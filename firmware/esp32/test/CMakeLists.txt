cmake_minimum_required(VERSION 3.13)

project(devicesdk-esp32-tests CXX C)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_C_STANDARD 11)
set(CMAKE_C_STANDARD_REQUIRED ON)

# Fetch Google Test
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

# Fetch cJSON (needed for websocket_handler.c)
FetchContent_Declare(
    cjson
    GIT_REPOSITORY https://github.com/DaveGamble/cJSON.git
    GIT_TAG v1.7.18
)
FetchContent_MakeAvailable(cjson)

enable_testing()

# Source files to test
set(TESTABLE_SOURCES
    ../main/base64.c
    ../main/worker_task.c
    ../main/websocket_handler.c
    ../main/shared_buffers.c
)

# Mock sources
set(MOCK_SOURCES
    mocks/hal_mock.c
)

# Test sources (C++ for gtest)
set(TEST_SOURCES
    unit/test_base64.cpp
    unit/test_worker_commands.cpp
    unit/test_websocket_handler.cpp
)

add_executable(run_tests
    ${TESTABLE_SOURCES}
    ${MOCK_SOURCES}
    ${TEST_SOURCES}
)

target_include_directories(run_tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../main
    ${CMAKE_CURRENT_SOURCE_DIR}/mocks
    ${cjson_SOURCE_DIR}
)

# Define UNIT_TEST to enable mock implementations
target_compile_definitions(run_tests PRIVATE
    UNIT_TEST=1
)

target_link_libraries(run_tests
    gtest_main
    gmock
    cjson
)

include(GoogleTest)
gtest_discover_tests(run_tests)
