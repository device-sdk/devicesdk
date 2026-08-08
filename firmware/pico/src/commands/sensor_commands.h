#ifndef SENSOR_COMMANDS_H
#define SENSOR_COMMANDS_H

// Parsing and worker dispatch for the single-wire sensor commands
// (`onewire_search`, `onewire_read_temp`, `dht_read`), plus the pure protocol
// helpers they share with the HAL drivers.
//
// These live outside websocket_handler.cpp / core1_worker.cpp on purpose: both
// of those pull in the Pico SDK, so nothing in them can be exercised by the
// host unit tests. Everything here depends only on picojson, the queue structs
// and hal.h, which the test build mocks.

#include "../multicore/command_queue.h"
#include "../multicore/response_queue.h"
#include <picojson.h>
#include <stddef.h>
#include <string>

// Decodes 16 uppercase hex characters into 8 ROM bytes, family code first.
// Returns false on a wrong length or a non-hex character.
bool sensor_parse_rom_hex(const std::string& hex, uint8_t out[ONEWIRE_ROM_LEN]);

// Maxim CRC8 (DS18B20 scratchpad and ROM): reflected polynomial 0x8C, init 0.
// A valid 8-byte ROM (or 9-byte scratchpad incl. its CRC byte) hashes to 0.
uint8_t sensor_ow_crc8(const uint8_t* data, size_t len);

// Decodes a DHT 40-bit frame (5 bytes: humidity hi/lo, temp hi/lo, checksum).
// Returns false on a checksum mismatch. DHT22 is sign-magnitude: the high bit
// of byte 2 is the temperature sign, the low 15 bits the magnitude in tenths.
bool sensor_dht_decode(uint8_t model, const uint8_t bytes[5],
                       float* celsius, float* humidity_pct);

// Bit-level 1-Wire bus abstraction so the ROM-search tree walk can be host
// tested against a scripted bus instead of real GPIO timing.
typedef struct {
    // Returns false when no device answered with a presence pulse.
    bool (*reset)(void* ctx);
    bool (*read_bit)(void* ctx);
    void (*write_bit)(void* ctx, bool bit);
} sensor_ow_bus_t;

// Standard Maxim ROM search. Stores up to `max_roms` DS18B20 ROM codes
// (family 0x28) in `roms`. Returns the count found, or -1 on a bus error
// (no presence pulse at the start, or the bus going quiet mid-walk). A ROM
// with a bad CRC aborts the search: the walk state is unreliable from there.
int sensor_ow_search(const sensor_ow_bus_t* bus, void* ctx,
                     uint8_t roms[][ONEWIRE_ROM_LEN], int max_roms);

// Each parser fills `cmd` (type + payload) from a command payload object.
// On failure it writes a user-facing reason into `error` and returns false.
bool parse_onewire_search(const picojson::object& payload,
                          worker_command_t* cmd, std::string* error);
bool parse_onewire_read_temp(const picojson::object& payload,
                             worker_command_t* cmd, std::string* error);
bool parse_dht_read(const picojson::object& payload,
                    worker_command_t* cmd, std::string* error);

// Worker-side handlers: call the HAL and fill `resp`. Run on core 1.
void handle_onewire_search(const worker_command_t* cmd, worker_response_t* resp);
void handle_onewire_read_temp(const worker_command_t* cmd,
                              worker_response_t* resp);
void handle_dht_read(const worker_command_t* cmd, worker_response_t* resp);

#endif // SENSOR_COMMANDS_H
