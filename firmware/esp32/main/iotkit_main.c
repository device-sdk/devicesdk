#include <stdio.h>
#include <string.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "freertos/queue.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_websocket_client.h"
#include "cJSON.h"

#include "hal.h"
#include "config.h"
#include "websocket_handler.h"
#include "command_queue.h"
#include "response_queue.h"
#include "shared_buffers.h"
#include "worker_task.h"
#include "base64.h"

static const char *TAG = "IoTKit";

// Strip null padding from binary-patched credentials (matching Pico main.cpp:186-194)
static void sanitize_credential(const char* src, size_t src_len, char* dest, size_t dest_size) {
    size_t out = 0;
    for (size_t i = 0; i < src_len && (out + 1) < dest_size; ++i) {
        if (src[i] != '\0') {
            dest[out++] = src[i];
        }
    }
    dest[out] = '\0';
}

// Raw credential arrays (may contain null padding from binary patching)
static const char RAW_SSID[] = IOTKIT_WIFI_SSID;
static const char RAW_PASSWORD[] = IOTKIT_WIFI_PASSWORD;
static const char RAW_TOKEN[] = IOTKIT_API_TOKEN;
static const char RAW_HOST[] = IOTKIT_API_HOST;
static const char RAW_PROJECT_ID[] = DEVICESDK_PROJECT_ID;
static const char RAW_DEVICE_ID[] = DEVICESDK_DEVICE_ID;

// Sanitized credential buffers
static char wifi_ssid[sizeof(RAW_SSID)];
static char wifi_password[sizeof(RAW_PASSWORD)];
static char api_token[sizeof(RAW_TOKEN)];
static char api_host[sizeof(RAW_HOST)];
static char project_id[sizeof(RAW_PROJECT_ID)];
static char device_id[sizeof(RAW_DEVICE_ID)];

static EventGroupHandle_t wifi_event_group;
static const int WIFI_CONNECTED_BIT = BIT0;
static const int WIFI_FAIL_BIT = BIT1;

static esp_websocket_client_handle_t ws_client = NULL;
static uint32_t last_ping_time = 0;
static bool ws_connected = false;

// Global queues for inter-task communication
QueueHandle_t cmd_queue;
QueueHandle_t response_queue;
QueueHandle_t gpio_notification_queue;

static void ws_send_text(const char *text) {
    if (ws_client && ws_connected) {
        esp_websocket_client_send_text(ws_client, text, strlen(text), portMAX_DELAY);
    }
}

static void process_worker_responses(void) {
    worker_response_t resp;

    while (xQueueReceive(response_queue, &resp, 0) == pdTRUE) {
        cJSON *response = cJSON_CreateObject();
        cJSON *payload_obj = cJSON_CreateObject();

        if (resp.status == RESPONSE_ERROR) {
            cJSON_AddStringToObject(response, "type", "command_error");
            cJSON_AddStringToObject(payload_obj, "error", resp.error_msg);
        } else {
            switch (resp.original_cmd) {
                case CMD_GPIO_SET:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "set_gpio_state");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_GPIO_GET_DIGITAL:
                    cJSON_AddStringToObject(response, "type", "pin_state");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "mode", "digital");
                    cJSON_AddStringToObject(payload_obj, "value", resp.data.gpio.digital_value ? "high" : "low");
                    break;

                case CMD_GPIO_GET_ANALOG:
                    cJSON_AddStringToObject(response, "type", "pin_state");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "mode", "analog");
                    cJSON_AddNumberToObject(payload_obj, "value", resp.data.gpio.analog_value);
                    break;

                case CMD_GPIO_CONFIGURE_INPUT:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "configure_gpio_input_monitoring");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "status", "monitoring_enabled");
                    break;

                case CMD_PWM_SET:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "set_pwm_state");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_I2C_CONFIGURE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "i2c_configure");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.i2c_configure.bus);
                    cJSON_AddNumberToObject(payload_obj, "sda_pin", resp.data.i2c_configure.sda_pin);
                    cJSON_AddNumberToObject(payload_obj, "scl_pin", resp.data.i2c_configure.scl_pin);
                    cJSON_AddNumberToObject(payload_obj, "frequency", resp.data.i2c_configure.frequency);
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_I2C_SCAN: {
                    cJSON_AddStringToObject(response, "type", "i2c_scan_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.i2c_scan.bus);
                    cJSON *devices = cJSON_CreateArray();
                    for (uint8_t i = 0; i < resp.data.i2c_scan.count; i++) {
                        char addr_str[8];
                        snprintf(addr_str, sizeof(addr_str), "0x%02X", resp.data.i2c_scan.addresses[i]);
                        cJSON_AddItemToArray(devices, cJSON_CreateString(addr_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "devices", devices);
                    cJSON_AddNumberToObject(payload_obj, "count", resp.data.i2c_scan.count);
                    break;
                }

                case CMD_I2C_WRITE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "i2c_write");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_I2C_READ: {
                    cJSON_AddStringToObject(response, "type", "i2c_read_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.i2c_read.bus);
                    char addr_str[8];
                    snprintf(addr_str, sizeof(addr_str), "0x%02X", resp.data.i2c_read.address);
                    cJSON_AddStringToObject(payload_obj, "address", addr_str);
                    char *data_b64 = base64_encode(resp.data.i2c_read.data, resp.data.i2c_read.data_len);
                    if (data_b64) {
                        cJSON_AddStringToObject(payload_obj, "data", data_b64);
                        free(data_b64);
                    }
                    cJSON_AddNumberToObject(payload_obj, "length", resp.data.i2c_read.data_len);
                    break;
                }

                case CMD_DISPLAY_UPDATE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "display_update");
                    cJSON_AddStringToObject(payload_obj, "controller",
                        resp.data.display.controller ? resp.data.display.controller : "ssd1306");
                    cJSON_AddNumberToObject(payload_obj, "width", resp.data.display.width);
                    cJSON_AddNumberToObject(payload_obj, "height", resp.data.display.height);
                    cJSON_AddNumberToObject(payload_obj, "segments_count", resp.data.display.segments_count);
                    cJSON_AddNumberToObject(payload_obj, "bytes_written", resp.data.display.bytes_written);
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_REBOOT:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "reboot");
                    cJSON_AddStringToObject(payload_obj, "status", "rebooting");
                    break;

                default:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;
            }
        }

        cJSON_AddItemToObject(response, "payload", payload_obj);

        if (resp.message_id[0] != '\0') {
            cJSON_AddStringToObject(response, "id", resp.message_id);
        }

        char *json_str = cJSON_PrintUnformatted(response);
        if (json_str) {
            ws_send_text(json_str);
            free(json_str);
        }
        cJSON_Delete(response);

        // Handle reboot after sending response
        if (resp.original_cmd == CMD_REBOOT && resp.status == RESPONSE_SUCCESS) {
            vTaskDelay(100 / portTICK_PERIOD_MS);
            iotkit_hal_reboot();
        }
    }
}

static void process_gpio_notifications(void) {
    gpio_notification_t notification;

    while (xQueueReceive(gpio_notification_queue, &notification, 0) == pdTRUE) {
        cJSON *msg = cJSON_CreateObject();
        cJSON *payload_obj = cJSON_CreateObject();

        cJSON_AddStringToObject(msg, "type", "gpio_state_changed");
        cJSON_AddNumberToObject(payload_obj, "pin", notification.pin);
        cJSON_AddStringToObject(payload_obj, "state", notification.state ? "high" : "low");
        cJSON_AddItemToObject(msg, "payload", payload_obj);

        char *json_str = cJSON_PrintUnformatted(msg);
        if (json_str) {
            ws_send_text(json_str);
            free(json_str);
        }
        cJSON_Delete(msg);
    }
}

static void event_handler(void* arg, esp_event_base_t event_base,
                          int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
        xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
        esp_wifi_connect();
        ESP_LOGI(TAG, "retry to connect to the AP");
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&event->ip_info.ip));
        xEventGroupClearBits(wifi_event_group, WIFI_FAIL_BIT);
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

static void wifi_init_sta(void) {
    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t cfg = WIFI_INIT_CONFIG_DEFAULT();
    ESP_ERROR_CHECK(esp_wifi_init(&cfg));

    esp_event_handler_instance_t instance_any_id;
    esp_event_handler_instance_t instance_got_ip;
    ESP_ERROR_CHECK(esp_event_handler_instance_register(WIFI_EVENT,
                                                        ESP_EVENT_ANY_ID,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_any_id));
    ESP_ERROR_CHECK(esp_event_handler_instance_register(IP_EVENT,
                                                        IP_EVENT_STA_GOT_IP,
                                                        &event_handler,
                                                        NULL,
                                                        &instance_got_ip));

    wifi_config_t wifi_config = {
        .sta = {
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    // Copy sanitized credentials into wifi_config (can't use initializer for variable-length strings)
    strncpy((char *)wifi_config.sta.ssid, wifi_ssid, sizeof(wifi_config.sta.ssid));
    strncpy((char *)wifi_config.sta.password, wifi_password, sizeof(wifi_config.sta.password));

    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA));
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config));
    ESP_ERROR_CHECK(esp_wifi_start());

    ESP_LOGI(TAG, "wifi_init_sta finished.");

    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            30000 / portTICK_PERIOD_MS);

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "connected to ap SSID:%s", wifi_ssid);
        iotkit_hal_blink_led(2);
    } else if (bits & WIFI_FAIL_BIT) {
        ESP_LOGI(TAG, "Failed to connect to SSID:%s", wifi_ssid);
    } else {
        ESP_LOGI(TAG, "UNEXPECTED EVENT");
    }
}

static void websocket_event_handler(void *handler_args, esp_event_base_t base, int32_t event_id, void *event_data) {
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;
    switch (event_id) {
        case WEBSOCKET_EVENT_CONNECTED:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_CONNECTED");
            ws_connected = true;
            iotkit_hal_blink_led(3);
            {
                const char *msg = "{\"type\":\"device_connected\"}";
                esp_websocket_client_send_text(ws_client, msg, strlen(msg), portMAX_DELAY);
                ESP_LOGI(TAG, "Sent device_connected message");
            }
            last_ping_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_DISCONNECTED");
            ws_connected = false;
            break;
        case WEBSOCKET_EVENT_DATA:
            if (data->data_len > 0) {
                char *message = malloc(data->data_len + 1);
                if (message) {
                    memcpy(message, data->data_ptr, data->data_len);
                    message[data->data_len] = '\0';
                    ESP_LOGI(TAG, "Received: %s", message);
                    handle_websocket_message(message);
                    free(message);
                }
            }
            break;
        case WEBSOCKET_EVENT_ERROR:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_ERROR");
            break;
    }
}

static void websocket_task(void *pvParameters) {
    ESP_LOGI(TAG, "WebSocket task started");

    char ws_path[256];
    snprintf(ws_path, sizeof(ws_path), "/v1/projects/%s/devices/%s/connect/websocket", project_id, device_id);

    char uri[512];
    char auth_header[256];
    snprintf(uri, sizeof(uri), "ws://%s%s", api_host, ws_path);
    snprintf(auth_header, sizeof(auth_header), "Authorization: Bearer %s\r\n", api_token);

    esp_websocket_client_config_t websocket_cfg = {
        .uri = uri,
        .headers = auth_header,
    };

    ws_client = esp_websocket_client_init(&websocket_cfg);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, NULL);
    esp_websocket_client_start(ws_client);

    while (1) {
        // Process responses from worker task and send via WebSocket
        if (ws_connected) {
            process_worker_responses();
            process_gpio_notifications();
        }

        // Ping keepalive
        if (ws_connected) {
            uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
            if (now - last_ping_time > IOTKIT_PING_INTERVAL_MS) {
                const char *ping_msg = "{\"type\":\"ping\"}";
                esp_websocket_client_send_text(ws_client, ping_msg, strlen(ping_msg), portMAX_DELAY);
                last_ping_time = now;
            }
        }

        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting IoTKit Client");

    // Sanitize binary-patched credentials (strip null padding)
    sanitize_credential(RAW_SSID, sizeof(RAW_SSID), wifi_ssid, sizeof(wifi_ssid));
    sanitize_credential(RAW_PASSWORD, sizeof(RAW_PASSWORD), wifi_password, sizeof(wifi_password));
    sanitize_credential(RAW_TOKEN, sizeof(RAW_TOKEN), api_token, sizeof(api_token));
    sanitize_credential(RAW_HOST, sizeof(RAW_HOST), api_host, sizeof(api_host));
    sanitize_credential(RAW_PROJECT_ID, sizeof(RAW_PROJECT_ID), project_id, sizeof(project_id));
    sanitize_credential(RAW_DEVICE_ID, sizeof(RAW_DEVICE_ID), device_id, sizeof(device_id));

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    iotkit_hal_init();
    iotkit_hal_blink_led(1);

    // Initialize inter-task queues
    cmd_queue = xQueueCreate(8, sizeof(worker_command_t));
    response_queue = xQueueCreate(16, sizeof(worker_response_t));
    gpio_notification_queue = xQueueCreate(32, sizeof(gpio_notification_t));

    // Initialize shared buffers
    shared_buffers_init();

    // Initialize worker task state
    worker_task_init();

    // Initialize WebSocket handler with command queue
    websocket_handler_init(cmd_queue);

    wifi_init_sta();

    // Start worker task
    xTaskCreate(worker_task_entry, "worker", 8192, NULL, 4, NULL);

    // Start WebSocket task (higher priority)
    xTaskCreate(websocket_task, "websocket", 8192, NULL, 5, NULL);
}
