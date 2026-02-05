#ifndef I2C_COMMAND_HANDLER_H
#define I2C_COMMAND_HANDLER_H

#include "picojson.h"
#include <string>

// Function pointer types for response callbacks
typedef void (*i2c_send_response_fn)(const char* type, const picojson::value& data);
typedef void (*i2c_send_error_fn)(const char* message);

// Initialize I2C command handler with response callbacks and message ID pointer
void i2c_commands_init(i2c_send_response_fn resp_fn, i2c_send_error_fn err_fn,
                       std::string* message_id_ptr);

// Try to handle an I2C command
// Returns true if the command type was recognized and handled
// Returns false if the command type is not an I2C command
bool try_handle_i2c_command(const std::string& type, const picojson::object& payload);

// Helper functions for command implementations to use
void i2c_cmd_send_response(const char* type, const picojson::value& data);
void i2c_cmd_send_error(const char* message);

#endif // I2C_COMMAND_HANDLER_H
