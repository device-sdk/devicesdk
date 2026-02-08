#include "worker_task.h"
#include "hal.h"
#include <string.h>
#include <stdio.h>

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include "freertos/task.h"
#include "esp_log.h"
#include "esp_timer.h"
#include "shared_buffers.h"
#include "display.h"

static const char *TAG = "Worker";

// External queues (created in iotkit_main.c)
extern QueueHandle_t cmd_queue;
extern QueueHandle_t response_queue;
extern QueueHandle_t gpio_notification_queue;
#endif

// GPIO monitoring state
#define MAX_MONITORED_PINS 32

typedef struct {
    uint8_t pin;
    bool active;
    bool last_state;
    bool has_initial_reading;
} monitored_pin_t;

static monitored_pin_t s_monitored_pins[MAX_MONITORED_PINS];
static int s_monitored_pin_count = 0;

// Local framebuffer for display operations
static uint8_t s_framebuffer[1024];
static size_t s_framebuffer_size = 0;

// Forward declarations
static void set_error(worker_response_t *resp, const char *msg);
static void handle_gpio_set(const worker_command_t *cmd, worker_response_t *resp);
static void handle_gpio_get_digital(const worker_command_t *cmd, worker_response_t *resp);
static void handle_gpio_get_analog(const worker_command_t *cmd, worker_response_t *resp);
static void handle_gpio_configure_input(const worker_command_t *cmd, worker_response_t *resp);
static void handle_pwm_set(const worker_command_t *cmd, worker_response_t *resp);
static void handle_i2c_configure(const worker_command_t *cmd, worker_response_t *resp);
static void handle_i2c_scan(const worker_command_t *cmd, worker_response_t *resp);
static void handle_i2c_write(const worker_command_t *cmd, worker_response_t *resp);
static void handle_i2c_read(const worker_command_t *cmd, worker_response_t *resp);
static void handle_display_update(const worker_command_t *cmd, worker_response_t *resp);
static void handle_reboot(const worker_command_t *cmd, worker_response_t *resp);

void worker_task_init(void) {
    memset(s_monitored_pins, 0, sizeof(s_monitored_pins));
    s_monitored_pin_count = 0;
    memset(s_framebuffer, 0, sizeof(s_framebuffer));
    s_framebuffer_size = 0;
}

worker_response_t worker_execute_command(const worker_command_t *cmd) {
    worker_response_t resp;
    memset(&resp, 0, sizeof(resp));
    resp.sequence_id = cmd->sequence_id;
    strncpy(resp.message_id, cmd->message_id, MAX_MESSAGE_ID_LEN - 1);
    resp.message_id[MAX_MESSAGE_ID_LEN - 1] = '\0';
    resp.original_cmd = cmd->type;
    resp.status = RESPONSE_SUCCESS;

    switch (cmd->type) {
        case CMD_GPIO_SET:
            handle_gpio_set(cmd, &resp);
            break;
        case CMD_GPIO_GET_DIGITAL:
            handle_gpio_get_digital(cmd, &resp);
            break;
        case CMD_GPIO_GET_ANALOG:
            handle_gpio_get_analog(cmd, &resp);
            break;
        case CMD_GPIO_CONFIGURE_INPUT:
            handle_gpio_configure_input(cmd, &resp);
            break;
        case CMD_PWM_SET:
            handle_pwm_set(cmd, &resp);
            break;
        case CMD_I2C_CONFIGURE:
            handle_i2c_configure(cmd, &resp);
            break;
        case CMD_I2C_SCAN:
            handle_i2c_scan(cmd, &resp);
            break;
        case CMD_I2C_WRITE:
            handle_i2c_write(cmd, &resp);
            break;
        case CMD_I2C_READ:
            handle_i2c_read(cmd, &resp);
            break;
        case CMD_DISPLAY_UPDATE:
            handle_display_update(cmd, &resp);
            break;
        case CMD_REBOOT:
            handle_reboot(cmd, &resp);
            break;
        default:
            set_error(&resp, "Unknown command type");
            break;
    }

    return resp;
}

#ifndef UNIT_TEST
static void poll_gpio_pins(void) {
    for (int i = 0; i < s_monitored_pin_count; i++) {
        if (!s_monitored_pins[i].active) continue;

        uint8_t pin = s_monitored_pins[i].pin;
        bool current_state = iotkit_hal_get_gpio_digital(pin);

        if (!s_monitored_pins[i].has_initial_reading) {
            s_monitored_pins[i].last_state = current_state;
            s_monitored_pins[i].has_initial_reading = true;
            continue;
        }

        if (current_state != s_monitored_pins[i].last_state) {
            gpio_notification_t notification;
            notification.pin = pin;
            notification.state = current_state;
            xQueueSend(gpio_notification_queue, &notification, 0);
            s_monitored_pins[i].last_state = current_state;
        }
    }
}

void worker_task_entry(void *pvParameters) {
    (void)pvParameters;
    ESP_LOGI(TAG, "Worker task started");

    int64_t last_gpio_poll_us = esp_timer_get_time();

    while (1) {
        worker_command_t cmd;

        // Process queued commands (non-blocking)
        if (xQueueReceive(cmd_queue, &cmd, 0) == pdTRUE) {
            worker_response_t response = worker_execute_command(&cmd);
            xQueueSend(response_queue, &response, portMAX_DELAY);
        }

        // Poll GPIO pins every 50ms
        int64_t now_us = esp_timer_get_time();
        if (now_us - last_gpio_poll_us >= 50000) {
            last_gpio_poll_us = now_us;
            poll_gpio_pins();
        }

        // Small sleep to prevent busy-waiting
        vTaskDelay(1);
    }
}
#endif // UNIT_TEST

// === Command handlers ===

static void set_error(worker_response_t *resp, const char *msg) {
    resp->status = RESPONSE_ERROR;
    strncpy(resp->error_msg, msg, MAX_ERROR_MSG_LEN - 1);
    resp->error_msg[MAX_ERROR_MSG_LEN - 1] = '\0';
}

static void handle_gpio_set(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    gpio_state_t state = (cmd->payload.gpio.state == WORKER_GPIO_HIGH)
                          ? GPIO_STATE_HIGH : GPIO_STATE_LOW;
    iotkit_hal_set_gpio(pin, state);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
}

static void handle_gpio_get_digital(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    bool value = iotkit_hal_get_gpio_digital(pin);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
    resp->data.gpio.digital_value = value;
    resp->data.gpio.mode = "digital";
}

static void handle_gpio_get_analog(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    uint16_t value = iotkit_hal_get_gpio_analog(pin);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
    resp->data.gpio.analog_value = value;
    resp->data.gpio.mode = "analog";
}

static void handle_gpio_configure_input(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    gpio_pull_t pull;
    switch (cmd->payload.gpio.pull) {
        case WORKER_PULL_UP: pull = GPIO_PULL_UP; break;
        case WORKER_PULL_DOWN: pull = GPIO_PULL_DOWN; break;
        default: pull = GPIO_PULL_NONE; break;
    }
    iotkit_hal_configure_gpio_input(pin, pull);

    // Add to monitored pins list
    bool found = false;
    for (int i = 0; i < s_monitored_pin_count; i++) {
        if (s_monitored_pins[i].pin == pin) {
            s_monitored_pins[i].active = true;
            s_monitored_pins[i].has_initial_reading = false;
            found = true;
            break;
        }
    }
    if (!found && s_monitored_pin_count < MAX_MONITORED_PINS) {
        s_monitored_pins[s_monitored_pin_count].pin = pin;
        s_monitored_pins[s_monitored_pin_count].active = true;
        s_monitored_pins[s_monitored_pin_count].has_initial_reading = false;
        s_monitored_pin_count++;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
}

static void handle_pwm_set(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t pin = cmd->payload.pwm.pin;
    uint32_t freq = cmd->payload.pwm.frequency;
    float duty = cmd->payload.pwm.duty_cycle;
    iotkit_hal_set_pwm(pin, freq, duty);
    resp->status = RESPONSE_SUCCESS;
}

static void handle_i2c_configure(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t bus = cmd->payload.i2c_configure.bus;
    uint8_t sda = cmd->payload.i2c_configure.sda_pin;
    uint8_t scl = cmd->payload.i2c_configure.scl_pin;
    uint32_t freq = cmd->payload.i2c_configure.frequency;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    if (!iotkit_hal_i2c_configure(bus, sda, scl, freq)) {
        set_error(resp, "Failed to configure I2C");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_configure.bus = bus;
    resp->data.i2c_configure.sda_pin = sda;
    resp->data.i2c_configure.scl_pin = scl;
    resp->data.i2c_configure.frequency = freq;
}

static void handle_i2c_scan(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t bus = cmd->payload.i2c_scan.bus;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    i2c_scan_result_t result = iotkit_hal_i2c_scan(bus);
    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_scan.bus = bus;
    resp->data.i2c_scan.count = result.count;
    memcpy(resp->data.i2c_scan.addresses, result.addresses, result.count);
}

static void handle_i2c_write(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t bus = cmd->payload.i2c_write.bus;
    uint8_t addr = cmd->payload.i2c_write.address;
    const uint8_t *data = cmd->payload.i2c_write.data;
    size_t len = cmd->payload.i2c_write.data_len;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    if (!iotkit_hal_i2c_write(bus, addr, data, len)) {
        set_error(resp, "I2C write failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_i2c_read(const worker_command_t *cmd, worker_response_t *resp) {
    uint8_t bus = cmd->payload.i2c_read.bus;
    uint8_t addr = cmd->payload.i2c_read.address;
    size_t len = cmd->payload.i2c_read.length;
    int reg = cmd->payload.i2c_read.reg;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    if (len > MAX_I2C_READ_DATA) {
        set_error(resp, "Read length too large");
        return;
    }

    int result = iotkit_hal_i2c_read(bus, addr, resp->data.i2c_read.data, len, reg);
    if (result < 0) {
        set_error(resp, "I2C read failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_read.bus = bus;
    resp->data.i2c_read.address = addr;
    resp->data.i2c_read.data_len = (size_t)result;
}

static void handle_display_update(const worker_command_t *cmd, worker_response_t *resp) {
#ifndef UNIT_TEST
    uint8_t bus = cmd->payload.display.bus;
    uint8_t addr = cmd->payload.display.address;
    uint8_t width = cmd->payload.display.width;
    uint8_t height = cmd->payload.display.height;
    bool is_ssd1306 = (cmd->payload.display.controller == 0);
    bool do_init = cmd->payload.display.init;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    size_t fb_size = (size_t)width * height / 8;

    // Read framebuffer from shared buffer
    uint8_t fb_data[MAX_DISPLAY_BUFFER_SIZE];
    size_t fb_len = 0;
    display_segment_t segments[MAX_DISPLAY_SEGMENTS];
    size_t segment_count = 0;

    if (!shared_display_buffer_read(fb_data, &fb_len, segments, &segment_count)) {
        set_error(resp, "No display data available");
        return;
    }

    // Resize local framebuffer if needed
    if (s_framebuffer_size != fb_size) {
        memset(s_framebuffer, 0, sizeof(s_framebuffer));
        s_framebuffer_size = fb_size;
    }

    // Apply segments to local framebuffer
    size_t total_written = 0;
    for (size_t i = 0; i < segment_count; i++) {
        size_t offset = segments[i].offset;
        size_t len = segments[i].length;
        if (offset + len <= fb_size && offset + len <= fb_len) {
            memcpy(&s_framebuffer[offset], &fb_data[offset], len);
            total_written += len;
        }
    }

    // If no segments, treat entire buffer as one segment
    if (segment_count == 0 && fb_len <= fb_size) {
        memcpy(s_framebuffer, fb_data, fb_len);
        total_written = fb_len;
    }

    // Initialize display if requested
    if (do_init) {
        bool init_ok = is_ssd1306
            ? display_init_ssd1306(bus, addr, width, height)
            : display_init_sh1106(bus, addr, width, height);
        if (!init_ok) {
            set_error(resp, "Failed to initialize display");
            return;
        }
    }

    // Write framebuffer
    bool write_ok = is_ssd1306
        ? display_write_fb_ssd1306(bus, addr, width, height, s_framebuffer, s_framebuffer_size)
        : display_write_fb_sh1106(bus, addr, width, height, s_framebuffer, s_framebuffer_size);

    if (!write_ok) {
        set_error(resp, "Failed to write framebuffer");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.display.width = width;
    resp->data.display.height = height;
    resp->data.display.controller = is_ssd1306 ? "ssd1306" : "sh1106";
    resp->data.display.segments_count = segment_count;
    resp->data.display.bytes_written = total_written;
#else
    (void)cmd;
    set_error(resp, "Display not available in test mode");
#endif
}

static void handle_reboot(const worker_command_t *cmd, worker_response_t *resp) {
    (void)cmd;
    resp->status = RESPONSE_SUCCESS;
    // Actual reboot happens after response is sent (handled by main task)
}
