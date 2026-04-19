#include "websocket_handler.h"
#include "command_queue.h"
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
static const char *TAG = "WSHandler";
#define LOG_I(tag, fmt, ...) ESP_LOGI(tag, fmt, ##__VA_ARGS__)
#define LOG_E(tag, fmt, ...) ESP_LOGE(tag, fmt, ##__VA_ARGS__)
#define LOG_W(tag, fmt, ...) ESP_LOGW(tag, fmt, ##__VA_ARGS__)
#else
#include <stdio.h>
static const char *TAG = "WSHandler";
#define LOG_I(tag, fmt, ...) (void)tag
#define LOG_E(tag, fmt, ...) (void)tag
#define LOG_W(tag, fmt, ...) (void)tag
#endif

static void *s_cmd_queue = NULL;
static uint32_t s_sequence_counter = 0;

void websocket_handler_init(void *cmd_queue_handle) {
    s_cmd_queue = cmd_queue_handle;
    s_sequence_counter = 0;
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

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsString(state_obj)) goto done;

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid pin number");
            goto done;
        }
        cmd.type = CMD_GPIO_SET;
        cmd.payload.gpio.pin = (uint8_t)pin_obj->valuedouble;

        if (strcmp(state_obj->valuestring, "high") == 0) {
            cmd.payload.gpio.state = WORKER_GPIO_HIGH;
        } else {
            cmd.payload.gpio.state = WORKER_GPIO_LOW;
        }
        queue_command(&cmd);
    }
    // === GET PIN STATE ===
    else if (strcmp(type, "get_pin_state") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *mode_obj = cJSON_GetObjectItem(payload, "mode");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsString(mode_obj)) goto done;

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid pin number");
            goto done;
        }
        cmd.payload.gpio.pin = (uint8_t)pin_obj->valuedouble;

        if (strcmp(mode_obj->valuestring, "digital") == 0) {
            cmd.type = CMD_GPIO_GET_DIGITAL;
        } else if (strcmp(mode_obj->valuestring, "analog") == 0) {
            cmd.type = CMD_GPIO_GET_ANALOG;
        } else {
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

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsNumber(freq_obj) || !cJSON_IsNumber(duty_obj)) goto done;

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid pin number");
            goto done;
        }
        if (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX) {
            LOG_E(TAG, "Invalid frequency");
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

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsBool(enable_obj)) goto done;

        if (pin_obj->valuedouble < 0 || pin_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid pin number");
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
        }
        // Disable monitoring: no command needed, just don't start monitoring
    }
    // === I2C CONFIGURE ===
    else if (strcmp(type, "i2c_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *sda_obj = cJSON_GetObjectItem(payload, "sda_pin");
        cJSON *scl_obj = cJSON_GetObjectItem(payload, "scl_pin");
        cJSON *freq_obj = cJSON_GetObjectItem(payload, "frequency");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsNumber(sda_obj) || !cJSON_IsNumber(scl_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        if (sda_obj->valuedouble < 0 || sda_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid sda_pin number");
            goto done;
        }
        if (scl_obj->valuedouble < 0 || scl_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid scl_pin number");
            goto done;
        }
        if (cJSON_IsNumber(freq_obj) && (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX)) {
            LOG_E(TAG, "Invalid frequency");
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
        if (!cJSON_IsNumber(bus_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
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

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsString(data_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_I2C_WRITE;
        cmd.payload.i2c_write.bus = (uint8_t)bus_obj->valuedouble;
        cmd.payload.i2c_write.address = (uint8_t)strtol(addr_obj->valuestring, NULL, 16);

        // Decode base64 data
        size_t decoded_len = 0;
        uint8_t *decoded = base64_decode(data_obj->valuestring, &decoded_len);
        if (!decoded || decoded_len > MAX_I2C_DATA_LEN) {
            free(decoded);
            goto done;
        }
        memcpy(cmd.payload.i2c_write.data, decoded, decoded_len);
        cmd.payload.i2c_write.data_len = decoded_len;
        free(decoded);
        queue_command(&cmd);
    }
    // === I2C READ ===
    else if (strcmp(type, "i2c_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *addr_obj = cJSON_GetObjectItem(payload, "address");
        cJSON *len_obj = cJSON_GetObjectItem(payload, "length");
        cJSON *reg_obj = cJSON_GetObjectItem(payload, "register");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsNumber(len_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_I2C_DATA_LEN) {
            LOG_E(TAG, "I2C read length too large");
            goto done;
        }
        cmd.type = CMD_I2C_READ;
        cmd.payload.i2c_read.bus = (uint8_t)bus_obj->valuedouble;
        cmd.payload.i2c_read.address = (uint8_t)strtol(addr_obj->valuestring, NULL, 16);
        cmd.payload.i2c_read.length = (size_t)len_obj->valuedouble;
        cmd.payload.i2c_read.reg = cJSON_IsNumber(reg_obj) ? (int)reg_obj->valuedouble : -1;
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

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsString(addr_obj) || !cJSON_IsArray(writes_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        uint8_t bus = (uint8_t)bus_obj->valuedouble;
        uint8_t address = (uint8_t)strtol(addr_obj->valuestring, NULL, 16);
        int writes_count = cJSON_GetArraySize(writes_obj);

        if (bus > 1) {
            LOG_E(TAG, "i2c_batch_write: invalid bus %d", bus);
            goto done;
        }
        if (writes_count == 0) {
            LOG_E(TAG, "i2c_batch_write: empty writes array");
            goto done;
        }

        // Execute each write operation
        for (int i = 0; i < writes_count; i++) {
            cJSON *write_op = cJSON_GetArrayItem(writes_obj, i);
            if (!cJSON_IsArray(write_op)) {
                // cJSON_Delete cascade-frees err_payload; err_str free()'d before goto done.
                cJSON *err_resp = cJSON_CreateObject();
                cJSON *err_payload = cJSON_CreateObject();
                cJSON_AddStringToObject(err_resp, "type", "command_error");
                char err_msg[64];
                snprintf(err_msg, sizeof(err_msg), "Write %d is not an array", i);
                cJSON_AddStringToObject(err_payload, "error", err_msg);
                cJSON_AddItemToObject(err_resp, "payload", err_payload);
                if (msg_id[0] != '\0') {
                    cJSON_AddStringToObject(err_resp, "id", msg_id);
                }
                // Store JSON for sending after cleanup
                char *err_str = cJSON_PrintUnformatted(err_resp);
                cJSON_Delete(err_resp);
                if (err_str) {
#ifndef UNIT_TEST
                    // Send via websocket — we need access to ws_send, but websocket_handler
                    // doesn't have direct access. Use the response queue mechanism instead.
                    // For inline commands, we log the error. The caller can check logs.
                    LOG_E(TAG, "i2c_batch_write error: %s", err_str);
#endif
                    free(err_str);
                }
                goto done;
            }

            int data_count = cJSON_GetArraySize(write_op);
            uint8_t data[128];
            size_t data_len = 0;

            for (int j = 0; j < data_count && data_len < sizeof(data); j++) {
                cJSON *byte_obj = cJSON_GetArrayItem(write_op, j);
                if (cJSON_IsString(byte_obj)) {
                    data[data_len++] = (uint8_t)strtol(byte_obj->valuestring, NULL, 16);
                }
            }

            if (data_len == 0) {
                LOG_E(TAG, "i2c_batch_write: write %d has no data", i);
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
                LOG_E(TAG, "i2c_batch_write: failed to queue write %d", i);
                goto done;
            }
        }
    }
    // === WATCHDOG CONFIGURE ===
    else if (strcmp(type, "watchdog_configure") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *timeout_obj = cJSON_GetObjectItem(payload, "timeout_ms");
        cJSON *enable_obj = cJSON_GetObjectItem(payload, "enable");

        if (!cJSON_IsNumber(timeout_obj) || !cJSON_IsBool(enable_obj)) goto done;

        if (timeout_obj->valuedouble < 0 || timeout_obj->valuedouble > UINT32_MAX) {
            LOG_E(TAG, "Invalid timeout_ms");
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
            !cJSON_IsNumber(cs_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        if (clk_obj->valuedouble < 0 || clk_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid clk_pin number");
            goto done;
        }
        if (mosi_obj->valuedouble < 0 || mosi_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid mosi_pin number");
            goto done;
        }
        if (miso_obj->valuedouble < 0 || miso_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid miso_pin number");
            goto done;
        }
        if (cs_obj->valuedouble < 0 || cs_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid cs_pin number");
            goto done;
        }
        if (cJSON_IsNumber(freq_obj) && (freq_obj->valuedouble < 0 || freq_obj->valuedouble > UINT32_MAX)) {
            LOG_E(TAG, "Invalid frequency");
            goto done;
        }
        if (cJSON_IsNumber(mode_obj) && (mode_obj->valuedouble < 0 || mode_obj->valuedouble > 255)) {
            LOG_E(TAG, "Invalid mode");
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

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsArray(data_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_SPI_TRANSFER;
        cmd.payload.spi_data.bus = (uint8_t)bus_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_SPI_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                cmd.payload.spi_data.data[data_len++] = (uint8_t)strtol(byte_obj->valuestring, NULL, 16);
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

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsArray(data_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        cmd.type = CMD_SPI_WRITE;
        cmd.payload.spi_data.bus = (uint8_t)bus_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_SPI_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                cmd.payload.spi_data.data[data_len++] = (uint8_t)strtol(byte_obj->valuestring, NULL, 16);
            }
        }
        cmd.payload.spi_data.data_len = data_len;
        queue_command(&cmd);
    }
    // === SPI READ ===
    else if (strcmp(type, "spi_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *bus_obj = cJSON_GetObjectItem(payload, "bus");
        cJSON *len_obj = cJSON_GetObjectItem(payload, "length");

        if (!cJSON_IsNumber(bus_obj) || !cJSON_IsNumber(len_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_SPI_DATA_LEN) {
            LOG_E(TAG, "SPI read length too large");
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
            !cJSON_IsNumber(rx_obj) || !cJSON_IsNumber(baud_obj)) goto done;

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid port number");
            goto done;
        }
        if (tx_obj->valuedouble < 0 || tx_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid tx_pin number");
            goto done;
        }
        if (rx_obj->valuedouble < 0 || rx_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid rx_pin number");
            goto done;
        }
        if (baud_obj->valuedouble < 0 || baud_obj->valuedouble > UINT32_MAX) {
            LOG_E(TAG, "Invalid baud_rate");
            goto done;
        }
        if (cJSON_IsNumber(data_bits_obj) && (data_bits_obj->valuedouble < 0 || data_bits_obj->valuedouble > 255)) {
            LOG_E(TAG, "Invalid data_bits");
            goto done;
        }
        if (cJSON_IsNumber(stop_bits_obj) && (stop_bits_obj->valuedouble < 0 || stop_bits_obj->valuedouble > 255)) {
            LOG_E(TAG, "Invalid stop_bits");
            goto done;
        }
        if (cJSON_IsNumber(parity_obj) && (parity_obj->valuedouble < 0 || parity_obj->valuedouble > 255)) {
            LOG_E(TAG, "Invalid parity");
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

        if (!cJSON_IsNumber(port_obj) || !cJSON_IsArray(data_obj)) goto done;

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid port number");
            goto done;
        }
        cmd.type = CMD_UART_WRITE;
        cmd.payload.uart_write.port = (uint8_t)port_obj->valuedouble;

        int data_count = cJSON_GetArraySize(data_obj);
        size_t data_len = 0;
        for (int i = 0; i < data_count && data_len < MAX_UART_DATA_LEN; i++) {
            cJSON *byte_obj = cJSON_GetArrayItem(data_obj, i);
            if (cJSON_IsString(byte_obj)) {
                cmd.payload.uart_write.data[data_len++] = (uint8_t)strtol(byte_obj->valuestring, NULL, 16);
            }
        }
        cmd.payload.uart_write.data_len = data_len;
        queue_command(&cmd);
    }
    // === UART READ ===
    else if (strcmp(type, "uart_read") == 0) {
        if (!cJSON_IsObject(payload)) goto done;
        cJSON *port_obj = cJSON_GetObjectItem(payload, "port");
        cJSON *len_obj = cJSON_GetObjectItem(payload, "length");
        cJSON *timeout_obj = cJSON_GetObjectItem(payload, "timeout_ms");

        if (!cJSON_IsNumber(port_obj) || !cJSON_IsNumber(len_obj)) goto done;

        if (port_obj->valuedouble < 0 || port_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid port number");
            goto done;
        }
        if (len_obj->valuedouble < 0 || len_obj->valuedouble > MAX_UART_DATA_LEN) {
            LOG_E(TAG, "UART read length too large");
            goto done;
        }
        if (cJSON_IsNumber(timeout_obj) && (timeout_obj->valuedouble < 0 || timeout_obj->valuedouble > UINT32_MAX)) {
            LOG_E(TAG, "Invalid timeout_ms");
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
            !cJSON_IsNumber(height_obj) || !cJSON_IsArray(segments_obj)) goto done;

        if (bus_obj->valuedouble < 0 || bus_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid bus number");
            goto done;
        }
        if (width_obj->valuedouble < 0 || width_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid width");
            goto done;
        }
        if (height_obj->valuedouble < 0 || height_obj->valuedouble > 255) {
            LOG_E(TAG, "Invalid height");
            goto done;
        }
        uint8_t bus = (uint8_t)bus_obj->valuedouble;
        uint8_t address = (uint8_t)strtol(addr_obj->valuestring, NULL, 16);
        const char *controller = controller_obj->valuestring;
        uint8_t width = (uint8_t)width_obj->valuedouble;
        uint8_t height = (uint8_t)height_obj->valuedouble;
        uint8_t col_offset = cJSON_IsNumber(col_off_obj) ? (uint8_t)col_off_obj->valuedouble : 0;
        uint8_t page_offset = cJSON_IsNumber(page_off_obj) ? (uint8_t)page_off_obj->valuedouble : 0;

        bool is_ssd1306 = (strcmp(controller, "ssd1306") == 0);
        bool is_sh1106 = (strcmp(controller, "sh1106") == 0);
        if (!is_ssd1306 && !is_sh1106) goto done;

        size_t fb_size = (size_t)width * height / 8;
        if (fb_size > MAX_DISPLAY_BUFFER_SIZE) goto done;

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

            size_t offset = (size_t)offset_obj->valuedouble;
            size_t decoded_len = 0;
            uint8_t *decoded = base64_decode(data_obj->valuestring, &decoded_len);
            if (!decoded) continue;

            if (offset + decoded_len <= fb_size) {
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
    }

done:
    cJSON_Delete(json);
    return true;
}
