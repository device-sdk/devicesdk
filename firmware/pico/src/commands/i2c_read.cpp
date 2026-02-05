#include "i2c_read.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>

// Expected payload:
// {
//   "bus": 0,
//   "address": "0x68",
//   "register_to_read": "0x75",  // Optional
//   "bytes_to_read": 1
// }

void handle_i2c_read(const picojson::object& payload) {
    auto bus_it = payload.find("bus");
    auto addr_it = payload.find("address");
    auto bytes_it = payload.find("bytes_to_read");
    auto reg_it = payload.find("register_to_read");

    if (bus_it == payload.end() || !bus_it->second.is<double>() ||
        addr_it == payload.end() || !addr_it->second.is<std::string>() ||
        bytes_it == payload.end() || !bytes_it->second.is<double>()) {
        i2c_cmd_send_error("Missing required parameters: bus, address, bytes_to_read");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();
    std::string addr_str = addr_it->second.get<std::string>();
    size_t bytes_to_read = (size_t)bytes_it->second.get<double>();

    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    uint8_t address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

    // Validate address range
    if (address < 0x08 || address > 0x77) {
        i2c_cmd_send_error("Invalid I2C address (must be 0x08-0x77)");
        return;
    }

    int reg = -1;
    if (reg_it != payload.end() && reg_it->second.is<std::string>()) {
        reg = (int)strtol(reg_it->second.get<std::string>().c_str(), nullptr, 16);
    }

    uint8_t buffer[128];
    if (bytes_to_read > sizeof(buffer)) bytes_to_read = sizeof(buffer);

    int read_count = hal_i2c_read(bus, address, buffer, bytes_to_read, reg);

    if (read_count < 0) {
        char error_msg[64];
        snprintf(error_msg, sizeof(error_msg), "I2C read failed from address %s", addr_str.c_str());
        i2c_cmd_send_error(error_msg);
        return;
    }

    picojson::array data_arr;
    for (int i = 0; i < read_count; i++) {
        char hex[5];
        snprintf(hex, sizeof(hex), "0x%02X", buffer[i]);
        data_arr.push_back(picojson::value(std::string(hex)));
    }

    picojson::object result;
    result["bus"] = picojson::value((double)bus);
    result["address"] = picojson::value(addr_str);
    result["data"] = picojson::value(data_arr);

    i2c_cmd_send_response("i2c_read_result", picojson::value(result));
}
