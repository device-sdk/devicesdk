#include "i2c_command_handler.h"

#ifdef UNIT_TEST
// The dispatcher below only exists for host unit tests; the production
// firmware dispatches I2C/display commands inline from websocket_handler.cpp
// (and routes display_update through Core 1 via core1_worker.cpp).
#include "i2c_configure.h"
#include "i2c_scan.h"
#include "i2c_write.h"
#include "i2c_read.h"
#include "i2c_batch_write.h"
#include "display_update.h"
#endif

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

#ifdef UNIT_TEST
bool try_handle_i2c_command(const std::string& type, const picojson::object& payload) {
    if (type == "i2c_configure") {
        handle_i2c_configure(payload);
        return true;
    }
    if (type == "i2c_scan") {
        handle_i2c_scan(payload);
        return true;
    }
    if (type == "i2c_write") {
        handle_i2c_write(payload);
        return true;
    }
    if (type == "i2c_read") {
        handle_i2c_read(payload);
        return true;
    }
    if (type == "i2c_batch_write") {
        handle_i2c_batch_write(payload);
        return true;
    }
    if (type == "display_update") {
        handle_display_update(payload);
        return true;
    }
    return false;
}
#endif
