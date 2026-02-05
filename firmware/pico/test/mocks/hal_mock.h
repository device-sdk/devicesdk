#ifndef HAL_MOCK_H
#define HAL_MOCK_H

#include <vector>
#include <tuple>
#include <cstdint>
#include <cstring>

// Mock state for tracking HAL calls and controlling return values
struct HalMockState {
    // I2C configuration tracking
    struct I2CConfigureCall {
        uint8_t bus;
        uint8_t sda_pin;
        uint8_t scl_pin;
        uint32_t frequency;
    };
    std::vector<I2CConfigureCall> i2c_configure_calls;

    // I2C write tracking
    struct I2CWriteCall {
        uint8_t bus;
        uint8_t address;
        std::vector<uint8_t> data;
    };
    std::vector<I2CWriteCall> i2c_write_calls;

    // I2C read tracking
    struct I2CReadCall {
        uint8_t bus;
        uint8_t address;
        size_t len;
        int reg;
    };
    std::vector<I2CReadCall> i2c_read_calls;

    // I2C scan tracking
    std::vector<uint8_t> i2c_scan_calls;

    // Return values for mocked functions
    bool i2c_configure_return = true;
    bool i2c_validate_pins_return = true;
    bool i2c_write_return = true;
    int i2c_read_return = 0;  // -1 for error, or bytes read
    std::vector<uint8_t> i2c_read_data;
    std::vector<uint8_t> i2c_scan_addresses;

    // I2C config state
    struct {
        uint8_t sda_pin = 4;
        uint8_t scl_pin = 5;
        uint32_t frequency = 100000;
        bool configured = false;
    } i2c_configs[2];

    void reset() {
        i2c_configure_calls.clear();
        i2c_write_calls.clear();
        i2c_read_calls.clear();
        i2c_scan_calls.clear();

        i2c_configure_return = true;
        i2c_validate_pins_return = true;
        i2c_write_return = true;
        i2c_read_return = 0;
        i2c_read_data.clear();
        i2c_scan_addresses.clear();

        i2c_configs[0] = {4, 5, 100000, false};
        i2c_configs[1] = {6, 7, 100000, false};
    }
};

extern HalMockState g_hal_mock;

#endif // HAL_MOCK_H
