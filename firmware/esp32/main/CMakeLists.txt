idf_component_register(SRCS "backoff.c" "devicesdk_main.c" "hal.c" "websocket_handler.c" "worker_task.c"
                            "base64.c" "shared_buffers.c" "display.c" "font5x7.c"
                            "onewire_dht.c" "sensor_utils.c"
                       PRIV_REQUIRES esp_websocket_client json esp_driver_gpio esp_wifi nvs_flash esp_netif
                                     esp_driver_ledc esp_adc esp_driver_i2c esp_timer
                                     driver esp_driver_spi esp_driver_uart espressif__onewire_bus
                       INCLUDE_DIRS "")

# Bake the firmware release version (from package.json) into the binary so the
# device can report it in the device_connected handshake. The version matches
# the CI release tag for this firmware.
file(READ "${CMAKE_CURRENT_LIST_DIR}/../package.json" DEVICESDK_PACKAGE_JSON)
if(DEVICESDK_PACKAGE_JSON MATCHES "\"version\"[[:space:]]*:[[:space:]]*\"([^\"]+)\"")
    set(DEVICESDK_FIRMWARE_VERSION "${CMAKE_MATCH_1}")
else()
    set(DEVICESDK_FIRMWARE_VERSION "0.0.0-dev")
endif()
target_compile_definitions(${COMPONENT_LIB} PRIVATE DEVICESDK_FIRMWARE_VERSION="${DEVICESDK_FIRMWARE_VERSION}")
