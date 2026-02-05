#include "hal.h"
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"
#include "hardware/pwm.h"
#include "hardware/adc.h"
#include "hardware/i2c.h"
#include "hardware/watchdog.h"
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

void hal_init() {
    // Nothing to do here for now - peripherals initialized on demand
}

void hal_reboot() {
    printf("Rebooting device...\n");
    watchdog_reboot(0, 0, 0);
    while(1) { tight_loop_contents(); }
}

void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    bool pin_state = (state == GPIO_STATE_HIGH);
    if (pin == 99) { // Special case for the onboard LED
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, pin_state);
    } else {
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_OUT);
        gpio_put(pin, pin_state);
    }
}

// Track which pins have been configured as inputs
static uint32_t gpio_input_configured_mask = 0;

bool hal_get_gpio_digital(uint8_t pin) {
    if (pin == 99) {
        // Can't read onboard LED state reliably
        return false;
    }
    // Only initialize the pin if not already configured as input
    if (!(gpio_input_configured_mask & (1u << pin))) {
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_IN);
        gpio_input_configured_mask |= (1u << pin);
    }
    return gpio_get(pin);
}

void hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    if (pin == 99) {
        // Can't configure onboard LED as input
        return;
    }
    gpio_init(pin);
    gpio_set_dir(pin, GPIO_IN);

    // Mark this pin as configured for input reads
    gpio_input_configured_mask |= (1u << pin);

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
