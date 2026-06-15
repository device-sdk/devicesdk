cmake_minimum_required(VERSION 3.13)

project(devicesdk-tests CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Fetch Google Test
include(FetchContent)
FetchContent_Declare(
    googletest
    GIT_REPOSITORY https://github.com/google/googletest.git
    GIT_TAG v1.14.0
)
# For Windows: Prevent overriding the parent project's compiler/linker settings
set(gtest_force_shared_crt ON CACHE BOOL "" FORCE)
FetchContent_MakeAvailable(googletest)

enable_testing()

# Source files to test (non-HAL dependencies)
set(TESTABLE_SOURCES
    ../src/utils/base64.cpp
    ../src/commands/i2c_command_handler.cpp
    ../src/commands/i2c_configure.cpp
    ../src/commands/i2c_scan.cpp
    ../src/commands/i2c_write.cpp
    ../src/commands/i2c_read.cpp
    ../src/commands/i2c_batch_write.cpp
    ../src/commands/display_update.cpp
)

# Mock sources
set(MOCK_SOURCES
    mocks/hal_mock.cpp
)

# Test sources
set(TEST_SOURCES
    unit/test_base64.cpp
    unit/test_i2c_configure.cpp
    unit/test_i2c_commands.cpp
    unit/test_display_update.cpp
    unit/test_ws_client.cpp
)

add_executable(run_tests
    ${TESTABLE_SOURCES}
    ${MOCK_SOURCES}
    ${TEST_SOURCES}
)

target_include_directories(run_tests PRIVATE
    ${CMAKE_CURRENT_SOURCE_DIR}/../
    ${CMAKE_CURRENT_SOURCE_DIR}/../src
    ${CMAKE_CURRENT_SOURCE_DIR}/../src/commands
    ${CMAKE_CURRENT_SOURCE_DIR}/../src/utils
    ${CMAKE_CURRENT_SOURCE_DIR}/../lib/picojson
    ${CMAKE_CURRENT_SOURCE_DIR}/mocks
)

# Define UNIT_TEST to enable mock implementations
target_compile_definitions(run_tests PRIVATE
    UNIT_TEST=1
)

target_link_libraries(run_tests
    gtest_main
    gmock
)

include(GoogleTest)
gtest_discover_tests(run_tests)
