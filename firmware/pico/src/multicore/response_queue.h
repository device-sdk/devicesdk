#ifndef RESPONSE_QUEUE_H
#define RESPONSE_QUEUE_H

#include "command_queue.h"
#include <stdint.h>
#include <stddef.h>

// Maximum sizes for response data
#define MAX_RESPONSE_DATA_LEN 256
#define MAX_ERROR_MSG_LEN 128
#define MAX_I2C_SCAN_RESULTS 128
#define MAX_I2C_READ_DATA 256

// Response status
typedef enum {
    RESPONSE_SUCCESS,
    RESPONSE_ERROR
} response_status_t;

// GPIO response data
typedef struct {
    uint8_t pin;
    bool digital_value;
    uint16_t analog_value;
    const char* mode;  // "digital" or "analog"
} gpio_response_data_t;

// I2C scan response data
typedef struct {
    uint8_t bus;
    uint8_t addresses[MAX_I2C_SCAN_RESULTS];
    uint8_t count;
} i2c_scan_response_data_t;

// I2C read response data
typedef struct {
    uint8_t bus;
    uint8_t address;
    uint8_t data[MAX_I2C_READ_DATA];
    size_t data_len;
} i2c_read_response_data_t;

// I2C configure response data
typedef struct {
    uint8_t bus;
    uint8_t sda_pin;
    uint8_t scl_pin;
    uint32_t frequency;
} i2c_configure_response_data_t;

// Display update response data
typedef struct {
    uint8_t width;
    uint8_t height;
    const char* controller;
    size_t segments_count;
    size_t bytes_written;
} display_update_response_data_t;

// Union of all response data types
typedef union {
    gpio_response_data_t gpio;
    i2c_scan_response_data_t i2c_scan;
    i2c_read_response_data_t i2c_read;
    i2c_configure_response_data_t i2c_configure;
    display_update_response_data_t display;
} response_data_t;

// Worker response structure
typedef struct {
    uint32_t sequence_id;
    char message_id[MAX_MESSAGE_ID_LEN];
    response_status_t status;
    command_type_t original_cmd;
    char error_msg[MAX_ERROR_MSG_LEN];
    response_data_t data;
} worker_response_t;

// GPIO state changed notification (for autonomous GPIO monitoring)
typedef struct {
    uint8_t pin;
    bool state;  // true = high, false = low
} gpio_notification_t;

#endif // RESPONSE_QUEUE_H
