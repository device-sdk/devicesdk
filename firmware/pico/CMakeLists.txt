# Generated Cmake Pico project file

cmake_minimum_required(VERSION 3.13)

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_EXPORT_COMPILE_COMMANDS ON)

# Initialise pico_sdk from installed location
# (note this can come from environment, CMake cache etc)

# == DO NOT EDIT THE FOLLOWING LINES for the Raspberry Pi Pico VS Code Extension to work ==
if(WIN32)
    set(USERHOME $ENV{USERPROFILE})
else()
    set(USERHOME $ENV{HOME})
endif()
set(sdkVersion 2.1.1)
set(toolchainVersion 14_2_Rel1)
set(picotoolVersion 2.1.1)
set(picoVscode ${USERHOME}/.pico-sdk/cmake/pico-vscode.cmake)
if (EXISTS ${picoVscode})
    include(${picoVscode})
endif()
# ====================================================================================
if(DEFINED ENV{IOTKIT_BOARD})
    set(PICO_BOARD "$ENV{IOTKIT_BOARD}" CACHE STRING "Board type")
    message(STATUS "Using IOTKIT_BOARD from environment: $ENV{IOTKIT_BOARD}")
else()
    set(PICO_BOARD pico2_w CACHE STRING "Board type")
    message(STATUS "IOTKIT_BOARD not set, defaulting to pico2_w.")
endif()

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(devicesdk-client C CXX ASM)

set(PICO_CXX_ENABLE_EXCEPTIONS 1)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Add executable.
add_executable(devicesdk-client
        main.cpp
        lib/lwip_ws/ws_client.cpp
        src/websocket_handler.cpp
        src/hal.cpp
        src/utils/base64.cpp
        src/multicore/shared_buffers.cpp
        src/multicore/core1_worker.cpp
        src/commands/i2c_command_handler.cpp
        src/commands/i2c_batch_write.cpp
)

# Pass credentials to the code
target_compile_definitions(devicesdk-client PRIVATE
    IOTKIT_WIFI_SSID="8d477eda147344f8b9b8d3e3bef7505b"
    IOTKIT_WIFI_PASSWORD="ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8"
    IOTKIT_API_TOKEN="e343ecb8036442e093a47718463c1716"
    IOTKIT_API_HOST="3ed66c2c3ed1474382278f70ba01dc4c"
    DEVICESDK_PROJECT_ID="288f2d2493094af68ab37a96ef73a118"
    DEVICESDK_DEVICE_ID="d09f91a7729141eb8911d7a0f1e1595f"
)

# LwIP configuration
target_compile_definitions(devicesdk-client PRIVATE
    NO_SYS=1
    LWIP_SOCKET=0
    LWIP_NETCONN=0
)

pico_set_program_name(devicesdk-client "devicesdk-client")
pico_set_program_version(devicesdk-client "0.1")

# Enable exceptions


# Modify the below lines to enable/disable output over UART/USB
pico_enable_stdio_uart(devicesdk-client 0)
pico_enable_stdio_usb(devicesdk-client 1)

# Add the standard library to the build
target_link_libraries(devicesdk-client
        pico_stdlib
)

# Add the standard include files to the build
target_include_directories(devicesdk-client PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}
        ${CMAKE_CURRENT_LIST_DIR}/lib/lwip_ws
        ${CMAKE_CURRENT_LIST_DIR}/lib/picojson
        ${CMAKE_CURRENT_LIST_DIR}/src
        ${CMAKE_CURRENT_LIST_DIR}/src/commands
        ${CMAKE_CURRENT_LIST_DIR}/src/utils
        ${CMAKE_CURRENT_LIST_DIR}/src/multicore
)

# Add any user requested libraries
target_link_libraries(devicesdk-client
        pico_cyw43_arch_lwip_threadsafe_background
        pico_multicore
        pico_rand
        pico_lwip
        hardware_pwm
        hardware_adc
        hardware_i2c
        hardware_watchdog
        hardware_spi
        hardware_uart
        hardware_pio
        pico_lwip_mbedtls
        pico_mbedtls
)

# Set the Wi-Fi country code
add_compile_definitions(CYW43_COUNTRY_PT)

pico_generate_pio_header(devicesdk-client ${CMAKE_CURRENT_LIST_DIR}/src/ws2812.pio)

pico_add_extra_outputs(devicesdk-client)
