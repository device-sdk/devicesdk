#ifndef HAL_MOCK_H
#define HAL_MOCK_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

// Maximum tracked calls
#define MAX_MOCK_CALLS 128
#define MAX_MOCK_WRITE_DATA 256

// I2C write call record
typedef struct {
    uint8_t bus;
    uint8_t address;
    uint8_t data[MAX_MOCK_WRITE_DATA];
    size_t data_len;
} mock_i2c_write_call_t;

// I2C read call record
typedef struct {
    uint8_t bus;
    uint8_t address;
    size_t len;
    int reg;
} mock_i2c_read_call_t;

// I2C configure call record
typedef struct {
    uint8_t bus;
    uint8_t sda_pin;
    uint8_t scl_pin;
    uint32_t frequency;
} mock_i2c_configure_call_t;

// GPIO set call record
typedef struct {
    uint8_t pin;
    int state;  // 0=low, 1=high
} mock_gpio_set_call_t;

// GPIO configure input call record
typedef struct {
    uint8_t pin;
    int pull;
} mock_gpio_configure_input_call_t;

// PWM set call record
typedef struct {
    uint8_t pin;
    uint32_t frequency;
    float duty_cycle;
} mock_pwm_set_call_t;

// Mock state
typedef struct {
    // GPIO set tracking
    mock_gpio_set_call_t gpio_set_calls[MAX_MOCK_CALLS];
    int gpio_set_call_count;

    // GPIO configure input tracking
    mock_gpio_configure_input_call_t gpio_configure_input_calls[MAX_MOCK_CALLS];
    int gpio_configure_input_call_count;

    // GPIO digital read return values
    bool gpio_digital_return;
    uint16_t gpio_analog_return;

    // PWM tracking
    mock_pwm_set_call_t pwm_set_calls[MAX_MOCK_CALLS];
    int pwm_set_call_count;

    // I2C configure tracking
    mock_i2c_configure_call_t i2c_configure_calls[MAX_MOCK_CALLS];
    int i2c_configure_call_count;

    // I2C write tracking
    mock_i2c_write_call_t i2c_write_calls[MAX_MOCK_CALLS];
    int i2c_write_call_count;

    // I2C read tracking
    mock_i2c_read_call_t i2c_read_calls[MAX_MOCK_CALLS];
    int i2c_read_call_count;

    // I2C scan tracking
    uint8_t i2c_scan_calls[MAX_MOCK_CALLS];
    int i2c_scan_call_count;

    // Return values
    bool i2c_configure_return;
    bool i2c_write_return;
    int i2c_read_return;
    uint8_t i2c_read_data[MAX_MOCK_WRITE_DATA];
    size_t i2c_read_data_len;
    uint8_t i2c_scan_addresses[128];
    uint8_t i2c_scan_address_count;

    // Reboot tracking
    bool reboot_called;
} hal_mock_state_t;

#ifdef __cplusplus
extern "C" {
#endif

extern hal_mock_state_t g_hal_mock;

void hal_mock_reset(void);

#ifdef __cplusplus
}
#endif

#endif // HAL_MOCK_H
