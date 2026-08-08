#include "sensor_commands.h"
#include "hal.h"
#include <cstring>

// GP23..GP25 drive the CYW43439 radio on the Pico W / Pico 2 W; bit-banging a
// sensor bus on them fights the WiFi. GP0..GP28 covers every other usable pin.
static bool pin_reserved_for_wifi(double pin) {
    return pin >= 23 && pin <= 25;
}

static int hex_nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

bool sensor_parse_rom_hex(const std::string& hex, uint8_t out[ONEWIRE_ROM_LEN]) {
    if (hex.size() != ONEWIRE_ROM_LEN * 2) return false;
    for (size_t i = 0; i < ONEWIRE_ROM_LEN; i++) {
        int hi = hex_nibble(hex[i * 2]);
        int lo = hex_nibble(hex[i * 2 + 1]);
        if (hi < 0 || lo < 0) return false;
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return true;
}

uint8_t sensor_ow_crc8(const uint8_t* data, size_t len) {
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

bool sensor_dht_decode(uint8_t model, const uint8_t bytes[5],
                       float* celsius, float* humidity_pct) {
    uint8_t checksum = (uint8_t)(bytes[0] + bytes[1] + bytes[2] + bytes[3]);
    if (checksum != bytes[4]) return false;

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

#define DS18B20_FAMILY_CODE 0x28
#define OW_CMD_SEARCH_ROM   0xF0

int sensor_ow_search(const sensor_ow_bus_t* bus, void* ctx,
                     uint8_t roms[][ONEWIRE_ROM_LEN], int max_roms) {
    if (!bus || !bus->reset || !bus->read_bit || !bus->write_bit) return -1;
    if (max_roms <= 0) return 0;

    int found = 0;
    int last_discrepancy = 0;
    bool last_device = false;
    uint8_t rom[ONEWIRE_ROM_LEN] = {0};

    // Standard Maxim ROM search: walk the binary tree of ROM bits, branching at
    // the highest unresolved discrepancy on each pass.
    while (!last_device && found < max_roms) {
        if (!bus->reset(ctx)) return found > 0 ? found : -1;
        for (int b = 0; b < 8; b++) {
            bus->write_bit(ctx, (OW_CMD_SEARCH_ROM >> b) & 1);
        }

        int discrepancy = 0;
        for (int bit_index = 1; bit_index <= 64; bit_index++) {
            int byte = (bit_index - 1) / 8;
            uint8_t mask = (uint8_t)(1 << ((bit_index - 1) % 8));

            bool id_bit = bus->read_bit(ctx);
            bool cmp_bit = bus->read_bit(ctx);

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
            bus->write_bit(ctx, chosen);
        }

        // Advance the walk state before deciding what to do with this ROM: the
        // next pass depends on last_discrepancy no matter which branch we take.
        last_discrepancy = discrepancy;
        if (last_discrepancy == 0) last_device = true;

        if (sensor_ow_crc8(rom, ONEWIRE_ROM_LEN) != 0) {
            // Corrupt ROM: the walk state is unreliable from here on, and
            // continuing can miss valid devices (canonical Maxim behavior).
            return found > 0 ? found : -1;
        }
        if (rom[0] != DS18B20_FAMILY_CODE) continue;  // not a DS18B20
        memcpy(roms[found], rom, ONEWIRE_ROM_LEN);
        found++;
    }

    return found;
}

// Shared pin extraction: every sensor command carries exactly one `pin`.
static bool parse_pin(const picojson::object& payload, uint8_t* pin,
                      std::string* error) {
    auto pin_it = payload.find("pin");
    if (pin_it == payload.end() || !pin_it->second.is<double>()) {
        *error = "Missing pin parameter";
        return false;
    }
    double pin_val = pin_it->second.get<double>();
    if (pin_val < 0 || pin_val > MAX_SENSOR_PIN ||
        pin_val != (double)(int)pin_val) {
        *error = "Invalid pin number";
        return false;
    }
    if (pin_reserved_for_wifi(pin_val)) {
        *error = "Invalid pin number (23-25 reserved for WiFi)";
        return false;
    }
    *pin = (uint8_t)pin_val;
    return true;
}

bool parse_onewire_search(const picojson::object& payload,
                          worker_command_t* cmd, std::string* error) {
    uint8_t pin = 0;
    if (!parse_pin(payload, &pin, error)) return false;

    cmd->payload.onewire_search.pin = pin;
    cmd->type = CMD_ONEWIRE_SEARCH;
    return true;
}

bool parse_onewire_read_temp(const picojson::object& payload,
                             worker_command_t* cmd, std::string* error) {
    uint8_t pin = 0;
    if (!parse_pin(payload, &pin, error)) return false;

    cmd->payload.onewire_read_temp.pin = pin;
    cmd->payload.onewire_read_temp.has_rom = false;
    memset(cmd->payload.onewire_read_temp.rom, 0, ONEWIRE_ROM_LEN);

    // `rom` is optional: absent means Skip ROM. Present but malformed is an
    // error rather than a silent fallback, which would read the wrong sensor.
    auto rom_it = payload.find("rom");
    if (rom_it != payload.end()) {
        if (!rom_it->second.is<std::string>()) {
            *error = "Invalid rom (expected a 16-character hex string)";
            return false;
        }
        if (!sensor_parse_rom_hex(rom_it->second.get<std::string>(),
                                  cmd->payload.onewire_read_temp.rom)) {
            *error = "Invalid rom (expected 16 uppercase hex characters)";
            return false;
        }
        cmd->payload.onewire_read_temp.has_rom = true;
    }

    cmd->type = CMD_ONEWIRE_READ_TEMP;
    return true;
}

bool parse_dht_read(const picojson::object& payload, worker_command_t* cmd,
                    std::string* error) {
    uint8_t pin = 0;
    if (!parse_pin(payload, &pin, error)) return false;

    auto model_it = payload.find("model");
    if (model_it == payload.end() || !model_it->second.is<std::string>()) {
        *error = "Missing model parameter";
        return false;
    }
    const std::string& model = model_it->second.get<std::string>();
    if (model != "dht11" && model != "dht22") {
        *error = "Invalid model (expected \"dht11\" or \"dht22\")";
        return false;
    }

    cmd->payload.dht_read.pin = pin;
    cmd->payload.dht_read.model =
        (model == "dht11") ? DHT_MODEL_DHT11 : DHT_MODEL_DHT22;
    cmd->type = CMD_DHT_READ;
    return true;
}

// === Worker handlers ===

static void set_sensor_error(worker_response_t* resp, const char* msg) {
    resp->status = RESPONSE_ERROR;
    strncpy(resp->error_msg, msg, MAX_ERROR_MSG_LEN - 1);
    resp->error_msg[MAX_ERROR_MSG_LEN - 1] = '\0';
}

void handle_onewire_search(const worker_command_t* cmd,
                           worker_response_t* resp) {
    uint8_t pin = cmd->payload.onewire_search.pin;
    uint8_t roms[MAX_ONEWIRE_ROMS][ONEWIRE_ROM_LEN];
    int count = hal_onewire_search(pin, roms, MAX_ONEWIRE_ROMS);

    if (count < 0) {
        set_sensor_error(resp, "OneWire bus error (no presence pulse)");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.onewire_search.pin = pin;
    resp->data.onewire_search.count = (uint8_t)count;
    for (int i = 0; i < count && i < MAX_ONEWIRE_ROMS; i++) {
        memcpy(resp->data.onewire_search.roms[i], roms[i], ONEWIRE_ROM_LEN);
    }
}

void handle_onewire_read_temp(const worker_command_t* cmd,
                              worker_response_t* resp) {
    uint8_t pin = cmd->payload.onewire_read_temp.pin;
    bool has_rom = cmd->payload.onewire_read_temp.has_rom;
    const uint8_t* rom = has_rom ? cmd->payload.onewire_read_temp.rom : nullptr;

    float celsius = 0.0f;
    if (!hal_onewire_read_temp(pin, rom, &celsius)) {
        set_sensor_error(resp, "DS18B20 read failed (no sensor or bad CRC)");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.onewire_temp.pin = pin;
    resp->data.onewire_temp.has_rom = has_rom;
    resp->data.onewire_temp.celsius = celsius;
    if (has_rom) {
        memcpy(resp->data.onewire_temp.rom, cmd->payload.onewire_read_temp.rom,
               ONEWIRE_ROM_LEN);
    } else {
        memset(resp->data.onewire_temp.rom, 0, ONEWIRE_ROM_LEN);
    }
}

void handle_dht_read(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.dht_read.pin;
    uint8_t model = cmd->payload.dht_read.model;

    float celsius = 0.0f;
    float humidity_pct = 0.0f;
    dht_read_status_t status =
        hal_dht_read(pin, model, &celsius, &humidity_pct);
    if (status == DHT_READ_RATE_LIMITED) {
        set_sensor_error(resp,
                         "DHT read rate limited: min 2s between DHT reads");
        return;
    }
    if (status != DHT_READ_OK) {
        set_sensor_error(resp, "DHT read failed (timeout or bad checksum)");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.dht.pin = pin;
    resp->data.dht.celsius = celsius;
    resp->data.dht.humidity_pct = humidity_pct;
}
