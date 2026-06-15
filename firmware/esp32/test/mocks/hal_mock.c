#include "hal.h"
#include "hal_mock.h"
#include <string.h>

hal_mock_state_t g_hal_mock;

void hal_mock_reset(void) {
    memset(&g_hal_mock, 0, sizeof(g_hal_mock));
    g_hal_mock.i2c_configure_return = true;
    g_hal_mock.i2c_write_return = true;
    g_hal_mock.i2c_read_return = 0;
}

void devicesdk_hal_init(void) {
    // No-op in tests
}

void devicesdk_hal_reboot(void) {
    g_hal_mock.reboot_called = true;
}

void devicesdk_hal_blink_led(int count) {
    (void)count;
}

void devicesdk_hal_set_gpio(uint8_t pin, gpio_state_t state) {
    if (g_hal_mock.gpio_set_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.gpio_set_call_count++;
        g_hal_mock.gpio_set_calls[idx].pin = pin;
        g_hal_mock.gpio_set_calls[idx].state = (state == GPIO_STATE_HIGH) ? 1 : 0;
    }
}

bool devicesdk_hal_get_gpio_digital(uint8_t pin) {
    (void)pin;
    return g_hal_mock.gpio_digital_return;
}

uint16_t devicesdk_hal_get_gpio_analog(uint8_t pin) {
    (void)pin;
    return g_hal_mock.gpio_analog_return;
}

void devicesdk_hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    if (g_hal_mock.gpio_configure_input_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.gpio_configure_input_call_count++;
        g_hal_mock.gpio_configure_input_calls[idx].pin = pin;
        g_hal_mock.gpio_configure_input_calls[idx].pull = (int)pull;
    }
}

void devicesdk_hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) {
    if (g_hal_mock.pwm_set_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.pwm_set_call_count++;
        g_hal_mock.pwm_set_calls[idx].pin = pin;
        g_hal_mock.pwm_set_calls[idx].frequency = frequency;
        g_hal_mock.pwm_set_calls[idx].duty_cycle = duty_cycle;
    }
}

bool devicesdk_hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) {
    if (g_hal_mock.i2c_configure_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.i2c_configure_call_count++;
        g_hal_mock.i2c_configure_calls[idx].bus = bus;
        g_hal_mock.i2c_configure_calls[idx].sda_pin = sda_pin;
        g_hal_mock.i2c_configure_calls[idx].scl_pin = scl_pin;
        g_hal_mock.i2c_configure_calls[idx].frequency = frequency;
    }
    return g_hal_mock.i2c_configure_return;
}

i2c_scan_result_t devicesdk_hal_i2c_scan(uint8_t bus) {
    if (g_hal_mock.i2c_scan_call_count < MAX_MOCK_CALLS) {
        g_hal_mock.i2c_scan_calls[g_hal_mock.i2c_scan_call_count++] = bus;
    }

    i2c_scan_result_t result;
    memset(&result, 0, sizeof(result));
    result.count = g_hal_mock.i2c_scan_address_count;
    memcpy(result.addresses, g_hal_mock.i2c_scan_addresses, result.count);
    return result;
}

bool devicesdk_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len) {
    if (g_hal_mock.i2c_write_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.i2c_write_call_count++;
        g_hal_mock.i2c_write_calls[idx].bus = bus;
        g_hal_mock.i2c_write_calls[idx].address = address;
        size_t copy_len = (len < MAX_MOCK_WRITE_DATA) ? len : MAX_MOCK_WRITE_DATA;
        memcpy(g_hal_mock.i2c_write_calls[idx].data, data, copy_len);
        g_hal_mock.i2c_write_calls[idx].data_len = len;
    }
    return g_hal_mock.i2c_write_return;
}

int devicesdk_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg) {
    if (g_hal_mock.i2c_read_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.i2c_read_call_count++;
        g_hal_mock.i2c_read_calls[idx].bus = bus;
        g_hal_mock.i2c_read_calls[idx].address = address;
        g_hal_mock.i2c_read_calls[idx].len = len;
        g_hal_mock.i2c_read_calls[idx].reg = reg;
    }

    if (g_hal_mock.i2c_read_return < 0) {
        return g_hal_mock.i2c_read_return;
    }

    size_t bytes_to_copy = (len < g_hal_mock.i2c_read_data_len) ? len : g_hal_mock.i2c_read_data_len;
    if (bytes_to_copy > 0) {
        memcpy(buffer, g_hal_mock.i2c_read_data, bytes_to_copy);
    }
    return g_hal_mock.i2c_read_return > 0 ? g_hal_mock.i2c_read_return : (int)bytes_to_copy;
}

float devicesdk_hal_get_temperature(void) {
    return 25.0f;
}

bool devicesdk_hal_watchdog_configure(uint32_t timeout_ms, bool enable) {
    (void)timeout_ms;
    (void)enable;
    return true;
}

void devicesdk_hal_watchdog_feed(void) {
}

bool devicesdk_hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode) {
    (void)bus; (void)clk_pin; (void)mosi_pin; (void)miso_pin; (void)cs_pin; (void)frequency; (void)mode;
    return true;
}

spi_transfer_result_t devicesdk_hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len) {
    (void)bus; (void)data; (void)len;
    spi_transfer_result_t result;
    memset(&result, 0, sizeof(result));
    return result;
}

bool devicesdk_hal_spi_write(uint8_t bus, const uint8_t *data, size_t len) {
    (void)bus; (void)data; (void)len;
    return true;
}

spi_transfer_result_t devicesdk_hal_spi_read(uint8_t bus, size_t len) {
    (void)bus; (void)len;
    spi_transfer_result_t result;
    memset(&result, 0, sizeof(result));
    return result;
}

bool devicesdk_hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity) {
    (void)port; (void)tx_pin; (void)rx_pin; (void)baud_rate; (void)data_bits; (void)stop_bits; (void)parity;
    return true;
}

bool devicesdk_hal_uart_write(uint8_t port, const uint8_t *data, size_t len) {
    (void)port; (void)data; (void)len;
    return true;
}

uart_read_result_t devicesdk_hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms) {
    (void)port; (void)bytes_to_read; (void)timeout_ms;
    uart_read_result_t result;
    memset(&result, 0, sizeof(result));
    return result;
}
