#include "hal.h"
#include "hal_mock.h"

// Global mock state
HalMockState g_hal_mock;

void hal_init() {
    // No-op in tests
}

void hal_reboot() {
    // No-op in tests
}

void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    // No-op in tests
}

bool hal_get_gpio_digital(uint8_t pin) {
    return false;
}

uint16_t hal_get_gpio_analog(uint8_t pin) {
    return 0;
}

void hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    // No-op in tests
}

void hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) {
    // No-op in tests
}

void hal_i2c_init(uint8_t bus) {
    if (bus < 2) {
        g_hal_mock.i2c_configs[bus].configured = true;
    }
}

i2c_scan_result_t hal_i2c_scan(uint8_t bus) {
    g_hal_mock.i2c_scan_calls.push_back(bus);

    i2c_scan_result_t result = {};
    result.count = g_hal_mock.i2c_scan_addresses.size();
    for (size_t i = 0; i < result.count && i < 128; i++) {
        result.addresses[i] = g_hal_mock.i2c_scan_addresses[i];
    }
    return result;
}

bool hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t* data, size_t len) {
    HalMockState::I2CWriteCall call;
    call.bus = bus;
    call.address = address;
    call.data.assign(data, data + len);
    g_hal_mock.i2c_write_calls.push_back(call);

    return g_hal_mock.i2c_write_return;
}

int hal_i2c_read(uint8_t bus, uint8_t address, uint8_t* buffer, size_t len, int reg) {
    HalMockState::I2CReadCall call;
    call.bus = bus;
    call.address = address;
    call.len = len;
    call.reg = reg;
    g_hal_mock.i2c_read_calls.push_back(call);

    if (g_hal_mock.i2c_read_return < 0) {
        return g_hal_mock.i2c_read_return;
    }

    size_t bytes_to_copy = std::min(len, g_hal_mock.i2c_read_data.size());
    if (bytes_to_copy > 0) {
        memcpy(buffer, g_hal_mock.i2c_read_data.data(), bytes_to_copy);
    }
    return g_hal_mock.i2c_read_return > 0 ? g_hal_mock.i2c_read_return : (int)bytes_to_copy;
}

bool hal_i2c_validate_pins(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin) {
    // Simulate real validation logic
    if (bus > 1) return false;

    static const uint8_t i2c0_valid_pins[][2] = {
        {0, 1}, {4, 5}, {8, 9}, {12, 13}, {16, 17}, {20, 21}
    };
    static const uint8_t i2c1_valid_pins[][2] = {
        {2, 3}, {6, 7}, {10, 11}, {14, 15}, {18, 19}, {26, 27}
    };

    const uint8_t (*valid_pins)[2];
    size_t num_pairs;

    if (bus == 0) {
        valid_pins = i2c0_valid_pins;
        num_pairs = sizeof(i2c0_valid_pins) / sizeof(i2c0_valid_pins[0]);
    } else {
        valid_pins = i2c1_valid_pins;
        num_pairs = sizeof(i2c1_valid_pins) / sizeof(i2c1_valid_pins[0]);
    }

    for (size_t i = 0; i < num_pairs; i++) {
        if (valid_pins[i][0] == sda_pin && valid_pins[i][1] == scl_pin) {
            return g_hal_mock.i2c_validate_pins_return;
        }
    }

    return false;
}

bool hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) {
    HalMockState::I2CConfigureCall call;
    call.bus = bus;
    call.sda_pin = sda_pin;
    call.scl_pin = scl_pin;
    call.frequency = frequency;
    g_hal_mock.i2c_configure_calls.push_back(call);

    if (!g_hal_mock.i2c_configure_return) {
        return false;
    }

    if (bus < 2) {
        g_hal_mock.i2c_configs[bus].sda_pin = sda_pin;
        g_hal_mock.i2c_configs[bus].scl_pin = scl_pin;
        g_hal_mock.i2c_configs[bus].frequency = frequency;
        g_hal_mock.i2c_configs[bus].configured = true;
    }

    return true;
}

const i2c_config_t* hal_i2c_get_config(uint8_t bus) {
    if (bus > 1) return nullptr;

    static i2c_config_t config;
    config.sda_pin = g_hal_mock.i2c_configs[bus].sda_pin;
    config.scl_pin = g_hal_mock.i2c_configs[bus].scl_pin;
    config.frequency = g_hal_mock.i2c_configs[bus].frequency;
    config.configured = g_hal_mock.i2c_configs[bus].configured;
    return &config;
}

void hal_i2c_reset(uint8_t bus) {
    if (bus < 2) {
        g_hal_mock.i2c_configs[bus].configured = false;
    }
}

void hal_blink_led(uint32_t duration_ms) {
    // No-op in tests
}
