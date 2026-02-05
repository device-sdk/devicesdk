idf_component_register(SRCS "iotkit_main.c" "hal.c" "websocket_handler.c"
                       PRIV_REQUIRES esp_websocket_client json esp_driver_gpio esp_wifi nvs_flash esp_netif
                       INCLUDE_DIRS "")
