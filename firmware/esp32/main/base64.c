#include "base64.h"
#include <stdlib.h>
#include <string.h>

static const char b64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static int b64_decode_char(char c) {
    if (c >= 'A' && c <= 'Z') return c - 'A';
    if (c >= 'a' && c <= 'z') return c - 'a' + 26;
    if (c >= '0' && c <= '9') return c - '0' + 52;
    if (c == '+') return 62;
    if (c == '/') return 63;
    return -1;
}

char *base64_encode(const uint8_t *data, size_t len) {
    if (!data || len == 0) {
        char *result = malloc(1);
        if (result) result[0] = '\0';
        return result;
    }

    size_t out_len = ((len + 2) / 3) * 4;
    char *result = malloc(out_len + 1);
    if (!result) return NULL;

    size_t j = 0;
    for (size_t i = 0; i < len; i += 3) {
        uint32_t n = ((uint32_t)data[i]) << 16;
        if (i + 1 < len) n |= ((uint32_t)data[i + 1]) << 8;
        if (i + 2 < len) n |= data[i + 2];

        result[j++] = b64_table[(n >> 18) & 0x3F];
        result[j++] = b64_table[(n >> 12) & 0x3F];
        result[j++] = (i + 1 < len) ? b64_table[(n >> 6) & 0x3F] : '=';
        result[j++] = (i + 2 < len) ? b64_table[n & 0x3F] : '=';
    }

    result[j] = '\0';
    return result;
}

uint8_t *base64_decode(const char *encoded, size_t *out_len) {
    if (!encoded || !out_len) return NULL;

    size_t len = strlen(encoded);
    *out_len = 0;

    if (len == 0) {
        uint8_t *result = malloc(1);
        return result;
    }

    if (len % 4 != 0) return NULL;

    // Calculate decoded size
    size_t padding = 0;
    if (len >= 1 && encoded[len - 1] == '=') padding++;
    if (len >= 2 && encoded[len - 2] == '=') padding++;
    size_t decoded_len = (len * 3) / 4 - padding;

    uint8_t *result = malloc(decoded_len);
    if (!result) return NULL;

    size_t j = 0;
    for (size_t i = 0; i < len; i += 4) {
        int a = b64_decode_char(encoded[i]);
        int b = b64_decode_char(encoded[i + 1]);
        int c = b64_decode_char(encoded[i + 2]);
        int d = b64_decode_char(encoded[i + 3]);

        if (a < 0 || b < 0) {
            free(result);
            return NULL;
        }

        result[j++] = (uint8_t)((a << 2) | (b >> 4));

        if (encoded[i + 2] != '=') {
            if (c < 0) { free(result); return NULL; }
            result[j++] = (uint8_t)(((b & 0x0F) << 4) | (c >> 2));
        }

        if (encoded[i + 3] != '=') {
            if (d < 0) { free(result); return NULL; }
            result[j++] = (uint8_t)(((c & 0x03) << 6) | d);
        }
    }

    *out_len = j;
    return result;
}
