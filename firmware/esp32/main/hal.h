#ifndef HAL_H
#define HAL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

typedef enum {
    GPIO_STATE_LOW = 0,
    GPIO_STATE_HIGH = 1
} gpio_state_t;

typedef enum {
    GPIO_PULL_NONE = 0,
    GPIO_PULL_UP = 1,
    GPIO_PULL_DOWN = 2
} gpio_pull_t;

typedef struct {
    uint8_t addresses[128];
    uint8_t count;
} i2c_scan_result_t;

typedef struct {
    uint8_t data[256];
    size_t len;
} spi_transfer_result_t;

typedef struct {
    uint8_t data[256];
    size_t len;
} uart_read_result_t;

// System
void iotkit_hal_init(void);
void iotkit_hal_reboot(void);
void iotkit_hal_blink_led(int count);

// GPIO
void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state);
bool iotkit_hal_get_gpio_digital(uint8_t pin);
uint16_t iotkit_hal_get_gpio_analog(uint8_t pin);
void iotkit_hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull);

// PWM
void iotkit_hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle);

// I2C
bool iotkit_hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency);
i2c_scan_result_t iotkit_hal_i2c_scan(uint8_t bus);
bool iotkit_hal_i2c_probe(uint8_t bus, uint8_t address);
bool iotkit_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len);
int iotkit_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg);

// Temperature sensor
float iotkit_hal_get_temperature(void);

// Watchdog timer
bool iotkit_hal_watchdog_configure(uint32_t timeout_ms, bool enable);
void iotkit_hal_watchdog_feed(void);

// SPI
bool iotkit_hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode);
spi_transfer_result_t iotkit_hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len);
bool iotkit_hal_spi_write(uint8_t bus, const uint8_t *data, size_t len);
spi_transfer_result_t iotkit_hal_spi_read(uint8_t bus, size_t len);

// UART
bool iotkit_hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity);
bool iotkit_hal_uart_write(uint8_t port, const uint8_t *data, size_t len);
uart_read_result_t iotkit_hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms);

#endif // HAL_H
