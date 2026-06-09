#include "ws_client.h"
#include "pico/cyw43_arch.h"
#include "pico/rand.h"
#include "lwip/dns.h"
#include "lwip/altcp_tcp.h"
#include <cstring>
#include <algorithm>
#include "picojson.h"
#include "websocket_handler.h"
#include "ca_cert.h"

#define WEBSOCKET_OPCODE_TEXT 0x1
// Big enough to hold a fully-masked text frame for the largest response we
// emit. A spi/uart read result of 256 bytes serialises to ~1.8 KB of hex
// strings, so 4 KB leaves comfortable headroom.
#define BUF_SIZE 4096
#define MAX_RX_BUFFER_SIZE 16384
#define MAX_TX_QUEUE_SIZE 10

WebsocketClient::WebsocketClient() : tls_pcb(nullptr), tls_config(nullptr), use_tls(true), port(443), connected_state(0), http_response_complete(false), in_callback(false) {}

WebsocketClient::~WebsocketClient() {
    if (tls_pcb) {
        altcp_close(tls_pcb);
    }
    if (tls_config) {
        altcp_tls_free_config(tls_config);
        tls_config = nullptr;
    }
}

bool WebsocketClient::connect(const char* host, const char* path, const char* token) {
    // Clean up any existing connection first
    if (tls_pcb) {
        close_connection();
    }

    // Parse port from host if present (e.g. "192.168.1.10:8080").
    // An explicit port means a self-hosted server on the LAN -> plain WS;
    // a bare hostname means TLS on 443 (same heuristic as the ESP32 client).
    std::string host_str(host);
    auto colon = host_str.find(':');
    if (colon != std::string::npos) {
        this->port = std::stoi(host_str.substr(colon + 1));
        this->host = host_str.substr(0, colon);
        this->use_tls = false;
    } else {
        this->port = 443;
        this->host = host_str;
        this->use_tls = true;
    }

    this->path = path;
    this->token = token;

    cyw43_arch_lwip_begin();
    err_t err = dns_gethostbyname(this->host.c_str(), &remote_addr, dns_found_callback, this);
    cyw43_arch_lwip_end();

    if (err == ERR_OK) {
        on_dns_found(&remote_addr);
    } else if (err != ERR_INPROGRESS) {
        return false;
    }
    return true;
}

void WebsocketClient::poll() {
    // Process queued messages from the main loop
    if (!tx_queue.empty() && is_connected() && tls_pcb) {
        cyw43_arch_lwip_begin();
        while (!tx_queue.empty()) {
            std::string msg = tx_queue.front();
            tx_queue.pop();

            char buffer[BUF_SIZE];
            size_t frame_len = build_frame(buffer, BUF_SIZE, msg.c_str(), msg.length());
            if (frame_len > 0) {
                altcp_write(tls_pcb, buffer, frame_len, TCP_WRITE_FLAG_COPY);
            }
        }
        altcp_output(tls_pcb);
        cyw43_arch_lwip_end();

        // Trigger another poll to actually transmit the data
        cyw43_arch_poll();
    }
}

bool WebsocketClient::send_text(const char* payload) {
    if (!is_connected() || !tls_pcb) {
        return false;
    }

    // If we're in a callback, queue the message for later sending
    if (in_callback) {
        while (tx_queue.size() >= MAX_TX_QUEUE_SIZE) {
            tx_queue.pop();  // Drop oldest message
        }
        tx_queue.push(std::string(payload));
        return true;
    }

    // Send directly from main loop context
    return send_text_internal(payload);
}

bool WebsocketClient::send_text_internal(const char* payload) {
    char buffer[BUF_SIZE];
    size_t frame_len = build_frame(buffer, BUF_SIZE, payload, strlen(payload));

    if (frame_len == 0) {
        return false;
    }

    cyw43_arch_lwip_begin();
    err_t write_err = altcp_write(tls_pcb, buffer, frame_len, TCP_WRITE_FLAG_COPY);
    err_t output_err = ERR_OK;
    if (write_err == ERR_OK) {
        output_err = altcp_output(tls_pcb);
    }
    cyw43_arch_lwip_end();

    return (write_err == ERR_OK && output_err == ERR_OK);
}

bool WebsocketClient::is_connected() const {
    return connected_state == 2;
}

void WebsocketClient::on_dns_found(const ip_addr_t *ipaddr) {
    if (ipaddr) {
        remote_addr = *ipaddr;

        if (use_tls) {
            // Create TLS config with embedded root CA for server certificate verification
            tls_config = altcp_tls_create_config_client(ca_cert_pem, ca_cert_pem_len);
            if (!tls_config) {
                return;
            }

            tls_pcb = altcp_tls_new(tls_config, IPADDR_TYPE_ANY);
            if (!tls_pcb) {
                altcp_tls_free_config(tls_config);
                tls_config = nullptr;
                return;
            }
        } else {
            // Plain TCP for self-hosted servers without TLS (host had a port).
            tls_pcb = altcp_tcp_new_ip_type(IPADDR_TYPE_ANY);
            if (!tls_pcb) {
                return;
            }
        }

        altcp_arg(tls_pcb, this);
        altcp_poll(tls_pcb, tcp_poll_callback, 1);
        altcp_sent(tls_pcb, tcp_sent_callback);
        altcp_recv(tls_pcb, tcp_recv_callback);
        altcp_err(tls_pcb, tcp_err_callback);

        cyw43_arch_lwip_begin();
        connected_state = 1;
        altcp_connect(tls_pcb, &remote_addr, this->port, tcp_connected_callback);
        cyw43_arch_lwip_end();
    }
}

void WebsocketClient::on_tcp_connected(struct altcp_pcb *tpcb, err_t err) {
    if (err != ERR_OK) {
        close_connection();
        return;
    }

    char buffer[BUF_SIZE];
    int len = snprintf(buffer, BUF_SIZE,
                     "GET %s HTTP/1.1\r\n"
                     "Host: %s\r\n"
                     "Upgrade: websocket\r\n"
                     "Connection: Upgrade\r\n"
                     "Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
                     "Sec-WebSocket-Version: 13\r\n"
                     "Authorization: Bearer %s\r\n\r\n",
                     path.c_str(), host.c_str(), token.c_str());

    cyw43_arch_lwip_begin();
    altcp_write(tpcb, buffer, len, TCP_WRITE_FLAG_COPY);
    altcp_output(tpcb);  // Flush the upgrade request immediately
    cyw43_arch_lwip_end();
}

void WebsocketClient::on_tcp_recv(struct altcp_pcb *tpcb, struct pbuf *p, err_t err) {
    if (!p) {
        close_connection();
        return;
    }

    cyw43_arch_lwip_check();
    in_callback = true;  // Mark that we're in callback context

    if (p->tot_len > 0) {
        // Check for buffer overflow before copying
        if (rx_buffer.size() + p->tot_len > MAX_RX_BUFFER_SIZE) {
            // Try to process existing buffer first
            process_rx_buffer();

            // If still too large after processing, clear buffer to accept new data
            if (rx_buffer.size() + p->tot_len > MAX_RX_BUFFER_SIZE) {
                rx_buffer.clear();
                rx_buffer.shrink_to_fit();
            }
        }

        // Copy all data from the pbuf chain
        struct pbuf *q = p;
        while (q != NULL) {
            rx_buffer.insert(rx_buffer.end(), (char*)q->payload, (char*)q->payload + q->len);
            q = q->next;
        }
        altcp_recved(tpcb, p->tot_len);
    }
    pbuf_free(p);

    // Process the received data
    process_rx_buffer();

    in_callback = false;  // Clear callback context flag
}

void WebsocketClient::close_connection() {
    if (tls_pcb) {
        altcp_arg(tls_pcb, NULL);
        altcp_close(tls_pcb);
        tls_pcb = nullptr;
    }
    if (tls_config) {
        altcp_tls_free_config(tls_config);
        tls_config = nullptr;
    }
    connected_state = 0;
    http_response_complete = false;
    rx_buffer.clear();
    rx_buffer.shrink_to_fit();
}

void WebsocketClient::on_tcp_err() {
    // The pcb is already freed by lwIP when this runs; forget it WITHOUT
    // closing (that would be a use-after-free). Freeing the TLS config is a
    // separate allocation and is safe.
    tls_pcb = nullptr;
    if (tls_config) {
        altcp_tls_free_config(tls_config);
        tls_config = nullptr;
    }
    connected_state = 0;
    http_response_complete = false;
    rx_buffer.clear();
    rx_buffer.shrink_to_fit();
}

size_t WebsocketClient::build_frame(char* buffer, size_t buffer_len, const char* payload, size_t payload_len) {
    buffer[0] = 0x80 | WEBSOCKET_OPCODE_TEXT; // FIN + opcode

    size_t header_len = 2;
    if (payload_len < 126) {
        buffer[1] = (char)payload_len;
    } else if (payload_len <= 0xFFFF) {
        // 16-bit extended payload length (126 marker + 2 length bytes, big-endian).
        // Without this, any frame >= 126 bytes (e.g. nearly every command_ack,
        // which carries the server's 36-char id) was silently dropped.
        buffer[1] = 126;
        buffer[2] = (char)((payload_len >> 8) & 0xFF);
        buffer[3] = (char)(payload_len & 0xFF);
        header_len = 4;
    } else {
        // 64-bit lengths are unsupported (and would exceed BUF_SIZE anyway).
        return 0;
    }

    // Masking (client-to-server frames must be masked)
    buffer[1] |= 0x80; // Set MASK bit
    uint32_t mask_key = get_rand_32();
    char* mask_bytes = (char*)&mask_key;
    buffer[header_len++] = mask_bytes[0];
    buffer[header_len++] = mask_bytes[1];
    buffer[header_len++] = mask_bytes[2];
    buffer[header_len++] = mask_bytes[3];

    if (header_len + payload_len > buffer_len) return 0; // Not enough space

    for (size_t i = 0; i < payload_len; ++i) {
        buffer[header_len + i] = payload[i] ^ mask_bytes[i % 4];
    }

    return header_len + payload_len;
}

void WebsocketClient::process_rx_buffer() {
    // First, handle the HTTP upgrade response if we haven't seen it yet
    if (!http_response_complete) {
        // Look for the end of HTTP headers (\r\n\r\n) without copying entire buffer
        const char* needle = "\r\n\r\n";
        auto it = std::search(rx_buffer.begin(), rx_buffer.end(), needle, needle + 4);
        if (it == rx_buffer.end()) {
            // Haven't received complete HTTP response yet
            return;
        }
        size_t header_end = std::distance(rx_buffer.begin(), it);

        // Check for successful upgrade (101 Switching Protocols) - only copy header portion
        std::string header(rx_buffer.begin(), rx_buffer.begin() + header_end);
        if (header.find("101") != std::string::npos) {
            connected_state = 2;
            http_response_complete = true;

            // Remove the HTTP response from the buffer, keep any remaining data
            size_t ws_data_start = header_end + 4; // Skip \r\n\r\n
            if (ws_data_start < rx_buffer.size()) {
                rx_buffer.erase(rx_buffer.begin(), rx_buffer.begin() + ws_data_start);
                rx_buffer.shrink_to_fit();
            } else {
                rx_buffer.clear();
                rx_buffer.shrink_to_fit();
                return;
            }
        } else {
            rx_buffer.clear();
            rx_buffer.shrink_to_fit();
            close_connection();
            return;
        }
    }

    // Now process WebSocket frames
    while (rx_buffer.size() >= 2) {
        size_t consumed = parse_frame(rx_buffer.data(), rx_buffer.size());
        if (consumed == 0) {
            // Not enough data for a complete frame, wait for more
            break;
        }
        // parse_frame() may have torn down the connection (e.g. a Close frame,
        // including the rate-limit close), which clears rx_buffer. Bail out
        // before erasing past the end of a now-empty/shorter buffer.
        if (connected_state == 0 || consumed > rx_buffer.size()) {
            break;
        }
        rx_buffer.erase(rx_buffer.begin(), rx_buffer.begin() + consumed);
    }
}

size_t WebsocketClient::parse_frame(const char* buffer, size_t len) {
    if (len < 2) return 0;

    uint8_t opcode = buffer[0] & 0x0F;
    // bool fin = (buffer[0] & 0x80) != 0; // FIN bit - not used currently
    bool masked = (buffer[1] & 0x80) != 0;
    size_t payload_len = buffer[1] & 0x7F;
    size_t header_len = 2;

    // Handle extended payload length
    if (payload_len == 126) {
        if (len < 4) return 0; // Need more data
        payload_len = ((uint8_t)buffer[2] << 8) | (uint8_t)buffer[3];
        header_len = 4;
    } else if (payload_len == 127) {
        // 64-bit length - not supported
        return 0;
    }

    // Server frames should not be masked, but handle it if they are
    if (masked) {
        header_len += 4;
    }

    size_t total_frame_len = header_len + payload_len;
    if (len < total_frame_len) return 0; // Need more data

    if (opcode == WEBSOCKET_OPCODE_TEXT) {
        std::string payload(buffer + header_len, payload_len);
        picojson::value v;
        std::string err = picojson::parse(v, payload);
        if (err.empty()) {
            // Check for rate_limit message before dispatching
            if (v.is<picojson::object>()) {
                const picojson::object& obj = v.get<picojson::object>();
                auto type_it = obj.find("type");
                if (type_it != obj.end() && type_it->second.is<std::string>() &&
                    type_it->second.get<std::string>() == "rate_limit") {
                    auto pl_it = obj.find("payload");
                    if (pl_it != obj.end() && pl_it->second.is<picojson::object>()) {
                        const picojson::object& pl = pl_it->second.get<picojson::object>();
                        auto retry_it = pl.find("retry_after");
                        if (retry_it != pl.end() && retry_it->second.is<double>()) {
                            uint32_t retry_secs = (uint32_t)retry_it->second.get<double>();
                            rate_limit_retry_after_ms = retry_secs * 1000;
                            printf("[WS] Rate limited: retry after %u seconds\n", retry_secs);
                        }
                    }
                    // Don't dispatch rate_limit to normal handler
                } else {
                    handle_websocket_message(v);
                }
            } else {
                handle_websocket_message(v);
            }
        }
    } else if (opcode == 0x8) {
        // Close frame - parse close code from payload (first 2 bytes, big-endian)
        if (payload_len >= 2) {
            last_close_code = ((uint8_t)buffer[header_len] << 8) | (uint8_t)buffer[header_len + 1];
            printf("[WS] Close frame received with code: %u\n", last_close_code);
        }
        close_connection();
    } else if (opcode == 0x9) {
        // Ping frame
    } else if (opcode == 0xA) {
        // Pong frame
    }

    return total_frame_len;
}


// Static callbacks
err_t WebsocketClient::tcp_connected_callback(void *arg, struct altcp_pcb *tpcb, err_t err) {
    ((WebsocketClient*)arg)->on_tcp_connected(tpcb, err);
    return ERR_OK;
}

err_t WebsocketClient::tcp_recv_callback(void *arg, struct altcp_pcb *tpcb, struct pbuf *p, err_t err) {
    ((WebsocketClient*)arg)->on_tcp_recv(tpcb, p, err);
    return ERR_OK;
}

void WebsocketClient::tcp_err_callback(void *arg, err_t err) {
    // lwIP has already freed the pcb before invoking the error callback, so we
    // must NOT call altcp_close()/altcp_arg() on it (use-after-free). Just drop
    // our reference and tear down the rest of the connection state.
    ((WebsocketClient*)arg)->on_tcp_err();
}

err_t WebsocketClient::tcp_poll_callback(void *arg, struct altcp_pcb *tpcb) {
    return ERR_OK;
}

err_t WebsocketClient::tcp_sent_callback(void *arg, struct altcp_pcb *tpcb, u16_t len) {
    // Not used in this simple implementation
    return ERR_OK;
}

void WebsocketClient::dns_found_callback(const char *name, const ip_addr_t *ipaddr, void *callback_arg) {
    ((WebsocketClient*)callback_arg)->on_dns_found(ipaddr);
}
