#ifndef BASE64_H
#define BASE64_H

#include <stdint.h>
#include <stddef.h>
#include <vector>
#include <string>

// Decode base64 string to binary data
// Returns empty vector on decode error
std::vector<uint8_t> base64_decode(const std::string& encoded);

// Encode binary data to base64 string
std::string base64_encode(const uint8_t* data, size_t len);

// Get expected decoded size for a base64 string
size_t base64_decoded_size(const std::string& encoded);

#endif // BASE64_H
