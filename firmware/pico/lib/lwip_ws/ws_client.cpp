#include "ws_client.h"
#include "pico/cyw43_arch.h"
#include "lwip/dns.h"
#include <cstring>
#include <algorithm>
#include "picojson.h"
#include "websocket_handler.h"

#define WEBSOCKET_OPCODE_TEXT 0x1
#define BUF_SIZE 2048
#define MAX_RX_BUFFER_SIZE 16384
#define MAX_TX_QUEUE_SIZE 10

WebsocketClient::WebsocketClient() : tcp_pcb(nullptr), connected_state(0), http_response_complete(false), in_callback(false) {}

WebsocketClient::~WebsocketClient() {
    if (tcp_pcb) {
        tcp_close(tcp_pcb);
    }
}

bool WebsocketClient::connect(const char* host, uint16_t port, const char* path, const char* token) {
    // Clean up any existing connection first
    if (tcp_pcb) {
        close_connection();
    }

    this->host = host;
    this->path = path;
    this->token = token;

    cyw43_arch_lwip_begin();
    err_t err = dns_gethostbyname(host, &remote_addr, dns_found_callback, this);
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
    if (!tx_queue.empty() && is_connected() && tcp_pcb) {
        cyw43_arch_lwip_begin();
        while (!tx_queue.empty()) {
            std::string msg = tx_queue.front();
            tx_queue.pop();
            
            char buffer[BUF_SIZE];
            size_t frame_len = build_frame(buffer, BUF_SIZE, msg.c_str(), msg.length());
            if (frame_len > 0) {
                tcp_write(tcp_pcb, buffer, frame_len, TCP_WRITE_FLAG_COPY);
            }
        }
        tcp_output(tcp_pcb);
        cyw43_arch_lwip_end();
        
        // Trigger another poll to actually transmit the data
        cyw43_arch_poll();
    }
}

bool WebsocketClient::send_text(const char* payload) {
    if (!is_connected() || !tcp_pcb) {
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
    err_t write_err = tcp_write(tcp_pcb, buffer, frame_len, TCP_WRITE_FLAG_COPY);
    err_t output_err = ERR_OK;
    if (write_err == ERR_OK) {
        output_err = tcp_output(tcp_pcb);
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
        tcp_pcb = tcp_new_ip_type(IP_GET_TYPE(&remote_addr));
        if (!tcp_pcb) {
            return;
        }

        tcp_arg(tcp_pcb, this);
        tcp_poll(tcp_pcb, tcp_poll_callback, 1);
        tcp_sent(tcp_pcb, tcp_sent_callback);
        tcp_recv(tcp_pcb, tcp_recv_callback);
        tcp_err(tcp_pcb, tcp_err_callback);

        cyw43_arch_lwip_begin();
        connected_state = 1;
        tcp_connect(tcp_pcb, &remote_addr, 80, tcp_connected_callback);
        cyw43_arch_lwip_end();
    }
}

void WebsocketClient::on_tcp_connected(struct tcp_pcb *tpcb, err_t err) {
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
    tcp_write(tpcb, buffer, len, TCP_WRITE_FLAG_COPY);
    tcp_output(tpcb);  // Flush the upgrade request immediately
    cyw43_arch_lwip_end();
}

void WebsocketClient::on_tcp_recv(struct tcp_pcb *tpcb, struct pbuf *p, err_t err) {
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
        tcp_recved(tpcb, p->tot_len);
    }
    pbuf_free(p);

    // Process the received data
    process_rx_buffer();
    
    in_callback = false;  // Clear callback context flag
}

void WebsocketClient::close_connection() {
    if (tcp_pcb) {
        tcp_arg(tcp_pcb, NULL);
        tcp_close(tcp_pcb);
        tcp_pcb = nullptr;
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
        buffer[1] = payload_len;
    } else {
        // Extended payload length not supported in this simple implementation
        return 0;
    }

    // Masking (client-to-server frames must be masked)
    buffer[1] |= 0x80; // Set MASK bit
    uint32_t mask_key = rand();
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
        rx_buffer.erase(rx_buffer.begin(), rx_buffer.begin() + consumed);
        rx_buffer.shrink_to_fit();
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
            handle_websocket_message(v);
        }
    } else if (opcode == 0x8) {
        // Close frame
        close_connection();
    } else if (opcode == 0x9) {
        // Ping frame
    } else if (opcode == 0xA) {
        // Pong frame
    }

    return total_frame_len;
}


// Static callbacks
err_t WebsocketClient::tcp_connected_callback(void *arg, struct tcp_pcb *tpcb, err_t err) {
    ((WebsocketClient*)arg)->on_tcp_connected(tpcb, err);
    return ERR_OK;
}

err_t WebsocketClient::tcp_recv_callback(void *arg, struct tcp_pcb *tpcb, struct pbuf *p, err_t err) {
    ((WebsocketClient*)arg)->on_tcp_recv(tpcb, p, err);
    return ERR_OK;
}

void WebsocketClient::tcp_err_callback(void *arg, err_t err) {
    ((WebsocketClient*)arg)->close_connection();
}

err_t WebsocketClient::tcp_poll_callback(void *arg, struct tcp_pcb *tpcb) {
    return ERR_OK;
}

err_t WebsocketClient::tcp_sent_callback(void *arg, struct tcp_pcb *tpcb, u16_t len) {
    // Not used in this simple implementation
    return ERR_OK;
}

void WebsocketClient::dns_found_callback(const char *name, const ip_addr_t *ipaddr, void *callback_arg) {
    ((WebsocketClient*)callback_arg)->on_dns_found(ipaddr);
}
