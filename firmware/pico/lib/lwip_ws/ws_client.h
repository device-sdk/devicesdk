#ifndef WS_CLIENT_H
#define WS_CLIENT_H

#include "lwip/altcp.h"
#include "lwip/altcp_tls.h"
#include <string>
#include <vector>
#include <queue>

class WebsocketClient {
public:
    WebsocketClient();
    ~WebsocketClient();

    bool connect(const char* host, const char* path, const char* token);
    void poll();
    bool send_text(const char* payload);
    bool is_connected() const;
    void close_connection();

    // Rate limiting support
    uint16_t last_close_code = 0;
    uint32_t rate_limit_retry_after_ms = 0;

private:
    struct altcp_pcb* tls_pcb;
    struct altcp_tls_config* tls_config;
    ip_addr_t remote_addr;
    std::string host;
    uint16_t port;
    std::string path;
    std::string token;
    int connected_state;
    bool http_response_complete;
    bool in_callback;
    std::vector<char> rx_buffer;
    std::queue<std::string> tx_queue;

    static err_t tcp_connected_callback(void *arg, struct altcp_pcb *tpcb, err_t err);
    static err_t tcp_recv_callback(void *arg, struct altcp_pcb *tpcb, struct pbuf *p, err_t err);
    static void tcp_err_callback(void *arg, err_t err);
    static err_t tcp_poll_callback(void *arg, struct altcp_pcb *tpcb);
    static err_t tcp_sent_callback(void *arg, struct altcp_pcb *tpcb, u16_t len);
    static void dns_found_callback(const char *name, const ip_addr_t *ipaddr, void *callback_arg);

    void on_tcp_connected(struct altcp_pcb *tpcb, err_t err);
    void on_tcp_recv(struct altcp_pcb *tpcb, struct pbuf *p, err_t err);
    void on_dns_found(const ip_addr_t *ipaddr);

    size_t build_frame(char* buffer, size_t buffer_len, const char* payload, size_t payload_len);
    void process_rx_buffer();
    size_t parse_frame(const char* buffer, size_t len);
    bool send_text_internal(const char* payload);
};

#endif // WS_CLIENT_H
