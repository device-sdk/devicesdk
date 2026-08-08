#include "websocket_handler.h"
#include "command_queue.h"
#include "response_queue.h"
#include "shared_buffers.h"
#include "base64.h"
#include "cJSON.h"
#include <string.h>
#include <stdlib.h>
#include <limits.h>

#ifndef UNIT_TEST
#include "esp_log.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "soc/soc_caps.h"
static const char *TAG = "WSHandler";
#define LOG_I(tag, fmt, ...) ESP_LOGI(tag, fmt, ##__VA_ARGS__)
#define LOG_E(tag, fmt, ...) ESP_LOGE(tag, fmt, ##__VA_ARGS__)
#define LOG_W(tag, fmt, ...) ESP_LOGW(tag, fmt, ##__VA_ARGS__)
#define MAX_GPIO_PIN (SOC_GPIO_PIN_COUNT - 1)
#else
#include <stdio.h>
static const char *TAG = "WSHandler";
#define LOG_I(tag, fmt, ...) (void)tag
#define LOG_E(tag, fmt, ...) (void)tag
#define LOG_W(tag, fmt, ...) (void)tag
#define MAX_GPIO_PIN 255
#endif

static void *s_cmd_queue = NULL;
static void *s_resp_queue = NULL;
static uint32_t s_sequence_counter = 0;

#ifdef UNIT_TEST
static worker_command_t s_test_last_cmd;
static bool s_test_last_cmd_valid = false;

void test_reset_last_queued_command(void) {
    memset(&s_test_last_cmd, 0, sizeof(s_test_last_cmd));
    s_test_last_cmd_valid = false;
}

const worker_command_t *test_get_last_queued_command(void) {
    return s_test_last_cmd_valid ? &s_test_last_cmd : NULL;
}
#endif

void websocket_handler_init(void *cmd_queue_handle) {
    s_cmd_queue = cmd_queue_handle;
    s_sequence_counter = 0;
#ifdef UNIT_TEST
    test_reset_last_queued_command();
#endif
}

// GP0..GP48 covers every ESP32 variant we ship; the per-chip range is checked
// by the GPIO driver itself when the command runs.
#define MAX_SENSOR_PIN 48

// Sends a `command_error` frame for a message that failed to parse, so the
// script's promise resolves (or rejects) with the error instead of timing out
// after 5 s. Under UNIT_TEST the host tests assert that nothing was queued, so
// this is a no-op there.
#ifndef UNIT_TEST
void devicesdk_ws_send_error(const char *message_id, const char *error);
static void send_command_error(const char *msg_id, const char *error) {
    devicesdk_ws_send_error(msg_id, error);
}
#else
static void send_command_error(const char *msg_id, const char *error) {
    (void)msg_id;
    (void)error;
}
#endif

// Validates a sensor pin: an integer in 0..MAX_SENSOR_PIN, or -1. Rejects
// fractional pins - truncating 4.5 to 4 would read the wrong sensor.
static int parse_sensor_pin(const cJSON *pin_obj) {
    if (!cJSON_IsNumber(pin_obj)) return -1;
    double d = pin_obj->valuedouble;
    if (d < 0 || d > MAX_SENSOR_PIN || d != (double)(int)d) return -1;
    return (int)d;
}

static int hex_nibble(char c) {
    if (c >= '0' && c <= '9') return c - '0';
    if (c >= 'A' && c <= 'F') return c - 'A' + 10;
    return -1;
}

// Decodes 16 uppercase hex characters into 8 ROM bytes, family code first.
static bool parse_rom_hex(const char *hex, uint8_t out[ONEWIRE_ROM_LEN]) {
    if (!hex || strlen(hex) != ONEWIRE_ROM_LEN * 2) return false;
    for (size_t i = 0; i < ONEWIRE_ROM_LEN; i++) {
        int hi = hex_nibble(hex[i * 2]);
        int lo = hex_nibble(hex[i * 2 + 1]);
        if (hi < 0 || lo < 0) return false;
        out[i] = (uint8_t)((hi << 4) | lo);
    }
    return true;
}

void websocket_handler_set_response_queue(void *resp_queue_handle) {
    s_resp_queue = resp_queue_handle;
}

// Answer a rejected command with a command_error response (same shape the Pico
// sends) so the server's pending command resolves immediately instead of
// timing out after 5s. No-op until a response queue is attached.
static void reject_command(const char *msg_id, const char *message) {
    LOG_E(TAG, "Command rejected: %s", message);

    worker_response_t resp;
    memset(&resp, 0, sizeof(resp));
    resp.status = RESPONSE_ERROR;
    strncpy(resp.message_id, msg_id, MAX_MESSAGE_ID_LEN - 1);
    resp.message_id[MAX_MESSAGE_ID_LEN - 1] = '\0';
    strncpy(resp.error_msg, message, MAX_ERROR_MSG_LEN - 1);
    resp.error_msg[MAX_ERROR_MSG_LEN - 1] = '\0';

#ifndef UNIT_TEST
    if (s_resp_queue) {
        xQueueSend((QueueHandle_t)s_resp_queue, &resp, 0);
    }
#else
    (void)s_resp_queue;
#endif
}

// Parse a full hex byte string ("0x3C" or "3C"). Rejects trailing garbage and
// out-of-range values instead of silently truncating like bare strtol would.
static bool parse_hex_byte(const char *s, uint8_t *out) {
    if (!s || *s == '\0') return false;
    char *end = NULL;
    long v = strtol(s, &end, 16);
    if (end == s || *end != '\0' || v < 0 || v > 0xFF) return false;
    *out = (uint8_t)v;
    return true;
}

static bool queue_command(worker_command_t *cmd) {
    cmd->sequence_id = ++s_sequence_counter;

#ifndef UNIT_TEST
    if (!s_cmd_queue) return false;
    if (xQueueSend((QueueHandle_t)s_cmd_queue, cmd, 0) != pdTRUE) {
        LOG_E(TAG, "Command queue full");
        return false;
    }
#else
    (void)s_cmd_queue;
    memcpy(&s_test_last_cmd, cmd, sizeof(s_test_last_cmd));
    s_test_last_cmd_valid = true;
#endif
    return true;
}

bool handle_websocket_message(const char *message) {
    if (!message) {
        LOG_E(TAG, "Null message received");
        return false;
    }

    cJSON *json = cJSON_Parse(message);
    if (!json) {
        LOG_E(TAG, "Failed to parse JSON: %s", message);
        return false;
    }

    cJSON *type_obj = cJSON_GetObjectItem(json, "type");
    if (!cJSON_IsString(type_obj)) {
        LOG_E(TAG, "Message missing 'type' field");
        cJSON_Delete(json);
        return false;
    }

    const char *type = type_obj->valuestring;

    // Extract message ID if present
    cJSON *id_obj = cJSON_GetObjectItem(json, "id");
    const char *msg_id = (cJSON_IsString(id_obj)) ? id_obj->valuestring : "";

    // Get payload (may be absent for some commands)
    cJSON *payload = cJSON_GetObjectItem(json, "payload");

    worker_command_t cmd;
    memset(&cmd, 0, sizeof(cmd));
    strncpy(cmd.message_id, msg_id, MAX_MESSAGE_ID_LEN - 1);
    cmd.message_id[MAX_MESSAGE_ID_LEN - 1] = '\0';

    // === REBOOT ===
    if (strcmp(type, "reboot") == 0) {
        cmd.type = CMD_REBOOT;
        queue_command(&cmd);
    }
    // === SET GPIO STATE ===
    else if (strcmp(type, "set_gpio_state") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *state_obj = cJSON_GetObjectItem(payload, "state");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsString(state_obj)) {
            reject_command(msg_id, "Missing pin or state parameter");
            goto done;
        }

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid pin number");
            goto done;
        }
        cmd.type = CMD_GPIO_SET;
        cmd.payload.gpio.pin = (uint8_t)pin_obj->valuedouble;

        if (strcmp(state_obj->valuestring, "high") == 0) {
            cmd.payload.gpio.state = WORKER_GPIO_HIGH;
        } else if (strcmp(state_obj->valuestring, "low") == 0) {
            cmd.payload.gpio.state = WORKER_GPIO_LOW;
        } else {
            reject_command(msg_id, "Invalid state value");
            goto done;
        }
        queue_command(&cmd);
    }
    // === GET PIN STATE ===
    else if (strcmp(type, "get_pin_state") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *mode_obj = cJSON_GetObjectItem(payload, "mode");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsString(mode_obj)) {
            reject_command(msg_id, "Missing pin or mode parameter");
            goto done;
        }

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid pin number");
            goto done;
        }
        cmd.payload.gpio.pin = (uint8_t)pin_obj->valuedouble;

        if (strcmp(mode_obj->valuestring, "digital") == 0) {
            cmd.type = CMD_GPIO_GET_DIGITAL;
        } else if (strcmp(mode_obj->valuestring, "analog") == 0) {
            cmd.type = CMD_GPIO_GET_ANALOG;
        } else {
            reject_command(msg_id, "Invalid mode (use 'digital' or 'analog')");
            goto done;
        }
        queue_command(&cmd);
    }
    // === SET PWM STATE ===
    else if (strcmp(type, "set_pwm_state") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *freq_obj = cJSON_GetObjectItem(payload, "frequency");
        cJSON *duty_obj = cJSON_GetObjectItem(payload, "duty_cycle");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsNumber(freq_obj) || !cJSON_IsNumber(duty_obj)) {
            reject_command(msg_id, "Missing pin, frequency, or duty_cycle parameter");
            goto done;
        }

        // PWM pins must be real GPIOs: the LEDC channel map is indexed by pin,
        // so reject anything past the chip's maximum pin number here as well
        // as in hal.c (defense in depth against an OOB array access).
        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > MAX_GPIO_PIN) {
            reject_command(msg_id, "Invalid pin number");
            goto done;
        }
        if (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX) {
            reject_command(msg_id, "Invalid frequency");
            goto done;
        }
        cmd.type = CMD_PWM_SET;
        cmd.payload.pwm.pin = (uint8_t)pin_obj->valuedouble;
        cmd.payload.pwm.frequency = (uint32_t)freq_obj->valuedouble;
        cmd.payload.pwm.duty_cycle = (float)duty_obj->valuedouble;
        queue_command(&cmd);
    }
    // === CONFIGURE GPIO INPUT MONITORING ===
    else if (strcmp(type, "configure_gpio_input_monitoring") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *enable_obj = cJSON_GetObjectItem(payload, "enable");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsBool(enable_obj)) {
            reject_command(msg_id, "Invalid pin or enable parameter");
            goto done;
        }

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid pin number");
            goto done;
        }
        uint8_t pin = (uint8_t)pin_obj->valuedouble;
        bool enable = cJSON_IsTrue(enable_obj);

        if (enable) {
            cmd.type = CMD_GPIO_CONFIGURE_INPUT;
            cmd.payload.gpio.pin = pin;

            // Parse pull configuration
            cmd.payload.gpio.pull = WORKER_PULL_UP;  // Default
            cJSON *pull_obj = cJSON_GetObjectItem(payload, "pull");
            if (cJSON_IsString(pull_obj)) {
                if (strcmp(pull_obj->valuestring, "down") == 0) {
                    cmd.payload.gpio.pull = WORKER_PULL_DOWN;
                } else if (strcmp(pull_obj->valuestring, "none") == 0) {
                    cmd.payload.gpio.pull = WORKER_PULL_NONE;
                }
            }
            queue_command(&cmd);
        } else {
            // Disable monitoring: queue a command so the worker stops polling
            // this pin and the server gets a monitoring_disabled ack.
            cmd.type = CMD_GPIO_DISABLE_MONITORING;
            cmd.payload.gpio.pin = pin;
            queue_command(&cmd);
        }
    }
    // === I2C CONFIGURE ===
    else if (strcmp(type, "i2c_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *sda_obj = cJSON_GetObjectItem(payload, "sda_pin");
        cJSON *scl_obj = cJSON_GetObjectItem(payload, "scl_pin");
        cJSON *freq_obj = cJSON_GetObjectItem(payload, "frequency");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsNumber(sda_obj) || !cJSON_IsNumber(scl_obj)) {
            reject_command(msg_id, "Missing bus, sda_pin, or scl_pin parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        if (sda_obj->valuedouble < 0 || sda_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid sda_pin number");
            goto done;
        }
        if (scl_obj->valuedouble < 0 || scl_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid scl_pin number");
            goto done;
        }
        if (cJSON_IsNumber(freq_obj) && (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX)) {
            reject_command(msg_id, "Invalid frequency");
            goto done;
        }
        cmd.type = CMD_I2C_CONFIGURE;
        cmd.payload.i2c_configure.bus = (uint8_t)bus_obj->valuedouble;
        cmd.payload.i2c_configure.sda_pin = (uint8_t)sda_obj->valuedouble;
        cmd.payload.i2c_configure.scl_pin = (uint8_t)scl_obj->valuedouble;
        cmd.payload.i2c_configure.frequency = cJSON_IsNumber(freq_obj)
            ? (uint32_t)freq_obj->valuedouble
            : 100000;
        queue_command(&cmd);
    }
    // === I2C SCAN ===
    else if (strcmp(type, "i2c_scan") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        if (!cJSON_IsNumber(bus_obj)) {
            reject_command(msg_id, "Missing bus parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_I2C_SCAN;
        cmd.payload.i2c_scan.bus = (uint8_t)bus_obj->valuedouble;
        queue_command(&cmd);
    }
    // === I2C WRITE ===
    else if (strcmp(type, "i2c_write") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *addr_obj = cJSON_GetObjectItem(payload, "address");
        cJSON *data_obj = cJSON_GetObjectItem(payload, "data");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsArray(data_obj)) {
            reject_command(msg_id, "Missing bus, address, or data parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_I2C_WRITE;
        cmd.payload.i2c_write.bus = (uint8_t)bus_obj->valuedouble;
        uint8_t address;
        if (!parse_hex_byte(addr_obj->valuestring, &address)) {
            reject_command(msg_id, "Invalid I2C address");
            goto done;
        }
        cmd.payload.i2c_write.address = address;

        // Parse data as an array of hex-string bytes (e.g. ["0xAE", "0x01"]),
        // matching the SDK contract and the i2c_batch_write handler below.
        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_I2C_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                uint8_t byte;
                if (!parse_hex_byte(byte_obj->valuestring, &byte)) {
                    reject_command(msg_id, "Invalid hex byte in data");
                    goto done;
                }
                cmd.payload.i2c_write.data[data_len++] = byte;
            }
        }
        if (data_len == 0) {
            reject_command(msg_id, "i2c_write: no data");
            goto done;
        }
        cmd.payload.i2c_write.data_len = data_len;
        queue_command(&cmd);
    }
    // === I2C READ ===
    else if (strcmp(type, "i2c_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *addr_obj = cJSON_GetObjectItem(payload, "address");
        // SDK contract (core I2cReadCommand) sends "bytes_to_read"; the optional
        // "register_to_read" is a hex-string byte (e.g. "0xD0"), matching the Pico
        // firmware. The old "length"/"register" names never matched any sender.
        cJSON *len_obj = cJSON_GetObjectItem(payload, "bytes_to_read");
        cJSON *reg_obj = cJSON_GetObjectItem(payload, "register_to_read");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsNumber(len_obj)) {
            reject_command(msg_id, "Missing bus, address, or bytes_to_read parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_I2C_DATA_LEN) {
            reject_command(msg_id, "I2C read length too large");
            goto done;
        }
        cmd.type = CMD_I2C_READ;
        cmd.payload.i2c_read.bus = (uint8_t)bus_obj->valuedouble;
        uint8_t address;
        if (!parse_hex_byte(addr_obj->valuestring, &address)) {
            reject_command(msg_id, "Invalid I2C address");
            goto done;
        }
        cmd.payload.i2c_read.address = address;
        cmd.payload.i2c_read.length = (size_t)len_obj->valuedouble;
        if (cJSON_IsString(reg_obj)) {
            uint8_t reg;
            if (!parse_hex_byte(reg_obj->valuestring, &reg)) {
                reject_command(msg_id, "Invalid register_to_read");
                goto done;
            }
            cmd.payload.i2c_read.reg = (int)reg;
        } else {
            cmd.payload.i2c_read.reg = -1;
        }
        queue_command(&cmd);
    }
    // === ONEWIRE SEARCH ===
    else if (strcmp(type, "onewire_search") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        int pin = parse_sensor_pin(cJSON_GetObjectItem(payload, "pin"));
        if (pin < 0) {
            LOG_E(TAG, "Invalid pin number");
            send_command_error(msg_id, "Invalid pin number");
            goto done;
        }
        cmd.type = CMD_ONEWIRE_SEARCH;
        cmd.payload.onewire_search.pin = (uint8_t)pin;
        queue_command(&cmd);
    }
    // === ONEWIRE READ TEMP ===
    else if (strcmp(type, "onewire_read_temp") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        int pin = parse_sensor_pin(cJSON_GetObjectItem(payload, "pin"));
        if (pin < 0) {
            LOG_E(TAG, "Invalid pin number");
            send_command_error(msg_id, "Invalid pin number");
            goto done;
        }

        cmd.type = CMD_ONEWIRE_READ_TEMP;
        cmd.payload.onewire_read_temp.pin = (uint8_t)pin;
        cmd.payload.onewire_read_temp.has_rom = false;
        memset(cmd.payload.onewire_read_temp.rom, 0, ONEWIRE_ROM_LEN);

        // `rom` is optional: absent means Skip ROM. Present but malformed
        // (including JSON null) is rejected rather than silently falling back,
        // which would read the wrong sensor on a multi-drop bus.
        cJSON *rom_obj = cJSON_GetObjectItem(payload, "rom");
        if (rom_obj != NULL) {
            if (!cJSON_IsString(rom_obj) ||
                !parse_rom_hex(rom_obj->valuestring, cmd.payload.onewire_read_temp.rom)) {
                LOG_E(TAG, "Invalid rom (expected 16 uppercase hex characters)");
                send_command_error(msg_id, "Invalid rom (expected 16 uppercase hex characters)");
                goto done;
            }
            cmd.payload.onewire_read_temp.has_rom = true;
        }
        queue_command(&cmd);
    }
    // === DHT READ ===
    else if (strcmp(type, "dht_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        int pin = parse_sensor_pin(cJSON_GetObjectItem(payload, "pin"));
        cJSON *model_obj = cJSON_GetObjectItem(payload, "model");
        if (pin < 0 || !cJSON_IsString(model_obj)) {
            LOG_E(TAG, "Invalid pin number or model");
            send_command_error(msg_id, "Invalid pin number or model");
            goto done;
        }

        uint8_t model;
        if (strcmp(model_obj->valuestring, "dht11") == 0) {
            model = DHT_MODEL_DHT11;
        } else if (strcmp(model_obj->valuestring, "dht22") == 0) {
            model = DHT_MODEL_DHT22;
        } else {
            LOG_E(TAG, "Invalid model (expected \"dht11\" or \"dht22\")");
            send_command_error(msg_id, "Invalid model (expected \"dht11\" or \"dht22\")");
            goto done;
        }

        cmd.type = CMD_DHT_READ;
        cmd.payload.dht_read.pin = (uint8_t)pin;
        cmd.payload.dht_read.model = model;
        queue_command(&cmd);
    }
    // === GET TEMPERATURE ===
    else if (strcmp(type, "get_temperature") == 0) {
        cmd.type = CMD_GET_TEMPERATURE;
        queue_command(&cmd);
    }
    // === I2C BATCH WRITE (inline — variable-length writes can't fit in fixed command) ===
    else if (strcmp(type, "i2c_batch_write") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *addr_obj = cJSON_GetObjectItem(payload, "address");
        cJSON *writes_obj = cJSON_GetObjectItem(payload, "writes");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsArray(writes_obj)) {
            reject_command(msg_id, "Missing required parameters: bus, address, writes");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        uint8_t bus = (uint8_t)bus_obj->valuedouble;

        if (bus > 1) {
            reject_command(msg_id, "Invalid bus number (must be 0 or 1)");
            goto done;
        }

        uint8_t address;
        if (!parse_hex_byte(addr_obj->valuestring, &address)) {
            reject_command(msg_id, "Invalid I2C address");
            goto done;
        }

        // Validate address range, matching the Pico firmware
        if (address < 0x08 || address > 0x77) {
            reject_command(msg_id, "Invalid I2C address (must be 0x08-0x77)");
            goto done;
        }

        int writes_count = cJSON_GetArraySize(writes_obj);

        if (writes_count == 0) {
            reject_command(msg_id, "i2c_batch_write: empty writes array");
            goto done;
        }

        // Execute each write operation
        for (int i = 0; i < writes_count; i++) {
            cJSON *write_op = cJSON_GetArrayItem(writes_obj, i);
            if (!cJSON_IsArray(write_op)) {
                char err_msg[64];
                snprintf(err_msg, sizeof(err_msg), "Write %d is not an array", i);
                reject_command(msg_id, err_msg);
                goto done;
            }

            int data_count = cJSON_GetArraySize(write_op);
            uint8_t data[128];
            size_t data_len = 0;

            for (int j = 0; j < data_count && data_len < sizeof(data); j++) {
                cJSON *byte_obj = cJSON_GetArrayItem(write_op, j);
                if (cJSON_IsString(byte_obj)) {
                    uint8_t byte;
                    if (!parse_hex_byte(byte_obj->valuestring, &byte)) {
                        reject_command(msg_id, "Invalid hex byte in write data");
                        goto done;
                    }
                    data[data_len++] = byte;
                }
            }

            if (data_len == 0) {
                char err_msg[64];
                snprintf(err_msg, sizeof(err_msg), "Write %d has no data", i);
                reject_command(msg_id, err_msg);
                goto done;
            }

            // Use the command queue for each individual write
            worker_command_t write_cmd;
            memset(&write_cmd, 0, sizeof(write_cmd));
            strncpy(write_cmd.message_id, msg_id, MAX_MESSAGE_ID_LEN - 1);
            write_cmd.message_id[MAX_MESSAGE_ID_LEN - 1] = '\0';
            write_cmd.type = CMD_I2C_WRITE;
            write_cmd.payload.i2c_write.bus = bus;
            write_cmd.payload.i2c_write.address = address;
            memcpy(write_cmd.payload.i2c_write.data, data, data_len);
            write_cmd.payload.i2c_write.data_len = data_len;

            if (!queue_command(&write_cmd)) {
                char err_msg[64];
                snprintf(err_msg, sizeof(err_msg), "i2c_batch_write: failed to queue write %d", i);
                reject_command(msg_id, err_msg);
                goto done;
            }
        }
    }
    // === WATCHDOG CONFIGURE ===
    else if (strcmp(type, "watchdog_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *timeout_obj = cJSON_GetObjectItem(payload, "timeout_ms");
        cJSON *enable_obj = cJSON_GetObjectItem(payload, "enable");

        if (!cJSON_IsNumber(timeout_obj) || !cJSON_IsBool(enable_obj)) {
            reject_command(msg_id, "Missing timeout_ms or enable parameter");
            goto done;
        }

        if (timeout_obj->valuedouble < 0 || timeout_obj->valuedouble > UINT32_MAX) {
            reject_command(msg_id, "Invalid timeout_ms");
            goto done;
        }
        cmd.type = CMD_WATCHDOG_CONFIGURE;
        cmd.payload.watchdog_configure.timeout_ms = (uint32_t)timeout_obj->valuedouble;
        cmd.payload.watchdog_configure.enable = cJSON_IsTrue(enable_obj);
        queue_command(&cmd);
    }
    // === WATCHDOG FEED ===
    else if (strcmp(type, "watchdog_feed") == 0) {
        cmd.type = CMD_WATCHDOG_FEED;
        queue_command(&cmd);
    }
    // === SPI CONFIGURE ===
    else if (strcmp(type, "spi_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *clk_obj = cJSON_GetObjectItem(payload, "clk_pin");
        cJSON *mosi_obj = cJSON_GetObjectItem(payload, "mosi_pin");
        cJSON *miso_obj = cJSON_GetObjectItem(payload, "miso_pin");
        cJSON *cs_obj = cJSON_GetObjectItem(payload, "cs_pin");
        cJSON *freq_obj = cJSON_GetObjectItem(payload, "frequency");
        cJSON *mode_obj = cJSON_GetObjectItem(payload, "mode");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsNumber(clk_obj) ||
            !cJSON_IsNumber(mosi_obj) || !cJSON_IsNumber(miso_obj) ||
            !cJSON_IsNumber(cs_obj)) {
            reject_command(msg_id, "Missing bus, clk_pin, mosi_pin, miso_pin, or cs_pin parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        if (clk_obj->valuedouble < 0 || clk_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid clk_pin number");
            goto done;
        }
        if (mosi_obj->valuedouble < 0 || mosi_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid mosi_pin number");
            goto done;
        }
        if (miso_obj->valuedouble < 0 || miso_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid miso_pin number");
            goto done;
        }
        if (cs_obj->valuedouble < 0 || cs_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid cs_pin number");
            goto done;
        }
        if (cJSON_IsNumber(freq_obj) && (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX)) {
            reject_command(msg_id, "Invalid frequency");
            goto done;
        }
        if (cJSON_IsNumber(mode_obj) && (mode_obj->valuedouble < 0 || mode_obj->valuedouble > 255)) {
            reject_command(msg_id, "Invalid mode");
            goto done;
        }
        cmd.type = CMD_SPI_CONFIGURE;
        cmd.payload.spi_configure.bus = (uint8_t)bus_obj->valuedouble;
        cmd.payload.spi_configure.clk_pin = (uint8_t)clk_obj->valuedouble;
        cmd.payload.spi_configure.mosi_pin = (uint8_t)mosi_obj->valuedouble;
        cmd.payload.spi_configure.miso_pin = (uint8_t)miso_obj->valuedouble;
        cmd.payload.spi_configure.cs_pin = (uint8_t)cs_obj->valuedouble;
        cmd.payload.spi_configure.frequency = cJSON_IsNumber(freq_obj) ? (uint32_t)freq_obj->valuedouble : 1000000;
        cmd.payload.spi_configure.mode = cJSON_IsNumber(mode_obj) ? (uint8_t)mode_obj->valuedouble : 0;
        queue_command(&cmd);
    }
    // === SPI TRANSFER ===
    else if (strcmp(type, "spi_transfer") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *data_obj = cJSON_GetObjectItem(payload, "data");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsArray(data_obj)) {
            reject_command(msg_id, "Missing bus or data parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_SPI_TRANSFER;
        cmd.payload.spi_data.bus = (uint8_t)bus_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_SPI_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                uint8_t byte;
                if (!parse_hex_byte(byte_obj->valuestring, &byte)) {
                    reject_command(msg_id, "Invalid hex byte in data");
                    goto done;
                }
                cmd.payload.spi_data.data[data_len++] = byte;
            }
        }
        cmd.payload.spi_data.data_len = data_len;
        queue_command(&cmd);
    }
    // === SPI WRITE ===
    else if (strcmp(type, "spi_write") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *data_obj = cJSON_GetObjectItem(payload, "data");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsArray(data_obj)) {
            reject_command(msg_id, "Missing bus or data parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_SPI_WRITE;
        cmd.payload.spi_data.bus = (uint8_t)bus_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_SPI_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                uint8_t byte;
                if (!parse_hex_byte(byte_obj->valuestring, &byte)) {
                    reject_command(msg_id, "Invalid hex byte in data");
                    goto done;
                }
                cmd.payload.spi_data.data[data_len++] = byte;
            }
        }
        cmd.payload.spi_data.data_len = data_len;
        queue_command(&cmd);
    }
    // === SPI READ ===
    else if (strcmp(type, "spi_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        // SDK contract (core SpiReadCommand) sends "bytes_to_read", not "length".
        cJSON *len_obj = cJSON_GetObjectItem(payload, "bytes_to_read");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsNumber(len_obj)) {
            reject_command(msg_id, "Missing bus or bytes_to_read parameter");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        // The worker caps read results at MAX_SPI_RESPONSE_DATA, so reject
        // larger requests here rather than queuing a doomed command.
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_SPI_RESPONSE_DATA) {
            reject_command(msg_id, "SPI read length too large");
            goto done;
        }
        cmd.type = CMD_SPI_READ;
        cmd.payload.spi_read.bus = (uint8_t)bus_obj->valuedouble;
        cmd.payload.spi_read.length = (size_t)len_obj->valuedouble;
        queue_command(&cmd);
    }
    // === UART CONFIGURE ===
    else if (strcmp(type, "uart_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *port_obj = cJSON_GetObjectItem(payload, "port");
        cJSON *tx_obj = cJSON_GetObjectItem(payload, "tx_pin");
        cJSON *rx_obj = cJSON_GetObjectItem(payload, "rx_pin");
        cJSON *baud_obj = cJSON_GetObjectItem(payload, "baud_rate");
        cJSON *data_bits_obj = cJSON_GetObjectItem(payload, "data_bits");
        cJSON *stop_bits_obj = cJSON_GetObjectItem(payload, "stop_bits");
        cJSON *parity_obj = cJSON_GetObjectItem(payload, "parity");

        if (!cJSON_IsNumber(port_obj) || !cJSON_IsNumber(tx_obj) ||
            !cJSON_IsNumber(rx_obj) || !cJSON_IsNumber(baud_obj)) {
            reject_command(msg_id, "Missing port, tx_pin, rx_pin, or baud_rate parameter");
            goto done;
        }

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid port number");
            goto done;
        }
        if (tx_obj->valuedouble < 0 || tx_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid tx_pin number");
            goto done;
        }
        if (rx_obj->valuedouble < 0 || rx_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid rx_pin number");
            goto done;
        }
        if (baud_obj->valuedouble < 0 || baud_obj->valuedouble > UINT32_MAX) {
            reject_command(msg_id, "Invalid baud_rate");
            goto done;
        }
        if (cJSON_IsNumber(data_bits_obj) && (data_bits_obj->valuedouble < 0 || data_bits_obj->valuedouble > 255)) {
            reject_command(msg_id, "Invalid data_bits");
            goto done;
        }
        if (cJSON_IsNumber(stop_bits_obj) && (stop_bits_obj->valuedouble < 0 || stop_bits_obj->valuedouble > 255)) {
            reject_command(msg_id, "Invalid stop_bits");
            goto done;
        }
        if (cJSON_IsNumber(parity_obj) && (parity_obj->valuedouble < 0 || parity_obj->valuedouble > 255)) {
            reject_command(msg_id, "Invalid parity");
            goto done;
        }
        cmd.type = CMD_UART_CONFIGURE;
        cmd.payload.uart_configure.port = (uint8_t)port_obj->valuedouble;
        cmd.payload.uart_configure.tx_pin = (uint8_t)tx_obj->valuedouble;
        cmd.payload.uart_configure.rx_pin = (uint8_t)rx_obj->valuedouble;
        cmd.payload.uart_configure.baud_rate = (uint32_t)baud_obj->valuedouble;
        cmd.payload.uart_configure.data_bits = cJSON_IsNumber(data_bits_obj) ? (uint8_t)data_bits_obj->valuedouble : 8;
        cmd.payload.uart_configure.stop_bits = cJSON_IsNumber(stop_bits_obj) ? (uint8_t)stop_bits_obj->valuedouble : 1;
        cmd.payload.uart_configure.parity = cJSON_IsNumber(parity_obj) ? (uint8_t)parity_obj->valuedouble : 0;
        queue_command(&cmd);
    }
    // === UART WRITE ===
    else if (strcmp(type, "uart_write") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *port_obj = cJSON_GetObjectItem(payload, "port");
        cJSON *data_obj = cJSON_GetObjectItem(payload, "data");

        if (!cJSON_IsNumber(port_obj) || !cJSON_IsArray(data_obj)) {
            reject_command(msg_id, "Missing port or data parameter");
            goto done;
        }

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid port number");
            goto done;
        }
        cmd.type = CMD_UART_WRITE;
        cmd.payload.uart_write.port = (uint8_t)port_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_UART_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                uint8_t byte;
                if (!parse_hex_byte(byte_obj->valuestring, &byte)) {
                    reject_command(msg_id, "Invalid hex byte in data");
                    goto done;
                }
                cmd.payload.uart_write.data[data_len++] = byte;
            }
        }
        cmd.payload.uart_write.data_len = data_len;
        queue_command(&cmd);
    }
    // === UART READ ===
    else if (strcmp(type, "uart_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *port_obj = cJSON_GetObjectItem(payload, "port");
        // SDK contract (core UartReadCommand) sends "bytes_to_read", not "length".
        cJSON *len_obj = cJSON_GetObjectItem(payload, "bytes_to_read");
        cJSON *timeout_obj = cJSON_GetObjectItem(payload, "timeout_ms");

        if (!cJSON_IsNumber(port_obj) || !cJSON_IsNumber(len_obj)) {
            reject_command(msg_id, "Missing port or bytes_to_read parameter");
            goto done;
        }

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid port number");
            goto done;
        }
        // The worker caps read results at MAX_UART_RESPONSE_DATA, so reject
        // larger requests here rather than queuing a doomed command.
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_UART_RESPONSE_DATA) {
            reject_command(msg_id, "UART read length too large");
            goto done;
        }
        if (cJSON_IsNumber(timeout_obj) && (timeout_obj->valuedouble < 0 || timeout_obj->valuedouble > UINT32_MAX)) {
            reject_command(msg_id, "Invalid timeout_ms");
            goto done;
        }
        cmd.type = CMD_UART_READ;
        cmd.payload.uart_read.port = (uint8_t)port_obj->valuedouble;
        cmd.payload.uart_read.bytes_to_read = (size_t)len_obj->valuedouble;
        cmd.payload.uart_read.timeout_ms = cJSON_IsNumber(timeout_obj) ? (uint32_t)timeout_obj->valuedouble : 1000;
        queue_command(&cmd);
    }
    // === DISPLAY UPDATE ===
    else if (strcmp(type, "display_update") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *addr_obj = cJSON_GetObjectItem(payload, "address");
        cJSON *controller_obj = cJSON_GetObjectItem(payload, "controller");
        cJSON *width_obj = cJSON_GetObjectItem(payload, "width");
        cJSON *height_obj = cJSON_GetObjectItem(payload, "height");
        cJSON *segments_obj = cJSON_GetObjectItem(payload, "segments");
        cJSON *init_obj = cJSON_GetObjectItem(payload, "init");
        cJSON *col_off_obj = cJSON_GetObjectItem(payload, "columnOffset");
        cJSON *page_off_obj = cJSON_GetObjectItem(payload, "pageOffset");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) ||
            !cJSON_IsString(controller_obj) || !cJSON_IsNumber(width_obj) ||
            !cJSON_IsNumber(height_obj) || !cJSON_IsArray(segments_obj)) {
            reject_command(msg_id, "Missing required parameters for display_update");
            goto done;
        }

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            reject_command(msg_id, "Invalid bus number");
            goto done;
        }
        if (width_obj->valuedouble <= 0 || width_obj->valuedouble > 128) {
            reject_command(msg_id, "Invalid width (must be 1-128)");
            goto done;
        }
        if (height_obj->valuedouble <= 0 || height_obj->valuedouble > 64 ||
            ((uint32_t)height_obj->valuedouble % 8) != 0) {
            reject_command(msg_id, "Invalid height (must be 1-64 and a multiple of 8)");
            goto done;
        }
        if (cJSON_IsNumber(col_off_obj) &&
            (col_off_obj->valuedouble < 0 || col_off_obj->valuedouble > 127)) {
            reject_command(msg_id, "Invalid columnOffset (must be 0-127)");
            goto done;
        }
        if (cJSON_IsNumber(page_off_obj) &&
            (page_off_obj->valuedouble < 0 || page_off_obj->valuedouble > 7)) {
            reject_command(msg_id, "Invalid pageOffset (must be 0-7)");
            goto done;
        }
        uint8_t bus = (uint8_t)bus_obj->valuedouble;
        uint8_t address;
        if (!parse_hex_byte(addr_obj->valuestring, &address)) {
            reject_command(msg_id, "Invalid display address");
            goto done;
        }
        const char *controller = controller_obj->valuestring;
        uint8_t width = (uint8_t)width_obj->valuedouble;
        uint8_t height = (uint8_t)height_obj->valuedouble;
        uint8_t col_offset = cJSON_IsNumber(col_off_obj) ? (uint8_t)col_off_obj->valuedouble : 0;
        uint8_t page_offset = cJSON_IsNumber(page_off_obj) ? (uint8_t)page_off_obj->valuedouble : 0;

        if ((uint32_t)col_offset + width > 128) {
            reject_command(msg_id, "columnOffset + width exceeds 128");
            goto done;
        }
        if ((uint32_t)page_offset + (height / 8) > 8) {
            reject_command(msg_id, "pageOffset + height/8 exceeds 8");
            goto done;
        }

        bool is_ssd1306 = (strcmp(controller, "ssd1306") == 0);
        bool is_sh1106 = (strcmp(controller, "sh1106") == 0);
        if (!is_ssd1306 && !is_sh1106) {
            reject_command(msg_id, "Invalid controller type");
            goto done;
        }

        size_t fb_size = (size_t)width * height / 8;
        if (fb_size > MAX_DISPLAY_BUFFER_SIZE) {
            reject_command(msg_id, "Framebuffer too large");
            goto done;
        }

        uint8_t fb_data[MAX_DISPLAY_BUFFER_SIZE];
        memset(fb_data, 0, sizeof(fb_data));
        display_segment_t seg_info[MAX_DISPLAY_SEGMENTS];
        size_t seg_count = 0;

        // Decode segments
        int seg_array_size = cJSON_GetArraySize(segments_obj);
        for (int i = 0; i < seg_array_size && seg_count < MAX_DISPLAY_SEGMENTS; i++) {
            cJSON *seg = cJSON_GetArrayItem(segments_obj, i);
            if (!cJSON_IsObject(seg)) continue;

            cJSON *offset_obj = cJSON_GetObjectItem(seg, "offset");
            cJSON *data_obj = cJSON_GetObjectItem(seg, "data");
            if (!cJSON_IsNumber(offset_obj) || !cJSON_IsString(data_obj)) continue;

            // Reject out-of-range offsets before casting: (size_t) of a huge
            // double is UB and can wrap small, passing a sum-based bounds check.
            if (offset_obj->valuedouble < 0 || offset_obj->valuedouble > (double)fb_size) continue;

            size_t offset = (size_t)offset_obj->valuedouble;
            size_t decoded_len = 0;
            uint8_t *decoded = base64_decode(data_obj->valuestring, &decoded_len);
            if (!decoded) continue;

            if (decoded_len <= fb_size - offset) {
                memcpy(&fb_data[offset], decoded, decoded_len);
                seg_info[seg_count].offset = offset;
                seg_info[seg_count].length = decoded_len;
                seg_count++;
            }
            free(decoded);
        }

        // Write to shared buffer
        if (!shared_display_buffer_write(fb_data, fb_size, seg_info, seg_count)) {
            goto done;
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
        cmd.payload.display.init = cJSON_IsTrue(init_obj);
        queue_command(&cmd);
    }
    else {
        LOG_W(TAG, "Unknown command type: %s", type);
        reject_command(msg_id, "Unknown command type");
    }

done:
    cJSON_Delete(json);
    return true;
}
