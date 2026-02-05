#ifndef LWIP_MOCK_H
#define LWIP_MOCK_H

#include <cstdint>
#include <vector>
#include <functional>

// Mock lwIP types
typedef int8_t err_t;
typedef uint16_t u16_t;

#define ERR_OK 0
#define ERR_MEM -1
#define ERR_INPROGRESS -5

#define TCP_WRITE_FLAG_COPY 1

// Mock ip_addr_t
struct ip_addr_t {
    uint32_t addr;
};

#define IP_GET_TYPE(addr) 0

// Mock tcp_pcb
struct tcp_pcb {
    void* callback_arg;
    bool connected;
};

// Mock pbuf
struct pbuf {
    void* payload;
    uint16_t len;
    uint16_t tot_len;
    struct pbuf* next;
};

// Mock function prototypes
inline struct tcp_pcb* tcp_new_ip_type(int type) {
    static struct tcp_pcb mock_pcb = {};
    return &mock_pcb;
}

inline void tcp_arg(struct tcp_pcb* pcb, void* arg) {
    if (pcb) pcb->callback_arg = arg;
}

inline void tcp_poll(struct tcp_pcb* pcb, void* callback, int interval) {}
inline void tcp_sent(struct tcp_pcb* pcb, void* callback) {}
inline void tcp_recv(struct tcp_pcb* pcb, void* callback) {}
inline void tcp_err(struct tcp_pcb* pcb, void* callback) {}

inline err_t tcp_connect(struct tcp_pcb* pcb, ip_addr_t* addr, uint16_t port, void* callback) {
    return ERR_OK;
}

inline err_t tcp_write(struct tcp_pcb* pcb, const void* data, uint16_t len, uint8_t flags) {
    return ERR_OK;
}

inline err_t tcp_output(struct tcp_pcb* pcb) {
    return ERR_OK;
}

inline void tcp_recved(struct tcp_pcb* pcb, uint16_t len) {}

inline err_t tcp_close(struct tcp_pcb* pcb) {
    return ERR_OK;
}

inline void pbuf_free(struct pbuf* p) {}

// Mock dns
inline err_t dns_gethostbyname(const char* host, ip_addr_t* addr, void* callback, void* arg) {
    return ERR_OK;
}

// Mock cyw43
inline void cyw43_arch_lwip_begin() {}
inline void cyw43_arch_lwip_end() {}
inline void cyw43_arch_lwip_check() {}
inline void cyw43_arch_poll() {}

// Global mock state for tests
struct LwipMockState {
    std::vector<std::vector<uint8_t>> tcp_writes;
    bool tcp_write_fail = false;
    int close_count = 0;

    void reset() {
        tcp_writes.clear();
        tcp_write_fail = false;
        close_count = 0;
    }
};

extern LwipMockState g_lwip_mock;

#endif // LWIP_MOCK_H
