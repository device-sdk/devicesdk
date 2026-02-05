#include "pico/cyw43_arch.h"
#include "pico/stdlib.h"
#include "ws_client.h"
#include "websocket_handler.h"

// WIFI Credentials - taken from environment variables
const char WIFI_SSID[] = IOTKIT_WIFI_SSID;
const char WIFI_PASSWORD[] = IOTKIT_WIFI_PASSWORD;
const char WEBSOCKET_TOKEN[] = IOTKIT_API_TOKEN;

void blink(int count) {
    for (int i = 0; i < count; ++i) {
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 1);
        sleep_ms(100);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 0);
        sleep_ms(100);
    }
}

int main() {
    stdio_init_all();

    if (cyw43_arch_init()) {
        printf("Wi-Fi init failed");
        return -1;
    }

    blink(1); // 1. Boot blink

    cyw43_arch_enable_sta_mode();

    printf("Connecting to Wi-Fi...\n");
    if (cyw43_arch_wifi_connect_timeout_ms(WIFI_SSID, WIFI_PASSWORD, CYW43_AUTH_WPA2_AES_PSK, 30000)) {
        printf("failed to connect.\n");
        return 1;
    } else {
        printf("Connected.\n");
        blink(2); // 2. Wi-Fi connected blink
    }

    WebsocketClient client;
    client.connect("api.iotkit.dev", 80, "/v1/projects/1/devices/2/connect/websocket", WEBSOCKET_TOKEN);

    bool initial_message_sent = false;
    uint32_t last_ping_time = 0;

    while (true) {
        cyw43_arch_poll();
        client.poll(); // Poll for WebSocket events

        if (client.is_connected()) {
            if (!initial_message_sent) {
                blink(3); // 3. WebSocket connected blink
                client.send_text("{\"type\": \"device connect\"}");
                initial_message_sent = true;
                last_ping_time = to_ms_since_boot(get_absolute_time());
            }

            uint32_t now = to_ms_since_boot(get_absolute_time());

            if (now - last_ping_time > 60000) {
                client.send_text("{\"type\": \"ping\"}");
                last_ping_time = now;
            }
        } else {
            initial_message_sent = false;
        }
        
        sleep_ms(1);
    }
}
