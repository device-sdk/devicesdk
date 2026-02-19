#include "hal.h"

#ifdef UNIT_TEST

// Stubs — replaced by mock in tests
void iotkit_hal_init(void) {}
void iotkit_hal_reboot(void) {}
void iotkit_hal_blink_led(int count) { (void)count; }
void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state) { (void)pin; (void)state; }
bool iotkit_hal_get_gpio_digital(uint8_t pin) { (void)pin; return false; }
uint16_t iotkit_hal_get_gpio_analog(uint8_t pin) { (void)pin; return 0; }
void iotkit_hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) { (void)pin; (void)pull; }
void iotkit_hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) { (void)pin; (void)frequency; (void)duty_cycle; }
bool iotkit_hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) { (void)bus; (void)sda_pin; (void)scl_pin; (void)frequency; return true; }
i2c_scan_result_t iotkit_hal_i2c_scan(uint8_t bus) { (void)bus; i2c_scan_result_t r = {0}; return r; }
bool iotkit_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len) { (void)bus; (void)address; (void)data; (void)len; return true; }
int iotkit_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg) { (void)bus; (void)address; (void)buffer; (void)len; (void)reg; return 0; }

#else

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_adc/adc_oneshot.h"
#include "driver/i2c_master.h"
#include "esp_system.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
#include "led_strip.h"
#include "led_strip_spi.h"
#endif

static const char *TAG = "HAL";

#define ONBOARD_LED_PIN CONFIG_IOTKIT_LED_PIN

#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
static led_strip_handle_t led_strip_handle = NULL;
#endif

// Track pins configured as inputs
static uint64_t gpio_input_configured_mask = 0;

// ADC
static adc_oneshot_unit_handle_t adc1_handle = NULL;
static bool adc_channels_configured[10] = {false};  // ADC1 channels 0-9

// PWM (LEDC)
#define LEDC_TIMER_RESOLUTION LEDC_TIMER_13_BIT
static int ledc_channel_map[GPIO_NUM_MAX];
static int ledc_next_channel = 0;
static bool ledc_channel_map_initialized = false;

// I2C
static i2c_master_bus_handle_t i2c_bus_handles[2] = {NULL, NULL};

// Cache I2C device handles per bus+address
#define MAX_I2C_DEVICES_PER_BUS 16
typedef struct {
    uint8_t address;
    i2c_master_dev_handle_t handle;
} i2c_device_cache_entry_t;

static i2c_device_cache_entry_t i2c_device_cache[2][MAX_I2C_DEVICES_PER_BUS];
static int i2c_device_cache_count[2] = {0, 0};

static i2c_master_dev_handle_t get_or_create_i2c_device(uint8_t bus, uint8_t address) {
    if (bus > 1 || !i2c_bus_handles[bus]) return NULL;

    // Look up in cache
    for (int i = 0; i < i2c_device_cache_count[bus]; i++) {
        if (i2c_device_cache[bus][i].address == address) {
            return i2c_device_cache[bus][i].handle;
        }
    }

    // Create new device handle
    if (i2c_device_cache_count[bus] >= MAX_I2C_DEVICES_PER_BUS) {
        ESP_LOGE(TAG, "I2C device cache full for bus %d", bus);
        return NULL;
    }

    i2c_device_config_t dev_cfg = {
        .dev_addr_length = I2C_ADDR_BIT_LEN_7,
        .device_address = address,
        .scl_speed_hz = 100000,  // Will be overridden by bus config
    };

    i2c_master_dev_handle_t dev_handle;
    esp_err_t ret = i2c_master_bus_add_device(i2c_bus_handles[bus], &dev_cfg, &dev_handle);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add I2C device 0x%02X on bus %d: %s", address, bus, esp_err_to_name(ret));
        return NULL;
    }

    int idx = i2c_device_cache_count[bus]++;
    i2c_device_cache[bus][idx].address = address;
    i2c_device_cache[bus][idx].handle = dev_handle;
    return dev_handle;
}

void iotkit_hal_init(void) {
    if (!ledc_channel_map_initialized) {
        for (int i = 0; i < GPIO_NUM_MAX; i++) {
            ledc_channel_map[i] = -1;
        }
        ledc_channel_map_initialized = true;
    }

#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
    led_strip_config_t strip_config = {
        .strip_gpio_num = ONBOARD_LED_PIN,
        .max_leds = 1,
    };
    led_strip_spi_config_t spi_config = {
        .clk_src = SPI_CLK_SRC_DEFAULT,
        .spi_bus = SPI2_HOST,
        .flags.with_dma = true,
    };
    ESP_ERROR_CHECK(led_strip_new_spi_device(&strip_config, &spi_config, &led_strip_handle));
    led_strip_clear(led_strip_handle);
    ESP_LOGI(TAG, "Addressable LED initialized on GPIO %d", ONBOARD_LED_PIN);
#endif

    ESP_LOGI(TAG, "HAL initialized");
}

void iotkit_hal_reboot(void) {
    ESP_LOGI(TAG, "Rebooting device...");
    esp_restart();
}

void iotkit_hal_blink_led(int count) {
    for (int i = 0; i < count; ++i) {
#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
        if (led_strip_handle) {
            led_strip_set_pixel(led_strip_handle, 0, 16, 16, 16);
            led_strip_refresh(led_strip_handle);
            vTaskDelay(100 / portTICK_PERIOD_MS);
            led_strip_clear(led_strip_handle);
            vTaskDelay(100 / portTICK_PERIOD_MS);
        }
#else
        iotkit_hal_set_gpio(ONBOARD_LED_PIN, GPIO_STATE_HIGH);
        vTaskDelay(100 / portTICK_PERIOD_MS);
        iotkit_hal_set_gpio(ONBOARD_LED_PIN, GPIO_STATE_LOW);
        vTaskDelay(100 / portTICK_PERIOD_MS);
#endif
    }
}

void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state) {
#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
    // Map onboard LED pin or virtual pin 99 to the addressable LED
    if ((pin == ONBOARD_LED_PIN || pin == 99) && led_strip_handle) {
        if (state == GPIO_STATE_HIGH) {
            led_strip_set_pixel(led_strip_handle, 0, 16, 16, 16);
            led_strip_refresh(led_strip_handle);
        } else {
            led_strip_clear(led_strip_handle);
        }
        return;
    }
#endif
    if (pin >= GPIO_NUM_MAX) {
        ESP_LOGE(TAG, "Invalid GPIO pin: %d", pin);
        return;
    }
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << pin),
        .mode = GPIO_MODE_OUTPUT,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    gpio_set_level(pin, state == GPIO_STATE_HIGH ? 1 : 0);
}

bool iotkit_hal_get_gpio_digital(uint8_t pin) {
    // Only initialize the pin if not already configured as input
    if (!(gpio_input_configured_mask & (1ULL << pin))) {
        gpio_config_t io_conf = {
            .pin_bit_mask = (1ULL << pin),
            .mode = GPIO_MODE_INPUT,
            .pull_up_en = GPIO_PULLUP_DISABLE,
            .pull_down_en = GPIO_PULLDOWN_DISABLE,
            .intr_type = GPIO_INTR_DISABLE,
        };
        gpio_config(&io_conf);
        gpio_input_configured_mask |= (1ULL << pin);
    }
    return gpio_get_level(pin) == 1;
}

uint16_t iotkit_hal_get_gpio_analog(uint8_t pin) {
    // ESP32 ADC1 GPIO mapping: GPIO 32-39 -> ADC1 channels 4-7, 0-3
    // Use adc_oneshot_io_to_channel to map automatically
    adc_unit_t unit;
    adc_channel_t channel;
    esp_err_t ret = adc_oneshot_io_to_channel(pin, &unit, &channel);
    if (ret != ESP_OK || unit != ADC_UNIT_1) {
        ESP_LOGE(TAG, "Invalid ADC pin: %d (must be ADC1, not ADC2 which conflicts with WiFi)", pin);
        return 0;
    }

    // Lazy init ADC1
    if (!adc1_handle) {
        adc_oneshot_unit_init_cfg_t init_cfg = {
            .unit_id = ADC_UNIT_1,
        };
        ret = adc_oneshot_new_unit(&init_cfg, &adc1_handle);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to init ADC1: %s", esp_err_to_name(ret));
            return 0;
        }
    }

    // Configure channel if not already done
    if (channel < 10 && !adc_channels_configured[channel]) {
        adc_oneshot_chan_cfg_t chan_cfg = {
            .atten = ADC_ATTEN_DB_12,
            .bitwidth = ADC_BITWIDTH_DEFAULT,
        };
        ret = adc_oneshot_config_channel(adc1_handle, channel, &chan_cfg);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to configure ADC channel %d: %s", channel, esp_err_to_name(ret));
            return 0;
        }
        adc_channels_configured[channel] = true;
    }

    int raw_value = 0;
    ret = adc_oneshot_read(adc1_handle, channel, &raw_value);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "ADC read failed on pin %d: %s", pin, esp_err_to_name(ret));
        return 0;
    }

    return (uint16_t)raw_value;
}

void iotkit_hal_configure_gpio_input(uint8_t pin, gpio_pull_t pull) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << pin),
        .mode = GPIO_MODE_INPUT,
        .pull_up_en = (pull == GPIO_PULL_UP) ? GPIO_PULLUP_ENABLE : GPIO_PULLUP_DISABLE,
        .pull_down_en = (pull == GPIO_PULL_DOWN) ? GPIO_PULLDOWN_ENABLE : GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    gpio_config(&io_conf);
    gpio_input_configured_mask |= (1ULL << pin);
}

void iotkit_hal_set_pwm(uint8_t pin, uint32_t frequency, float duty_cycle) {
    // Assign a LEDC channel to this pin if not already assigned
    if (ledc_channel_map[pin] < 0) {
        if (ledc_next_channel >= LEDC_CHANNEL_MAX) {
            ESP_LOGE(TAG, "No more LEDC channels available");
            return;
        }
        ledc_channel_map[pin] = ledc_next_channel++;

        // Configure timer (use timer 0 for all channels, update frequency)
        ledc_timer_config_t timer_conf = {
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .duty_resolution = LEDC_TIMER_RESOLUTION,
            .timer_num = LEDC_TIMER_0,
            .freq_hz = frequency,
            .clk_cfg = LEDC_AUTO_CLK,
        };
        ledc_timer_config(&timer_conf);

        ledc_channel_config_t ch_conf = {
            .gpio_num = pin,
            .speed_mode = LEDC_LOW_SPEED_MODE,
            .channel = (ledc_channel_t)ledc_channel_map[pin],
            .intr_type = LEDC_INTR_DISABLE,
            .timer_sel = LEDC_TIMER_0,
            .duty = 0,
            .hpoint = 0,
        };
        ledc_channel_config(&ch_conf);
    }

    // Update frequency
    ledc_set_freq(LEDC_LOW_SPEED_MODE, LEDC_TIMER_0, frequency);

    // Set duty cycle (0.0 to 1.0 -> 0 to 2^13-1)
    uint32_t max_duty = (1 << LEDC_TIMER_13_BIT) - 1;
    uint32_t duty = (uint32_t)(duty_cycle * max_duty);
    ledc_set_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)ledc_channel_map[pin], duty);
    ledc_update_duty(LEDC_LOW_SPEED_MODE, (ledc_channel_t)ledc_channel_map[pin]);
}

bool iotkit_hal_i2c_configure(uint8_t bus, uint8_t sda_pin, uint8_t scl_pin, uint32_t frequency) {
    if (bus > 1) return false;

    // Deinitialize existing bus if configured
    if (i2c_bus_handles[bus]) {
        // Remove all cached devices first
        for (int i = 0; i < i2c_device_cache_count[bus]; i++) {
            i2c_master_bus_rm_device(i2c_device_cache[bus][i].handle);
        }
        i2c_device_cache_count[bus] = 0;

        i2c_del_master_bus(i2c_bus_handles[bus]);
        i2c_bus_handles[bus] = NULL;
    }

    i2c_master_bus_config_t bus_cfg = {
        .i2c_port = bus,
        .sda_io_num = sda_pin,
        .scl_io_num = scl_pin,
        .clk_source = I2C_CLK_SRC_DEFAULT,
        .glitch_ignore_cnt = 7,
        .flags.enable_internal_pullup = true,
    };

    esp_err_t ret = i2c_new_master_bus(&bus_cfg, &i2c_bus_handles[bus]);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure I2C bus %d: %s", bus, esp_err_to_name(ret));
        return false;
    }

    ESP_LOGI(TAG, "I2C%d configured: SDA=%d, SCL=%d, freq=%lu Hz", bus, sda_pin, scl_pin, (unsigned long)frequency);
    return true;
}

i2c_scan_result_t iotkit_hal_i2c_scan(uint8_t bus) {
    i2c_scan_result_t result = {0};

    if (bus > 1 || !i2c_bus_handles[bus]) {
        ESP_LOGE(TAG, "I2C bus %d not configured", bus);
        return result;
    }

    ESP_LOGI(TAG, "Scanning I2C bus %d...", bus);
    for (uint8_t addr = 0x08; addr < 0x78; addr++) {
        esp_err_t ret = i2c_master_probe(i2c_bus_handles[bus], addr, 100);
        if (ret == ESP_OK) {
            result.addresses[result.count++] = addr;
            ESP_LOGI(TAG, "  Found device at 0x%02X", addr);
        }
    }
    ESP_LOGI(TAG, "I2C scan complete, found %d devices", result.count);
    return result;
}

bool iotkit_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len) {
    i2c_master_dev_handle_t dev = get_or_create_i2c_device(bus, address);
    if (!dev) return false;

    esp_err_t ret = i2c_master_transmit(dev, data, len, 100);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2C write failed to 0x%02X on bus %d: %s", address, bus, esp_err_to_name(ret));
        return false;
    }
    return true;
}

int iotkit_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg) {
    i2c_master_dev_handle_t dev = get_or_create_i2c_device(bus, address);
    if (!dev) return -1;

    esp_err_t ret;
    if (reg >= 0) {
        uint8_t reg_byte = (uint8_t)reg;
        ret = i2c_master_transmit_receive(dev, &reg_byte, 1, buffer, len, 100);
    } else {
        ret = i2c_master_receive(dev, buffer, len, 100);
    }

    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "I2C read failed from 0x%02X on bus %d: %s", address, bus, esp_err_to_name(ret));
        return -1;
    }
    return (int)len;
}

#endif // UNIT_TEST
