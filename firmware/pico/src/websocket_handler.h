#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#include "picojson.h"
#include <cstdint>
#include <string>

typedef void (*send_response_fn)(const char* json);
typedef void (*configure_gpio_input_fn)(uint8_t pin);

void websocket_handler_init(send_response_fn send_fn, configure_gpio_input_fn gpio_fn = nullptr);
void handle_websocket_message(const picojson::value& payload);

// Message ID access for deferred commands
const std::string& get_current_message_id();
void set_current_message_id(const std::string& id);

#endif // WEBSOCKET_HANDLER_H
