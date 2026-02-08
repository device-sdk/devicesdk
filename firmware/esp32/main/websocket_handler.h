#ifndef WEBSOCKET_HANDLER_H
#define WEBSOCKET_HANDLER_H

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#endif

#include "command_queue.h"

// Initialize the websocket handler with the command queue
void websocket_handler_init(void *cmd_queue_handle);

// Parse a JSON message and dispatch the appropriate command to the worker queue.
// Returns true if the message was handled (even if the command was unknown).
// Returns false only on parse failure.
bool handle_websocket_message(const char *message);

#endif // WEBSOCKET_HANDLER_H
