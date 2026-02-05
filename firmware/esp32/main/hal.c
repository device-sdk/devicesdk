#include "hal.h"
#include "driver/gpio.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "esp_log.h"

static const char *TAG = "HAL";

#define ONBOARD_LED_PIN CONFIG_IOTKIT_LED_PIN

void iotkit_hal_init(void) {
    ESP_LOGI(TAG, "HAL initialized");
}

void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state) {
    gpio_config_t io_conf = {
        .pin_bit_mask = (1ULL << pin),
        .mode = GPIO_MODE_OUTPUT,
        .pull_down_en = GPIO_PULLDOWN_DISABLE,
        .pull_up_en = GPIO_PULLUP_DISABLE,
        .intr_type = GPIO_INTR_DISABLE,
    };
    
    gpio_config(&io_conf);
    gpio_set_level(pin, state == GPIO_STATE_HIGH ? 1 : 0);
    
    ESP_LOGI(TAG, "GPIO %d set to %s", pin, state == GPIO_STATE_HIGH ? "HIGH" : "LOW");
}

void iotkit_hal_blink_led(int count) {
    for (int i = 0; i < count; ++i) {
        iotkit_hal_set_gpio(ONBOARD_LED_PIN, GPIO_STATE_HIGH);
        vTaskDelay(100 / portTICK_PERIOD_MS);
        iotkit_hal_set_gpio(ONBOARD_LED_PIN, GPIO_STATE_LOW);
        vTaskDelay(100 / portTICK_PERIOD_MS);
    }
}
