#ifndef CORE1_WORKER_H
#define CORE1_WORKER_H

#include "pico/util/queue.h"
#include "command_queue.h"
#include "response_queue.h"

// External queues (defined in main.cpp)
extern queue_t g_command_queue;
extern queue_t g_response_queue;
extern queue_t g_gpio_notification_queue;

// Core 1 entry point - runs the worker loop
void core1_entry(void);

// Initialize Core 1 worker state (called before multicore_launch_core1)
void core1_worker_init(void);

// GPIO monitoring functions (called from Core 1)
void core1_add_monitored_pin(uint8_t pin);
void core1_remove_monitored_pin(uint8_t pin);

#endif // CORE1_WORKER_H
