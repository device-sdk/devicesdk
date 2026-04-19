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

#ifdef UNIT_TEST
// Test-only helpers: under UNIT_TEST, queue_command captures its argument instead
// of pushing to FreeRTOS, so tests can assert on what would have been queued.
const worker_command_t *test_get_last_queued_command(void);
void test_reset_last_queued_command(void);
#endif

#endif // WEBSOCKET_HANDLER_H
