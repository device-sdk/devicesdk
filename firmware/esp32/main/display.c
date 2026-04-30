#include "display.h"
#include "font5x7.h"
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
    // 0x12 = alternating COM pin config (needed for 64-row panels and for
    // the 0.42" 72×40 panel which interleaves even/odd COMs across top/bottom
    // halves). 0x02 (sequential) on those displays produces visible stripe
    // artifacts. The 128×32 panels are the ones that actually need 0x02.
    uint8_t com_pins = (height == 32) ? 0x02 : 0x12;
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

// --- Boot status (firmware-driven OLED for FN4 / 0.42" boards) ---

#define BOOT_DISPLAY_BUS         0
#define BOOT_DISPLAY_SDA         5
#define BOOT_DISPLAY_SCL         6
#define BOOT_DISPLAY_FREQ        400000
#define BOOT_DISPLAY_ADDR        0x3C
#define BOOT_DISPLAY_WIDTH       72
#define BOOT_DISPLAY_HEIGHT      40
#define BOOT_DISPLAY_COL_OFFSET  28
#define BOOT_DISPLAY_PAGES       (BOOT_DISPLAY_HEIGHT / 8)
#define BOOT_DISPLAY_FB_SIZE     (BOOT_DISPLAY_WIDTH * BOOT_DISPLAY_PAGES)

static bool s_boot_display_ready = false;

static void boot_set_pixel(uint8_t *fb, int x, int y) {
    if (x < 0 || x >= BOOT_DISPLAY_WIDTH || y < 0 || y >= BOOT_DISPLAY_HEIGHT) return;
    fb[(y / 8) * BOOT_DISPLAY_WIDTH + x] |= (uint8_t)(1u << (y % 8));
}

static int boot_draw_char(uint8_t *fb, int x, int y, char c) {
    const uint8_t *cols = font5x7_char_columns(c);
    if (cols) {
        for (int col = 0; col < FONT5X7_WIDTH; col++) {
            uint8_t bits = cols[col];
            for (int row = 0; row < FONT5X7_HEIGHT; row++) {
                if (bits & (1u << row)) boot_set_pixel(fb, x + col, y + row);
            }
        }
    }
    return x + FONT5X7_WIDTH + 1;  // one-pixel spacer
}

bool display_boot_init(void) {
    if (s_boot_display_ready) return true;

    if (!iotkit_hal_i2c_configure(BOOT_DISPLAY_BUS, BOOT_DISPLAY_SDA, BOOT_DISPLAY_SCL, BOOT_DISPLAY_FREQ)) {
        return false;
    }
    if (!iotkit_hal_i2c_probe(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR)) {
        // No OLED on this board (e.g. DevKitM-1) — silent skip.
        return false;
    }
    if (!display_init_ssd1306(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR,
                              BOOT_DISPLAY_WIDTH, BOOT_DISPLAY_HEIGHT)) {
        return false;
    }
    s_boot_display_ready = true;

    // Wipe full controller RAM (cols 0..127, all 5 pages) so leftover content
    // from earlier scripts that wrote a wider window doesn't bleed into our
    // 72-col visible region. Cheap (~640 B) and only runs once per boot.
    uint8_t zero_chunk[33] = { CONTROL_BYTE_DATA };  // C99 zero-init for the rest
    // Set address window to the full 128×40 RAM region
    {
        uint8_t cmd_set_col[]  = { CONTROL_BYTE_CMD, SSD1306_CMD_SET_COL_ADDR, 0, 127 };
        uint8_t cmd_set_page[] = { CONTROL_BYTE_CMD, SSD1306_CMD_SET_PAGE_ADDR, 0, BOOT_DISPLAY_PAGES - 1 };
        iotkit_hal_i2c_write(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR, cmd_set_col, sizeof(cmd_set_col));
        iotkit_hal_i2c_write(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR, cmd_set_page, sizeof(cmd_set_page));
    }
    size_t total = 128 * BOOT_DISPLAY_PAGES;
    while (total > 0) {
        size_t n = total > 32 ? 32 : total;
        iotkit_hal_i2c_write(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR, zero_chunk, n + 1);
        total -= n;
    }
    return true;
}

void display_boot_text(const char *text) {
    if (!s_boot_display_ready || !text) return;

    uint8_t fb[BOOT_DISPLAY_FB_SIZE] = {0};

    // Caller-provided status, centered horizontally and vertically on the glass.
    size_t status_w = font5x7_text_width(text);
    int status_x = (int)((BOOT_DISPLAY_WIDTH - status_w) / 2);
    if (status_x < 0) status_x = 0;
    int status_y = (BOOT_DISPLAY_HEIGHT - FONT5X7_HEIGHT) / 2;
    int sx = status_x;
    for (const char *p = text; *p; p++) sx = boot_draw_char(fb, sx, status_y, *p);

    display_write_fb_ssd1306(BOOT_DISPLAY_BUS, BOOT_DISPLAY_ADDR,
                             BOOT_DISPLAY_WIDTH, BOOT_DISPLAY_HEIGHT,
                             BOOT_DISPLAY_COL_OFFSET, 0, fb, sizeof(fb));
}
