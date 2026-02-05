#include <stdio.h>
#include <string.h>
#include "sdkconfig.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "freertos/event_groups.h"
#include "esp_system.h"
#include "esp_wifi.h"
#include "esp_event.h"
#include "esp_log.h"
#include "nvs_flash.h"
#include "esp_websocket_client.h"

#include "hal.h"
#include "config.h"
#include "websocket_handler.h"

static const char *TAG = "IoTKit";

static EventGroupHandle_t wifi_event_group;
static const int WIFI_CONNECTED_BIT = BIT0;
static const int WIFI_FAIL_BIT = BIT1;

static esp_websocket_client_handle_t ws_client = NULL;
static uint32_t last_ping_time = 0;
static bool ws_connected = false;

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
            .ssid = IOTKIT_WIFI_SSID,
            .password = IOTKIT_WIFI_PASSWORD,
            .threshold.authmode = WIFI_AUTH_WPA2_PSK,
        },
    };
    ESP_ERROR_CHECK(esp_wifi_set_mode(WIFI_MODE_STA) );
    ESP_ERROR_CHECK(esp_wifi_set_config(WIFI_IF_STA, &wifi_config) );
    ESP_ERROR_CHECK(esp_wifi_start() );

    ESP_LOGI(TAG, "wifi_init_sta finished.");

    EventBits_t bits = xEventGroupWaitBits(wifi_event_group,
            WIFI_CONNECTED_BIT | WIFI_FAIL_BIT,
            pdFALSE,
            pdFALSE,
            30000 / portTICK_PERIOD_MS);

    if (bits & WIFI_CONNECTED_BIT) {
        ESP_LOGI(TAG, "connected to ap SSID:%s", IOTKIT_WIFI_SSID);
        iotkit_hal_blink_led(2);
    } else if (bits & WIFI_FAIL_BIT) {
        ESP_LOGI(TAG, "Failed to connect to SSID:%s", IOTKIT_WIFI_SSID);
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
                char msg[] = "{\"type\": \"device connect\"}";
                esp_websocket_client_send_text(ws_client, msg, strlen(msg), portMAX_DELAY);
                ESP_LOGI(TAG, "Sent device connect message");
            }
            last_ping_time = xTaskGetTickCount() * portTICK_PERIOD_MS;
            break;
        case WEBSOCKET_EVENT_DISCONNECTED:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_DISCONNECTED");
            ws_connected = false;
            break;
        case WEBSOCKET_EVENT_DATA:
            ESP_LOGI(TAG, "WEBSOCKET_EVENT_DATA");
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

    char uri[256];
    char auth_header[256];
    snprintf(uri, sizeof(uri), "ws://%s:%d%s", IOTKIT_SERVER_HOST, IOTKIT_SERVER_PORT, IOTKIT_SERVER_PATH);
    snprintf(auth_header, sizeof(auth_header), "Authorization: Bearer %s\r\n", IOTKIT_API_TOKEN);

    esp_websocket_client_config_t websocket_cfg = {
        .uri = uri,
        .headers = auth_header,
    };

    ws_client = esp_websocket_client_init(&websocket_cfg);
    esp_websocket_register_events(ws_client, WEBSOCKET_EVENT_ANY, websocket_event_handler, NULL);
    esp_websocket_client_start(ws_client);

    while (1) {
        vTaskDelay(1000 / portTICK_PERIOD_MS);

        if (ws_connected) {
            uint32_t now = xTaskGetTickCount() * portTICK_PERIOD_MS;
            if (now - last_ping_time > IOTKIT_PING_INTERVAL_MS) {
                char ping_msg[] = "{\"type\": \"ping\"}";
                esp_websocket_client_send_text(ws_client, ping_msg, strlen(ping_msg), portMAX_DELAY);
                ESP_LOGI(TAG, "Sent ping message");
                last_ping_time = now;
            }
        }
    }
}

void app_main(void) {
    ESP_LOGI(TAG, "Starting IoTKit Client");

    esp_err_t ret = nvs_flash_init();
    if (ret == ESP_ERR_NVS_NO_FREE_PAGES || ret == ESP_ERR_NVS_NEW_VERSION_FOUND) {
        ESP_ERROR_CHECK(nvs_flash_erase());
        ret = nvs_flash_init();
    }
    ESP_ERROR_CHECK(ret);

    iotkit_hal_init();
    iotkit_hal_blink_led(1);

    wifi_init_sta();

    xTaskCreate(&websocket_task, "websocket_task", 4096, NULL, 5, NULL);
}
