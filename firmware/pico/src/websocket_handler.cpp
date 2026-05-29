#include "websocket_handler.h"
#include "multicore/command_queue.h"
#include "multicore/response_queue.h"
#include "multicore/shared_buffers.h"
#include "multicore/core1_worker.h"
#include "commands/i2c_batch_write.h"
#include "commands/i2c_command_handler.h"
#include "base64.h"
#include "pico/stdlib.h"
#include <stdio.h>
#include <string.h>
#include <stdlib.h>
#include <climits>

// Forward declarations for callbacks used by i2c_command_handler
static void send_response(const char* type, const picojson::value& data);
static void send_error(const char* message);

static send_response_fn g_send_response = nullptr;
static std::string g_current_message_id;
static uint32_t g_sequence_counter = 0;

void websocket_handler_init(send_response_fn send_fn, configure_gpio_input_fn gpio_fn) {
    g_send_response = send_fn;
    // gpio_fn no longer used - GPIO monitoring handled by Core 1
    (void)gpio_fn;
    // Initialize i2c_command_handler with our response/error callbacks so that
    // handle_i2c_batch_write can send responses via the WebSocket connection.
    i2c_commands_init(send_response, send_error, &g_current_message_id);
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

            double pin_val = pin_it->second.get<double>();
            if (pin_val < 0 || pin_val > 255) { send_error("Invalid pin number"); return; }

            cmd.type = CMD_GPIO_SET;
            cmd.payload.gpio.pin = (uint8_t)pin_val;

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

            double pin_val = pin_it->second.get<double>();
            if (pin_val < 0 || pin_val > 255) { send_error("Invalid pin number"); return; }
            double freq_val = freq_it->second.get<double>();
            if (freq_val < 0 || freq_val > UINT32_MAX) { send_error("Invalid frequency"); return; }

            cmd.type = CMD_PWM_SET;
            cmd.payload.pwm.pin = (uint8_t)pin_val;
            cmd.payload.pwm.frequency = (uint32_t)freq_val;
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

            double pin_val = pin_it->second.get<double>();
            if (pin_val < 0 || pin_val > 255) { send_error("Invalid pin number"); return; }
            uint8_t pin = (uint8_t)pin_val;
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

            double pin_val = pin_it->second.get<double>();
            if (pin_val < 0 || pin_val > 255) { send_error("Invalid pin number"); return; }
            uint8_t pin = (uint8_t)pin_val;
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

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }
            double sda_val = sda_it->second.get<double>();
            if (sda_val < 0 || sda_val > 255) { send_error("Invalid sda_pin number"); return; }
            double scl_val = scl_it->second.get<double>();
            if (scl_val < 0 || scl_val > 255) { send_error("Invalid scl_pin number"); return; }

            uint32_t frequency = 100000;  // Default 100kHz
            if (freq_it != payload.end() && freq_it->second.is<double>()) {
                double freq_val = freq_it->second.get<double>();
                if (freq_val < 0 || freq_val > UINT32_MAX) { send_error("Invalid frequency"); return; }
                frequency = (uint32_t)freq_val;
            }

            cmd.type = CMD_I2C_CONFIGURE;
            cmd.payload.i2c_configure.bus = (uint8_t)bus_val;
            cmd.payload.i2c_configure.sda_pin = (uint8_t)sda_val;
            cmd.payload.i2c_configure.scl_pin = (uint8_t)scl_val;
            cmd.payload.i2c_configure.frequency = frequency;

            queue_command(&cmd);
        } else {
            send_error("Missing bus, sda_pin, or scl_pin parameter");
        }
    }
    // === I2C SCAN ===
    else if (type == "i2c_scan") {
        auto bus_it = payload.find("bus");

        if (bus_it != payload.end() && bus_it->second.is<double>()) {
            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }

            cmd.type = CMD_I2C_SCAN;
            cmd.payload.i2c_scan.bus = (uint8_t)bus_val;
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
            data_it != payload.end() && data_it->second.is<picojson::array>()) {

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }

            cmd.type = CMD_I2C_WRITE;
            cmd.payload.i2c_write.bus = (uint8_t)bus_val;

            std::string addr_str = addr_it->second.get<std::string>();
            cmd.payload.i2c_write.address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

            // Parse data as an array of hex-string bytes (e.g. ["0xAE", "0x01"]),
            // matching the SDK contract and the spi/i2c_batch_write handlers.
            const picojson::array& data_arr = data_it->second.get<picojson::array>();
            size_t len = data_arr.size();
            if (len > MAX_I2C_DATA_LEN) {
                send_error("I2C data too large");
                return;
            }

            for (size_t i = 0; i < len; i++) {
                if (data_arr[i].is<std::string>()) {
                    cmd.payload.i2c_write.data[i] = (uint8_t)strtol(data_arr[i].get<std::string>().c_str(), nullptr, 16);
                } else if (data_arr[i].is<double>()) {
                    cmd.payload.i2c_write.data[i] = (uint8_t)data_arr[i].get<double>();
                }
            }
            cmd.payload.i2c_write.data_len = len;

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

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }
            double len_val = len_it->second.get<double>();
            if (len_val < 0 || len_val > MAX_I2C_DATA_LEN) { send_error("I2C read length too large"); return; }

            cmd.type = CMD_I2C_READ;
            cmd.payload.i2c_read.bus = (uint8_t)bus_val;

            std::string addr_str = addr_it->second.get<std::string>();
            cmd.payload.i2c_read.address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

            cmd.payload.i2c_read.length = (size_t)len_val;
            cmd.payload.i2c_read.reg = reg_it != payload.end() && reg_it->second.is<double>()
                ? (int)reg_it->second.get<double>()
                : -1;

            queue_command(&cmd);
        } else {
            send_error("Missing bus, address, or length parameter");
        }
    }
    // === I2C BATCH WRITE ===
    // Handled directly (not via multicore queue) since the writes array is
    // variable-length and doesn't fit the fixed-size command_queue payload.
    else if (type == "i2c_batch_write") {
        handle_i2c_batch_write(payload);
    }
    // === GET TEMPERATURE ===
    else if (type == "get_temperature") {
        cmd.type = CMD_GET_TEMPERATURE;
        queue_command(&cmd);
    }
    // === WATCHDOG CONFIGURE ===
    else if (type == "watchdog_configure") {
        auto timeout_it = payload.find("timeout_ms");
        auto enable_it = payload.find("enable");

        if (timeout_it != payload.end() && timeout_it->second.is<double>() &&
            enable_it != payload.end() && enable_it->second.is<bool>()) {

            double timeout_val = timeout_it->second.get<double>();
            if (timeout_val < 0 || timeout_val > UINT32_MAX) { send_error("Invalid timeout_ms"); return; }

            cmd.type = CMD_WATCHDOG_CONFIGURE;
            cmd.payload.watchdog_configure.timeout_ms = (uint32_t)timeout_val;
            cmd.payload.watchdog_configure.enable = enable_it->second.get<bool>();

            queue_command(&cmd);
        } else {
            send_error("Missing timeout_ms or enable parameter");
        }
    }
    // === WATCHDOG FEED ===
    else if (type == "watchdog_feed") {
        cmd.type = CMD_WATCHDOG_FEED;
        queue_command(&cmd);
    }
    // === SPI CONFIGURE ===
    else if (type == "spi_configure") {
        auto bus_it = payload.find("bus");
        auto clk_it = payload.find("clk_pin");
        auto mosi_it = payload.find("mosi_pin");
        auto miso_it = payload.find("miso_pin");
        auto cs_it = payload.find("cs_pin");
        auto freq_it = payload.find("frequency");
        auto mode_it = payload.find("mode");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            clk_it != payload.end() && clk_it->second.is<double>() &&
            mosi_it != payload.end() && mosi_it->second.is<double>() &&
            miso_it != payload.end() && miso_it->second.is<double>() &&
            cs_it != payload.end() && cs_it->second.is<double>()) {

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }
            double clk_val = clk_it->second.get<double>();
            if (clk_val < 0 || clk_val > 255) { send_error("Invalid clk_pin number"); return; }
            double mosi_val = mosi_it->second.get<double>();
            if (mosi_val < 0 || mosi_val > 255) { send_error("Invalid mosi_pin number"); return; }
            double miso_val = miso_it->second.get<double>();
            if (miso_val < 0 || miso_val > 255) { send_error("Invalid miso_pin number"); return; }
            double cs_val = cs_it->second.get<double>();
            if (cs_val < 0 || cs_val > 255) { send_error("Invalid cs_pin number"); return; }

            uint32_t frequency = 1000000;  // Default 1MHz
            if (freq_it != payload.end() && freq_it->second.is<double>()) {
                double freq_val = freq_it->second.get<double>();
                if (freq_val < 0 || freq_val > UINT32_MAX) { send_error("Invalid frequency"); return; }
                frequency = (uint32_t)freq_val;
            }

            uint8_t mode = 0;  // Default mode 0
            if (mode_it != payload.end() && mode_it->second.is<double>()) {
                double mode_val = mode_it->second.get<double>();
                if (mode_val < 0 || mode_val > 255) { send_error("Invalid mode"); return; }
                mode = (uint8_t)mode_val;
            }

            cmd.type = CMD_SPI_CONFIGURE;
            cmd.payload.spi_configure.bus = (uint8_t)bus_val;
            cmd.payload.spi_configure.clk_pin = (uint8_t)clk_val;
            cmd.payload.spi_configure.mosi_pin = (uint8_t)mosi_val;
            cmd.payload.spi_configure.miso_pin = (uint8_t)miso_val;
            cmd.payload.spi_configure.cs_pin = (uint8_t)cs_val;
            cmd.payload.spi_configure.frequency = frequency;
            cmd.payload.spi_configure.mode = mode;

            queue_command(&cmd);
        } else {
            send_error("Missing bus, clk_pin, mosi_pin, miso_pin, or cs_pin parameter");
        }
    }
    // === SPI TRANSFER ===
    else if (type == "spi_transfer") {
        auto bus_it = payload.find("bus");
        auto data_it = payload.find("data");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            data_it != payload.end() && data_it->second.is<picojson::array>()) {

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }

            cmd.type = CMD_SPI_TRANSFER;
            cmd.payload.spi_transfer.bus = (uint8_t)bus_val;

            const picojson::array& data_arr = data_it->second.get<picojson::array>();
            size_t len = data_arr.size();
            if (len > MAX_SPI_DATA_LEN) {
                send_error("SPI data too large");
                return;
            }

            for (size_t i = 0; i < len; i++) {
                if (data_arr[i].is<std::string>()) {
                    cmd.payload.spi_transfer.data[i] = (uint8_t)strtol(data_arr[i].get<std::string>().c_str(), nullptr, 16);
                } else if (data_arr[i].is<double>()) {
                    cmd.payload.spi_transfer.data[i] = (uint8_t)data_arr[i].get<double>();
                }
            }
            cmd.payload.spi_transfer.data_len = len;

            queue_command(&cmd);
        } else {
            send_error("Missing bus or data parameter");
        }
    }
    // === SPI WRITE ===
    else if (type == "spi_write") {
        auto bus_it = payload.find("bus");
        auto data_it = payload.find("data");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            data_it != payload.end() && data_it->second.is<picojson::array>()) {

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }

            cmd.type = CMD_SPI_WRITE;
            cmd.payload.spi_transfer.bus = (uint8_t)bus_val;

            const picojson::array& data_arr = data_it->second.get<picojson::array>();
            size_t len = data_arr.size();
            if (len > MAX_SPI_DATA_LEN) {
                send_error("SPI data too large");
                return;
            }

            for (size_t i = 0; i < len; i++) {
                if (data_arr[i].is<std::string>()) {
                    cmd.payload.spi_transfer.data[i] = (uint8_t)strtol(data_arr[i].get<std::string>().c_str(), nullptr, 16);
                } else if (data_arr[i].is<double>()) {
                    cmd.payload.spi_transfer.data[i] = (uint8_t)data_arr[i].get<double>();
                }
            }
            cmd.payload.spi_transfer.data_len = len;

            queue_command(&cmd);
        } else {
            send_error("Missing bus or data parameter");
        }
    }
    // === SPI READ ===
    else if (type == "spi_read") {
        auto bus_it = payload.find("bus");
        auto len_it = payload.find("length");

        if (bus_it != payload.end() && bus_it->second.is<double>() &&
            len_it != payload.end() && len_it->second.is<double>()) {

            double bus_val = bus_it->second.get<double>();
            if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }
            double len_val = len_it->second.get<double>();
            if (len_val < 0 || len_val > MAX_SPI_DATA_LEN) { send_error("SPI read length too large"); return; }

            cmd.type = CMD_SPI_READ;
            cmd.payload.spi_read.bus = (uint8_t)bus_val;
            cmd.payload.spi_read.length = (size_t)len_val;

            queue_command(&cmd);
        } else {
            send_error("Missing bus or length parameter");
        }
    }
    // === UART CONFIGURE ===
    else if (type == "uart_configure") {
        auto port_it = payload.find("port");
        auto tx_it = payload.find("tx_pin");
        auto rx_it = payload.find("rx_pin");
        auto baud_it = payload.find("baud_rate");
        auto data_bits_it = payload.find("data_bits");
        auto stop_bits_it = payload.find("stop_bits");
        auto parity_it = payload.find("parity");

        if (port_it != payload.end() && port_it->second.is<double>() &&
            tx_it != payload.end() && tx_it->second.is<double>() &&
            rx_it != payload.end() && rx_it->second.is<double>()) {

            double port_val = port_it->second.get<double>();
            if (port_val < 0 || port_val > 255) { send_error("Invalid port number"); return; }
            double tx_val = tx_it->second.get<double>();
            if (tx_val < 0 || tx_val > 255) { send_error("Invalid tx_pin number"); return; }
            double rx_val = rx_it->second.get<double>();
            if (rx_val < 0 || rx_val > 255) { send_error("Invalid rx_pin number"); return; }

            uint32_t baud_rate = 115200;  // Default 115200
            if (baud_it != payload.end() && baud_it->second.is<double>()) {
                double baud_val = baud_it->second.get<double>();
                if (baud_val < 0 || baud_val > UINT32_MAX) { send_error("Invalid baud_rate"); return; }
                baud_rate = (uint32_t)baud_val;
            }

            uint8_t data_bits = 8;  // Default 8 data bits
            if (data_bits_it != payload.end() && data_bits_it->second.is<double>()) {
                double db_val = data_bits_it->second.get<double>();
                if (db_val < 0 || db_val > 255) { send_error("Invalid data_bits"); return; }
                data_bits = (uint8_t)db_val;
            }

            uint8_t stop_bits = 1;  // Default 1 stop bit
            if (stop_bits_it != payload.end() && stop_bits_it->second.is<double>()) {
                double sb_val = stop_bits_it->second.get<double>();
                if (sb_val < 0 || sb_val > 255) { send_error("Invalid stop_bits"); return; }
                stop_bits = (uint8_t)sb_val;
            }

            uint8_t parity = 0;  // Default no parity
            if (parity_it != payload.end() && parity_it->second.is<double>()) {
                double par_val = parity_it->second.get<double>();
                if (par_val < 0 || par_val > 255) { send_error("Invalid parity"); return; }
                parity = (uint8_t)par_val;
            }

            cmd.type = CMD_UART_CONFIGURE;
            cmd.payload.uart_configure.port = (uint8_t)port_val;
            cmd.payload.uart_configure.tx_pin = (uint8_t)tx_val;
            cmd.payload.uart_configure.rx_pin = (uint8_t)rx_val;
            cmd.payload.uart_configure.baud_rate = baud_rate;
            cmd.payload.uart_configure.data_bits = data_bits;
            cmd.payload.uart_configure.stop_bits = stop_bits;
            cmd.payload.uart_configure.parity = parity;

            queue_command(&cmd);
        } else {
            send_error("Missing port, tx_pin, or rx_pin parameter");
        }
    }
    // === UART WRITE ===
    else if (type == "uart_write") {
        auto port_it = payload.find("port");
        auto data_it = payload.find("data");

        if (port_it != payload.end() && port_it->second.is<double>() &&
            data_it != payload.end() && data_it->second.is<picojson::array>()) {

            double port_val = port_it->second.get<double>();
            if (port_val < 0 || port_val > 255) { send_error("Invalid port number"); return; }

            cmd.type = CMD_UART_WRITE;
            cmd.payload.uart_write.port = (uint8_t)port_val;

            const picojson::array& data_arr = data_it->second.get<picojson::array>();
            size_t len = data_arr.size();
            if (len > MAX_UART_DATA_LEN) {
                send_error("UART data too large");
                return;
            }

            for (size_t i = 0; i < len; i++) {
                if (data_arr[i].is<std::string>()) {
                    cmd.payload.uart_write.data[i] = (uint8_t)strtol(data_arr[i].get<std::string>().c_str(), nullptr, 16);
                } else if (data_arr[i].is<double>()) {
                    cmd.payload.uart_write.data[i] = (uint8_t)data_arr[i].get<double>();
                }
            }
            cmd.payload.uart_write.data_len = len;

            queue_command(&cmd);
        } else {
            send_error("Missing port or data parameter");
        }
    }
    // === UART READ ===
    else if (type == "uart_read") {
        auto port_it = payload.find("port");
        auto len_it = payload.find("length");
        auto timeout_it = payload.find("timeout_ms");

        if (port_it != payload.end() && port_it->second.is<double>() &&
            len_it != payload.end() && len_it->second.is<double>()) {

            double port_val = port_it->second.get<double>();
            if (port_val < 0 || port_val > 255) { send_error("Invalid port number"); return; }
            double len_val = len_it->second.get<double>();
            if (len_val < 0 || len_val > MAX_UART_DATA_LEN) { send_error("UART read length too large"); return; }

            uint32_t timeout_ms = 1000;  // Default 1 second timeout
            if (timeout_it != payload.end() && timeout_it->second.is<double>()) {
                double timeout_val = timeout_it->second.get<double>();
                if (timeout_val < 0 || timeout_val > UINT32_MAX) { send_error("Invalid timeout_ms"); return; }
                timeout_ms = (uint32_t)timeout_val;
            }

            cmd.type = CMD_UART_READ;
            cmd.payload.uart_read.port = (uint8_t)port_val;
            cmd.payload.uart_read.bytes_to_read = (size_t)len_val;
            cmd.payload.uart_read.timeout_ms = timeout_ms;

            queue_command(&cmd);
        } else {
            send_error("Missing port or length parameter");
        }
    }
    // === PIO WS2812 CONFIGURE ===
    else if (type == "pio_ws2812_configure") {
        auto pin_it = payload.find("pin");
        auto num_leds_it = payload.find("num_leds");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            num_leds_it != payload.end() && num_leds_it->second.is<double>()) {

            double pin_val = pin_it->second.get<double>();
            if (pin_val < 0 || pin_val > 255) { send_error("Invalid pin number"); return; }
            double num_val = num_leds_it->second.get<double>();
            if (num_val < 0 || num_val > MAX_WS2812_LEDS) { send_error("Invalid num_leds"); return; }

            cmd.type = CMD_PIO_WS2812_CONFIGURE;
            cmd.payload.pio_ws2812_configure.pin = (uint8_t)pin_val;
            cmd.payload.pio_ws2812_configure.num_leds = (uint16_t)num_val;

            queue_command(&cmd);
        } else {
            send_error("Missing pin or num_leds parameter");
        }
    }
    // === PIO WS2812 UPDATE ===
    else if (type == "pio_ws2812_update") {
        auto pixels_it = payload.find("pixels");

        if (pixels_it != payload.end() && pixels_it->second.is<picojson::array>()) {
            const picojson::array& pixels = pixels_it->second.get<picojson::array>();

            size_t num_pixels = pixels.size();
            if (num_pixels > MAX_WS2812_LEDS) {
                send_error("Too many pixels");
                return;
            }

            uint8_t pixel_data[MAX_WS2812_BUFFER_SIZE];
            size_t pixel_len = 0;

            for (size_t i = 0; i < num_pixels; i++) {
                if (!pixels[i].is<picojson::array>()) continue;
                const picojson::array& rgb = pixels[i].get<picojson::array>();
                if (rgb.size() < 3) continue;

                pixel_data[pixel_len++] = rgb[0].is<double>() ? (uint8_t)rgb[0].get<double>() : 0;
                pixel_data[pixel_len++] = rgb[1].is<double>() ? (uint8_t)rgb[1].get<double>() : 0;
                pixel_data[pixel_len++] = rgb[2].is<double>() ? (uint8_t)rgb[2].get<double>() : 0;
            }

            // Write pixel data to shared buffer
            if (!shared_ws2812_buffer_write(pixel_data, pixel_len)) {
                send_error("Failed to write WS2812 pixel buffer");
                return;
            }

            cmd.type = CMD_PIO_WS2812_UPDATE;
            queue_command(&cmd);
        } else {
            send_error("Missing pixels parameter");
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
        auto col_off_it = payload.find("columnOffset");
        auto page_off_it = payload.find("pageOffset");

        if (bus_it == payload.end() || !bus_it->second.is<double>() ||
            addr_it == payload.end() || !addr_it->second.is<std::string>() ||
            controller_it == payload.end() || !controller_it->second.is<std::string>() ||
            width_it == payload.end() || !width_it->second.is<double>() ||
            height_it == payload.end() || !height_it->second.is<double>() ||
            segments_it == payload.end() || !segments_it->second.is<picojson::array>()) {
            send_error("Missing required parameters for display_update");
            return;
        }

        double bus_val = bus_it->second.get<double>();
        if (bus_val < 0 || bus_val > 255) { send_error("Invalid bus number"); return; }
        uint8_t bus = (uint8_t)bus_val;
        std::string addr_str = addr_it->second.get<std::string>();
        std::string controller = controller_it->second.get<std::string>();
        double width_val = width_it->second.get<double>();
        if (width_val <= 0 || width_val > 128) { send_error("Invalid width (must be 1-128)"); return; }
        uint8_t width = (uint8_t)width_val;
        double height_val = height_it->second.get<double>();
        if (height_val <= 0 || height_val > 64 || ((uint32_t)height_val % 8) != 0) {
            send_error("Invalid height (must be 1-64 and a multiple of 8)");
            return;
        }
        uint8_t height = (uint8_t)height_val;
        const picojson::array& segments = segments_it->second.get<picojson::array>();

        uint8_t col_offset = 0;
        uint8_t page_offset = 0;
        if (col_off_it != payload.end() && col_off_it->second.is<double>()) {
            double v = col_off_it->second.get<double>();
            if (v < 0 || v > 127) { send_error("Invalid columnOffset (must be 0-127)"); return; }
            col_offset = (uint8_t)v;
        }
        if (page_off_it != payload.end() && page_off_it->second.is<double>()) {
            double v = page_off_it->second.get<double>();
            if (v < 0 || v > 7) { send_error("Invalid pageOffset (must be 0-7)"); return; }
            page_offset = (uint8_t)v;
        }
        if ((uint32_t)col_offset + width > 128) {
            send_error("columnOffset + width exceeds 128");
            return;
        }
        if ((uint32_t)page_offset + (height / 8) > 8) {
            send_error("pageOffset + height/8 exceeds 8");
            return;
        }

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
        cmd.payload.display.col_offset = col_offset;
        cmd.payload.display.page_offset = page_offset;
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
