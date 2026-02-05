#ifndef WS_CLIENT_H
#define WS_CLIENT_H

#include "lwip/tcp.h"
#include <string>
#include <vector>

class WebsocketClient {
public:
    WebsocketClient();
    ~WebsocketClient();

    bool connect(const char* host, uint16_t port, const char* path, const char* token);
    void poll();
    bool send_text(const char* payload);
    bool is_connected() const;

private:
    struct tcp_pcb* tcp_pcb;
    ip_addr_t remote_addr;
    std::string host;
    std::string path;
    std::string token;
    int connected_state;
    std::vector<char> rx_buffer;

    static err_t tcp_connected_callback(void *arg, struct tcp_pcb *tpcb, err_t err);
    static err_t tcp_recv_callback(void *arg, struct tcp_pcb *tpcb, struct pbuf *p, err_t err);
    static void tcp_err_callback(void *arg, err_t err);
    static err_t tcp_poll_callback(void *arg, struct tcp_pcb *tpcb);
    static err_t tcp_sent_callback(void *arg, struct tcp_pcb *tpcb, u16_t len);
    static void dns_found_callback(const char *name, const ip_addr_t *ipaddr, void *callback_arg);

    void on_tcp_connected(struct tcp_pcb *tpcb, err_t err);
    void on_tcp_recv(struct tcp_pcb *tpcb, struct pbuf *p, err_t err);
    void on_dns_found(const ip_addr_t *ipaddr);
    void close_connection();
    
    size_t build_frame(char* buffer, size_t buffer_len, const char* payload, size_t payload_len);
    void parse_frame(const char* buffer, size_t len);
};

#endif // WS_CLIENT_H
