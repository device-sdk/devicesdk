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
    bool send_ping();
    bool is_connected() const;
    void close_connection();

    // Rate limiting support
    uint16_t last_close_code = 0;
    uint32_t rate_limit_retry_after_ms = 0;

    // HTTP status of the last handshake response (0 if none was received).
    // 401 means the server rejected the API token - the caller can use this
    // to stop the reconnect loop instead of retrying forever.
    uint16_t last_http_status = 0;

private:
    // Protocol-level keepalive: we send PING frames periodically and the
    // server PONGs them, so last_rx_ms advances even on an idle connection.
    // A silent NAT idle-drop stops the PONGs and the dead-socket timeout
    // closes the connection so the caller can reconnect.
    std::string ws_key;
    uint32_t last_rx_ms = 0;
    struct altcp_pcb* tls_pcb;
    struct altcp_tls_config* tls_config;
    // Plain-WS support for self-hosted servers: an explicit port in the host
    // (e.g. "192.168.1.10:8080") selects plain TCP; a bare hostname uses TLS
    // on 443 with the embedded CA bundle (same heuristic as the ESP32 client).
    bool use_tls;
    ip_addr_t remote_addr;
    std::string host;
    uint16_t port;
    std::string path;
    std::string token;
    int connected_state;
    bool http_response_complete;
    bool in_callback;
    // Set from the lwIP callback context (close/error) to signal poll() on the
    // main loop that queued responses must be dropped before the next flush.
    // tx_queue is only ever mutated from the main loop; callbacks must not
    // touch it directly (the background task can preempt a mid-push queue).
    bool discard_pending_tx = false;
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
    void on_tcp_err(err_t err);
    void on_dns_found(const ip_addr_t *ipaddr);

    size_t build_frame(char* buffer, size_t buffer_len, const char* payload, size_t payload_len, uint8_t opcode);
    void process_rx_buffer();
    size_t parse_frame(const char* buffer, size_t len);
    bool send_text_internal(const char* payload);
    bool send_ctrl_frame(uint8_t opcode, const char* payload, size_t len);
    bool send_frame_buffered(uint8_t opcode, const char* payload, size_t len,
                             char* buffer, size_t buffer_len);
    bool send_pong(const char* payload, size_t len);
};

#endif // WS_CLIENT_H
