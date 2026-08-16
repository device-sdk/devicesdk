# Regression check for the firmware version-extraction regex.
#
# The firmware CMakeLists.txt files read "version" out of package.json and bake
# it into the binary so devices report it in the device_connected handshake.
# CMake's regex engine does NOT support POSIX character classes such as
# [[:space:]] (or \s), so a previous version of the extraction silently fell
# back to "0.0.0-dev" in every build (see firmware/esp32/main/CMakeLists.txt
# and firmware/pico/CMakeLists.txt). In quoted arguments CMake converts \t, \r,
# and \n into real control characters, so whitespace must be spelled as
# [ \t\r\n] - a class holding a literal space, tab, CR, and LF.
#
# This script re-runs the exact build regex against package.json and compares
# the result against an independent manual parse of the same file. It needs
# only CMake (no ESP-IDF, no Pico SDK, no hardware) and fails loudly if the
# extraction no longer yields the real package version.
#
# Usage (from a firmware directory containing package.json):
#   cmake -DPACKAGE_JSON=package.json -P ../scripts/check_version.cmake
#
# Note: script mode defaults to new policies, so `while(TRUE)` is not reliable
# here; loops use an explicit exit flag instead.

if(NOT DEFINED PACKAGE_JSON)
    message(FATAL_ERROR "check_version.cmake requires -DPACKAGE_JSON=<path>")
endif()

file(READ "${PACKAGE_JSON}" DEVICESDK_PACKAGE_JSON)
string(LENGTH "${DEVICESDK_PACKAGE_JSON}" json_len)

# --- Independent ground truth: manual scan, no regex ----------------------------
# Locate the "version" key, then skip any mix of whitespace (space, tab, CR, LF)
# around the ':' and read the quoted value. In quoted arguments CMake converts
# \t, \r, and \n into real control characters, so the escapes below compare
# directly against the characters scanned out of package.json.

string(FIND "${DEVICESDK_PACKAGE_JSON}" "\"version\"" parse_pos)
if(parse_pos EQUAL -1)
    message(FATAL_ERROR "package.json has no \"version\" key")
endif()
math(EXPR parse_pos "${parse_pos} + 9")

set(done 0)
while(NOT done)
    if(parse_pos GREATER_EQUAL json_len)
        break()
    endif()
    string(SUBSTRING "${DEVICESDK_PACKAGE_JSON}" ${parse_pos} 1 c)
    if(c STREQUAL " " OR c STREQUAL "\t" OR c STREQUAL "\r" OR c STREQUAL "\n")
        math(EXPR parse_pos "${parse_pos} + 1")
    else()
        set(done 1)
    endif()
endwhile()

string(SUBSTRING "${DEVICESDK_PACKAGE_JSON}" ${parse_pos} 1 c)
if(NOT c STREQUAL ":")
    message(FATAL_ERROR "expected ':' after the \"version\" key in ${PACKAGE_JSON}")
endif()
math(EXPR parse_pos "${parse_pos} + 1")

set(done 0)
while(NOT done)
    if(parse_pos GREATER_EQUAL json_len)
        break()
    endif()
    string(SUBSTRING "${DEVICESDK_PACKAGE_JSON}" ${parse_pos} 1 c)
    if(c STREQUAL " " OR c STREQUAL "\t" OR c STREQUAL "\r" OR c STREQUAL "\n")
        math(EXPR parse_pos "${parse_pos} + 1")
    else()
        set(done 1)
    endif()
endwhile()

string(SUBSTRING "${DEVICESDK_PACKAGE_JSON}" ${parse_pos} 1 c)
if(NOT c STREQUAL "\"")
    message(FATAL_ERROR "expected a quoted value after the \":\" in ${PACKAGE_JSON}")
endif()
math(EXPR parse_pos "${parse_pos} + 1")

set(expected_version "")
set(done 0)
while(NOT done)
    if(parse_pos GREATER_EQUAL json_len)
        message(FATAL_ERROR "unterminated version string in ${PACKAGE_JSON}")
    endif()
    string(SUBSTRING "${DEVICESDK_PACKAGE_JSON}" ${parse_pos} 1 c)
    if(c STREQUAL "\"")
        set(done 1)
    else()
        string(APPEND expected_version "${c}")
        math(EXPR parse_pos "${parse_pos} + 1")
    endif()
endwhile()

# --- The exact regex used by the firmware build scripts -------------------------
if(DEVICESDK_PACKAGE_JSON MATCHES "\"version\"[ \t\r\n]*:[ \t\r\n]*\"([^\"]+)\"")
    set(extracted_version "${CMAKE_MATCH_1}")
else()
    message(FATAL_ERROR
        "version extraction regex did not match ${PACKAGE_JSON}; the firmware "
        "build would compile the fallback version")
endif()

if(NOT extracted_version STREQUAL expected_version)
    message(FATAL_ERROR
        "version extraction mismatch in ${PACKAGE_JSON}: regex got "
        "'${extracted_version}', manual parse got '${expected_version}'")
endif()

message(STATUS "check_version: '${extracted_version}' matches package.json version")