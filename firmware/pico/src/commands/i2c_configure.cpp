#include "i2c_configure.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include <stdio.h>

// Expected payload:
// {
//   "bus": 0,           // 0 or 1
//   "sda_pin": 4,       // GPIO number
//   "scl_pin": 5,       // GPIO number
//   "frequency": 400000 // Optional, defaults to 100000
// }

void handle_i2c_configure(const picojson::object& payload) {
    // Extract required parameters
    auto bus_it = payload.find("bus");
    auto sda_it = payload.find("sda_pin");
    auto scl_it = payload.find("scl_pin");

    if (bus_it == payload.end() || !bus_it->second.is<double>() ||
        sda_it == payload.end() || !sda_it->second.is<double>() ||
        scl_it == payload.end() || !scl_it->second.is<double>()) {
        i2c_cmd_send_error("Missing required parameters: bus, sda_pin, scl_pin");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();
    uint8_t sda_pin = (uint8_t)sda_it->second.get<double>();
    uint8_t scl_pin = (uint8_t)scl_it->second.get<double>();

    // Extract optional frequency (default 100kHz)
    uint32_t frequency = 100000;
    auto freq_it = payload.find("frequency");
    if (freq_it != payload.end() && freq_it->second.is<double>()) {
        frequency = (uint32_t)freq_it->second.get<double>();
    }

    // Validate bus number
    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    // Validate pin combination
    if (!hal_i2c_validate_pins(bus, sda_pin, scl_pin)) {
        char error_msg[128];
        snprintf(error_msg, sizeof(error_msg),
                 "Invalid pin combination: GP%d/GP%d not valid for I2C%d",
                 sda_pin, scl_pin, bus);
        i2c_cmd_send_error(error_msg);
        return;
    }

    // Configure the bus
    if (!hal_i2c_configure(bus, sda_pin, scl_pin, frequency)) {
        i2c_cmd_send_error("Failed to configure I2C bus");
        return;
    }

    printf("I2C%d configured: SDA=GP%d, SCL=GP%d, freq=%lu Hz\n",
           bus, sda_pin, scl_pin, frequency);

    // Send success response
    picojson::object ack;
    ack["command"] = picojson::value("i2c_configure");
    ack["bus"] = picojson::value((double)bus);
    ack["sda_pin"] = picojson::value((double)sda_pin);
    ack["scl_pin"] = picojson::value((double)scl_pin);
    ack["frequency"] = picojson::value((double)frequency);
    ack["status"] = picojson::value("success");
    i2c_cmd_send_response("command_ack", picojson::value(ack));
}
