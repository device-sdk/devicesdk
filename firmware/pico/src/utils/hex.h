#ifndef HEX_H
#define HEX_H

#include <stdint.h>
#include <string>

// Strictly parse a hex byte ("0x3C" or "3C"). Returns false for empty input,
// trailing garbage, overflow, or values outside 0x00-0xFF - unlike bare
// strtol, which silently truncates "0x100" to 0x00 and "0x70junk" to 0x70.
bool parse_hex_byte(const std::string& s, uint8_t* out);

#endif // HEX_H
