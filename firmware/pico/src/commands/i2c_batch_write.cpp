#include "i2c_batch_write.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include <stdio.h>
#include <stdlib.h>

// Expected payload:
// {
//   "bus": 0,
//   "address": "0x76",
//   "writes": [
//     ["0xF2", "0x01"],
//     ["0xF4", "0x27"],
//     ["0xF5", "0xA0"]
//   ]
// }

void handle_i2c_batch_write(const picojson::object& payload) {
    auto bus_it = payload.find("bus");
    auto addr_it = payload.find("address");
    auto writes_it = payload.find("writes");

    if (bus_it == payload.end() || !bus_it->second.is<double>() ||
        addr_it == payload.end() || !addr_it->second.is<std::string>() ||
        writes_it == payload.end() || !writes_it->second.is<picojson::array>()) {
        i2c_cmd_send_error("Missing required parameters: bus, address, writes");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();
    std::string addr_str = addr_it->second.get<std::string>();
    const picojson::array& writes_arr = writes_it->second.get<picojson::array>();

    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    // Parse address (hex string like "0x76")
    uint8_t address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

    // Validate address range
    if (address < 0x08 || address > 0x77) {
        i2c_cmd_send_error("Invalid I2C address (must be 0x08-0x77)");
        return;
    }

    if (writes_arr.empty()) {
        i2c_cmd_send_error("Writes array is empty");
        return;
    }

    // Execute each write operation
    size_t write_index = 0;
    for (const auto& write_op : writes_arr) {
        if (!write_op.is<picojson::array>()) {
            char error_msg[64];
            snprintf(error_msg, sizeof(error_msg), "Write %zu is not an array", write_index);
            i2c_cmd_send_error(error_msg);
            return;
        }

        const picojson::array& data_arr = write_op.get<picojson::array>();

        // Parse data bytes
        uint8_t data[128];
        size_t len = 0;
        for (const auto& item : data_arr) {
            if (item.is<std::string>() && len < sizeof(data)) {
                data[len++] = (uint8_t)strtol(item.get<std::string>().c_str(), nullptr, 16);
            }
        }

        if (len == 0) {
            char error_msg[64];
            snprintf(error_msg, sizeof(error_msg), "Write %zu has no data", write_index);
            i2c_cmd_send_error(error_msg);
            return;
        }

        // Execute the write
        bool success = hal_i2c_write(bus, address, data, len);
        if (!success) {
            char error_msg[64];
            snprintf(error_msg, sizeof(error_msg), "Write %zu failed: NACK received", write_index);
            i2c_cmd_send_error(error_msg);
            return;
        }

        write_index++;
    }

    printf("I2C batch write: %zu operations completed to address %s\n",
           writes_arr.size(), addr_str.c_str());

    picojson::object ack;
    ack["command"] = picojson::value("i2c_batch_write");
    ack["bus"] = picojson::value((double)bus);
    ack["address"] = picojson::value(addr_str);
    ack["writes_completed"] = picojson::value((double)writes_arr.size());
    ack["status"] = picojson::value("success");
    i2c_cmd_send_response("command_ack", picojson::value(ack));
}
