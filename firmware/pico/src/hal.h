#ifndef HAL_H
#define HAL_H

#include <stdint.h>
#include <stdbool.h>
#include <stddef.h>

typedef enum {
    GPIO_STATE_LOW,
    GPIO_STATE_HIGH
} gpio_state_t;

typedef enum {
    GPIO_PULL_NONE,
    GPIO_PULL_UP,
    GPIO_PULL_DOWN
} gpio_pull_t;

typedef struct {
    uint8_t data[256];
    size_t len;
} spi_transfer_result_t;

typedef struct {
    uint8_t data[256];
    size_t len;
} uart_read_result_t;

typedef struct {
    uint8_t addresses[128];
    uint8_t count;
} i2c_scan_result_t;

typedef struct {
    uint8_t sda_pin;
    uint8_t scl_pin;
    uint32_t frequency;
    bool configured;
} i2c_config_t;

void hal_init();
void hal_reboot();

void hal_set_gpio(uint8_t pin, gpio_state_t state);
bool hal_get_gpio_digital(uint8_t pin);
uint16_t hal_get_gpio_analog(uint8_t pin);
void hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull = GPIO_PULL_NONE);

void hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle);

void hal_i2c_init(uint8_t bus);
i2c_scan_result_t hal_i2c_scan(uint8_t bus);
bool hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t* data, size_t len);
int hal_i2c_read(uint8_t bus, uint8_t address, uint8_t* buffer, size_t len, int reg);

// I2C dynamic configuration
bool hal_i2c_validate_pins(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin);
bool hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency);
const i2c_config_t* hal_i2c_get_config(uint8_t bus);
void hal_i2c_reset(uint8_t bus);

void hal_blink_led(uint32_t duration_ms);

// Temperature sensor
float hal_get_temperature(void);

// Watchdog timer
bool hal_watchdog_configure(uint32_t timeout_ms, bool enable);
void hal_watchdog_feed(void);

// SPI
bool hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode);
spi_transfer_result_t hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len);
bool hal_spi_write(uint8_t bus, const uint8_t *data, size_t len);
spi_transfer_result_t hal_spi_read(uint8_t bus, size_t len);

// UART
bool hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity);
bool hal_uart_write(uint8_t port, const uint8_t *data, size_t len);
uart_read_result_t hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms);

// PIO / WS2812
bool hal_pio_ws2812_configure(uint8_t pin, uint16_t num_leds);
bool hal_pio_ws2812_update(const uint8_t *pixel_data, size_t len);

#endif // HAL_H
