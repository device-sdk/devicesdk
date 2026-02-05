#include "websocket_handler.h"
#include "multicore/command_queue.h"
#include "multicore/response_queue.h"
#include "multicore/shared_buffers.h"
#include "multicore/core1_worker.h"
#include "base64.h"
#include "pico/stdlib.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>

static send_response_fn g_send_response = nullptr;
static std::string g_current_message_id;
static uint32_t g_sequence_counter = 0;

void websocket_handler_init(send_response_fn send_fn, configure_gpio_input_fn gpio_fn) {
    g_send_response = send_fn;
    // gpio_fn no longer used - GPIO monitoring handled by Core 1
    (void)gpio_fn;
}

const std::string& get_current_message_id() {
    return g_current_message_id;
}

void set_current_message_id(const std::string& id) {
    g_current_message_id = id;
}

static void send_response(const char* type, const picojson::value& data) {
    if (!g_send_response) return;

    picojson::object response;
    response["type"] = picojson::value(type);
    response["payload"] = data;
    if (!g_current_message_id.empty()) {
        response["id"] = picojson::value(g_current_message_id);
    }

    std::string json = picojson::value(response).serialize();
    g_send_response(json.c_str());
}

static void send_error(const char* message) {
    picojson::object payload;
    payload["error"] = picojson::value(message);
    send_response("command_error", picojson::value(payload));
}

// Queue a command to Core 1
static bool queue_command(worker_command_t* cmd) {
    cmd->sequence_id = ++g_sequence_counter;
    strncpy(cmd->message_id, g_current_message_id.c_str(), MAX_MESSAGE_ID_LEN - 1);
    cmd->message_id[MAX_MESSAGE_ID_LEN - 1] = '\0';

    if (!queue_try_add(&g_command_queue, cmd)) {
        send_error("Command queue full");
        return false;
    }
    return true;
}

static uint8_t hex_to_byte(const char* hex) {
    uint8_t result = 0;
    for (int i = 0; i < 2; i++) {
        result <<= 4;
        char c = hex[i];
        if (c >= '0' && c <= '9') result |= (c - '0');
        else if (c >= 'a' && c <= 'f') result |= (c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') result |= (c - 'A' + 10);
    }
    return result;
}

void handle_websocket_message(const picojson::value& v) {
    if (!v.is<picojson::object>()) return;
    const picojson::object& obj = v.get<picojson::object>();

    auto type_it = obj.find("type");
    if (type_it == obj.end() || !type_it->second.is<std::string>()) return;
    const std::string& type = type_it->second.get<std::string>();

    // Extract message ID if present
    g_current_message_id.clear();
    auto id_it = obj.find("id");
    if (id_it != obj.end() && id_it->second.is<std::string>()) {
        g_current_message_id = id_it->second.get<std::string>();
    }

    // Get payload (may be empty for some commands)
    picojson::object payload;
    auto payload_it = obj.find("payload");
    if (payload_it != obj.end() && payload_it->second.is<picojson::object>()) {
        payload = payload_it->second.get<picojson::object>();
    }

    worker_command_t cmd;
    memset(&cmd, 0, sizeof(cmd));

    // === REBOOT ===
    if (type == "reboot") {
        cmd.type = CMD_REBOOT;
        queue_command(&cmd);
    }
    // === SET GPIO STATE ===
    else if (type == "set_gpio_state") {
        auto pin_it = payload.find("pin");
        auto state_it = payload.find("state");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            state_it != payload.end() && state_it->second.is<std::string>()) {

            cmd.type = CMD_GPIO_SET;
            cmd.payload.gpio.pin = (uint8_t)pin_it->second.get<double>();

            const std::string& state_str = state_it->second.get<std::string>();
            if (state_str == "high") {
                cmd.payload.gpio.state = WORKER_GPIO_HIGH;
            } else if (state_str == "low") {
                cmd.payload.gpio.state = WORKER_GPIO_LOW;
            } else {
                send_error("Invalid state value");
                return;
            }

            queue_command(&cmd);
        } else {
            send_error("Missing pin or state parameter");
        }
    }
    // === SET PWM STATE ===
    else if (type == "set_pwm_state") {
        auto pin_it = payload.find("pin");
        auto freq_it = payload.find("frequency");
        auto duty_it = payload.find("duty_cycle");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            freq_it != payload.end() && freq_it->second.is<double>() &&
            duty_it != payload.end() && duty_it->second.is<double>()) {

            cmd.type = CMD_PWM_SET;
            cmd.payload.pwm.pin = (uint8_t)pin_it->second.get<double>();
            cmd.payload.pwm.frequency = (uint32_t)freq_it->second.get<double>();
            cmd.payload.pwm.duty_cycle = (float)duty_it->second.get<double>();

            queue_command(&cmd);
        } else {
            send_error("Missing pin, frequency, or duty_cycle parameter");
        }
    }
    // === GET PIN STATE ===
    else if (type == "get_pin_state") {
        auto pin_it = payload.find("pin");
        auto mode_it = payload.find("mode");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            mode_it != payload.end() && mode_it->second.is<std::string>()) {

            uint8_t pin = (uint8_t)pin_it->second.get<double>();
            const std::string& mode = mode_it->second.get<std::string>();

            if (mode == "digital") {
                cmd.type = CMD_GPIO_GET_DIGITAL;
            } else if (mode == "analog") {
                cmd.type = CMD_GPIO_GET_ANALOG;
            } else {
                send_error("Invalid mode (use 'digital' or 'analog')");
                return;
            }

            cmd.payload.gpio.pin = pin;
            queue_command(&cmd);
        } else {
            send_error("Missing pin or mode parameter");
        }
    }
    // === CONFIGURE GPIO INPUT MONITORING ===
    else if (type == "configure_gpio_input_monitoring") {
        auto pin_it = payload.find("pin");
        auto enable_it = payload.find("enable");
        auto pull_it = payload.find("pull");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            enable_it != payload.end() && enable_it->second.is<bool>()) {

            uint8_t pin = (uint8_t)pin_it->second.get<double>();
            bool enable = enable_it->second.get<bool>();

            if (enable) {
                cmd.type = CMD_GPIO_CONFIGURE_INPUT;
                cmd.payload.gpio.pin = pin;

                // Parse pull configuration
                cmd.payload.gpio.pull = WORKER_PULL_UP;  // Default
                if (pull_it != payload.end() && pull_it->second.is<std::string>()) {
                    const std::string& pull_str = pull_it->second.get<std::string>();
                    if (pull_str == "up") {
                        cmd.payload.gpio.pull = WORKER_PULL_UP;
                    } else if (pull_str == "down") {
                        cmd.payload.gpio.pull = WORKER_PULL_DOWN;
                    } else if (pull_str == "none") {
                        cmd.payload.gpio.pull = WORKER_PULL_NONE;
                    }
                }

                queue_command(&cmd);
            } else {
                // Disable monitoring - send response immediately since Core 1 tracks this
                // TODO: Add CMD_GPIO_DISABLE_MONITORING if needed
                picojson::object ack;
                ack["command"] = picojson::value("configure_gpio_input_monitoring");
                ack["pin"] = picojson::value((double)pin);
                ack["status"] = picojson::value("monitoring_disabled");
                send_response("command_ack", picojson::value(ack));
            }
        } else {
            send_error("Invalid pin or enable parameter");
        }
    }
    // === I2C CONFIGURE ===
    else if (type == "i2c_configure") {
        auto bus_it = payload.find("bus");
        auto sda_it = payload.find("sda_pin");
        auto scl_it = payload.find("scl_pin");
        auto freq_it = payload.find("frequency");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            sda_it != payload.end() && sda_it->second.is<double>() &&
            scl_it != payload.end() && scl_it->second.is<double>()) {

            cmd.type = CMD_I2C_CONFIGURE;
            cmd.payload.i2c_configure.bus = (uint8_t)bus_it->second.get<double>();
            cmd.payload.i2c_configure.sda_pin = (uint8_t)sda_it->second.get<double>();
            cmd.payload.i2c_configure.scl_pin = (uint8_t)scl_it->second.get<double>();
            cmd.payload.i2c_configure.frequency = freq_it != payload.end() && freq_it->second.is<double>()
                ? (uint32_t)freq_it->second.get<double>()
                : 100000;  // Default 100kHz

            queue_command(&cmd);
        } else {
            send_error("Missing bus, sda_pin, or scl_pin parameter");
        }
    }
    // === I2C SCAN ===
    else if (type == "i2c_scan") {
        auto bus_it = payload.find("bus");

        if (bus_it != payload.end() && bus_it->second.is<double>()) {
            cmd.type = CMD_I2C_SCAN;
            cmd.payload.i2c_scan.bus = (uint8_t)bus_it->second.get<double>();
            queue_command(&cmd);
        } else {
            send_error("Missing bus parameter");
        }
    }
    // === I2C WRITE ===
    else if (type == "i2c_write") {
        auto bus_it = payload.find("bus");
        auto addr_it = payload.find("address");
        auto data_it = payload.find("data");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            addr_it != payload.end() && addr_it->second.is<std::string>() &&
            data_it != payload.end() && data_it->second.is<std::string>()) {

            cmd.type = CMD_I2C_WRITE;
            cmd.payload.i2c_write.bus = (uint8_t)bus_it->second.get<double>();

            std::string addr_str = addr_it->second.get<std::string>();
            cmd.payload.i2c_write.address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

            // Decode base64 data
            std::string data_b64 = data_it->second.get<std::string>();
            std::vector<uint8_t> data = base64_decode(data_b64);

            if (data.size() > MAX_I2C_DATA_LEN) {
                send_error("I2C data too large");
                return;
            }

            memcpy(cmd.payload.i2c_write.data, data.data(), data.size());
            cmd.payload.i2c_write.data_len = data.size();

            queue_command(&cmd);
        } else {
            send_error("Missing bus, address, or data parameter");
        }
    }
    // === I2C READ ===
    else if (type == "i2c_read") {
        auto bus_it = payload.find("bus");
        auto addr_it = payload.find("address");
        auto len_it = payload.find("length");
        auto reg_it = payload.find("register");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            addr_it != payload.end() && addr_it->second.is<std::string>() &&
            len_it != payload.end() && len_it->second.is<double>()) {

            cmd.type = CMD_I2C_READ;
            cmd.payload.i2c_read.bus = (uint8_t)bus_it->second.get<double>();

            std::string addr_str = addr_it->second.get<std::string>();
            cmd.payload.i2c_read.address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

            cmd.payload.i2c_read.length = (size_t)len_it->second.get<double>();
            cmd.payload.i2c_read.reg = reg_it != payload.end() && reg_it->second.is<double>()
                ? (int)reg_it->second.get<double>()
                : -1;

            queue_command(&cmd);
        } else {
            send_error("Missing bus, address, or length parameter");
        }
    }
    // === DISPLAY UPDATE ===
    else if (type == "display_update") {
        auto bus_it = payload.find("bus");
        auto addr_it = payload.find("address");
        auto controller_it = payload.find("controller");
        auto width_it = payload.find("width");
        auto height_it = payload.find("height");
        auto segments_it = payload.find("segments");
        auto init_it = payload.find("init");

        if (bus_it == payload.end() || !bus_it->second.is<double>() ||
            addr_it == payload.end() || !addr_it->second.is<std::string>() ||
            controller_it == payload.end() || !controller_it->second.is<std::string>() ||
            width_it == payload.end() || !width_it->second.is<double>() ||
            height_it == payload.end() || !height_it->second.is<double>() ||
            segments_it == payload.end() || !segments_it->second.is<picojson::array>()) {
            send_error("Missing required parameters for display_update");
            return;
        }

        uint8_t bus = (uint8_t)bus_it->second.get<double>();
        std::string addr_str = addr_it->second.get<std::string>();
        std::string controller = controller_it->second.get<std::string>();
        uint8_t width = (uint8_t)width_it->second.get<double>();
        uint8_t height = (uint8_t)height_it->second.get<double>();
        const picojson::array& segments = segments_it->second.get<picojson::array>();

        if (bus > 1) {
            send_error("Invalid bus number");
            return;
        }

        uint8_t address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

        bool is_ssd1306 = (controller == "ssd1306");
        bool is_sh1106 = (controller == "sh1106");
        if (!is_ssd1306 && !is_sh1106) {
            send_error("Invalid controller type");
            return;
        }

        // Prepare framebuffer data for shared buffer
        size_t fb_size = (size_t)width * height / 8;
        if (fb_size > MAX_DISPLAY_BUFFER_SIZE) {
            send_error("Framebuffer too large");
            return;
        }

        uint8_t fb_data[MAX_DISPLAY_BUFFER_SIZE] = {0};
        display_segment_t seg_info[MAX_DISPLAY_SEGMENTS];
        size_t seg_count = 0;

        // Decode and accumulate segments
        for (size_t i = 0; i < segments.size() && seg_count < MAX_DISPLAY_SEGMENTS; i++) {
            if (!segments[i].is<picojson::object>()) continue;
            const picojson::object& seg = segments[i].get<picojson::object>();

            auto offset_it = seg.find("offset");
            auto data_it = seg.find("data");

            if (offset_it == seg.end() || !offset_it->second.is<double>() ||
                data_it == seg.end() || !data_it->second.is<std::string>()) {
                continue;
            }

            size_t offset = (size_t)offset_it->second.get<double>();
            const std::string& data_b64 = data_it->second.get<std::string>();
            std::vector<uint8_t> data = base64_decode(data_b64);

            if (offset + data.size() <= fb_size) {
                memcpy(&fb_data[offset], data.data(), data.size());
                seg_info[seg_count].offset = offset;
                seg_info[seg_count].length = data.size();
                seg_count++;
            }
        }

        // Write to shared buffer
        if (!shared_display_buffer_write(fb_data, fb_size, seg_info, seg_count)) {
            send_error("Failed to write display buffer");
            return;
        }

        // Queue command
        cmd.type = CMD_DISPLAY_UPDATE;
        cmd.payload.display.bus = bus;
        cmd.payload.display.address = address;
        cmd.payload.display.width = width;
        cmd.payload.display.height = height;
        cmd.payload.display.controller = is_ssd1306 ? 0 : 1;
        cmd.payload.display.init = init_it != payload.end() && init_it->second.is<bool>()
            ? init_it->second.get<bool>()
            : false;

        queue_command(&cmd);
    }
    else {
        printf("Unknown command type: %s\n", type.c_str());
        send_error("Unknown command type");
    }
}
