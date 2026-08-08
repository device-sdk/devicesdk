#ifndef SENSOR_COMMANDS_H
#define SENSOR_COMMANDS_H

// Parsing and worker dispatch for the single-wire sensor commands
// (`onewire_search`, `onewire_read_temp`, `dht_read`).
//
// These live outside websocket_handler.cpp / core1_worker.cpp on purpose: both
// of those pull in the Pico SDK, so nothing in them can be exercised by the
// host unit tests. Everything here depends only on picojson, the queue structs
// and hal.h, which the test build mocks.

#include "../multicore/command_queue.h"
#include "../multicore/response_queue.h"
#include <picojson.h>
#include <string>

// Decodes 16 uppercase hex characters into 8 ROM bytes, family code first.
// Returns false on a wrong length or a non-hex character.
bool sensor_parse_rom_hex(const std::string& hex, uint8_t out[ONEWIRE_ROM_LEN]);

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
