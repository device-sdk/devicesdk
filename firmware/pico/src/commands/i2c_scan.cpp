#include "i2c_scan.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include <stdio.h>

// Expected payload:
// {
//   "bus": 0  // 0 or 1
// }

void handle_i2c_scan(const picojson::object& payload) {
    auto bus_it = payload.find("bus");

    if (bus_it == payload.end() || !bus_it->second.is<double>()) {
        i2c_cmd_send_error("Missing required parameter: bus");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();

    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    i2c_scan_result_t scan = hal_i2c_scan(bus);

    picojson::array addresses;
    for (int i = 0; i < scan.count; i++) {
        char hex[5];
        snprintf(hex, sizeof(hex), "0x%02X", scan.addresses[i]);
        addresses.push_back(picojson::value(std::string(hex)));
    }

    picojson::object result;
    result["bus"] = picojson::value((double)bus);
    result["addresses_found"] = picojson::value(addresses);

    i2c_cmd_send_response("i2c_scan_result", picojson::value(result));
}
