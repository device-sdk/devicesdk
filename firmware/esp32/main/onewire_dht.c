// DS18B20 (OneWire) and DHT11/DHT22 drivers for the ESP32 family.
//
// OneWire rides on espressif/onewire_bus: the RMT backend generates the bit
// slots in hardware where the chip has RMT (ESP32, ESP32-C3), and the UART
// backend (added in component 1.1.0) is used on chips without it (ESP32-C61).
// Either way there is no bit-banging and no interrupt-disable window for the
// bus traffic - only the DS18B20 command sequence (Convert T, Read Scratchpad,
// CRC) lives here.
//
// DHT has no peripheral that fits it, so its 40-bit frame is bit-banged. Only
// the measured high-pulse durations need interrupts off, so the critical
// section is per bit slot (~120 us typical) rather than for the whole ~5 ms
// frame: the radio keeps its periodic interrupts on single-core parts
// (C3/C61), and the worker task is pinned off the WiFi core on dual-core
// parts (see devicesdk_main.c).
//
// This file is excluded from the host test build (see test/CMakeLists.txt);
// test/mocks/hal_mock.c supplies the mocked HAL entry points instead. The
// pure decode logic lives in sensor_utils.c, which the host tests do cover.

#include "hal.h"

#ifndef UNIT_TEST

// For ONEWIRE_ROM_LEN and the DHT_MODEL_* selectors shared with the queue.
#include "command_queue.h"
#include "sensor_utils.h"

#include "driver/gpio.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "onewire_bus.h"
#include "onewire_device.h"
#include "onewire_crc.h"
#include "soc/soc_caps.h"
#include <string.h>

#if !SOC_RMT_SUPPORTED
#include "driver/uart.h"
#endif

static const char *TAG = "onewire_dht";

#define DS18B20_FAMILY_CODE  0x28
#define OW_CMD_MATCH_ROM     0x55
#define OW_CMD_SKIP_ROM      0xCC
#define OW_CMD_CONVERT_T     0x44
#define OW_CMD_READ_SCRATCH  0xBE

// Opens a bus on `pin`. Each command creates and tears down its own bus so the
// backend channels are only held while a sensor is actually being read.
// Concurrent WS2812 use on RMT chips can exhaust RMT channels; the failure
// surfaces as a bus error response.
static onewire_bus_handle_t ow_open(uint8_t pin) {
    onewire_bus_config_t bus_config = {
        .bus_gpio_num = pin,
        .flags = { .en_pull_up = 1 },  // external 4.7k is still required
    };
    onewire_bus_handle_t bus = NULL;

#if SOC_RMT_SUPPORTED
    // 10 bytes covers the longest DS18B20 reply (9-byte scratchpad).
    onewire_bus_rmt_config_t rmt_config = { .max_rx_bytes = 10 };
    if (onewire_new_bus_rmt(&bus_config, &rmt_config, &bus) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open OneWire RMT bus on GPIO %d", pin);
        return NULL;
    }
#else
    // Chips without RMT (ESP32-C61) use the UART backend. UART1 is used
    // because UART0 is the debug console; do not run the uart_* commands on
    // UART1 while 1-Wire is in use on such targets.
    onewire_bus_uart_config_t uart_config = { .uart_port_num = UART_NUM_1 };
    if (onewire_new_bus_uart(&bus_config, &uart_config, &bus) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open OneWire UART bus on GPIO %d", pin);
        return NULL;
    }
#endif
    return bus;
}

// Addresses one device (Match ROM) or the only device on the bus (Skip ROM).
static bool ow_select(onewire_bus_handle_t bus, const uint8_t *rom) {
    if (rom) {
        uint8_t tx[1 + ONEWIRE_ROM_LEN];
        tx[0] = OW_CMD_MATCH_ROM;
        memcpy(&tx[1], rom, ONEWIRE_ROM_LEN);
        return onewire_bus_write_bytes(bus, tx, sizeof(tx)) == ESP_OK;
    }
    uint8_t tx = OW_CMD_SKIP_ROM;
    return onewire_bus_write_bytes(bus, &tx, 1) == ESP_OK;
}

int devicesdk_hal_onewire_search(uint8_t pin, uint8_t roms[][8], int max_roms) {
    if (max_roms <= 0) return 0;

    onewire_bus_handle_t bus = ow_open(pin);
    if (!bus) return -1;  // channel allocation or UART-port failure

    onewire_device_iter_handle_t iter = NULL;
    if (onewire_new_device_iter(bus, &iter) != ESP_OK) {
        onewire_bus_del(bus);
        return -1;
    }

    int found = 0;
    onewire_device_t device;
    while (found < max_roms &&
           onewire_device_iter_get_next(iter, &device) == ESP_OK) {
        // The address is a little-endian uint64: byte 0 is the family code,
        // which is also the first byte on the wire and in our hex encoding.
        uint8_t rom[ONEWIRE_ROM_LEN];
        for (int i = 0; i < ONEWIRE_ROM_LEN; i++) {
            rom[i] = (uint8_t)((device.address >> (8 * i)) & 0xFF);
        }
        if (rom[0] != DS18B20_FAMILY_CODE) continue;  // not a DS18B20
        memcpy(roms[found], rom, ONEWIRE_ROM_LEN);
        found++;
    }

    onewire_del_device_iter(iter);
    onewire_bus_del(bus);
    // An empty bus (or one with no DS18B20) is a success with zero ROMs.
    return found;
}

bool devicesdk_hal_onewire_read_temp(uint8_t pin, const uint8_t *rom,
                                     float *celsius) {
    onewire_bus_handle_t bus = ow_open(pin);
    if (!bus) return false;

    bool ok = false;
    // Up to two attempts: the first read can return the power-on register
    // value (0x0550 = 85.0 C) if the conversion had not completed. A genuine
    // 85.0 C reading survives the retry and is accepted on the second pass.
    for (int attempt = 0; attempt < 2 && !ok; attempt++) {
        if (onewire_bus_reset(bus) != ESP_OK) break;
        if (!ow_select(bus, rom)) break;

        uint8_t convert = OW_CMD_CONVERT_T;
        if (onewire_bus_write_bytes(bus, &convert, 1) != ESP_OK) break;
        // 12-bit conversion. Blocking the worker task here is deliberate: the
        // command queue is serial anyway, and the worker is pinned off the
        // WiFi core on dual-core parts.
        vTaskDelay(pdMS_TO_TICKS(800));

        if (onewire_bus_reset(bus) != ESP_OK) break;
        if (!ow_select(bus, rom)) break;

        uint8_t read_scratch = OW_CMD_READ_SCRATCH;
        if (onewire_bus_write_bytes(bus, &read_scratch, 1) != ESP_OK) break;

        uint8_t scratch[9];
        if (onewire_bus_read_bytes(bus, scratch, sizeof(scratch)) != ESP_OK) break;
        if (onewire_crc8(0, scratch, sizeof(scratch)) != 0) {
            ESP_LOGW(TAG, "DS18B20 scratchpad CRC mismatch on GPIO %d", pin);
            break;
        }

        int16_t raw = (int16_t)((scratch[1] << 8) | scratch[0]);
        if (raw == 0x0550 && attempt == 0) {
            ESP_LOGW(TAG, "DS18B20 returned power-on value on GPIO %d, retrying", pin);
            continue;  // power-on value: one retry disambiguates a real 85.0 C
        }
        *celsius = (float)raw / 16.0f;
        ok = true;
    }

    onewire_bus_del(bus);
    return ok;
}

// --- DHT11 / DHT22 ---

// Both sensors need a settling gap between reads; polling faster returns stale
// or corrupt frames, so the limit is enforced here rather than left to users.
#define DHT_MIN_INTERVAL_US 2000000LL
#define DHT_MAX_PINS 49  // parse layer accepts 0..48 (MAX_SENSOR_PIN)

static int64_t s_dht_last_read_us[DHT_MAX_PINS] = {0};
static portMUX_TYPE s_dht_mux = portMUX_INITIALIZER_UNLOCKED;

// Waits for `pin` to reach `level`, returning the elapsed microseconds or -1 on
// timeout. Called inside a critical section, so this loop is the only clock.
static int dht_wait_level(uint8_t pin, int level, int timeout_us) {
    int64_t start = esp_timer_get_time();
    while (gpio_get_level(pin) != level) {
        if (esp_timer_get_time() - start > timeout_us) return -1;
    }
    return (int)(esp_timer_get_time() - start);
}

dht_read_status_t devicesdk_hal_dht_read(uint8_t pin, uint8_t model,
                                         float *celsius, float *humidity_pct) {
    if (pin >= DHT_MAX_PINS) return DHT_READ_FAILED;

    int64_t now = esp_timer_get_time();
    if (s_dht_last_read_us[pin] != 0 &&
        now - s_dht_last_read_us[pin] < DHT_MIN_INTERVAL_US) {
        return DHT_READ_RATE_LIMITED;  // min 2s between DHT reads
    }

    gpio_config_t io_conf = {
        .pin_bit_mask = 1ULL << pin,
        // Open drain with the input buffer live: we drive the start pulse low,
        // then read the sensor's reply on the same pin.
        .mode = GPIO_MODE_INPUT_OUTPUT_OD,
        .pull_up_en = GPIO_PULLUP_ENABLE,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    if (gpio_config(&io_conf) != ESP_OK) return DHT_READ_FAILED;

    // Start signal: hold the line low (20 ms for DHT11, 2 ms for DHT22), then
    // release and let the sensor take over.
    gpio_set_level(pin, 0);
    esp_rom_delay_us(model == DHT_MODEL_DHT11 ? 20000 : 2000);
    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);

    uint8_t bytes[5] = {0};
    bool ok = true;

    // The preamble and each bit's low phase are just waits: an interrupt there
    // only stretches the wait, since the sensor holds the line. Only the
    // measured high-pulse duration must not be interrupted, so the critical
    // section covers the measurement (plus the low-to-high wait that precedes
    // it, closing the race of an interrupt landing between the two). The
    // window is one bit slot (~120 us typical, 250 us worst case), keeping the
    // radio responsive on single-core parts.
    if (dht_wait_level(pin, 0, 100) < 0) ok = false;
    if (ok && dht_wait_level(pin, 1, 200) < 0) ok = false;
    if (ok && dht_wait_level(pin, 0, 200) < 0) ok = false;

    if (ok) {
        for (int i = 0; i < 40; i++) {
            // Each bit: ~50 us low, then a high whose length encodes the value
            // (~26 us for 0, ~70 us for 1).
            portENTER_CRITICAL(&s_dht_mux);
            if (dht_wait_level(pin, 1, 100) < 0) ok = false;
            int high_us = ok ? dht_wait_level(pin, 0, 150) : -1;
            portEXIT_CRITICAL(&s_dht_mux);
            if (high_us < 0) { ok = false; break; }
            if (high_us > 40) bytes[i / 8] |= (uint8_t)(1 << (7 - (i % 8)));
        }
    }

    // Every attempt stamps the 2 s window, successful or not: the sensors
    // return corrupt frames when polled faster after any read cycle.
    s_dht_last_read_us[pin] = esp_timer_get_time();

    if (!ok) {
        ESP_LOGW(TAG, "DHT timeout on GPIO %d", pin);
        return DHT_READ_FAILED;
    }
    if (!sensor_dht_decode(model, bytes, celsius, humidity_pct)) {
        ESP_LOGW(TAG, "DHT checksum mismatch on GPIO %d", pin);
        return DHT_READ_FAILED;
    }
    return DHT_READ_OK;
}

#endif  // UNIT_TEST
