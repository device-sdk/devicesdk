#include "websocket_handler.h"
#include "hal.h"
#include "cJSON.h"
#include "esp_log.h"
#include <string.h>

static const char *TAG = "WebSocket Handler";

void handle_websocket_message(const char *message) {
    if (!message) {
        ESP_LOGE(TAG, "Null message received");
        return;
    }

    cJSON *json = cJSON_Parse(message);
    if (!json) {
        ESP_LOGE(TAG, "Failed to parse JSON: %s", message);
        return;
    }

    cJSON *type_obj = cJSON_GetObjectItem(json, "type");
    if (!cJSON_IsString(type_obj)) {
        ESP_LOGE(TAG, "Message missing 'type' field");
        cJSON_Delete(json);
        return;
    }

    const char *type = type_obj->valuestring;
    ESP_LOGI(TAG, "Received message type: %s", type);

    if (strcmp(type, "set_gpio_state") == 0) {
        cJSON *payload = cJSON_GetObjectItem(json, "payload");
        if (!cJSON_IsObject(payload)) {
            ESP_LOGE(TAG, "set_gpio_state missing payload");
            cJSON_Delete(json);
            return;
        }

        cJSON *pin_obj = cJSON_GetObjectItem(payload, "pin");
        cJSON *state_obj = cJSON_GetObjectItem(payload, "state");

        if (!cJSON_IsNumber(pin_obj) || !cJSON_IsString(state_obj)) {
            ESP_LOGE(TAG, "set_gpio_state invalid pin or state");
            cJSON_Delete(json);
            return;
        }

        uint8_t pin = (uint8_t)pin_obj->valuedouble;
        const char *state_str = state_obj->valuestring;
        gpio_state_t state = strcmp(state_str, "high") == 0 ? GPIO_STATE_HIGH : GPIO_STATE_LOW;

        iotkit_hal_set_gpio(pin, state);
        ESP_LOGI(TAG, "GPIO command executed: pin=%d, state=%s", pin, state_str);
    } else {
        ESP_LOGW(TAG, "Unknown message type: %s", type);
    }

    cJSON_Delete(json);
}
