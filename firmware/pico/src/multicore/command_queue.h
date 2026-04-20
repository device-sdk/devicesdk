#ifndef COMMAND_QUEUE_H
#define COMMAND_QUEUE_H

#include <stdint.h>
#include <stddef.h>

// Maximum sizes for variable-length data in commands
#define MAX_MESSAGE_ID_LEN 64
#define MAX_I2C_DATA_LEN  256
#define MAX_SPI_DATA_LEN  4096
#define MAX_UART_DATA_LEN 4096

// Command types for Core 1 worker
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
    CMD_I2C_BATCH_WRITE,

    // Temperature sensor
    CMD_GET_TEMPERATURE,

    // Watchdog timer
    CMD_WATCHDOG_CONFIGURE,
    CMD_WATCHDOG_FEED,

    // SPI commands
    CMD_SPI_CONFIGURE,
    CMD_SPI_TRANSFER,
    CMD_SPI_WRITE,
    CMD_SPI_READ,

    // UART commands
    CMD_UART_CONFIGURE,
    CMD_UART_WRITE,
    CMD_UART_READ,

    // PIO / WS2812 commands
    CMD_PIO_WS2812_CONFIGURE,
    CMD_PIO_WS2812_UPDATE,

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

// Watchdog configure payload
typedef struct {
    uint32_t timeout_ms;
    bool enable;
} watchdog_configure_payload_t;

// SPI configure payload
typedef struct {
    uint8_t bus;
    uint8_t clk_pin;
    uint8_t mosi_pin;
    uint8_t miso_pin;
    uint8_t cs_pin;
    uint32_t frequency;
    uint8_t mode;
} spi_configure_payload_t;

// SPI transfer payload
typedef struct {
    uint8_t bus;
    uint8_t data[MAX_SPI_DATA_LEN];
    size_t data_len;
} spi_transfer_payload_t;

// SPI read payload
typedef struct {
    uint8_t bus;
    size_t length;
} spi_read_payload_t;

// UART configure payload
typedef struct {
    uint8_t port;
    uint8_t tx_pin;
    uint8_t rx_pin;
    uint32_t baud_rate;
    uint8_t data_bits;
    uint8_t stop_bits;
    uint8_t parity;
} uart_configure_payload_t;

// UART write payload
typedef struct {
    uint8_t port;
    uint8_t data[MAX_UART_DATA_LEN];
    size_t data_len;
} uart_write_payload_t;

// UART read payload
typedef struct {
    uint8_t port;
    size_t bytes_to_read;
    uint32_t timeout_ms;
} uart_read_payload_t;

// PIO WS2812 configure payload
typedef struct {
    uint8_t pin;
    uint16_t num_leds;
} pio_ws2812_configure_payload_t;

// Display update payload (framebuffer data in shared buffer)
typedef struct {
    uint8_t bus;
    uint8_t address;
    uint8_t width;
    uint8_t height;
    uint8_t controller;  // 0 = ssd1306, 1 = sh1106
    uint8_t col_offset;  // RAM column offset (non-zero for e.g. 0.42" 72x40 SSD1306)
    uint8_t page_offset; // RAM page offset (usually 0)
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
    watchdog_configure_payload_t watchdog_configure;
    spi_configure_payload_t spi_configure;
    spi_transfer_payload_t spi_transfer;
    spi_read_payload_t spi_read;
    uart_configure_payload_t uart_configure;
    uart_write_payload_t uart_write;
    uart_read_payload_t uart_read;
    pio_ws2812_configure_payload_t pio_ws2812_configure;
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
