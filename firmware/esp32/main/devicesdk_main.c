#include <stdio.h>
#include <stdbool.h>
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
#include "esp_timer.h"
#include "nvs_flash.h"
#include "esp_websocket_client.h"
#include "esp_crt_bundle.h"
#include "esp_random.h"
#include "esp_timer.h"
#include "cJSON.h"

#include "hal.h"
#include "config.h"
#include "display.h"
#include "websocket_handler.h"
#include "command_queue.h"
#include "response_queue.h"
#include "shared_buffers.h"
#include "worker_task.h"
#include "backoff.h"

// Device type reported in the device_connected handshake. Derived from the IDF
// target macros (sdkconfig.h is included above).
#if defined(CONFIG_IDF_TARGET_ESP32C3)
#define DEVICESDK_DEVICE_TYPE "esp32c3"
#elif defined(CONFIG_IDF_TARGET_ESP32C61)
#define DEVICESDK_DEVICE_TYPE "esp32c61"
#else
#define DEVICESDK_DEVICE_TYPE "esp32"
#endif

// The worker task is pinned to the last available core: APP_CPU on the
// dual-core ESP32, core 0 on single-core parts (ESP32-C3/C61). Do NOT hardcode
// a core here - xTaskCreatePinnedToCore asserts at runtime on an out-of-range
// core ID when configNUMBER_OF_CORES == 1 (ESP-IDF 5.5,
// freertos_tasks_c_additions.h:163), which crashed single-core targets on
// every boot. This static assert turns a regression into a compile error on
// the single-core CI builds instead of a runtime crash loop on hardware.
#define DEVICESDK_WORKER_CORE (configNUM_CORES - 1)
_Static_assert(DEVICESDK_WORKER_CORE >= 0 && DEVICESDK_WORKER_CORE < configNUM_CORES,
               "worker task core ID out of range on this target");

static const char *TAG = "DeviceSDK";

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
static const char RAW_SSID[] = DEVICESDK_WIFI_SSID;
static const char RAW_PASSWORD[] = DEVICESDK_WIFI_PASSWORD;
static const char RAW_TOKEN[] = DEVICESDK_API_TOKEN;
static const char RAW_HOST[] = DEVICESDK_API_HOST;
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
static esp_timer_handle_t wifi_reconnect_timer = NULL;
static uint32_t wifi_retry_count = 0;
static uint32_t rate_limit_retry_after_ms = 0;
static uint32_t rate_limit_reconnect_at_ms = 0;

// The server rejects the WS upgrade with HTTP 401 when the API token is
// invalid; without a stop, the client would auto-reconnect every 10s forever.
static int ws_auth_failure_count = 0;
static bool ws_stop_requested = false;
static bool ws_permanently_stopped = false;
#define WS_MAX_AUTH_FAILURES 5

// Reassembly buffer for WS frames larger than the client's rx buffer
// (buffer_size = 2048). The server caps command payloads at 4096 bytes of
// JSON, so 4.5 KB covers the largest frame plus envelope and WS overhead.
#define WS_RX_FRAME_MAX 4608
static char s_ws_rx_frame[WS_RX_FRAME_MAX];
static size_t s_ws_rx_frame_len = 0;
static bool s_ws_rx_frame_dropped = false;

// Global queues for inter-task communication
QueueHandle_t cmd_queue;
QueueHandle_t response_queue;
QueueHandle_t gpio_notification_queue;

static void ws_send_text(const char *text) {
    if (ws_client && ws_connected) {
        // Bounded timeout so a backed-up TX path can't stall the websocket
        // task (pings, reconnect logic) indefinitely.
        int ret = esp_websocket_client_send_text(ws_client, text, strlen(text), 2000 / portTICK_PERIOD_MS);
        if (ret < 0) {
            ESP_LOGE(TAG, "Failed to send WS message (ret=%d)", ret);
        }
    }
}

// Builds and sends a `command_error` frame, used by websocket_handler.c for
// messages that fail to parse so the caller gets the error instead of a 5 s
// timeout. `message_id` may be empty.
void devicesdk_ws_send_error(const char *message_id, const char *error) {
    cJSON *response = cJSON_CreateObject();
    cJSON *payload_obj = cJSON_CreateObject();
    cJSON_AddStringToObject(response, "type", "command_error");
    cJSON_AddStringToObject(payload_obj, "error", error);
    cJSON_AddItemToObject(response, "payload", payload_obj);
    if (message_id[0] != '\0') {
        cJSON_AddStringToObject(response, "id", message_id);
    }
    char *json_str = cJSON_PrintUnformatted(response);
    cJSON_Delete(response);
    if (json_str) {
        ws_send_text(json_str);
        free(json_str);
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
                    cJSON_AddStringToObject(response, "type", "pin_state_update");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "mode", "digital");
                    cJSON_AddStringToObject(payload_obj, "value", resp.data.gpio.digital_value ? "high" : "low");
                    break;

                case CMD_GPIO_GET_ANALOG:
                    cJSON_AddStringToObject(response, "type", "pin_state_update");
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

                case CMD_GPIO_DISABLE_MONITORING:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "configure_gpio_input_monitoring");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.gpio.pin);
                    cJSON_AddStringToObject(payload_obj, "status", "monitoring_disabled");
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
                    // Contract (responses.ts I2cScanResult) is { bus, addresses_found: string[] },
                    // matching the Pico firmware. The old "devices"/"count" shape was never read.
                    cJSON_AddStringToObject(response, "type", "i2c_scan_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.i2c_scan.bus);
                    cJSON *addresses_found = cJSON_CreateArray();
                    for (uint8_t i = 0; i < resp.data.i2c_scan.count; i++) {
                        char addr_str[8];
                        snprintf(addr_str, sizeof(addr_str), "0x%02X", resp.data.i2c_scan.addresses[i]);
                        cJSON_AddItemToArray(addresses_found, cJSON_CreateString(addr_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "addresses_found", addresses_found);
                    break;
                }

                case CMD_I2C_WRITE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "i2c_write");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_I2C_READ: {
                    // Contract (responses.ts I2cReadResult) is { bus, address, data: string[] }
                    // of hex bytes, matching the Pico firmware and the spi/uart read results
                    // below. The old base64 string + "length" shape was never read correctly.
                    cJSON_AddStringToObject(response, "type", "i2c_read_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.i2c_read.bus);
                    char addr_str[8];
                    snprintf(addr_str, sizeof(addr_str), "0x%02X", resp.data.i2c_read.address);
                    cJSON_AddStringToObject(payload_obj, "address", addr_str);
                    cJSON *i2c_read_data = cJSON_CreateArray();
                    for (size_t i = 0; i < resp.data.i2c_read.data_len; i++) {
                        char hex_str[8];
                        snprintf(hex_str, sizeof(hex_str), "0x%02X", resp.data.i2c_read.data[i]);
                        cJSON_AddItemToArray(i2c_read_data, cJSON_CreateString(hex_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "data", i2c_read_data);
                    break;
                }

                case CMD_GET_TEMPERATURE:
                    cJSON_AddStringToObject(response, "type", "temperature_result");
                    cJSON_AddNumberToObject(payload_obj, "celsius", resp.data.temperature.celsius);
                    break;

                case CMD_WATCHDOG_CONFIGURE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "watchdog_configure");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_WATCHDOG_FEED:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "watchdog_feed");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_SPI_CONFIGURE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "spi_configure");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_SPI_TRANSFER: {
                    cJSON_AddStringToObject(response, "type", "spi_transfer_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.spi.bus);
                    cJSON *spi_data = cJSON_CreateArray();
                    for (size_t i = 0; i < resp.data.spi.data_len; i++) {
                        char hex_str[8];
                        snprintf(hex_str, sizeof(hex_str), "0x%02X", resp.data.spi.data[i]);
                        cJSON_AddItemToArray(spi_data, cJSON_CreateString(hex_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "data", spi_data);
                    break;
                }

                case CMD_SPI_WRITE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "spi_write");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_SPI_READ: {
                    cJSON_AddStringToObject(response, "type", "spi_read_result");
                    cJSON_AddNumberToObject(payload_obj, "bus", resp.data.spi.bus);
                    cJSON *spi_read_data = cJSON_CreateArray();
                    for (size_t i = 0; i < resp.data.spi.data_len; i++) {
                        char hex_str[8];
                        snprintf(hex_str, sizeof(hex_str), "0x%02X", resp.data.spi.data[i]);
                        cJSON_AddItemToArray(spi_read_data, cJSON_CreateString(hex_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "data", spi_read_data);
                    break;
                }

                case CMD_UART_CONFIGURE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "uart_configure");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_UART_WRITE:
                    cJSON_AddStringToObject(response, "type", "command_ack");
                    cJSON_AddStringToObject(payload_obj, "command", "uart_write");
                    cJSON_AddStringToObject(payload_obj, "status", "success");
                    break;

                case CMD_UART_READ: {
                    cJSON_AddStringToObject(response, "type", "uart_read_result");
                    cJSON_AddNumberToObject(payload_obj, "port", resp.data.uart_read.port);
                    cJSON *uart_data = cJSON_CreateArray();
                    for (size_t i = 0; i < resp.data.uart_read.data_len; i++) {
                        char hex_str[8];
                        snprintf(hex_str, sizeof(hex_str), "0x%02X", resp.data.uart_read.data[i]);
                        cJSON_AddItemToArray(uart_data, cJSON_CreateString(hex_str));
                    }
                    cJSON_AddItemToObject(payload_obj, "data", uart_data);
                    cJSON_AddNumberToObject(payload_obj, "bytes_read", resp.data.uart_read.data_len);
                    break;
                }

                case CMD_ONEWIRE_SEARCH: {
                    cJSON_AddStringToObject(response, "type", "onewire_search_result");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.onewire_search.pin);
                    cJSON *roms = cJSON_CreateArray();
                    for (uint8_t i = 0; i < resp.data.onewire_search.count && i < MAX_ONEWIRE_ROMS; i++) {
                        char rom_hex[ONEWIRE_ROM_LEN * 2 + 1] = {0};
                        for (int b = 0; b < ONEWIRE_ROM_LEN; b++) {
                            snprintf(&rom_hex[b * 2], 3, "%02X", resp.data.onewire_search.roms[i][b]);
                        }
                        cJSON_AddItemToArray(roms, cJSON_CreateString(rom_hex));
                    }
                    cJSON_AddItemToObject(payload_obj, "roms", roms);
                    break;
                }

                case CMD_ONEWIRE_READ_TEMP: {
                    cJSON_AddStringToObject(response, "type", "onewire_temp_result");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.onewire_temp.pin);
                    // Skip ROM reads report an empty rom, per responses.ts.
                    char rom_hex[ONEWIRE_ROM_LEN * 2 + 1] = {0};
                    if (resp.data.onewire_temp.has_rom) {
                        for (int b = 0; b < ONEWIRE_ROM_LEN; b++) {
                            snprintf(&rom_hex[b * 2], 3, "%02X", resp.data.onewire_temp.rom[b]);
                        }
                    }
                    cJSON_AddStringToObject(payload_obj, "rom", rom_hex);
                    cJSON_AddNumberToObject(payload_obj, "celsius", resp.data.onewire_temp.celsius);
                    break;
                }

                case CMD_DHT_READ:
                    cJSON_AddStringToObject(response, "type", "dht_read_result");
                    cJSON_AddNumberToObject(payload_obj, "pin", resp.data.dht.pin);
                    cJSON_AddNumberToObject(payload_obj, "celsius", resp.data.dht.celsius);
                    cJSON_AddNumberToObject(payload_obj, "humidity_pct", resp.data.dht.humidity_pct);
                    break;

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
            devicesdk_hal_reboot();
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

// One-shot esp_timer callback that performs the actual WiFi reconnect. The
// DISCONNECTED handler schedules this instead of calling esp_wifi_connect()
// directly so the WiFi event-loop task is never blocked by a retry delay.
static void wifi_reconnect_timer_cb(void *arg) {
    ESP_LOGI(TAG, "retrying wifi connection (attempt %lu)",
             (unsigned long)wifi_retry_count);
    esp_wifi_connect();
}

// Exponential backoff lives in backoff.c; `esp_random()` is supplied by the
// caller so the pure math is host-testable.
static void event_handler(void* arg, esp_event_base_t event_base,
                          int32_t event_id, void* event_data) {
    if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_START) {
        esp_wifi_connect();
    } else if (event_base == WIFI_EVENT && event_id == WIFI_EVENT_STA_DISCONNECTED) {
        xEventGroupClearBits(wifi_event_group, WIFI_CONNECTED_BIT);
        xEventGroupSetBits(wifi_event_group, WIFI_FAIL_BIT);
        wifi_event_sta_disconnected_t *disconn = (wifi_event_sta_disconnected_t *)event_data;
        int reason = disconn ? (int)disconn->reason : -1;
        uint32_t delay_ms = wifi_backoff_delay_ms(wifi_retry_count, esp_random());
        ESP_LOGI(TAG, "wifi disconnected, reason=%d, retry in %lums (attempt %lu)",
                 reason, (unsigned long)delay_ms, (unsigned long)(wifi_retry_count + 1));
        if (wifi_reconnect_timer) {
            esp_timer_stop(wifi_reconnect_timer);
            esp_timer_start_once(wifi_reconnect_timer, (uint64_t)delay_ms * 1000);
        }
        wifi_retry_count++;
    } else if (event_base == IP_EVENT && event_id == IP_EVENT_STA_GOT_IP) {
        ip_event_got_ip_t* event = (ip_event_got_ip_t*) event_data;
        ESP_LOGI(TAG, "got ip:" IPSTR, IP2STR(&event->ip_info.ip));
        wifi_ap_record_t ap_info;
        if (esp_wifi_sta_get_ap_info(&ap_info) == ESP_OK) {
            ESP_LOGI(TAG, "connected to AP \"%.32s\" (channel %u, RSSI %d dBm)",
                     (const char *)ap_info.ssid, ap_info.primary, ap_info.rssi);
        }
        if (wifi_reconnect_timer) {
            esp_timer_stop(wifi_reconnect_timer);
        }
        wifi_retry_count = 0;
        xEventGroupClearBits(wifi_event_group, WIFI_FAIL_BIT);
        xEventGroupSetBits(wifi_event_group, WIFI_CONNECTED_BIT);
    }
}

// Advertise a DHCP hostname derived from the patched device slug so the
// router's client list shows a readable name instead of the Espressif default.
// The slug is validated at creation as [a-z][a-z0-9-]*, but sanitize and cap
// defensively anyway.
static void build_dhcp_hostname(char *out, size_t out_size) {
    size_t o = 0;
    for (size_t i = 0; device_id[i] != '\0' && o + 1 < out_size; ++i) {
        char ch = device_id[i];
        if ((ch >= 'a' && ch <= 'z') || (ch >= '0' && ch <= '9') || ch == '-') {
            out[o++] = ch;
        }
    }
    while (o > 0 && out[o - 1] == '-') {
        o--;
    }
    out[o] = '\0';
    if (o == 0) {
        snprintf(out, out_size, "devicesdk");
    }
}

static void wifi_init_sta(void) {
    wifi_event_group = xEventGroupCreate();

    ESP_ERROR_CHECK(esp_netif_init());
    ESP_ERROR_CHECK(esp_event_loop_create_default());
    esp_netif_t *sta_netif = esp_netif_create_default_wifi_sta();

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

    // Set the DHCP hostname before starting WiFi so the router's client list
    // shows this device's name instead of the generic "espressif" default.
    char dhcp_hostname[32];
    build_dhcp_hostname(dhcp_hostname, sizeof(dhcp_hostname));
    ESP_ERROR_CHECK(esp_netif_set_hostname(sta_netif, dhcp_hostname));
    ESP_LOGI(TAG, "advertising DHCP hostname %s", dhcp_hostname);

    // One-shot reconnect timer; armed by the DISCONNECTED event handler.
    esp_timer_create_args_t timer_args = {
        .callback = wifi_reconnect_timer_cb,
        .name = "wifi_reconnect",
    };
    ESP_ERROR_CHECK(esp_timer_create(&timer_args, &wifi_reconnect_timer));

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
        display_boot_text("WiFi");
        devicesdk_hal_blink_led(2);
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
            ws_auth_failure_count = 0;
            // Connection to the server succeeded — confirm it on the panel.
            // The cloud sends the first display_update right after the
            // device_connected handshake below, which overwrites this.
            display_boot_text("Connected");
            devicesdk_hal_blink_led(3);
            {
                char conn_msg[160];
                snprintf(conn_msg, sizeof(conn_msg),
                         "{\"type\":\"device_connected\",\"payload\":{\"firmware_version\":\"%s\",\"device_type\":\"%s\"}}",
                         DEVICESDK_FIRMWARE_VERSION, DEVICESDK_DEVICE_TYPE);
                esp_websocket_client_send_text(ws_client, conn_msg, strlen(conn_msg), portMAX_DELAY);
                ESP_LOGI(TAG, "Sent device_connected message");
            }
            last_ping_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_DISCONNECTED");
            ws_connected = false;
            s_ws_rx_frame_len = 0;
            s_ws_rx_frame_dropped = false;
            // Connection lost — revert to "Server" so the panel reflects the
            // reconnecting state until the next CONNECTED event (or a fresh
            // cloud display_update) overwrites it.
            display_boot_text("Server");
            if (rate_limit_retry_after_ms > 0) {
                uint32_t now_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
                rate_limit_reconnect_at_ms = now_ms + rate_limit_retry_after_ms;
                ESP_LOGW(TAG, "Rate limited: waiting %lu ms before reconnecting",
                         (unsigned long)rate_limit_retry_after_ms);
                rate_limit_retry_after_ms = 0;
                esp_websocket_client_stop(ws_client);
            }
            break;
        case WEBSOCKET_EVENT_DATA:
            if (data->data_len > 0) {
                // Frames larger than buffer_size arrive as multiple DATA
                // events carrying payload_offset/payload_len. Reassemble the
                // full frame before parsing JSON, and only parse once.
                if (data->payload_offset == 0) {
                    s_ws_rx_frame_len = 0;
                    s_ws_rx_frame_dropped = false;
                }
                if (s_ws_rx_frame_dropped) {
                    break;  // skip the rest of an oversize frame
                }
                if (data->data_len > (int)(sizeof(s_ws_rx_frame) - 1 - s_ws_rx_frame_len)) {
                    ESP_LOGE(TAG, "WS frame exceeds %u bytes, dropping",
                             (unsigned)sizeof(s_ws_rx_frame));
                    s_ws_rx_frame_len = 0;
                    s_ws_rx_frame_dropped = true;
                    break;
                }
                memcpy(&s_ws_rx_frame[s_ws_rx_frame_len], data->data_ptr, data->data_len);
                s_ws_rx_frame_len += data->data_len;
                if (data->payload_offset + data->data_len < data->payload_len) {
                    break;  // more chunks of this frame pending
                }
                s_ws_rx_frame[s_ws_rx_frame_len] = '\0';
                ESP_LOGD(TAG, "Received: %s", s_ws_rx_frame);

                // Check for rate_limit message before normal handling
                cJSON *json = cJSON_Parse(s_ws_rx_frame);
                if (json) {
                    cJSON *type_field = cJSON_GetObjectItem(json, "type");
                    if (type_field && cJSON_IsString(type_field) &&
                        strcmp(type_field->valuestring, "rate_limit") == 0) {
                        cJSON *payload_field = cJSON_GetObjectItem(json, "payload");
                        if (payload_field) {
                            cJSON *retry_after = cJSON_GetObjectItem(payload_field, "retry_after");
                            if (retry_after && cJSON_IsNumber(retry_after)) {
                                rate_limit_retry_after_ms = (uint32_t)(retry_after->valuedouble * 1000);
                                ESP_LOGW(TAG, "Rate limited: retry after %u seconds",
                                         (unsigned)(retry_after->valuedouble));
                            }
                        }
                        cJSON_Delete(json);
                    } else {
                        cJSON_Delete(json);
                        handle_websocket_message(s_ws_rx_frame);
                    }
                } else {
                    handle_websocket_message(s_ws_rx_frame);
                }
                s_ws_rx_frame_len = 0;
            }
            break;
        case WEBSOCKET_EVENT_ERROR:
            if (data->error_handle.esp_transport_sock_errno != 0) {
                int ws_err = data->error_handle.esp_transport_sock_errno;
                ESP_LOGI(TAG, "WEBSOCKET_EVENT_ERROR: %s (errno=%d)",
                         strerror(ws_err), ws_err);
            } else {
                ESP_LOGI(TAG, "WEBSOCKET_EVENT_ERROR: %s",
                         esp_err_to_name(data->error_handle.esp_tls_last_esp_err));
            }
            // The server answers the upgrade request with HTTP 401 when the
            // API token is invalid or the device was revoked. Count consecutive
            // rejections; once the limit is hit, stop retrying so a wrong
            // token can't drain the battery and spam the server forever.
            if (data->error_handle.esp_ws_handshake_status_code == 401) {
                ws_auth_failure_count++;
                if (ws_auth_failure_count >= WS_MAX_AUTH_FAILURES) {
                    ws_stop_requested = true;
                    ESP_LOGE(TAG, "Server rejected the API token (HTTP 401) %d times. "
                             "Stopping reconnect attempts - re-flash this device with a valid token.",
                             ws_auth_failure_count);
                }
            }
            break;
    }
}

static void websocket_task(void *pvParameters) {
    ESP_LOGI(TAG, "WebSocket task started");

    char ws_path[256];
    snprintf(ws_path, sizeof(ws_path), "/v1/projects/%s/devices/%s/connect/websocket", project_id, device_id);

    char uri[512];
    char auth_header[256];
    // Local dev: api_host is `<lan-ip>:<port>` → plain WS. Production hostnames
    // never include a port → TLS. Assumes DNS-form hostnames; an IPv6 literal
    // (e.g. `[::1]:8787` or `2001:db8::1`) would also match the colon check
    // and silently downgrade to plain WS — config.h is hand-edited and IPv6
    // is not a supported transport here, so this is a documented assumption
    // rather than a defensive parse.
    const bool use_tls = (strchr(api_host, ':') == NULL);
    snprintf(uri, sizeof(uri), "%s://%s%s", use_tls ? "wss" : "ws", api_host, ws_path);
    ESP_LOGI(TAG, "connecting to %s", uri);
    snprintf(auth_header, sizeof(auth_header), "Authorization: Bearer %s\r\n", api_token);
    size_t token_len = strlen(api_token);
    ESP_LOGI(TAG, "using api token ...%s",
             token_len >= 4 ? api_token + token_len - 4 : "????");

    esp_websocket_client_config_t websocket_cfg = {
        .uri = uri,
        .headers = auth_header,
        .transport = use_tls ? WEBSOCKET_TRANSPORT_OVER_SSL : WEBSOCKET_TRANSPORT_OVER_TCP,
        .crt_bundle_attach = use_tls ? esp_crt_bundle_attach : NULL,
        // Incoming server frames can exceed the 1024-byte default
        // (display_update framebuffers, script env blobs, etc.).
        .buffer_size = 2048,
        // The ESP ws client dispatches events inside its internal task;
        // our event handler parses cJSON, logs the message, and queues a
        // worker_command_t. Measured peak ~8.9 KB on C3 for trivial
        // commands — the 4 KB default overflows hard, 8 KB still fell
        // short by ~700 B. Keep headroom for larger frames.
        .task_stack = 16384,
        // Dead-socket detection. A half-open TCP drop (home-router/NAT idle
        // timeout, ~15 min) otherwise goes unnoticed: the app-level
        // {"type":"ping"} text frame below is fire-and-forget (the server never
        // replies to it), so the client keeps believing it is connected, never
        // reconnects, and the server's connection-gated cron alarm stays
        // cancelled forever — the device shows "online" while its clock/cron
        // freezes (see repo TROUBLESHOOT.md, "Per-device cron stops firing
        // after ~15 min"). Enabling protocol-level WebSocket PING/PONG fixes
        // this from the device side: the runtime PONGs every PING for free
        // without waking the hibernating server object, so a missing PONG
        // within pingpong_timeout_sec proves the path is dead and tears the
        // connection down, triggering the client's built-in auto-reconnect
        // (re-sends device_connected → server re-arms the cron). The steady
        // PING traffic also keeps NAT mappings warm, avoiding the idle drop in
        // the first place. TCP keep-alive is a second, lower-layer backstop.
        .ping_interval_sec = 20,
        .pingpong_timeout_sec = 10,
        .keep_alive_enable = true,
        .keep_alive_idle = 15,
        .keep_alive_interval = 15,
        .keep_alive_count = 3,
    };

    ws_client = esp_websocket_client_init(&websocket_cfg);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, NULL);
    // Show "Server" while the WebSocket connection is in progress; the
    // WEBSOCKET_EVENT_CONNECTED handler swaps it to "Connected" on success, so
    // a panel stuck on "Server" means the server connection never completed.
    display_boot_text("Server");
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
            if (now - last_ping_time > DEVICESDK_PING_INTERVAL_MS) {
                ws_send_text("{\"type\":\"ping\"}");
                last_ping_time = now;
            }
        }

        // Stop the client for good after repeated auth rejections (HTTP 401).
        // esp_websocket_client_stop() must not run from the event handler,
        // so it is executed here in the websocket task.
        if (ws_stop_requested && !ws_permanently_stopped) {
            ws_permanently_stopped = true;
            ESP_LOGE(TAG, "WebSocket client stopped: invalid API token");
            esp_websocket_client_stop(ws_client);
        }

        // Reconnect after rate limit delay (non-blocking)
        if (!ws_connected && !ws_permanently_stopped && rate_limit_reconnect_at_ms > 0) {
            uint32_t now_ms = xTaskGetTickCount() * portTICK_PERIOD_MS;
            if (now_ms >= rate_limit_reconnect_at_ms) {
                rate_limit_reconnect_at_ms = 0;
                ESP_LOGI(TAG, "Reconnecting after rate limit delay");
                esp_websocket_client_start(ws_client);
            }
        }

        vTaskDelay(10 / portTICK_PERIOD_MS);
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting DeviceSDK Client");

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

    devicesdk_hal_init();
    // Probe + init the on-board OLED (FN4 / 0.42" boards). NACK on boards
    // without one (DevKitM-1) → boot text becomes a no-op for the rest of boot.
    display_boot_init();
    display_boot_text("Booting");
    devicesdk_hal_blink_led(1);

    // Initialize inter-task queues
    cmd_queue = xQueueCreate(8, sizeof(worker_command_t));
    response_queue = xQueueCreate(16, sizeof(worker_response_t));
    gpio_notification_queue = xQueueCreate(32, sizeof(gpio_notification_t));

    // Initialize shared buffers
    shared_buffers_init();

    // Initialize worker task state
    worker_task_init();

    // Initialize WebSocket handler with command queue; parse/validation
    // failures are answered with command_error via the response queue.
    websocket_handler_init(cmd_queue);
    websocket_handler_set_response_queue(response_queue);

    wifi_init_sta();

    // Start worker task - 16 KB needed: handle_display_update puts a
    // 1 KB MAX_DISPLAY_BUFFER_SIZE fb_data[] + 192 B segments[] on stack
    // before recursing into the SSD1306/SH1106 driver + I2C writes.
    // Pinned to DEVICESDK_WORKER_CORE (see the static assert near the top).
    xTaskCreatePinnedToCore(worker_task_entry, "worker", 16384, NULL, 4, NULL,
                            DEVICESDK_WORKER_CORE);

    // Start WebSocket task (higher priority)
    xTaskCreate(websocket_task, "websocket", 8192, NULL, 5, NULL);
}
