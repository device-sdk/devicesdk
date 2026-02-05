#include "ws_client.h"
#include "pico/cyw43_arch.h"
#include "lwip/dns.h"
#include <cstring>
#include "picojson.h"
#include "websocket_handler.h"

#define WEBSOCKET_OPCODE_TEXT 0x1
#define BUF_SIZE 2048

WebsocketClient::WebsocketClient() : tcp_pcb(nullptr), connected_state(0) {}

WebsocketClient::~WebsocketClient() {
    if (tcp_pcb) {
        tcp_close(tcp_pcb);
    }
}

bool WebsocketClient::connect(const char* host, uint16_t port, const char* path, const char* token) {
    this->host = host;
    this->path = path;
    this->token = token;

    cyw43_arch_lwip_begin();
    err_t err = dns_gethostbyname(host, &remote_addr, dns_found_callback, this);
    cyw43_arch_lwip_end();

    if (err == ERR_OK) {
        on_dns_found(&remote_addr);
    } else if (err != ERR_INPROGRESS) {
        printf("DNS error: %d\n", err);
        return false;
    }
    return true;
}

void WebsocketClient::poll() {
    // The lwIP poll function is called from the main loop via cyw43_arch_poll()
    // We can add any periodic checks here if needed
}

bool WebsocketClient::send_text(const char* payload) {
    if (!is_connected()) return false;

    char buffer[BUF_SIZE];
    size_t frame_len = build_frame(buffer, BUF_SIZE, payload, strlen(payload));

    cyw43_arch_lwip_begin();
    err_t err = tcp_write(tcp_pcb, buffer, frame_len, TCP_WRITE_FLAG_COPY);
    cyw43_arch_lwip_end();

    if (err != ERR_OK) {
        printf("Failed to send data: %d\n", err);
        return false;
    }
    return true;
}

bool WebsocketClient::is_connected() const {
    return connected_state == 2;
}

void WebsocketClient::on_dns_found(const ip_addr_t *ipaddr) {
    if (ipaddr) {
        remote_addr = *ipaddr;
        tcp_pcb = tcp_new_ip_type(IP_GET_TYPE(&remote_addr));
        if (!tcp_pcb) {
            printf("Failed to create PCB\n");
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
    } else {
        printf("DNS lookup failed\n");
    }
}

void WebsocketClient::on_tcp_connected(struct tcp_pcb *tpcb, err_t err) {
    if (err != ERR_OK) {
        printf("TCP connect failed: %d\n", err);
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
    cyw43_arch_lwip_end();
    
    connected_state = 2;
    printf("WebSocket Connected\n");
}

void WebsocketClient::on_tcp_recv(struct tcp_pcb *tpcb, struct pbuf *p, err_t err) {
    if (!p) {
        close_connection();
        return;
    }

    cyw43_arch_lwip_check();
    if (p->tot_len > 0) {
        rx_buffer.insert(rx_buffer.end(), (char*)p->payload, (char*)p->payload + p->len);
        parse_frame(rx_buffer.data(), rx_buffer.size());
        rx_buffer.clear();
        tcp_recved(tpcb, p->tot_len);
    }
    pbuf_free(p);
}

void WebsocketClient::close_connection() {
    if (tcp_pcb) {
        tcp_arg(tcp_pcb, NULL);
        tcp_close(tcp_pcb);
        tcp_pcb = nullptr;
    }
    connected_state = 0;
    printf("Connection closed\n");
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

void WebsocketClient::parse_frame(const char* buffer, size_t len) {
    if (len < 2) return;

    // For simplicity, we're assuming the first message from the server is not a websocket frame
    // and we're ignoring it. A robust implementation would properly parse the HTTP upgrade response.
    if (buffer[0] != 'H' && buffer[1] != 'T') {
        uint8_t opcode = buffer[0] & 0x0F;
        if (opcode == WEBSOCKET_OPCODE_TEXT) {
            size_t payload_len = buffer[1] & 0x7F;
            size_t payload_offset = 2;
            if (payload_len == 126) {
                // Not supported in this simple implementation
                return;
            }

            if (len >= payload_offset + payload_len) {
                std::string payload(buffer + payload_offset, payload_len);
                picojson::value v;
                std::string err = picojson::parse(v, payload);
                if (err.empty()) {
                    handle_websocket_message(v);
                } else {
                    printf("Failed to parse JSON: %s\n", err.c_str());
                }
            }
        }
    }
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
    printf("TCP error: %d\n", err);
    ((WebsocketClient*)arg)->close_connection();
}

err_t WebsocketClient::tcp_poll_callback(void *arg, struct tcp_pcb *tpcb) {
    // Not used in this simple implementation
    return ERR_OK;
}

err_t WebsocketClient::tcp_sent_callback(void *arg, struct tcp_pcb *tpcb, u16_t len) {
    // Not used in this simple implementation
    return ERR_OK;
}

void WebsocketClient::dns_found_callback(const char *name, const ip_addr_t *ipaddr, void *callback_arg) {
    ((WebsocketClient*)callback_arg)->on_dns_found(ipaddr);
}
