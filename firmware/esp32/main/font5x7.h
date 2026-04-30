#ifndef FONT5X7_H
#define FONT5X7_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

#define FONT5X7_WIDTH       5
#define FONT5X7_HEIGHT      7
#define FONT5X7_FIRST_CHAR  32
#define FONT5X7_LAST_CHAR   126

// Returns a pointer to 5 column bytes for `c`, or NULL if `c` is out of range.
// Each column byte uses bit 0 = top row, bit 6 = bottom row (matches packages/core
// SDK's font5x7 so firmware-rendered text looks identical to SDK-rendered text).
const uint8_t *font5x7_char_columns(char c);

// Pixel width of `text` rendered with font5x7 (5 px per glyph + 1 px spacing,
// minus the trailing spacer).
size_t font5x7_text_width(const char *text);

#endif
