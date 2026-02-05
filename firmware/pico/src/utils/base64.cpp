#include "base64.h"

static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int b64_decode_char(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1; // '=' or invalid
}

size_t base64_decoded_size(const std::string& encoded) {
    if (encoded.empty()) return 0;

    size_t len = encoded.length();
    size_t padding = 0;

    if (len >= 1 && encoded[len - 1] == '=') padding++;
    if (len >= 2 && encoded[len - 2] == '=') padding++;

    return (len * 3) / 4 - padding;
}

std::vector<uint8_t> base64_decode(const std::string& encoded) {
    std::vector<uint8_t> result;

    if (encoded.empty()) return result;

    size_t len = encoded.length();
    if (len % 4 != 0) return result; // Invalid base64 length

    result.reserve(base64_decoded_size(encoded));

    for (size_t i = 0; i < len; i += 4) {
        int a = b64_decode_char(encoded[i]);
        int b = b64_decode_char(encoded[i + 1]);
        int c = b64_decode_char(encoded[i + 2]);
        int d = b64_decode_char(encoded[i + 3]);

        // First two characters must be valid
        if (a < 0 || b < 0) {
            result.clear();
            return result;
        }

        result.push_back((a << 2) | (b >> 4));

        if (encoded[i + 2] != '=') {
            if (c < 0) {
                result.clear();
                return result;
            }
            result.push_back(((b & 0x0F) << 4) | (c >> 2));
        }

        if (encoded[i + 3] != '=') {
            if (d < 0) {
                result.clear();
                return result;
            }
            result.push_back(((c & 0x03) << 6) | d);
        }
    }

    return result;
}

std::string base64_encode(const uint8_t* data, size_t len) {
    std::string result;
    if (len == 0) return result;

    result.reserve(((len + 2) / 3) * 4);

    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = ((uint32_t)data[i]) << 16;
        if (i + 1 < len) n |= ((uint32_t)data[i + 1]) << 8;
        if (i + 2 < len) n |= data[i + 2];

        result.push_back(b64_table[(n >> 18) & 0x3F]);
        result.push_back(b64_table[(n >> 12) & 0x3F]);
        result.push_back((i + 1 < len) ? b64_table[(n >> 6) & 0x3F] : '=');
        result.push_back((i + 2 < len) ? b64_table[n & 0x3F] : '=');
    }

    return result;
}
