#include "hal.h"
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "hardware/pwm.h"
#include "hardware/adc.h"
#include "hardware/i2c.h"
#include "hardware/watchdog.h"
#include "hardware/spi.h"
#include "hardware/uart.h"
#include "hardware/pio.h"
#include "hardware/clocks.h"
#include "ws2812.pio.h"
#include <stdio.h>

// Valid I2C pin combinations from RP2040 datasheet
// I2C0: GP0/GP1, GP4/GP5, GP8/GP9, GP12/GP13, GP16/GP17, GP20/GP21
// I2C1: GP2/GP3, GP6/GP7, GP10/GP11, GP14/GP15, GP18/GP19, GP26/GP27
static const uint8_t i2c0_valid_pins[][2] = {
    {0, 1}, {4, 5}, {8, 9}, {12, 13}, {16, 17}, {20, 21}
};
static const uint8_t i2c1_valid_pins[][2] = {
    {2, 3}, {6, 7}, {10, 11}, {14, 15}, {18, 19}, {26, 27}
};

// Dynamic I2C configuration storage
static i2c_config_t i2c_configs[2] = {
    { .sda_pin = 4, .scl_pin = 5, .frequency = 100000, .configured = false },
    { .sda_pin = 6, .scl_pin = 7, .frequency = 100000, .configured = false }
};

static bool adc_initialized = false;

// Reject pins outside the hardware-valid range (NUM_BANK0_GPIOS is 30 on RP2040, 48 on RP2350).
// The virtual pin 99 addresses the onboard LED via the CYW43 WiFi coprocessor and is always allowed.
static inline bool is_valid_gpio(uint8_t pin) {
    return pin == 99 || pin < NUM_BANK0_GPIOS;
}

void hal_init() {
    // Nothing to do here for now - peripherals initialized on demand
}

void hal_reboot() {
    printf("Rebooting device...\n");
    watchdog_reboot(0, 0, 0);
    while(1) { tight_loop_contents(); }
}

void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    if (!is_valid_gpio(pin)) {
        printf("Invalid GPIO pin: %d\n", pin);
        return;
    }
    bool pin_state = (state == GPIO_STATE_HIGH);
    if (pin == 99) { // Special case for the onboard LED
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, pin_state);
    } else {
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_OUT);
        gpio_put(pin, pin_state);
    }
}

// Track which pins have been configured as inputs. 64-bit mask covers both
// RP2040 (NUM_BANK0_GPIOS=30) and RP2350 (NUM_BANK0_GPIOS=48); is_valid_gpio()
// rejects pins outside that range before any shift.
static uint64_t gpio_input_configured_mask = 0;

bool hal_get_gpio_digital(uint8_t pin) {
    if (!is_valid_gpio(pin)) {
        printf("Invalid GPIO pin: %d\n", pin);
        return false;
    }
    if (pin == 99) {
        // Can't read onboard LED state reliably
        return false;
    }
    // Only initialize the pin if not already configured as input
    if (!(gpio_input_configured_mask & (1ull << pin))) {
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_IN);
        gpio_input_configured_mask |= (1ull << pin);
    }
    return gpio_get(pin);
}

void hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    if (!is_valid_gpio(pin)) {
        printf("Invalid GPIO pin: %d\n", pin);
        return;
    }
    if (pin == 99) {
        // Can't configure onboard LED as input
        return;
    }
    gpio_init(pin);
    gpio_set_dir(pin, GPIO_IN);

    // Mark this pin as configured for input reads
    gpio_input_configured_mask |= (1ull << pin);

    // Configure pull-up or pull-down
    if (pull == GPIO_PULL_UP) {
        gpio_pull_up(pin);
    } else if (pull == GPIO_PULL_DOWN) {
        gpio_pull_down(pin);
    }
    // GPIO_PULL_NONE: no pull resistor (floating)
}

uint16_t hal_get_gpio_analog(uint8_t pin) {
    // ADC pins on Pico are GPIO 26-29 (ADC0-3)
    if (pin < 26 || pin > 29) {
        printf("Invalid ADC pin: %d (must be 26-29)\n", pin);
        return 0;
    }

    if (!adc_initialized) {
        adc_init();
        adc_initialized = true;
    }

    uint8_t adc_channel = pin - 26;
    adc_gpio_init(pin);
    adc_select_input(adc_channel);
    return adc_read();
}

void hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) {
    if (pin == 99) {
        printf("PWM not supported on onboard LED\n");
        return;
    }

    gpio_set_function(pin, GPIO_FUNC_PWM);
    uint slice_num = pwm_gpio_to_slice_num(pin);

    // Calculate wrap value for desired frequency
    // PWM clock is 125MHz by default
    uint32_t clock_freq = 125000000;
    uint32_t wrap = clock_freq / frequency - 1;
    if (wrap > 65535) wrap = 65535;
    if (wrap < 1) wrap = 1;

    pwm_set_wrap(slice_num, wrap);

    // Set duty cycle (0.0 to 1.0)
    uint16_t level = (uint16_t)(duty_cycle * (wrap + 1));
    pwm_set_chan_level(slice_num, pwm_gpio_to_channel(pin), level);

    pwm_set_enabled(slice_num, true);
    printf("PWM set on pin %d: freq=%lu, duty=%.2f\n", pin, frequency, duty_cycle);
}

void hal_i2c_init(uint8_t bus) {
    if (bus > 1) return;

    i2c_config_t* cfg = &i2c_configs[bus];
    if (cfg->configured) return;

    i2c_inst_t* i2c = (bus == 0) ? i2c0 : i2c1;

    i2c_init(i2c, cfg->frequency);
    gpio_set_function(cfg->sda_pin, GPIO_FUNC_I2C);
    gpio_set_function(cfg->scl_pin, GPIO_FUNC_I2C);
    gpio_pull_up(cfg->sda_pin);
    gpio_pull_up(cfg->scl_pin);

    cfg->configured = true;
    printf("I2C%d initialized on SDA=%d, SCL=%d @ %lu Hz\n",
           bus, cfg->sda_pin, cfg->scl_pin, cfg->frequency);
}

bool hal_i2c_validate_pins(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin) {
    const uint8_t (*valid_pins)[2];
    size_t count;

    if (bus == 0) {
        valid_pins = i2c0_valid_pins;
        count = sizeof(i2c0_valid_pins) / sizeof(i2c0_valid_pins[0]);
    } else if (bus == 1) {
        valid_pins = i2c1_valid_pins;
        count = sizeof(i2c1_valid_pins) / sizeof(i2c1_valid_pins[0]);
    } else {
        return false;
    }

    for (size_t i = 0; i < count; i++) {
        if (valid_pins[i][0] == sda_pin && valid_pins[i][1] == scl_pin) {
            return true;
        }
    }
    return false;
}

bool hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) {
    if (bus > 1) return false;
    if (!hal_i2c_validate_pins(bus, sda_pin, scl_pin)) return false;

    // Deinitialize if already configured
    if (i2c_configs[bus].configured) {
        hal_i2c_reset(bus);
    }

    // Store new configuration
    i2c_configs[bus].sda_pin = sda_pin;
    i2c_configs[bus].scl_pin = scl_pin;
    i2c_configs[bus].frequency = frequency;
    i2c_configs[bus].configured = false;

    // Initialize with new config
    hal_i2c_init(bus);

    return true;
}

const i2c_config_t* hal_i2c_get_config(uint8_t bus) {
    if (bus > 1) return nullptr;
    return &i2c_configs[bus];
}

void hal_i2c_reset(uint8_t bus) {
    if (bus > 1) return;

    if (i2c_configs[bus].configured) {
        i2c_inst_t* i2c = (bus == 0) ? i2c0 : i2c1;
        i2c_deinit(i2c);
        i2c_configs[bus].configured = false;
        printf("I2C%d reset\n", bus);
    }
}

i2c_scan_result_t hal_i2c_scan(uint8_t bus) {
    i2c_scan_result_t result = {0};
    hal_i2c_init(bus);

    i2c_inst_t* i2c = (bus == 0) ? i2c0 : i2c1;

    printf("Scanning I2C bus %d...\n", bus);
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        uint8_t rxdata;
        int ret = i2c_read_blocking(i2c, addr, &rxdata, 1, false);
        if (ret >= 0) {
            result.addresses[result.count++] = addr;
            printf("  Found device at 0x%02X\n", addr);
        }
    }
    printf("I2C scan complete, found %d devices\n", result.count);
    return result;
}

bool hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t* data, size_t len) {
    hal_i2c_init(bus);
    i2c_inst_t* i2c = (bus == 0) ? i2c0 : i2c1;

    int ret = i2c_write_blocking(i2c, address, data, len, false);
    if (ret == PICO_ERROR_GENERIC) {
        printf("I2C write failed to address 0x%02X\n", address);
        return false;
    }
    // Debug logging removed - was causing performance issues with display updates
    return true;
}

int hal_i2c_read(uint8_t bus, uint8_t address, uint8_t* buffer, size_t len, int reg) {
    hal_i2c_init(bus);
    i2c_inst_t* i2c = (bus == 0) ? i2c0 : i2c1;

    // If register specified, write it first
    if (reg >= 0) {
        uint8_t reg_byte = (uint8_t)reg;
        int ret = i2c_write_blocking(i2c, address, &reg_byte, 1, true); // keep bus
        if (ret == PICO_ERROR_GENERIC) {
            printf("I2C write register 0x%02X failed\n", reg);
            return -1;
        }
    }

    int ret = i2c_read_blocking(i2c, address, buffer, len, false);
    if (ret == PICO_ERROR_GENERIC) {
        printf("I2C read failed from address 0x%02X\n", address);
        return -1;
    }
    // Debug logging removed - was causing performance issues
    return ret;
}

void hal_blink_led(uint32_t duration_ms) {
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 1);
    sleep_ms(duration_ms);
    cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 0);
}

// === Temperature sensor ===

float hal_get_temperature(void) {
    if (!adc_initialized) {
        adc_init();
        adc_initialized = true;
    }
    adc_set_temp_sensor_enabled(true);
    adc_select_input(4);
    uint16_t raw = adc_read();
    float voltage = raw * 3.3f / 4096.0f;
    float temp = 27.0f - (voltage - 0.706f) / 0.001721f;
    return temp;
}

// === Watchdog timer ===

static bool wdt_enabled = false;

bool hal_watchdog_configure(uint32_t timeout_ms, bool enable) {
    if (enable) {
        watchdog_enable(timeout_ms, true);  // true = pause on debug
        wdt_enabled = true;
        printf("Watchdog enabled with timeout %lu ms\n", timeout_ms);
        return true;
    } else {
        // On Pico, once enabled, watchdog cannot be disabled
        if (wdt_enabled) {
            printf("Watchdog cannot be disabled once enabled on Pico\n");
            return false;
        }
        return true;
    }
}

void hal_watchdog_feed(void) {
    if (wdt_enabled) {
        watchdog_update();
    }
}

// === SPI ===

typedef struct {
    uint8_t clk_pin;
    uint8_t mosi_pin;
    uint8_t miso_pin;
    uint8_t cs_pin;
    uint32_t frequency;
    uint8_t mode;
    bool configured;
} spi_config_t;

static spi_config_t spi_configs[2] = {
    { .clk_pin = 0, .mosi_pin = 0, .miso_pin = 0, .cs_pin = 0, .frequency = 0, .mode = 0, .configured = false },
    { .clk_pin = 0, .mosi_pin = 0, .miso_pin = 0, .cs_pin = 0, .frequency = 0, .mode = 0, .configured = false }
};

static spi_inst_t* get_spi_inst(uint8_t bus) {
    if (bus == 0) return spi0;
    if (bus == 1) return spi1;
    return nullptr;
}

bool hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode) {
    if (bus > 1) return false;

    spi_inst_t* spi = get_spi_inst(bus);
    if (!spi) return false;

    // Deinitialize if already configured
    if (spi_configs[bus].configured) {
        spi_deinit(spi);
    }

    spi_init(spi, frequency);

    // Set SPI format based on mode (CPOL/CPHA)
    spi_cpol_t cpol = (mode & 0x02) ? SPI_CPOL_1 : SPI_CPOL_0;
    spi_cpha_t cpha = (mode & 0x01) ? SPI_CPHA_1 : SPI_CPHA_0;
    spi_set_format(spi, 8, cpol, cpha, SPI_MSB_FIRST);

    // Configure pins
    gpio_set_function(clk_pin, GPIO_FUNC_SPI);
    gpio_set_function(mosi_pin, GPIO_FUNC_SPI);
    gpio_set_function(miso_pin, GPIO_FUNC_SPI);

    // CS pin managed manually via GPIO
    gpio_init(cs_pin);
    gpio_set_dir(cs_pin, GPIO_OUT);
    gpio_put(cs_pin, 1);  // CS high (deselected)

    spi_configs[bus].clk_pin = clk_pin;
    spi_configs[bus].mosi_pin = mosi_pin;
    spi_configs[bus].miso_pin = miso_pin;
    spi_configs[bus].cs_pin = cs_pin;
    spi_configs[bus].frequency = frequency;
    spi_configs[bus].mode = mode;
    spi_configs[bus].configured = true;

    printf("SPI%d configured: CLK=%d MOSI=%d MISO=%d CS=%d freq=%lu mode=%d\n",
           bus, clk_pin, mosi_pin, miso_pin, cs_pin, frequency, mode);
    return true;
}

spi_transfer_result_t hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len) {
    spi_transfer_result_t result = { .data = {0}, .len = 0 };

    if (bus > 1 || !spi_configs[bus].configured) return result;
    if (len > sizeof(result.data)) len = sizeof(result.data);

    spi_inst_t* spi = get_spi_inst(bus);
    uint8_t cs_pin = spi_configs[bus].cs_pin;

    gpio_put(cs_pin, 0);  // CS low
    spi_write_read_blocking(spi, data, result.data, len);
    gpio_put(cs_pin, 1);  // CS high

    result.len = len;
    return result;
}

bool hal_spi_write(uint8_t bus, const uint8_t *data, size_t len) {
    if (bus > 1 || !spi_configs[bus].configured) return false;

    spi_inst_t* spi = get_spi_inst(bus);
    uint8_t cs_pin = spi_configs[bus].cs_pin;

    gpio_put(cs_pin, 0);  // CS low
    spi_write_blocking(spi, data, len);
    gpio_put(cs_pin, 1);  // CS high

    return true;
}

spi_transfer_result_t hal_spi_read(uint8_t bus, size_t len) {
    spi_transfer_result_t result = { .data = {0}, .len = 0 };

    if (bus > 1 || !spi_configs[bus].configured) return result;
    if (len > sizeof(result.data)) len = sizeof(result.data);

    spi_inst_t* spi = get_spi_inst(bus);
    uint8_t cs_pin = spi_configs[bus].cs_pin;

    gpio_put(cs_pin, 0);  // CS low
    spi_read_blocking(spi, 0x00, result.data, len);
    gpio_put(cs_pin, 1);  // CS high

    result.len = len;
    return result;
}

// === UART ===

typedef struct {
    uint8_t tx_pin;
    uint8_t rx_pin;
    uint32_t baud_rate;
    bool configured;
} uart_config_t;

static uart_config_t uart_configs[2] = {
    { .tx_pin = 0, .rx_pin = 0, .baud_rate = 0, .configured = false },
    { .tx_pin = 0, .rx_pin = 0, .baud_rate = 0, .configured = false }
};

static uart_inst_t* get_uart_inst(uint8_t port) {
    if (port == 0) return uart0;
    if (port == 1) return uart1;
    return nullptr;
}

bool hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity) {
    if (port > 1) return false;

    uart_inst_t* uart = get_uart_inst(port);
    if (!uart) return false;

    // Deinitialize if already configured
    if (uart_configs[port].configured) {
        uart_deinit(uart);
    }

    uart_init(uart, baud_rate);
    gpio_set_function(tx_pin, GPIO_FUNC_UART);
    gpio_set_function(rx_pin, GPIO_FUNC_UART);

    // Map parity: 0=none, 1=even, 2=odd
    uart_parity_t p;
    switch (parity) {
        case 1: p = UART_PARITY_EVEN; break;
        case 2: p = UART_PARITY_ODD; break;
        default: p = UART_PARITY_NONE; break;
    }

    uart_set_format(uart, data_bits, stop_bits, p);

    uart_configs[port].tx_pin = tx_pin;
    uart_configs[port].rx_pin = rx_pin;
    uart_configs[port].baud_rate = baud_rate;
    uart_configs[port].configured = true;

    printf("UART%d configured: TX=%d RX=%d baud=%lu data=%d stop=%d parity=%d\n",
           port, tx_pin, rx_pin, baud_rate, data_bits, stop_bits, parity);
    return true;
}

bool hal_uart_write(uint8_t port, const uint8_t *data, size_t len) {
    if (port > 1 || !uart_configs[port].configured) return false;

    uart_inst_t* uart = get_uart_inst(port);
    uart_write_blocking(uart, data, len);
    return true;
}

uart_read_result_t hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms) {
    uart_read_result_t result = { .data = {0}, .len = 0 };

    if (port > 1 || !uart_configs[port].configured) return result;
    if (bytes_to_read > sizeof(result.data)) bytes_to_read = sizeof(result.data);

    uart_inst_t* uart = get_uart_inst(port);
    uint32_t start = to_ms_since_boot(get_absolute_time());

    while (result.len < bytes_to_read) {
        uint32_t elapsed = to_ms_since_boot(get_absolute_time()) - start;
        if (elapsed >= timeout_ms) break;

        uint32_t remaining_ms = timeout_ms - elapsed;
        // Convert remaining ms to us for the readable check
        uint32_t remaining_us = remaining_ms * 1000;
        if (remaining_us > 1000000) remaining_us = 1000000;  // Cap at 1 second per check

        if (uart_is_readable_within_us(uart, remaining_us)) {
            result.data[result.len++] = uart_getc(uart);
        } else {
            // Timeout on this byte, stop reading
            break;
        }
    }

    return result;
}

// === PIO / WS2812 ===

static PIO ws2812_pio = pio0;
static uint ws2812_sm = 0;
static bool ws2812_configured = false;
static uint16_t ws2812_num_leds = 0;

bool hal_pio_ws2812_configure(uint8_t pin, uint16_t num_leds) {
    if (ws2812_configured) {
        // Disable and remove existing program
        pio_sm_set_enabled(ws2812_pio, ws2812_sm, false);
        pio_remove_program(ws2812_pio, &ws2812_program, 0);
        ws2812_configured = false;
    }

    uint offset = pio_add_program(ws2812_pio, &ws2812_program);
    ws2812_program_init(ws2812_pio, ws2812_sm, offset, pin, 800000.0f, false);

    ws2812_num_leds = num_leds;
    ws2812_configured = true;

    printf("WS2812 configured: pin=%d num_leds=%d\n", pin, num_leds);
    return true;
}

bool hal_pio_ws2812_update(const uint8_t *pixel_data, size_t len) {
    if (!ws2812_configured) return false;

    size_t num_pixels = len / 3;
    if (num_pixels > ws2812_num_leds) num_pixels = ws2812_num_leds;

    for (size_t i = 0; i < num_pixels; i++) {
        // Input is RGB, WS2812 expects GRB
        uint8_t r = pixel_data[i * 3 + 0];
        uint8_t g = pixel_data[i * 3 + 1];
        uint8_t b = pixel_data[i * 3 + 2];
        uint32_t grb = ((uint32_t)g << 16) | ((uint32_t)r << 8) | (uint32_t)b;
        pio_sm_put_blocking(ws2812_pio, ws2812_sm, grb << 8u);
    }

    return true;
}
