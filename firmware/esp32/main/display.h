#ifndef DISPLAY_H
#define DISPLAY_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

// Initialize SSD1306 display
bool display_init_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height);

// Initialize SH1106 display
bool display_init_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height);

// Write framebuffer to SSD1306 (horizontal addressing, 32-byte chunks).
// col_offset/page_offset shift the visible window in controller RAM — non-zero for
// panels whose glass doesn't start at column 0 (e.g. 0.42" 72x40 SSD1306 uses col_offset=30).
bool display_write_fb_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                               uint8_t col_offset, uint8_t page_offset,
                               const uint8_t *buffer, size_t buf_len);

// Write framebuffer to SH1106 (page mode). col_offset defaults to 2 when 0 is passed
// (SH1106's well-known built-in offset); pass a different value to override.
bool display_write_fb_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                              uint8_t col_offset, uint8_t page_offset,
                              const uint8_t *buffer, size_t buf_len);

#endif // DISPLAY_H
