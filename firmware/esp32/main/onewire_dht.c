// DS18B20 (OneWire) and DHT11/DHT22 drivers for the ESP32 family.
//
// OneWire rides on espressif/onewire_bus, whose RMT backend generates the bit
// slots in hardware: no bit-banging, and no interrupt-disable window for the
// bus traffic. Only the DS18B20 command sequence (Convert T, Read Scratchpad,
// CRC) lives here.
//
// DHT has no peripheral that fits it, so its 40-bit frame is bit-banged inside
// a critical section. That costs ~5 ms of blocked interrupts on the worker
// task, once every 2 s at most.
//
// This file is excluded from the host test build (see test/CMakeLists.txt);
// test/mocks/hal_mock.c supplies the mocked HAL entry points instead.

#include "hal.h"

#ifndef UNIT_TEST

// For ONEWIRE_ROM_LEN and the DHT_MODEL_* selectors shared with the queue.
#include "command_queue.h"

#include "driver/gpio.h"
#include "esp_timer.h"
#include "esp_rom_sys.h"
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "onewire_bus.h"
#include "onewire_device.h"
#include "onewire_crc.h"
#include <string.h>

static const char *TAG = "onewire_dht";

#define DS18B20_FAMILY_CODE  0x28
#define OW_CMD_MATCH_ROM     0x55
#define OW_CMD_SKIP_ROM      0xCC
#define OW_CMD_CONVERT_T     0x44
#define OW_CMD_READ_SCRATCH  0xBE

// Opens a bus on `pin`. Each command creates and tears down its own bus so the
// RMT channels are only held while a sensor is actually being read.
static onewire_bus_handle_t ow_open(uint8_t pin) {
    onewire_bus_config_t bus_config = {
        .bus_gpio_num = pin,
        .flags = { .en_pull_up = 1 },  // external 4.7k is still required
    };
    // 10 bytes covers the longest DS18B20 reply (9-byte scratchpad).
    onewire_bus_rmt_config_t rmt_config = { .max_rx_bytes = 10 };
    onewire_bus_handle_t bus = NULL;
    if (onewire_new_bus_rmt(&bus_config, &rmt_config, &bus) != ESP_OK) {
        ESP_LOGE(TAG, "Failed to open OneWire bus on GPIO %d", pin);
        return NULL;
    }
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
    if (!bus) return -1;

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
    return found;
}

bool devicesdk_hal_onewire_read_temp(uint8_t pin, const uint8_t *rom,
                                     float *celsius) {
    onewire_bus_handle_t bus = ow_open(pin);
    if (!bus) return false;

    bool ok = false;
    do {
        if (onewire_bus_reset(bus) != ESP_OK) break;
        if (!ow_select(bus, rom)) break;

        uint8_t convert = OW_CMD_CONVERT_T;
        if (onewire_bus_write_bytes(bus, &convert, 1) != ESP_OK) break;
        // 12-bit conversion. Blocking the worker task here is deliberate: the
        // network runs on its own task, and the command queue is serial anyway.
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
        if (raw == 0x0550) break;  // power-on value: no conversion happened
        *celsius = (float)raw / 16.0f;
        ok = true;
    } while (0);

    onewire_bus_del(bus);
    return ok;
}

// --- DHT11 / DHT22 ---

// Both sensors need a settling gap between reads; polling faster returns stale
// or corrupt frames, so the limit is enforced here rather than left to users.
#define DHT_MIN_INTERVAL_US 2000000LL
#define DHT_MAX_PINS 48

static int64_t s_dht_last_read_us[DHT_MAX_PINS] = {0};
static portMUX_TYPE s_dht_mux = portMUX_INITIALIZER_UNLOCKED;

// Waits for `pin` to reach `level`, returning the elapsed microseconds or -1 on
// timeout. Called inside the critical section, so this loop is the only clock.
static int dht_wait_level(uint8_t pin, int level, int timeout_us) {
    int64_t start = esp_timer_get_time();
    while (gpio_get_level(pin) != level) {
        if (esp_timer_get_time() - start > timeout_us) return -1;
    }
    return (int)(esp_timer_get_time() - start);
}

bool devicesdk_hal_dht_read(uint8_t pin, uint8_t model, float *celsius,
                            float *humidity_pct) {
    if (pin >= DHT_MAX_PINS) return false;

    int64_t now = esp_timer_get_time();
    if (s_dht_last_read_us[pin] != 0 &&
        now - s_dht_last_read_us[pin] < DHT_MIN_INTERVAL_US) {
        return false;  // min 2s between DHT reads
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
    if (gpio_config(&io_conf) != ESP_OK) return false;

    // Start signal: hold the line low (20 ms for DHT11, 2 ms for DHT22), then
    // release and let the sensor take over.
    gpio_set_level(pin, 0);
    esp_rom_delay_us(model == DHT_MODEL_DHT11 ? 20000 : 2000);
    gpio_set_level(pin, 1);
    esp_rom_delay_us(40);

    uint8_t bytes[5] = {0};
    bool ok = true;

    // The whole 40-bit frame is ~5 ms and every bit is a pulse width, so a
    // single interrupt in the middle corrupts the reading.
    portENTER_CRITICAL(&s_dht_mux);

    // Preamble: 80 us low then 80 us high from the sensor.
    if (dht_wait_level(pin, 0, 100) < 0) ok = false;
    if (ok && dht_wait_level(pin, 1, 200) < 0) ok = false;
    if (ok && dht_wait_level(pin, 0, 200) < 0) ok = false;

    if (ok) {
        for (int i = 0; i < 40; i++) {
            // Each bit: ~50 us low, then a high whose length encodes the value
            // (~26 us for 0, ~70 us for 1).
            if (dht_wait_level(pin, 1, 100) < 0) { ok = false; break; }
            int high_us = dht_wait_level(pin, 0, 150);
            if (high_us < 0) { ok = false; break; }
            if (high_us > 40) bytes[i / 8] |= (uint8_t)(1 << (7 - (i % 8)));
        }
    }

    portEXIT_CRITICAL(&s_dht_mux);

    s_dht_last_read_us[pin] = esp_timer_get_time();

    if (!ok) {
        ESP_LOGW(TAG, "DHT timeout on GPIO %d", pin);
        return false;
    }

    uint8_t checksum = (uint8_t)(bytes[0] + bytes[1] + bytes[2] + bytes[3]);
    if (checksum != bytes[4]) {
        ESP_LOGW(TAG, "DHT checksum mismatch on GPIO %d", pin);
        return false;
    }

    if (model == DHT_MODEL_DHT11) {  // integer humidity and temperature
        *humidity_pct = (float)bytes[0];
        *celsius = (float)bytes[2];
    } else {  // DHT22: tenths, with the temperature sign in the high bit
        *humidity_pct = (float)((bytes[0] << 8) | bytes[1]) / 10.0f;
        float temp = (float)(((bytes[2] & 0x7F) << 8) | bytes[3]) / 10.0f;
        *celsius = (bytes[2] & 0x80) ? -temp : temp;
    }
    return true;
}

#endif  // UNIT_TEST
