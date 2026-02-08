#ifndef COMMAND_QUEUE_H
#define COMMAND_QUEUE_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

// Maximum sizes for variable-length data in commands
#define MAX_MESSAGE_ID_LEN 64
#define MAX_I2C_DATA_LEN 256

// Command types for worker task
typedef enum {
    // GPIO commands
    CMD_GPIO_SET,
    CMD_GPIO_GET_DIGITAL,
    CMD_GPIO_GET_ANALOG,
    CMD_GPIO_CONFIGURE_INPUT,

    // PWM commands
    CMD_PWM_SET,

    // I2C commands
    CMD_I2C_CONFIGURE,
    CMD_I2C_SCAN,
    CMD_I2C_WRITE,
    CMD_I2C_READ,

    // Display commands (uses shared buffer for large framebuffer data)
    CMD_DISPLAY_UPDATE,

    // System commands
    CMD_REBOOT
} command_type_t;

// GPIO state enum matching hal.h
typedef enum {
    WORKER_GPIO_LOW = 0,
    WORKER_GPIO_HIGH = 1
} worker_gpio_state_t;

// GPIO pull enum matching hal.h
typedef enum {
    WORKER_PULL_NONE = 0,
    WORKER_PULL_UP = 1,
    WORKER_PULL_DOWN = 2
} worker_gpio_pull_t;

// GPIO command payload
typedef struct {
    uint8_t pin;
    worker_gpio_state_t state;
    worker_gpio_pull_t pull;
} gpio_payload_t;

// PWM command payload
typedef struct {
    uint8_t pin;
    uint32_t frequency;
    float duty_cycle;
} pwm_payload_t;

// I2C configure payload
typedef struct {
    uint8_t bus;
    uint8_t sda_pin;
    uint8_t scl_pin;
    uint32_t frequency;
} i2c_configure_payload_t;

// I2C scan payload
typedef struct {
    uint8_t bus;
} i2c_scan_payload_t;

// I2C write payload
typedef struct {
    uint8_t bus;
    uint8_t address;
    uint8_t data[MAX_I2C_DATA_LEN];
    size_t data_len;
} i2c_write_payload_t;

// I2C read payload
typedef struct {
    uint8_t bus;
    uint8_t address;
    size_t length;
    int reg;  // -1 for no register
} i2c_read_payload_t;

// Display update payload (framebuffer data in shared buffer)
typedef struct {
    uint8_t bus;
    uint8_t address;
    uint8_t width;
    uint8_t height;
    uint8_t controller;  // 0 = ssd1306, 1 = sh1106
    bool init;
} display_update_payload_t;

// Union of all payloads
typedef union {
    gpio_payload_t gpio;
    pwm_payload_t pwm;
    i2c_configure_payload_t i2c_configure;
    i2c_scan_payload_t i2c_scan;
    i2c_write_payload_t i2c_write;
    i2c_read_payload_t i2c_read;
    display_update_payload_t display;
} command_payload_t;

// Worker command structure
typedef struct {
    command_type_t type;
    uint32_t sequence_id;
    char message_id[MAX_MESSAGE_ID_LEN];
    command_payload_t payload;
} worker_command_t;

#endif // COMMAND_QUEUE_H
