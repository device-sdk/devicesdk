// Bit-banged single-wire sensor drivers: Maxim OneWire (DS18B20) and the
// DHT11/DHT22 family. Both protocols encode bits as pulse widths in the tens of
// microseconds, so they cannot be driven from TypeScript over the WebSocket -
// the timing has to live here.
//
// Everything below runs on core 1 (the worker), which is why blocking for the
// 750 ms DS18B20 conversion is acceptable: core 0 keeps servicing the network.
// Interrupts are disabled around individual bit slots only, never around the
// conversion wait, so a few microseconds of jitter can never become 750 ms of
// deaf networking.

#include "hal.h"
#include "pico/stdlib.h"
#include "hardware/sync.h"
#include <stdio.h>
#include <string.h>

// --- OneWire bus primitives (Maxim standard-speed timings) ---

static inline void ow_release(uint8_t pin) {
    gpio_set_dir(pin, GPIO_IN);
}

static inline void ow_drive_low(uint8_t pin) {
    gpio_put(pin, 0);
    gpio_set_dir(pin, GPIO_OUT);
}

static void ow_init_pin(uint8_t pin) {
    gpio_init(pin);
    gpio_put(pin, 0);   // never drive high: the bus is open-drain
    ow_release(pin);
}

// Returns true when at least one device answered with a presence pulse.
static bool ow_reset(uint8_t pin) {
    ow_drive_low(pin);
    sleep_us(480);

    uint32_t irq = save_and_disable_interrupts();
    ow_release(pin);
    sleep_us(70);
    bool present = (gpio_get(pin) == 0);
    restore_interrupts(irq);

    sleep_us(410);  // finish the 480 us recovery window
    return present;
}

static void ow_write_bit(uint8_t pin, bool bit) {
    uint32_t irq = save_and_disable_interrupts();
    ow_drive_low(pin);
    if (bit) {
        sleep_us(6);
        ow_release(pin);
        restore_interrupts(irq);
        sleep_us(64);
    } else {
        sleep_us(60);
        ow_release(pin);
        restore_interrupts(irq);
        sleep_us(10);
    }
}

static bool ow_read_bit(uint8_t pin) {
    uint32_t irq = save_and_disable_interrupts();
    ow_drive_low(pin);
    sleep_us(6);
    ow_release(pin);
    sleep_us(9);
    bool bit = gpio_get(pin) != 0;
    restore_interrupts(irq);
    sleep_us(55);  // out to the 70 us slot
    return bit;
}

static void ow_write_byte(uint8_t pin, uint8_t byte) {
    for (int i = 0; i < 8; i++) {
        ow_write_bit(pin, (byte >> i) & 1);  // LSB first
    }
}

static uint8_t ow_read_byte(uint8_t pin) {
    uint8_t byte = 0;
    for (int i = 0; i < 8; i++) {
        if (ow_read_bit(pin)) byte |= (uint8_t)(1 << i);
    }
    return byte;
}

// Maxim CRC8: reflected polynomial 0x8C, init 0.
static uint8_t ow_crc8(const uint8_t* data, size_t len) {
    uint8_t crc = 0;
    for (size_t i = 0; i < len; i++) {
        uint8_t byte = data[i];
        for (int bit = 0; bit < 8; bit++) {
            uint8_t mix = (uint8_t)((crc ^ byte) & 0x01);
            crc >>= 1;
            if (mix) crc ^= 0x8C;
            byte >>= 1;
        }
    }
    return crc;
}

#define OW_CMD_SEARCH_ROM   0xF0
#define OW_CMD_MATCH_ROM    0x55
#define OW_CMD_SKIP_ROM     0xCC
#define OW_CMD_CONVERT_T    0x44
#define OW_CMD_READ_SCRATCH 0xBE

// Addresses one device (Match ROM) or the only device on the bus (Skip ROM).
static void ow_select(uint8_t pin, const uint8_t* rom) {
    if (rom) {
        ow_write_byte(pin, OW_CMD_MATCH_ROM);
        for (int i = 0; i < 8; i++) ow_write_byte(pin, rom[i]);
    } else {
        ow_write_byte(pin, OW_CMD_SKIP_ROM);
    }
}

int hal_onewire_search(uint8_t pin, uint8_t roms[][8], int max_roms) {
    if (max_roms <= 0) return 0;
    ow_init_pin(pin);
    if (!ow_reset(pin)) return -1;

    int found = 0;
    int last_discrepancy = 0;
    bool last_device = false;
    uint8_t rom[8] = {0};

    // Standard Maxim ROM search: walk the binary tree of ROM bits, branching at
    // the highest unresolved discrepancy on each pass.
    while (!last_device && found < max_roms) {
        if (!ow_reset(pin)) return found > 0 ? found : -1;
        ow_write_byte(pin, OW_CMD_SEARCH_ROM);

        int discrepancy = 0;
        for (int bit_index = 1; bit_index <= 64; bit_index++) {
            int byte = (bit_index - 1) / 8;
            uint8_t mask = (uint8_t)(1 << ((bit_index - 1) % 8));

            bool id_bit = ow_read_bit(pin);
            bool cmp_bit = ow_read_bit(pin);

            bool chosen;
            if (id_bit && cmp_bit) {
                // No device answered: the bus went quiet mid-walk.
                return found > 0 ? found : -1;
            } else if (id_bit != cmp_bit) {
                chosen = id_bit;
            } else {
                // Both 0 and 1 present at this position.
                if (bit_index < last_discrepancy) {
                    chosen = (rom[byte] & mask) != 0;
                } else {
                    chosen = (bit_index == last_discrepancy);
                }
                if (!chosen) discrepancy = bit_index;
            }

            if (chosen) {
                rom[byte] |= mask;
            } else {
                rom[byte] &= (uint8_t)~mask;
            }
            ow_write_bit(pin, chosen);
        }

        if (ow_crc8(rom, 8) == 0) {
            memcpy(roms[found], rom, 8);
            found++;
        }

        last_discrepancy = discrepancy;
        if (last_discrepancy == 0) last_device = true;
    }

    return found;
}

bool hal_onewire_read_temp(uint8_t pin, const uint8_t* rom, float* celsius) {
    ow_init_pin(pin);
    if (!ow_reset(pin)) return false;

    ow_select(pin, rom);
    ow_write_byte(pin, OW_CMD_CONVERT_T);
    sleep_ms(750);  // 12-bit conversion; interrupts stay enabled throughout

    if (!ow_reset(pin)) return false;
    ow_select(pin, rom);
    ow_write_byte(pin, OW_CMD_READ_SCRATCH);

    uint8_t scratch[9];
    for (int i = 0; i < 9; i++) scratch[i] = ow_read_byte(pin);

    if (ow_crc8(scratch, 9) != 0) return false;

    int16_t raw = (int16_t)((scratch[1] << 8) | scratch[0]);
    if (raw == 0x0550) return false;  // power-on value: no conversion happened
    *celsius = (float)raw / 16.0f;
    return true;
}

// --- DHT11 / DHT22 ---

// Both sensors need a settling gap between reads; polling faster returns stale
// or corrupt frames, so the limit is enforced here rather than left to users.
#define DHT_MIN_INTERVAL_US 2000000ULL
#define DHT_MAX_PINS 30

static uint64_t dht_last_read_us[DHT_MAX_PINS] = {0};

// Waits for `pin` to reach `level`, returning the elapsed microseconds or -1 on
// timeout. Called with interrupts disabled, so the loop is the only clock.
static int dht_wait_level(uint8_t pin, bool level, uint32_t timeout_us) {
    uint64_t start = time_us_64();
    while ((gpio_get(pin) != 0) != level) {
        if (time_us_64() - start > timeout_us) return -1;
    }
    return (int)(time_us_64() - start);
}

bool hal_dht_read(uint8_t pin, uint8_t model, float* celsius,
                  float* humidity_pct) {
    if (pin >= DHT_MAX_PINS) return false;

    uint64_t now = time_us_64();
    if (dht_last_read_us[pin] != 0 &&
        now - dht_last_read_us[pin] < DHT_MIN_INTERVAL_US) {
        return false;  // min 2s between DHT reads
    }

    gpio_init(pin);
    gpio_put(pin, 0);

    // Start signal: hold the line low (20 ms for DHT11, 2 ms for DHT22), then
    // release and let the sensor take over.
    gpio_set_dir(pin, GPIO_OUT);
    sleep_ms(model == 0 ? 20 : 2);
    gpio_set_dir(pin, GPIO_IN);
    sleep_us(40);

    uint8_t bytes[5] = {0};
    bool ok = true;

    // The whole 40-bit frame is ~5 ms and every bit is a pulse width, so a
    // single interrupt in the middle corrupts the reading. Core 0 keeps the
    // network alive while core 1 is deaf here.
    uint32_t irq = save_and_disable_interrupts();

    // Preamble: 80 us low then 80 us high from the sensor.
    if (dht_wait_level(pin, false, 100) < 0) ok = false;
    if (ok && dht_wait_level(pin, true, 200) < 0) ok = false;
    if (ok && dht_wait_level(pin, false, 200) < 0) ok = false;

    if (ok) {
        for (int i = 0; i < 40 && ok; i++) {
            // Each bit: ~50 us low, then a high whose length encodes the value
            // (~26 us for 0, ~70 us for 1).
            if (dht_wait_level(pin, true, 100) < 0) { ok = false; break; }
            int high_us = dht_wait_level(pin, false, 150);
            if (high_us < 0) { ok = false; break; }
            if (high_us > 40) bytes[i / 8] |= (uint8_t)(1 << (7 - (i % 8)));
        }
    }

    restore_interrupts(irq);

    dht_last_read_us[pin] = time_us_64();

    if (!ok) return false;

    uint8_t checksum = (uint8_t)(bytes[0] + bytes[1] + bytes[2] + bytes[3]);
    if (checksum != bytes[4]) return false;

    if (model == 0) {  // DHT11: integer humidity and temperature
        *humidity_pct = (float)bytes[0];
        *celsius = (float)bytes[2];
    } else {  // DHT22: tenths, with the temperature sign in the high bit
        *humidity_pct = (float)((bytes[0] << 8) | bytes[1]) / 10.0f;
        float temp = (float)(((bytes[2] & 0x7F) << 8) | bytes[3]) / 10.0f;
        *celsius = (bytes[2] & 0x80) ? -temp : temp;
    }
    return true;
}
