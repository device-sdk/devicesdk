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
set(PICO_BOARD pico2_w CACHE STRING "Board type")

# Pull in Raspberry Pi Pico SDK (must be before project)
include(pico_sdk_import.cmake)

project(iotkit-client C CXX ASM)

set(PICO_CXX_ENABLE_EXCEPTIONS 1)

# Initialise the Raspberry Pi Pico SDK
pico_sdk_init()

# Check for environment variables, with defaults
if(DEFINED ENV{IOTKIT_WIFI_SSID})
    set(WIFI_SSID "$ENV{IOTKIT_WIFI_SSID}")
    message(STATUS "Using IOTKIT_WIFI_SSID from environment.")
else()
    set(WIFI_SSID "Caravela")
    message(STATUS "Using default IOTKIT_WIFI_SSID 'Caravela'.")
endif()

if(DEFINED ENV{IOTKIT_WIFI_PASSWORD})
    set(WIFI_PASSWORD "$ENV{IOTKIT_WIFI_PASSWORD}")
    message(STATUS "Using IOTKIT_WIFI_PASSWORD from environment.")
else()
    set(WIFI_PASSWORD "12345679")
    message(STATUS "Using default IOTKIT_WIFI_PASSWORD.")
endif()

if(DEFINED ENV{IOTKIT_API_TOKEN})
    set(API_TOKEN "$ENV{IOTKIT_API_TOKEN}")
    message(STATUS "Using IOTKIT_API_TOKEN from environment.")
else()
    set(API_TOKEN "30a1e5ed66c4439ebff0cab8cf4b71b0")
    message(STATUS "Using default IOTKIT_API_TOKEN.")
endif()

# Add executable.
add_executable(iotkit-client
        main.cpp
        lib/lwip_ws/ws_client.cpp
        src/websocket_handler.cpp
        src/hal.cpp
)

# Pass credentials to the code
target_compile_definitions(iotkit-client PRIVATE
    IOTKIT_WIFI_SSID="${WIFI_SSID}"
    IOTKIT_WIFI_PASSWORD="${WIFI_PASSWORD}"
    IOTKIT_API_TOKEN="${API_TOKEN}"
)

# LwIP configuration
target_compile_definitions(iotkit-client PRIVATE
    NO_SYS=1
    LWIP_SOCKET=0
    LWIP_NETCONN=0
)

pico_set_program_name(iotkit-client "iotkit-client")
pico_set_program_version(iotkit-client "0.1")

# Enable exceptions


# Modify the below lines to enable/disable output over UART/USB
pico_enable_stdio_uart(iotkit-client 0)
pico_enable_stdio_usb(iotkit-client 1)

# Add the standard library to the build
target_link_libraries(iotkit-client
        pico_stdlib
)

# Add the standard include files to the build
target_include_directories(iotkit-client PRIVATE
        ${CMAKE_CURRENT_LIST_DIR}
        ${CMAKE_CURRENT_LIST_DIR}/lib/lwip_ws
        ${CMAKE_CURRENT_LIST_DIR}/lib/picojson
        ${CMAKE_CURRENT_LIST_DIR}/src
)

# Add any user requested libraries
target_link_libraries(iotkit-client
        pico_cyw43_arch_lwip_threadsafe_background
        pico_rand
        pico_lwip
)

# Set the Wi-Fi country code
add_compile_definitions(CYW43_COUNTRY_PT)

pico_add_extra_outputs(iotkit-client)