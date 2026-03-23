idf_component_register(SRCS "iotkit_main.c" "hal.c" "websocket_handler.c" "worker_task.c"
                            "base64.c" "shared_buffers.c" "display.c"
                       PRIV_REQUIRES esp_websocket_client json esp_driver_gpio esp_wifi nvs_flash esp_netif
                                     esp_driver_ledc esp_adc esp_driver_i2c esp_timer
                                     driver esp_driver_spi esp_driver_uart
                       INCLUDE_DIRS "")
