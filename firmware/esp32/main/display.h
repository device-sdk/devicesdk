#ifndef DISPLAY_H
#define DISPLAY_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

// Initialize SSD1306 display
bool display_init_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height);

// Initialize SH1106 display
bool display_init_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height);

// Write framebuffer to SSD1306 (horizontal addressing, 32-byte chunks)
bool display_write_fb_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                               const uint8_t *buffer, size_t buf_len);

// Write framebuffer to SH1106 (page mode, column offset 2)
bool display_write_fb_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                              const uint8_t *buffer, size_t buf_len);

#endif // DISPLAY_H
