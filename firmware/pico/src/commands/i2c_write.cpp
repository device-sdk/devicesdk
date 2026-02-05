#include "i2c_write.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>

// Expected payload:
// {
//   "bus": 0,
//   "address": "0x3C",
//   "data": ["0x00", "0xAE"]
// }

void handle_i2c_write(const picojson::object& payload) {
    auto bus_it = payload.find("bus");
    auto addr_it = payload.find("address");
    auto data_it = payload.find("data");

    if (bus_it == payload.end() || !bus_it->second.is<double>() ||
        addr_it == payload.end() || !addr_it->second.is<std::string>() ||
        data_it == payload.end() || !data_it->second.is<picojson::array>()) {
        i2c_cmd_send_error("Missing required parameters: bus, address, data");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();
    std::string addr_str = addr_it->second.get<std::string>();
    const picojson::array& data_arr = data_it->second.get<picojson::array>();

    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    // Parse address (hex string like "0x50")
    uint8_t address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

    // Validate address range
    if (address < 0x08 || address > 0x77) {
        i2c_cmd_send_error("Invalid I2C address (must be 0x08-0x77)");
        return;
    }

    // Parse data array (hex strings)
    uint8_t data[128];
    size_t len = 0;
    for (const auto& item : data_arr) {
        if (item.is<std::string>() && len < sizeof(data)) {
            data[len++] = (uint8_t)strtol(item.get<std::string>().c_str(), nullptr, 16);
        }
    }

    if (len == 0) {
        i2c_cmd_send_error("Data array is empty");
        return;
    }

    bool success = hal_i2c_write(bus, address, data, len);
    if (!success) {
        char error_msg[64];
        snprintf(error_msg, sizeof(error_msg), "I2C write failed to address %s", addr_str.c_str());
        i2c_cmd_send_error(error_msg);
        return;
    }

    picojson::object ack;
    ack["command"] = picojson::value("i2c_write");
    ack["bus"] = picojson::value((double)bus);
    ack["address"] = picojson::value(addr_str);
    ack["bytes_written"] = picojson::value((double)len);
    ack["status"] = picojson::value("success");
    i2c_cmd_send_response("command_ack", picojson::value(ack));
}
