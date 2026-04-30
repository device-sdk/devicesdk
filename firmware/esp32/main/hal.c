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
bool iotkit_hal_i2c_probe(uint8_t bus, uint8_t address) { (void)bus; (void)address; return false; }
bool iotkit_hal_i2c_write(uint8_t bus, uint8_t address, const uint8_t *data, size_t len) { (void)bus; (void)address; (void)data; (void)len; return true; }
int iotkit_hal_i2c_read(uint8_t bus, uint8_t address, uint8_t *buffer, size_t len, int reg) { (void)bus; (void)address; (void)buffer; (void)len; (void)reg; return 0; }
float iotkit_hal_get_temperature(void) { return 25.0f; }
bool iotkit_hal_watchdog_configure(uint32_t timeout_ms, bool enable) { (void)timeout_ms; (void)enable; return true; }
void iotkit_hal_watchdog_feed(void) {}
bool iotkit_hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode) { (void)bus; (void)clk_pin; (void)mosi_pin; (void)miso_pin; (void)cs_pin; (void)frequency; (void)mode; return true; }
spi_transfer_result_t iotkit_hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len) { (void)bus; (void)data; (void)len; spi_transfer_result_t r = {0}; return r; }
bool iotkit_hal_spi_write(uint8_t bus, const uint8_t *data, size_t len) { (void)bus; (void)data; (void)len; return true; }
spi_transfer_result_t iotkit_hal_spi_read(uint8_t bus, size_t len) { (void)bus; (void)len; spi_transfer_result_t r = {0}; return r; }
bool iotkit_hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity) { (void)port; (void)tx_pin; (void)rx_pin; (void)baud_rate; (void)data_bits; (void)stop_bits; (void)parity; return true; }
bool iotkit_hal_uart_write(uint8_t port, const uint8_t *data, size_t len) { (void)port; (void)data; (void)len; return true; }
uart_read_result_t iotkit_hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms) { (void)port; (void)bytes_to_read; (void)timeout_ms; uart_read_result_t r = {0}; return r; }

#else

#include "driver/gpio.h"
#include "driver/ledc.h"
#include "esp_adc/adc_oneshot.h"
#include "driver/i2c_master.h"
#include "soc/soc_caps.h"
#if SOC_TEMP_SENSOR_SUPPORTED
#include "driver/temperature_sensor.h"
#endif
#include "driver/spi_master.h"
#include "driver/uart.h"
#include "esp_task_wdt.h"
#include "esp_system.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#ifdef CONFIG_IOTKIT_LED_IS_ADDRESSABLE
#include "led_strip.h"
#if SOC_RMT_SUPPORTED
#include "led_strip_rmt.h"
#else
#include "led_strip_spi.h"
#endif
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

// Temperature sensor
#if SOC_TEMP_SENSOR_SUPPORTED
static temperature_sensor_handle_t temp_sensor_handle = NULL;
#endif

// Watchdog
static bool wdt_subscribed = false;

// SPI
static spi_device_handle_t spi_device_handles[2] = {NULL, NULL};
static bool spi_bus_initialized[2] = {false, false};

// UART
static bool uart_port_initialized[3] = {false, false, false};

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
#if SOC_RMT_SUPPORTED
    led_strip_rmt_config_t rmt_config = {
        .clk_src = RMT_CLK_SRC_DEFAULT,
        .resolution_hz = 10 * 1000 * 1000,
    };
    ESP_ERROR_CHECK(led_strip_new_rmt_device(&strip_config, &rmt_config, &led_strip_handle));
#else
    led_strip_spi_config_t spi_config = {
        .clk_src = SPI_CLK_SRC_DEFAULT,
        .spi_bus = SPI2_HOST,
        .flags.with_dma = true,
    };
    ESP_ERROR_CHECK(led_strip_new_spi_device(&strip_config, &spi_config, &led_strip_handle));
#endif
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

bool iotkit_hal_i2c_probe(uint8_t bus, uint8_t address) {
    if (bus > 1 || !i2c_bus_handles[bus]) return false;
    return i2c_master_probe(i2c_bus_handles[bus], address, 50) == ESP_OK;
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

// === Temperature Sensor ===

float iotkit_hal_get_temperature(void) {
#if SOC_TEMP_SENSOR_SUPPORTED
    if (!temp_sensor_handle) {
        temperature_sensor_config_t config = TEMPERATURE_SENSOR_CONFIG_DEFAULT(-10, 80);
        esp_err_t ret = temperature_sensor_install(&config, &temp_sensor_handle);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to install temperature sensor: %s", esp_err_to_name(ret));
            return -999.0f;
        }
        ret = temperature_sensor_enable(temp_sensor_handle);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to enable temperature sensor: %s", esp_err_to_name(ret));
            temperature_sensor_uninstall(temp_sensor_handle);
            temp_sensor_handle = NULL;
            return -999.0f;
        }
    }

    float celsius = 0.0f;
    esp_err_t ret = temperature_sensor_get_celsius(temp_sensor_handle, &celsius);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to read temperature: %s", esp_err_to_name(ret));
        return -999.0f;
    }
    return celsius;
#else
    return -999.0f;
#endif
}

// === Watchdog Timer ===

bool iotkit_hal_watchdog_configure(uint32_t timeout_ms, bool enable) {
    esp_err_t ret;

    if (enable) {
        esp_task_wdt_config_t wdt_config = {
            .timeout_ms = timeout_ms,
            .idle_core_mask = 0,
            .trigger_panic = true,
        };
        ret = esp_task_wdt_reconfigure(&wdt_config);
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to reconfigure watchdog: %s", esp_err_to_name(ret));
            return false;
        }

        if (!wdt_subscribed) {
            ret = esp_task_wdt_add(NULL);
            if (ret != ESP_OK) {
                ESP_LOGE(TAG, "Failed to add task to watchdog: %s", esp_err_to_name(ret));
                return false;
            }
            wdt_subscribed = true;
        }
        ESP_LOGI(TAG, "Watchdog configured: timeout=%lu ms", (unsigned long)timeout_ms);
    } else {
        if (wdt_subscribed) {
            ret = esp_task_wdt_delete(NULL);
            if (ret != ESP_OK) {
                ESP_LOGE(TAG, "Failed to remove task from watchdog: %s", esp_err_to_name(ret));
                return false;
            }
            wdt_subscribed = false;
        }
        ESP_LOGI(TAG, "Watchdog disabled for current task");
    }
    return true;
}

void iotkit_hal_watchdog_feed(void) {
    if (wdt_subscribed) {
        esp_err_t ret = esp_task_wdt_reset();
        if (ret != ESP_OK) {
            ESP_LOGE(TAG, "Failed to feed watchdog: %s", esp_err_to_name(ret));
        }
    }
}

// === SPI ===

bool iotkit_hal_spi_configure(uint8_t bus, uint8_t clk_pin, uint8_t mosi_pin, uint8_t miso_pin, uint8_t cs_pin, uint32_t frequency, uint8_t mode) {
    // SPI3_HOST is preferred (SPI2 may be used by LED strip on SPI-backend chips),
    // but the RISC-V C-series only exposes SPI2 — on those we fall back to SPI2.
    // On C61 this conflicts with an addressable LED; on C3 the LED uses RMT, so SPI2 is free.
#if SOC_SPI_PERIPH_NUM >= 3
    spi_host_device_t host = SPI3_HOST;
#else
    spi_host_device_t host = SPI2_HOST;
#endif

    if (bus > 1) {
        ESP_LOGE(TAG, "Invalid SPI bus: %d (must be 0 or 1)", bus);
        return false;
    }

    // Clean up existing device and bus if configured
    if (spi_device_handles[bus]) {
        spi_bus_remove_device(spi_device_handles[bus]);
        spi_device_handles[bus] = NULL;
    }
    if (spi_bus_initialized[bus]) {
        spi_bus_free(host);
        spi_bus_initialized[bus] = false;
    }

    spi_bus_config_t bus_cfg = {
        .mosi_io_num = mosi_pin,
        .miso_io_num = miso_pin,
        .sclk_io_num = clk_pin,
        .quadwp_io_num = -1,
        .quadhd_io_num = -1,
        .max_transfer_sz = 256,
    };

    esp_err_t ret = spi_bus_initialize(host, &bus_cfg, SPI_DMA_CH_AUTO);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to initialize SPI bus %d: %s", bus, esp_err_to_name(ret));
        return false;
    }
    spi_bus_initialized[bus] = true;

    spi_device_interface_config_t dev_cfg = {
        .mode = mode,
        .clock_speed_hz = (int)frequency,
        .spics_io_num = cs_pin,
        .queue_size = 1,
    };

    ret = spi_bus_add_device(host, &dev_cfg, &spi_device_handles[bus]);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to add SPI device on bus %d: %s", bus, esp_err_to_name(ret));
        spi_bus_free(host);
        spi_bus_initialized[bus] = false;
        return false;
    }

    ESP_LOGI(TAG, "SPI bus %d configured: CLK=%d, MOSI=%d, MISO=%d, CS=%d, freq=%lu Hz, mode=%d",
             bus, clk_pin, mosi_pin, miso_pin, cs_pin, (unsigned long)frequency, mode);
    return true;
}

spi_transfer_result_t iotkit_hal_spi_transfer(uint8_t bus, const uint8_t *data, size_t len) {
    spi_transfer_result_t result = {0};

    if (bus > 1 || !spi_device_handles[bus]) {
        ESP_LOGE(TAG, "SPI bus %d not configured", bus);
        return result;
    }

    if (len > sizeof(result.data)) {
        ESP_LOGE(TAG, "SPI transfer length %zu exceeds max %zu", len, sizeof(result.data));
        return result;
    }

    uint8_t tx_buf[256];
    uint8_t rx_buf[256];
    memcpy(tx_buf, data, len);
    memset(rx_buf, 0, len);

    spi_transaction_t trans = {
        .length = len * 8,
        .tx_buffer = tx_buf,
        .rx_buffer = rx_buf,
    };

    esp_err_t ret = spi_device_transmit(spi_device_handles[bus], &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI transfer failed on bus %d: %s", bus, esp_err_to_name(ret));
        return result;
    }

    memcpy(result.data, rx_buf, len);
    result.len = len;
    return result;
}

bool iotkit_hal_spi_write(uint8_t bus, const uint8_t *data, size_t len) {
    if (bus > 1 || !spi_device_handles[bus]) {
        ESP_LOGE(TAG, "SPI bus %d not configured", bus);
        return false;
    }

    if (len > 256) {
        ESP_LOGE(TAG, "SPI write length %zu exceeds max 256", len);
        return false;
    }

    spi_transaction_t trans = {
        .length = len * 8,
        .tx_buffer = data,
        .rx_buffer = NULL,
    };

    esp_err_t ret = spi_device_transmit(spi_device_handles[bus], &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI write failed on bus %d: %s", bus, esp_err_to_name(ret));
        return false;
    }
    return true;
}

spi_transfer_result_t iotkit_hal_spi_read(uint8_t bus, size_t len) {
    spi_transfer_result_t result = {0};

    if (bus > 1 || !spi_device_handles[bus]) {
        ESP_LOGE(TAG, "SPI bus %d not configured", bus);
        return result;
    }

    if (len > sizeof(result.data)) {
        ESP_LOGE(TAG, "SPI read length %zu exceeds max %zu", len, sizeof(result.data));
        return result;
    }

    uint8_t tx_buf[256];
    uint8_t rx_buf[256];
    memset(tx_buf, 0, len);
    memset(rx_buf, 0, len);

    spi_transaction_t trans = {
        .length = len * 8,
        .tx_buffer = tx_buf,
        .rx_buffer = rx_buf,
    };

    esp_err_t ret = spi_device_transmit(spi_device_handles[bus], &trans);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "SPI read failed on bus %d: %s", bus, esp_err_to_name(ret));
        return result;
    }

    memcpy(result.data, rx_buf, len);
    result.len = len;
    return result;
}

// === UART ===

bool iotkit_hal_uart_configure(uint8_t port, uint8_t tx_pin, uint8_t rx_pin, uint32_t baud_rate, uint8_t data_bits, uint8_t stop_bits, uint8_t parity) {
    if (port == 0) {
        ESP_LOGE(TAG, "UART port 0 is reserved for debug console");
        return false;
    }
    if (port > 2) {
        ESP_LOGE(TAG, "Invalid UART port: %d (must be 1 or 2)", port);
        return false;
    }

    // Clean up existing port if configured
    if (uart_port_initialized[port]) {
        uart_driver_delete(port);
        uart_port_initialized[port] = false;
    }

    uart_word_length_t word_len;
    switch (data_bits) {
        case 5: word_len = UART_DATA_5_BITS; break;
        case 6: word_len = UART_DATA_6_BITS; break;
        case 7: word_len = UART_DATA_7_BITS; break;
        default: word_len = UART_DATA_8_BITS; break;
    }

    uart_stop_bits_t stop;
    switch (stop_bits) {
        case 2: stop = UART_STOP_BITS_2; break;
        default: stop = UART_STOP_BITS_1; break;
    }

    uart_parity_t par;
    switch (parity) {
        case 1: par = UART_PARITY_ODD; break;
        case 2: par = UART_PARITY_EVEN; break;
        default: par = UART_PARITY_DISABLE; break;
    }

    uart_config_t uart_config = {
        .baud_rate = (int)baud_rate,
        .data_bits = word_len,
        .parity = par,
        .stop_bits = stop,
        .flow_ctrl = UART_HW_FLOWCTRL_DISABLE,
        .source_clk = UART_SCLK_DEFAULT,
    };

    esp_err_t ret = uart_driver_install(port, 1024, 0, 0, NULL, 0);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to install UART driver for port %d: %s", port, esp_err_to_name(ret));
        return false;
    }

    ret = uart_param_config(port, &uart_config);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to configure UART port %d: %s", port, esp_err_to_name(ret));
        uart_driver_delete(port);
        return false;
    }

    ret = uart_set_pin(port, tx_pin, rx_pin, UART_PIN_NO_CHANGE, UART_PIN_NO_CHANGE);
    if (ret != ESP_OK) {
        ESP_LOGE(TAG, "Failed to set UART pins for port %d: %s", port, esp_err_to_name(ret));
        uart_driver_delete(port);
        return false;
    }

    uart_port_initialized[port] = true;
    ESP_LOGI(TAG, "UART port %d configured: TX=%d, RX=%d, baud=%lu", port, tx_pin, rx_pin, (unsigned long)baud_rate);
    return true;
}

bool iotkit_hal_uart_write(uint8_t port, const uint8_t *data, size_t len) {
    if (port == 0 || port > 2 || !uart_port_initialized[port]) {
        ESP_LOGE(TAG, "UART port %d not configured", port);
        return false;
    }

    int written = uart_write_bytes(port, data, len);
    if (written < 0) {
        ESP_LOGE(TAG, "UART write failed on port %d", port);
        return false;
    }
    return true;
}

uart_read_result_t iotkit_hal_uart_read(uint8_t port, size_t bytes_to_read, uint32_t timeout_ms) {
    uart_read_result_t result = {0};

    if (port == 0 || port > 2 || !uart_port_initialized[port]) {
        ESP_LOGE(TAG, "UART port %d not configured", port);
        return result;
    }

    if (bytes_to_read > sizeof(result.data)) {
        bytes_to_read = sizeof(result.data);
    }

    TickType_t ticks = timeout_ms / portTICK_PERIOD_MS;
    int read_len = uart_read_bytes(port, result.data, bytes_to_read, ticks);
    if (read_len < 0) {
        ESP_LOGE(TAG, "UART read failed on port %d", port);
        return result;
    }

    result.len = (size_t)read_len;
    return result;
}

#endif // UNIT_TEST
