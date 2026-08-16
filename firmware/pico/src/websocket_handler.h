#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include "picojson.h"
#include "pico/util/queue.h"
#include <cstdint>
#include <string>

// Maximum inbound WS message size. The server caps command payloads at 4096
// bytes of JSON, so 4224 covers the largest frame plus framing overhead.
#define MAX_WS_MESSAGE_SIZE 4224

// Raw inbound message handed from the WS recv callback to the main-loop
// consumer. The payload is heap-allocated and NUL-terminated; the consumer
// frees it after parsing so the recv callback never needs a large stack frame.
typedef struct {
    char* data;
    size_t len;
} ws_message_t;

// Bounded queue of raw WS messages (defined in main.cpp). Producer: the WS
// recv callback on the CYW43 background task; consumer: the main loop.
// queue_t is thread-safe (spin-lock based).
extern queue_t g_ws_message_queue;

typedef void (*send_response_fn)(const char* json);
typedef void (*configure_gpio_input_fn)(uint8_t pin);

void websocket_handler_init(send_response_fn send_fn, configure_gpio_input_fn gpio_fn = nullptr);
void handle_websocket_message(const picojson::value& payload);

// Copy a raw WS payload into the message queue (heap-allocating the copy).
// Drops the message when the queue is full instead of blocking the recv
// callback; JSON parsing + dispatch happen on the consumer side.
void queue_ws_message(const char* data, size_t len);

// Message ID access for deferred commands
const std::string& get_current_message_id();
void set_current_message_id(const std::string& id);

#endif // WEBSOCKET_HANDLER_H
