#include "sensor_commands.h"
#include "hal.h"
#include <cstring>

// GP0..GP28 are the pins a user can wire a sensor to. Virtual pin 99 (onboard
// LED) is deliberately not accepted here: there is no bus behind it.
static const double SENSOR_PIN_MAX = 28.0;

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

// Shared pin extraction: every sensor command carries exactly one `pin`.
static bool parse_pin(const picojson::object& payload, uint8_t* pin,
                      std::string* error) {
    auto pin_it = payload.find("pin");
    if (pin_it == payload.end() || !pin_it->second.is<double>()) {
        *error = "Missing pin parameter";
        return false;
    }
    double pin_val = pin_it->second.get<double>();
    if (pin_val < 0 || pin_val > SENSOR_PIN_MAX) {
        *error = "Invalid pin number";
        return false;
    }
    *pin = (uint8_t)pin_val;
    return true;
}

bool parse_onewire_search(const picojson::object& payload,
                          worker_command_t* cmd, std::string* error) {
    uint8_t pin = 0;
    if (!parse_pin(payload, &pin, error)) return false;

    cmd->type = CMD_ONEWIRE_SEARCH;
    cmd->payload.onewire_search.pin = pin;
    return true;
}

bool parse_onewire_read_temp(const picojson::object& payload,
                             worker_command_t* cmd, std::string* error) {
    uint8_t pin = 0;
    if (!parse_pin(payload, &pin, error)) return false;

    cmd->type = CMD_ONEWIRE_READ_TEMP;
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

    cmd->type = CMD_DHT_READ;
    cmd->payload.dht_read.pin = pin;
    cmd->payload.dht_read.model =
        (model == "dht11") ? DHT_MODEL_DHT11 : DHT_MODEL_DHT22;
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
    if (!hal_dht_read(pin, model, &celsius, &humidity_pct)) {
        set_sensor_error(
            resp, "DHT read failed (timeout, bad checksum, or min 2s between "
                  "DHT reads)");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.dht.pin = pin;
    resp->data.dht.celsius = celsius;
    resp->data.dht.humidity_pct = humidity_pct;
}
