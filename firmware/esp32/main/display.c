#include "display.h"
#include "hal.h"
#include <string.h>

// SSD1306/SH1106 command definitions
#define SSD1306_CMD_DISPLAY_OFF          0xAE
#define SSD1306_CMD_DISPLAY_ON           0xAF
#define SSD1306_CMD_SET_CLOCK_DIV        0xD5
#define SSD1306_CMD_SET_MUX_RATIO        0xA8
#define SSD1306_CMD_SET_DISPLAY_OFFSET   0xD3
#define SSD1306_CMD_SET_START_LINE       0x40
#define SSD1306_CMD_CHARGE_PUMP          0x8D
#define SSD1306_CMD_SET_MEMORY_MODE      0x20
#define SSD1306_CMD_SEG_REMAP            0xA1
#define SSD1306_CMD_COM_SCAN_DEC         0xC8
#define SSD1306_CMD_SET_COM_PINS         0xDA
#define SSD1306_CMD_SET_CONTRAST         0x81
#define SSD1306_CMD_SET_PRECHARGE        0xD9
#define SSD1306_CMD_SET_VCOM_DESELECT    0xDB
#define SSD1306_CMD_DISPLAY_RAM          0xA4
#define SSD1306_CMD_NORMAL_DISPLAY       0xA6
#define SSD1306_CMD_SET_COL_ADDR         0x21
#define SSD1306_CMD_SET_PAGE_ADDR        0x22

#define CONTROL_BYTE_CMD    0x00
#define CONTROL_BYTE_DATA   0x40

static bool send_cmd(uint8_t bus, uint8_t addr, uint8_t cmd) {
    uint8_t data[2] = { CONTROL_BYTE_CMD, cmd };
    return iotkit_hal_i2c_write(bus, addr, data, 2);
}

static bool send_cmd2(uint8_t bus, uint8_t addr, uint8_t cmd, uint8_t arg) {
    uint8_t data[3] = { CONTROL_BYTE_CMD, cmd, arg };
    return iotkit_hal_i2c_write(bus, addr, data, 3);
}

static bool send_cmd3(uint8_t bus, uint8_t addr, uint8_t cmd, uint8_t arg1, uint8_t arg2) {
    uint8_t data[4] = { CONTROL_BYTE_CMD, cmd, arg1, arg2 };
    return iotkit_hal_i2c_write(bus, addr, data, 4);
}

bool display_init_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height) {
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_OFF)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_CLOCK_DIV, 0x80)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_MUX_RATIO, height - 1)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_DISPLAY_OFFSET, 0x00)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_SET_START_LINE)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_CHARGE_PUMP, 0x14)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_MEMORY_MODE, 0x00)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_SEG_REMAP)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_COM_SCAN_DEC)) return false;
    uint8_t com_pins = (height == 64) ? 0x12 : 0x02;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_COM_PINS, com_pins)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_CONTRAST, 0xCF)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_PRECHARGE, 0xF1)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_VCOM_DESELECT, 0x40)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_RAM)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_NORMAL_DISPLAY)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_ON)) return false;
    return true;
}

bool display_init_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height) {
    (void)width;
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_OFF)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_CLOCK_DIV, 0x80)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_MUX_RATIO, height - 1)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_DISPLAY_OFFSET, 0x00)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_SET_START_LINE)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_CHARGE_PUMP, 0x14)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_MEMORY_MODE, 0x02)) return false;  // Page mode for SH1106
    if (!send_cmd(bus, addr, SSD1306_CMD_SEG_REMAP)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_COM_SCAN_DEC)) return false;
    uint8_t com_pins = (height == 64) ? 0x12 : 0x02;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_COM_PINS, com_pins)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_CONTRAST, 0xCF)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_PRECHARGE, 0xF1)) return false;
    if (!send_cmd2(bus, addr, SSD1306_CMD_SET_VCOM_DESELECT, 0x40)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_RAM)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_NORMAL_DISPLAY)) return false;
    if (!send_cmd(bus, addr, SSD1306_CMD_DISPLAY_ON)) return false;
    return true;
}

bool display_write_fb_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                               uint8_t col_offset, uint8_t page_offset,
                               const uint8_t *buffer, size_t buf_len) {
    uint8_t pages = height / 8;
    if (!send_cmd3(bus, addr, SSD1306_CMD_SET_COL_ADDR, col_offset, col_offset + width - 1)) return false;
    if (!send_cmd3(bus, addr, SSD1306_CMD_SET_PAGE_ADDR, page_offset, page_offset + pages - 1)) return false;

    // Write in 32-byte chunks
    size_t chunk_size = 32;
    size_t offset = 0;
    uint8_t chunk[33];  // 1 control byte + 32 data

    while (offset < buf_len) {
        size_t remaining = buf_len - offset;
        size_t to_send = (remaining > chunk_size) ? chunk_size : remaining;

        chunk[0] = CONTROL_BYTE_DATA;
        memcpy(&chunk[1], &buffer[offset], to_send);

        if (!iotkit_hal_i2c_write(bus, addr, chunk, to_send + 1)) {
            return false;
        }
        offset += to_send;
    }
    return true;
}

bool display_write_fb_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                              uint8_t col_offset, uint8_t page_offset,
                              const uint8_t *buffer, size_t buf_len) {
    (void)buf_len;
    uint8_t pages = height / 8;
    uint8_t page_data[129];  // 1 control byte + 128 data max
    // SH1106's glass has a 2-column RAM offset by default; preserve that when caller passes 0.
    if (col_offset == 0) col_offset = 2;

    for (uint8_t page = 0; page < pages; page++) {
        if (!send_cmd(bus, addr, 0xB0 + page + page_offset)) return false;
        if (!send_cmd(bus, addr, col_offset & 0x0F)) return false;            // low nibble
        if (!send_cmd(bus, addr, 0x10 | ((col_offset >> 4) & 0x0F))) return false;  // high nibble

        size_t fb_page_offset = page * width;
        page_data[0] = CONTROL_BYTE_DATA;
        memcpy(&page_data[1], &buffer[fb_page_offset], width);

        if (!iotkit_hal_i2c_write(bus, addr, page_data, width + 1)) {
            return false;
        }
    }
    return true;
}
