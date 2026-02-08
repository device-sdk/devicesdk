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

void iotkit_hal_init(void) {
    // No-op in tests
}

void iotkit_hal_reboot(void) {
    g_hal_mock.reboot_called = true;
}

void iotkit_hal_blink_led(int count) {
    (void)count;
}

void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state) {
    if (g_hal_mock.gpio_set_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.gpio_set_call_count++;
        g_hal_mock.gpio_set_calls[idx].pin = pin;
        g_hal_mock.gpio_set_calls[idx].state = (state == GPIO_STATE_HIGH) ? 1 : 0;
    }
}

bool iotkit_hal_get_gpio_digital(uint8_t pin) {
    (void)pin;
    return g_hal_mock.gpio_digital_return;
}

uint16_t iotkit_hal_get_gpio_analog(uint8_t pin) {
    (void)pin;
    return g_hal_mock.gpio_analog_return;
}

void iotkit_hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    if (g_hal_mock.gpio_configure_input_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.gpio_configure_input_call_count++;
        g_hal_mock.gpio_configure_input_calls[idx].pin = pin;
        g_hal_mock.gpio_configure_input_calls[idx].pull = (int)pull;
    }
}

void iotkit_hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) {
    if (g_hal_mock.pwm_set_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.pwm_set_call_count++;
        g_hal_mock.pwm_set_calls[idx].pin = pin;
        g_hal_mock.pwm_set_calls[idx].frequency = frequency;
        g_hal_mock.pwm_set_calls[idx].duty_cycle = duty_cycle;
    }
}

bool iotkit_hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) {
    if (g_hal_mock.i2c_configure_call_count < MAX_MOCK_CALLS) {
        int idx = g_hal_mock.i2c_configure_call_count++;
        g_hal_mock.i2c_configure_calls[idx].bus = bus;
        g_hal_mock.i2c_configure_calls[idx].sda_pin = sda_pin;
        g_hal_mock.i2c_configure_calls[idx].scl_pin = scl_pin;
        g_hal_mock.i2c_configure_calls[idx].frequency = frequency;
    }
    return g_hal_mock.i2c_configure_return;
}

i2c_scan_result_t iotkit_hal_i2c_scan(uint8_t bus) {
    if (g_hal_mock.i2c_scan_call_count < MAX_MOCK_CALLS) {
        g_hal_mock.i2c_scan_calls[g_hal_mock.i2c_scan_call_count++] = bus;
    }

    i2c_scan_result_t result;
    memset(&result, 0, sizeof(result));
    result.count = g_hal_mock.i2c_scan_address_count;
    memcpy(result.addresses, g_hal_mock.i2c_scan_addresses, result.count);
    return result;
}

bool iotkit_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len) {
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

int iotkit_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg) {
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
