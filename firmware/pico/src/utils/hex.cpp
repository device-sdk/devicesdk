#include "hex.h"
#include <cstdlib>
#include <cerrno>

bool parse_hex_byte(const std::string& s, uint8_t* out) {
    if (s.empty()) return false;
    errno = 0;
    char* end = nullptr;
    long v = std::strtol(s.c_str(), &end, 16);
    if (end == s.c_str() || *end != '\0' || errno == ERANGE || v < 0 || v > 0xFF) {
        return false;
    }
    *out = (uint8_t)v;
    return true;
}
