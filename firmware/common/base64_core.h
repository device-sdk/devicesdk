// Shared header-only base64 primitives used by both ESP32 (C) and Pico (C++) firmware.
//
// Each platform keeps its own public API (malloc'd C strings on ESP32,
// std::string/std::vector on Pico) because their callers are tightly coupled
// to those types. This header consolidates only what's genuinely duplicated:
// the alphabet, the decode lookup, and the encoded-length formula.
//
// Include with a relative path — there is no shared CMake include root:
//   #include "../../common/base64_core.h"        (from firmware/esp32/main/)
//   #include "../../../common/base64_core.h"     (from firmware/pico/src/utils/)
//
// No runtime allocations, no dependencies, C and C++ safe.
#ifndef FIRMWARE_COMMON_BASE64_CORE_H
#define FIRMWARE_COMMON_BASE64_CORE_H

#include <stdint.h>
#include <stddef.h>

static const char BASE64_ALPHABET[65] =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

// Returns 0-63 on valid base64 char, -1 on '=' or any invalid char.
static inline int base64_decode_char_inline(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

// Output length (not including trailing null) for encoding `raw_len` bytes.
static inline size_t base64_encoded_length(size_t raw_len) {
    return ((raw_len + 2) / 3) * 4;
}

// Decoded length for a given base64 string length + padding count (0, 1, or 2).
// Caller is responsible for validating input length is a multiple of 4.
static inline size_t base64_decoded_length(size_t encoded_len, size_t padding) {
    return (encoded_len * 3) / 4 - padding;
}

#endif // FIRMWARE_COMMON_BASE64_CORE_H
