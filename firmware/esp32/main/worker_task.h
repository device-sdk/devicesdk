#ifndef WORKER_TASK_H
#define WORKER_TASK_H

#include "command_queue.h"
#include "response_queue.h"

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#endif

// Initialize worker task state
void worker_task_init(void);

// FreeRTOS task entry point — runs on its own thread
// pvParameters is unused
void worker_task_entry(void *pvParameters);

// Execute a single command and produce a response (exposed for unit testing)
worker_response_t worker_execute_command(const worker_command_t *cmd);

#endif // WORKER_TASK_H
