#include "pico/cyw43_arch.h"
#include "pico/stdlib.h"
#include "pico/multicore.h"
#include "pico/util/queue.h"
#include "ws_client.h"
#include "websocket_handler.h"
#include "multicore/command_queue.h"
#include "multicore/response_queue.h"
#include "multicore/shared_buffers.h"
#include "multicore/core1_worker.h"
#include "hardware/watchdog.h"
#include "pico/rand.h"
#include "lwip/netif.h"
#include "lwip/ip4_addr.h"
#include "backoff.h"
#include <cstring>

// mbedTLS platform time function (required by MBEDTLS_PLATFORM_MS_TIME_ALT)
extern "C" {
#include "mbedtls/platform_time.h"
mbedtls_ms_time_t mbedtls_ms_time(void) {
    return (mbedtls_ms_time_t)to_ms_since_boot(get_absolute_time());
}
}

// Global queues for inter-core communication
queue_t g_command_queue;
queue_t g_response_queue;
queue_t g_gpio_notification_queue;

// Global WebSocket client pointer for sending responses
static WebsocketClient* g_client = nullptr;

void ws_send_response(const char* json) {
    if (g_client && g_client->is_connected()) {
        g_client->send_text(json);
    }
}

void send_gpio_state_notification(uint8_t pin, bool state) {
    char json[256];
    snprintf(json, sizeof(json),
        "{\"type\":\"gpio_state_changed\",\"payload\":{\"pin\":%d,\"state\":\"%s\"}}",
        pin, state ? "high" : "low");
    ws_send_response(json);
}

// Process responses from Core 1 and send via WebSocket
static void process_worker_responses() {
    worker_response_t resp;

    while (queue_try_remove(&g_response_queue, &resp)) {
        picojson::object response;
        picojson::object payload;

        // Set message ID if present
        std::string msg_id = resp.message_id;

        if (resp.status == RESPONSE_ERROR) {
            response["type"] = picojson::value("command_error");
            payload["error"] = picojson::value(resp.error_msg);
        } else {
            switch (resp.original_cmd) {
                case CMD_GPIO_SET: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("set_gpio_state");
                    payload["pin"] = picojson::value((double)resp.data.gpio.pin);
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_GPIO_GET_DIGITAL: {
                    response["type"] = picojson::value("pin_state_update");
                    payload["pin"] = picojson::value((double)resp.data.gpio.pin);
                    payload["mode"] = picojson::value("digital");
                    payload["value"] = picojson::value(resp.data.gpio.digital_value ? "high" : "low");
                    break;
                }
                case CMD_GPIO_GET_ANALOG: {
                    response["type"] = picojson::value("pin_state_update");
                    payload["pin"] = picojson::value((double)resp.data.gpio.pin);
                    payload["mode"] = picojson::value("analog");
                    payload["value"] = picojson::value((double)resp.data.gpio.analog_value);
                    break;
                }
                case CMD_GPIO_CONFIGURE_INPUT: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("configure_gpio_input_monitoring");
                    payload["pin"] = picojson::value((double)resp.data.gpio.pin);
                    payload["status"] = picojson::value("monitoring_enabled");
                    break;
                }
                case CMD_PWM_SET: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("set_pwm_state");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_I2C_CONFIGURE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("i2c_configure");
                    payload["bus"] = picojson::value((double)resp.data.i2c_configure.bus);
                    payload["sda_pin"] = picojson::value((double)resp.data.i2c_configure.sda_pin);
                    payload["scl_pin"] = picojson::value((double)resp.data.i2c_configure.scl_pin);
                    payload["frequency"] = picojson::value((double)resp.data.i2c_configure.frequency);
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_I2C_SCAN: {
                    // Contract (responses.ts I2cScanResult): { bus, addresses_found: string[] }
                    response["type"] = picojson::value("i2c_scan_result");
                    payload["bus"] = picojson::value((double)resp.data.i2c_scan.bus);
                    picojson::array addresses_found;
                    for (uint8_t i = 0; i < resp.data.i2c_scan.count; i++) {
                        char addr[8];
                        snprintf(addr, sizeof(addr), "0x%02X", resp.data.i2c_scan.addresses[i]);
                        addresses_found.push_back(picojson::value(addr));
                    }
                    payload["addresses_found"] = picojson::value(addresses_found);
                    break;
                }
                case CMD_I2C_WRITE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("i2c_write");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_I2C_READ: {
                    // Contract (responses.ts I2cReadResult): { bus, address, data: string[] }
                    // of hex bytes — matching i2c_scan / spi / uart read results.
                    response["type"] = picojson::value("i2c_read_result");
                    payload["bus"] = picojson::value((double)resp.data.i2c_read.bus);
                    char addr[8];
                    snprintf(addr, sizeof(addr), "0x%02X", resp.data.i2c_read.address);
                    payload["address"] = picojson::value(addr);
                    picojson::array data_arr;
                    for (size_t i = 0; i < resp.data.i2c_read.data_len; i++) {
                        char hex[8];
                        snprintf(hex, sizeof(hex), "0x%02X", resp.data.i2c_read.data[i]);
                        data_arr.push_back(picojson::value(hex));
                    }
                    payload["data"] = picojson::value(data_arr);
                    break;
                }
                case CMD_GET_TEMPERATURE: {
                    response["type"] = picojson::value("temperature_result");
                    payload["celsius"] = picojson::value((double)resp.data.temperature.celsius);
                    break;
                }
                case CMD_ONEWIRE_SEARCH: {
                    response["type"] = picojson::value("onewire_search_result");
                    payload["pin"] = picojson::value((double)resp.data.onewire_search.pin);
                    picojson::array roms;
                    for (uint8_t i = 0; i < resp.data.onewire_search.count && i < MAX_ONEWIRE_ROMS; i++) {
                        char rom_hex[ONEWIRE_ROM_LEN * 2 + 1] = {0};
                        for (int b = 0; b < ONEWIRE_ROM_LEN; b++) {
                            snprintf(&rom_hex[b * 2], 3, "%02X", resp.data.onewire_search.roms[i][b]);
                        }
                        roms.push_back(picojson::value(rom_hex));
                    }
                    payload["roms"] = picojson::value(roms);
                    break;
                }
                case CMD_ONEWIRE_READ_TEMP: {
                    response["type"] = picojson::value("onewire_temp_result");
                    payload["pin"] = picojson::value((double)resp.data.onewire_temp.pin);
                    // Skip ROM reads report an empty rom, per responses.ts.
                    char rom_hex[ONEWIRE_ROM_LEN * 2 + 1] = {0};
                    if (resp.data.onewire_temp.has_rom) {
                        for (int b = 0; b < ONEWIRE_ROM_LEN; b++) {
                            snprintf(&rom_hex[b * 2], 3, "%02X", resp.data.onewire_temp.rom[b]);
                        }
                    }
                    payload["rom"] = picojson::value(rom_hex);
                    payload["celsius"] = picojson::value((double)resp.data.onewire_temp.celsius);
                    break;
                }
                case CMD_DHT_READ: {
                    response["type"] = picojson::value("dht_read_result");
                    payload["pin"] = picojson::value((double)resp.data.dht.pin);
                    payload["celsius"] = picojson::value((double)resp.data.dht.celsius);
                    payload["humidity_pct"] = picojson::value((double)resp.data.dht.humidity_pct);
                    break;
                }
                case CMD_WATCHDOG_CONFIGURE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("watchdog_configure");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_WATCHDOG_FEED: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("watchdog_feed");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_SPI_CONFIGURE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("spi_configure");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_SPI_TRANSFER: {
                    response["type"] = picojson::value("spi_transfer_result");
                    picojson::array data_arr;
                    for (size_t i = 0; i < resp.data.spi.data_len; i++) {
                        char hex[8];
                        snprintf(hex, sizeof(hex), "0x%02X", resp.data.spi.data[i]);
                        data_arr.push_back(picojson::value(hex));
                    }
                    payload["data"] = picojson::value(data_arr);
                    payload["length"] = picojson::value((double)resp.data.spi.data_len);
                    break;
                }
                case CMD_SPI_WRITE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("spi_write");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_SPI_READ: {
                    response["type"] = picojson::value("spi_read_result");
                    picojson::array data_arr;
                    for (size_t i = 0; i < resp.data.spi.data_len; i++) {
                        char hex[8];
                        snprintf(hex, sizeof(hex), "0x%02X", resp.data.spi.data[i]);
                        data_arr.push_back(picojson::value(hex));
                    }
                    payload["data"] = picojson::value(data_arr);
                    payload["length"] = picojson::value((double)resp.data.spi.data_len);
                    break;
                }
                case CMD_UART_CONFIGURE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("uart_configure");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_UART_WRITE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("uart_write");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_UART_READ: {
                    response["type"] = picojson::value("uart_read_result");
                    picojson::array data_arr;
                    for (size_t i = 0; i < resp.data.uart_read.data_len; i++) {
                        char hex[8];
                        snprintf(hex, sizeof(hex), "0x%02X", resp.data.uart_read.data[i]);
                        data_arr.push_back(picojson::value(hex));
                    }
                    payload["data"] = picojson::value(data_arr);
                    payload["bytes_read"] = picojson::value((double)resp.data.uart_read.data_len);
                    break;
                }
                case CMD_PIO_WS2812_CONFIGURE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("pio_ws2812_configure");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_PIO_WS2812_UPDATE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("pio_ws2812_update");
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_DISPLAY_UPDATE: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("display_update");
                    payload["controller"] = picojson::value(resp.data.display.controller ? resp.data.display.controller : "ssd1306");
                    payload["width"] = picojson::value((double)resp.data.display.width);
                    payload["height"] = picojson::value((double)resp.data.display.height);
                    payload["segments_count"] = picojson::value((double)resp.data.display.segments_count);
                    payload["bytes_written"] = picojson::value((double)resp.data.display.bytes_written);
                    payload["status"] = picojson::value("success");
                    break;
                }
                case CMD_REBOOT: {
                    response["type"] = picojson::value("command_ack");
                    payload["command"] = picojson::value("reboot");
                    payload["status"] = picojson::value("rebooting");
                    break;
                }
                default: {
                    response["type"] = picojson::value("command_ack");
                    payload["status"] = picojson::value("success");
                    break;
                }
            }
        }

        response["payload"] = picojson::value(payload);
        if (!msg_id.empty()) {
            response["id"] = picojson::value(msg_id);
        }

        std::string json = picojson::value(response).serialize();
        ws_send_response(json.c_str());

        // Handle reboot after sending response
        if (resp.original_cmd == CMD_REBOOT && resp.status == RESPONSE_SUCCESS) {
            sleep_ms(100);  // Give time to send the response
            watchdog_reboot(0, 0, 0);
        }
    }
}

// Process GPIO notifications from Core 1
static void process_gpio_notifications() {
    gpio_notification_t notification;

    while (queue_try_remove(&g_gpio_notification_queue, &notification)) {
        send_gpio_state_notification(notification.pin, notification.state);
    }
}

// WIFI Credentials - taken from environment variables
const char WIFI_SSID[] = DEVICESDK_WIFI_SSID;
const char WIFI_PASSWORD[] = DEVICESDK_WIFI_PASSWORD;
const char WEBSOCKET_TOKEN[] = DEVICESDK_API_TOKEN;
const char API_HOST[] = DEVICESDK_API_HOST;
const char PROJECT_ID[] = DEVICESDK_PROJECT_ID;
const char DEVICE_ID[] = DEVICESDK_DEVICE_ID;
static char device_id[sizeof(DEVICE_ID)];

static void sanitize_credential(const char* src, size_t src_len, char* dest, size_t dest_size) {
    size_t out = 0;
    for (size_t i = 0; i < src_len && (out + 1) < dest_size; ++i) {
        if (src[i] != '\0') {
            dest[out++] = src[i];
        }
    }
    dest[out] = '\0';
}

void blink(int count) {
    for (int i = 0; i < count; ++i) {
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 1);
        sleep_ms(100);
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, 0);
        sleep_ms(100);
    }
}

// Build a DHCP hostname from the patched device slug. Sanitize defensively and
// cap the length so the router's client list shows a readable name.
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

int main() {
    stdio_init_all();

    if (cyw43_arch_init()) {
        // Can't blink on error - CYW43 not initialized
        while(1) { sleep_ms(1000); } // Halt
    }

    blink(1); // 1. Boot blink (CYW43 must be initialized first for LED control)

    cyw43_arch_enable_sta_mode();

    char wifi_ssid[sizeof(WIFI_SSID)] = {};
    char wifi_password[sizeof(WIFI_PASSWORD)] = {};
    char api_host[sizeof(API_HOST)] = {};
    char project_id[sizeof(PROJECT_ID)] = {};
    sanitize_credential(WIFI_SSID, sizeof(WIFI_SSID), wifi_ssid, sizeof(wifi_ssid));
    sanitize_credential(WIFI_PASSWORD, sizeof(WIFI_PASSWORD), wifi_password, sizeof(wifi_password));
    sanitize_credential(API_HOST, sizeof(API_HOST), api_host, sizeof(api_host));
    sanitize_credential(PROJECT_ID, sizeof(PROJECT_ID), project_id, sizeof(project_id));
    sanitize_credential(DEVICE_ID, sizeof(DEVICE_ID), device_id, sizeof(device_id));

    // Advertise a DHCP hostname from the patched device slug so the router's
    // client list shows a readable name instead of the generic default.
    // lwIP's netif_set_hostname only stores the pointer, so keep the buffer
    // alive for the program lifetime (main's stack frame never returns).
    char dhcp_hostname[32];
    build_dhcp_hostname(dhcp_hostname, sizeof(dhcp_hostname));
    cyw43_arch_lwip_begin();
    netif_set_hostname(&cyw43_state.netif[0], dhcp_hostname);
    cyw43_arch_lwip_end();
    printf("[Main] DHCP hostname: %s\n", dhcp_hostname);

    if (cyw43_arch_wifi_connect_timeout_ms(wifi_ssid, wifi_password, CYW43_AUTH_WPA2_AES_PSK, 30000)) {
        return 1;
    } else {
        blink(2); // 2. Wi-Fi connected blink
        int32_t rssi = 0;
        cyw43_wifi_get_rssi(&cyw43_state, &rssi);
        printf("[Main] connected to %s, IP %s, RSSI %d dBm\n",
               wifi_ssid, ip4addr_ntoa(netif_ip4_addr(&cyw43_state.netif[0])), rssi);
    }

    // Initialize inter-core queues BEFORE launching Core 1
    queue_init(&g_command_queue, sizeof(worker_command_t), 8);
    queue_init(&g_response_queue, sizeof(worker_response_t), 16);
    queue_init(&g_gpio_notification_queue, sizeof(gpio_notification_t), 32);

    // Initialize shared buffers
    shared_buffers_init();

    // Initialize Core 1 worker state
    core1_worker_init();

    // Launch Core 1 worker
    multicore_launch_core1(core1_entry);

    WebsocketClient client;
    g_client = &client;

    bool initial_message_sent = false;
    bool was_connected = false;
    bool rate_limit_logged = false;
    uint32_t last_ping_time = 0;
    uint32_t last_reconnect_attempt = 0;
    uint32_t wifi_retry_count = 0;
    uint32_t last_wifi_reconnect_at = 0;

    websocket_handler_init(ws_send_response, nullptr);

    char ws_path[256];
    snprintf(ws_path, sizeof(ws_path), "/v1/projects/%s/devices/%s/connect/websocket", project_id, device_id);
    client.connect(api_host, ws_path, WEBSOCKET_TOKEN);
    last_reconnect_attempt = to_ms_since_boot(get_absolute_time());

    while (true) {
        // WiFi link monitoring with exponential backoff reconnect. The initial
        // connect above is synchronous; this handles the link dropping later.
        int link_status = cyw43_wifi_link_status(&cyw43_state, CYW43_ITF_STA);
        if (link_status == CYW43_LINK_UP) {
            wifi_retry_count = 0;
            last_wifi_reconnect_at = 0;
        } else if (link_status == CYW43_LINK_DOWN || link_status == CYW43_LINK_FAIL ||
                   link_status == CYW43_LINK_BADAUTH || link_status == CYW43_LINK_NONET) {
            uint32_t now = to_ms_since_boot(get_absolute_time());
            if (last_wifi_reconnect_at == 0) {
                last_wifi_reconnect_at = now;  // mark when the link was first seen down
            }
            uint32_t down_ms = now - last_wifi_reconnect_at;
            uint32_t delay_ms = wifi_backoff_delay_ms(wifi_retry_count, get_rand_32());
            if (down_ms >= delay_ms) {
                printf("[Main] wifi link lost (status=%d), retrying after %lu ms down (attempt %lu)\n",
                       link_status, (unsigned long)down_ms, (unsigned long)wifi_retry_count);
                last_wifi_reconnect_at = now;
                cyw43_arch_wifi_connect_timeout_ms(wifi_ssid, wifi_password, CYW43_AUTH_WPA2_AES_PSK, 5000);
                wifi_retry_count++;
            }
        }
        // CYW43_LINK_JOIN / CYW43_LINK_NOIP: association or DHCP in progress; wait.
        cyw43_arch_poll();
        client.poll(); // Poll for WebSocket events

        // Process responses from Core 1
        process_worker_responses();

        // Process GPIO notifications from Core 1
        process_gpio_notifications();

        uint32_t now = to_ms_since_boot(get_absolute_time());

        if (client.is_connected()) {
            was_connected = true;

            if (!initial_message_sent) {
                blink(3); // 3. WebSocket connected blink
                char conn_msg[160];
                snprintf(conn_msg, sizeof(conn_msg),
                    "{\"type\":\"device_connected\",\"payload\":{\"firmware_version\":\"%s\",\"device_type\":\"%s\"}}",
                    DEVICESDK_FIRMWARE_VERSION, DEVICESDK_DEVICE_TYPE);
                client.send_text(conn_msg);
                initial_message_sent = true;
                last_ping_time = now;
            }

            if (now - last_ping_time > 60000) {
                client.send_text("{\"type\": \"ping\"}");
                last_ping_time = now;
            }
        } else {
            // Connection lost or not yet established
            if (was_connected) {
                was_connected = false;
                last_reconnect_attempt = now;
            }

            initial_message_sent = false;

            // Determine reconnect delay: use rate limit retry_after if set, otherwise default 5s
            uint32_t reconnect_delay_ms = 5000;
            if (client.rate_limit_retry_after_ms > 0) {
                reconnect_delay_ms = client.rate_limit_retry_after_ms;
                if (!rate_limit_logged) {
                    printf("[Main] Rate limited (close code %u): waiting %u ms before reconnect\n",
                           client.last_close_code, reconnect_delay_ms);
                    rate_limit_logged = true;
                }
            }

            if (cyw43_wifi_link_status(&cyw43_state, CYW43_ITF_STA) == CYW43_LINK_UP &&
                now - last_reconnect_attempt >= reconnect_delay_ms) {
                // Reset rate limit state before reconnecting
                client.rate_limit_retry_after_ms = 0;
                client.last_close_code = 0;
                rate_limit_logged = false;

                client.close_connection();
                client.connect(api_host, ws_path, WEBSOCKET_TOKEN);
                last_reconnect_attempt = now;

                // Blink twice to indicate reconnection attempt
                blink(2);
            }
        }

        sleep_ms(1);
    }
}
