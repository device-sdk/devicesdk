#ifndef BASE64_H
#define BASE64_H

#include <stdint.h>
#include <stddef.h>

// Encode binary data to base64 string.
// Returns malloc'd string (caller must free), or NULL on error.
char *base64_encode(const uint8_t *data, size_t len);

// Decode base64 string to binary data.
// Returns malloc'd buffer (caller must free), or NULL on error.
// Sets *out_len to decoded length.
uint8_t *base64_decode(const char *encoded, size_t *out_len);

#endif // BASE64_H
