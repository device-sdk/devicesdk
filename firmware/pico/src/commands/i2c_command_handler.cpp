#include "i2c_command_handler.h"

// Include individual command handlers
#include "i2c_configure.h"
#include "i2c_scan.h"
#include "i2c_write.h"
#include "i2c_read.h"
#include "i2c_batch_write.h"
#include "display_update.h"
#include "deferred_commands.h"

// External function to get current message ID for deferred commands
extern const std::string& get_current_message_id();

static i2c_send_response_fn g_send_response = nullptr;
static i2c_send_error_fn g_send_error = nullptr;
static std::string* g_message_id = nullptr;

void i2c_commands_init(i2c_send_response_fn resp_fn, i2c_send_error_fn err_fn,
                       std::string* message_id_ptr) {
    g_send_response = resp_fn;
    g_send_error = err_fn;
    g_message_id = message_id_ptr;
}

void i2c_cmd_send_response(const char* type, const picojson::value& data) {
    if (g_send_response) {
        g_send_response(type, data);
    }
}

void i2c_cmd_send_error(const char* message) {
    if (g_send_error) {
        g_send_error(message);
    }
}

bool try_handle_i2c_command(const std::string& type, const picojson::object& payload) {
    if (type == "i2c_configure") {
        handle_i2c_configure(payload);
        return true;
    }
    else if (type == "i2c_scan") {
        handle_i2c_scan(payload);
        return true;
    }
    else if (type == "i2c_write") {
        handle_i2c_write(payload);
        return true;
    }
    else if (type == "i2c_read") {
        handle_i2c_read(payload);
        return true;
    }
    else if (type == "i2c_batch_write") {
        handle_i2c_batch_write(payload);
        return true;
    }
    else if (type == "display_update") {
        // Defer to main loop context to avoid blocking lwIP callback
        defer_command(type, payload, get_current_message_id());
        return true;
    }

    return false;  // Not an I2C command
}
