#include "core1_worker.h"
#include "shared_buffers.h"
#include "hal.h"
#include "pico/stdlib.h"
#include "hardware/watchdog.h"
#include <string.h>
#include <stdio.h>
#include <map>
#include <vector>

// Local state for GPIO monitoring
static std::map<uint8_t, bool> s_monitored_pins;
static std::map<uint8_t, bool> s_gpio_states;
static uint32_t s_last_gpio_poll_time = 0;

// Local framebuffer for display operations
static std::vector<uint8_t> s_framebuffer;

// Forward declarations
static worker_response_t execute_command(const worker_command_t* cmd);
static void poll_gpio_pins(void);

void core1_worker_init(void) {
    s_monitored_pins.clear();
    s_gpio_states.clear();
    s_last_gpio_poll_time = 0;
}

void core1_add_monitored_pin(uint8_t pin) {
    s_monitored_pins[pin] = true;
}

void core1_remove_monitored_pin(uint8_t pin) {
    s_monitored_pins.erase(pin);
    s_gpio_states.erase(pin);
}

void core1_entry(void) {
    while (true) {
        worker_command_t cmd;

        // Process queued commands (non-blocking check)
        if (queue_try_remove(&g_command_queue, &cmd)) {
            worker_response_t response = execute_command(&cmd);
            queue_add_blocking(&g_response_queue, &response);
        }

        // Poll GPIO pins every 50ms
        uint32_t now = to_ms_since_boot(get_absolute_time());
        if (now - s_last_gpio_poll_time >= 50) {
            s_last_gpio_poll_time = now;
            poll_gpio_pins();
        }

        // Small sleep to prevent busy-waiting
        sleep_us(100);
    }
}

static void poll_gpio_pins(void) {
    for (auto& entry : s_monitored_pins) {
        uint8_t pin = entry.first;
        bool current_state = hal_get_gpio_digital(pin);

        auto it = s_gpio_states.find(pin);
        if (it != s_gpio_states.end() && it->second != current_state) {
            // State changed - send notification
            gpio_notification_t notification;
            notification.pin = pin;
            notification.state = current_state;
            queue_try_add(&g_gpio_notification_queue, &notification);
            s_gpio_states[pin] = current_state;
        } else if (it == s_gpio_states.end()) {
            // First read - just store state
            s_gpio_states[pin] = current_state;
        }
    }
}

// Helper to set error response
static void set_error(worker_response_t* resp, const char* msg) {
    resp->status = RESPONSE_ERROR;
    strncpy(resp->error_msg, msg, MAX_ERROR_MSG_LEN - 1);
    resp->error_msg[MAX_ERROR_MSG_LEN - 1] = '\0';
}

// === Command handlers ===

static void handle_gpio_set(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    gpio_state_t state = (cmd->payload.gpio.state == WORKER_GPIO_HIGH)
                          ? GPIO_STATE_HIGH : GPIO_STATE_LOW;
    hal_set_gpio(pin, state);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
}

static void handle_gpio_get_digital(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    bool value = hal_get_gpio_digital(pin);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
    resp->data.gpio.digital_value = value;
    resp->data.gpio.mode = "digital";
}

static void handle_gpio_get_analog(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    uint16_t value = hal_get_gpio_analog(pin);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
    resp->data.gpio.analog_value = value;
    resp->data.gpio.mode = "analog";
}

static void handle_gpio_configure_input(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.gpio.pin;
    gpio_pull_t pull;
    switch (cmd->payload.gpio.pull) {
        case WORKER_PULL_UP: pull = GPIO_PULL_UP; break;
        case WORKER_PULL_DOWN: pull = GPIO_PULL_DOWN; break;
        default: pull = GPIO_PULL_NONE; break;
    }
    hal_configure_gpio_input(pin, pull);
    core1_add_monitored_pin(pin);
    resp->status = RESPONSE_SUCCESS;
    resp->data.gpio.pin = pin;
}

static void handle_pwm_set(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.pwm.pin;
    uint32_t freq = cmd->payload.pwm.frequency;
    float duty = cmd->payload.pwm.duty_cycle;
    hal_set_pwm(pin, freq, duty);
    resp->status = RESPONSE_SUCCESS;
}

static void handle_i2c_configure(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.i2c_configure.bus;
    uint8_t sda = cmd->payload.i2c_configure.sda_pin;
    uint8_t scl = cmd->payload.i2c_configure.scl_pin;
    uint32_t freq = cmd->payload.i2c_configure.frequency;

    if (!hal_i2c_validate_pins(bus, sda, scl)) {
        set_error(resp, "Invalid I2C pin configuration");
        return;
    }

    if (!hal_i2c_configure(bus, sda, scl, freq)) {
        set_error(resp, "Failed to configure I2C");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_configure.bus = bus;
    resp->data.i2c_configure.sda_pin = sda;
    resp->data.i2c_configure.scl_pin = scl;
    resp->data.i2c_configure.frequency = freq;
}

static void handle_i2c_scan(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.i2c_scan.bus;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    i2c_scan_result_t result = hal_i2c_scan(bus);
    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_scan.bus = bus;
    resp->data.i2c_scan.count = result.count;
    memcpy(resp->data.i2c_scan.addresses, result.addresses, result.count);
}

static void handle_i2c_write(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.i2c_write.bus;
    uint8_t addr = cmd->payload.i2c_write.address;
    const uint8_t* data = cmd->payload.i2c_write.data;
    size_t len = cmd->payload.i2c_write.data_len;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    if (!hal_i2c_write(bus, addr, data, len)) {
        set_error(resp, "I2C write failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_i2c_read(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.i2c_read.bus;
    uint8_t addr = cmd->payload.i2c_read.address;
    size_t len = cmd->payload.i2c_read.length;
    int reg = cmd->payload.i2c_read.reg;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    if (len > MAX_I2C_READ_DATA) {
        set_error(resp, "Read length too large");
        return;
    }

    int result = hal_i2c_read(bus, addr, resp->data.i2c_read.data, len, reg);
    if (result < 0) {
        set_error(resp, "I2C read failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.i2c_read.bus = bus;
    resp->data.i2c_read.address = addr;
    resp->data.i2c_read.data_len = (size_t)result;
}

// Display controller constants
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
    return hal_i2c_write(bus, addr, data, 2);
}

static bool send_cmd2(uint8_t bus, uint8_t addr, uint8_t cmd, uint8_t arg) {
    uint8_t data[3] = { CONTROL_BYTE_CMD, cmd, arg };
    return hal_i2c_write(bus, addr, data, 3);
}

static bool send_cmd3(uint8_t bus, uint8_t addr, uint8_t cmd, uint8_t arg1, uint8_t arg2) {
    uint8_t data[4] = { CONTROL_BYTE_CMD, cmd, arg1, arg2 };
    return hal_i2c_write(bus, addr, data, 4);
}

static bool init_display_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height) {
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

static bool init_display_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height) {
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

static bool write_fb_ssd1306(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                              uint8_t col_offset, uint8_t page_offset,
                              const uint8_t* buffer, size_t buf_len) {
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

        if (!hal_i2c_write(bus, addr, chunk, to_send + 1)) {
            return false;
        }
        offset += to_send;
    }
    return true;
}

static bool write_fb_sh1106(uint8_t bus, uint8_t addr, uint8_t width, uint8_t height,
                             uint8_t col_offset, uint8_t page_offset,
                             const uint8_t* buffer, size_t buf_len) {
    uint8_t pages = height / 8;
    uint8_t page_data[129];  // 1 control byte + 128 data max
    // SH1106's glass has a 2-column RAM offset by default; preserve that when caller passes 0.
    if (col_offset == 0) col_offset = 2;

    for (uint8_t page = 0; page < pages; page++) {
        if (!send_cmd(bus, addr, 0xB0 + page + page_offset)) return false;
        if (!send_cmd(bus, addr, col_offset & 0x0F)) return false;                 // low nibble
        if (!send_cmd(bus, addr, 0x10 | ((col_offset >> 4) & 0x0F))) return false; // high nibble

        size_t fb_page_offset = page * width;
        page_data[0] = CONTROL_BYTE_DATA;
        memcpy(&page_data[1], &buffer[fb_page_offset], width);

        if (!hal_i2c_write(bus, addr, page_data, width + 1)) {
            return false;
        }
    }
    return true;
}

static void handle_display_update(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.display.bus;
    uint8_t addr = cmd->payload.display.address;
    uint8_t width = cmd->payload.display.width;
    uint8_t height = cmd->payload.display.height;
    uint8_t col_offset = cmd->payload.display.col_offset;
    uint8_t page_offset = cmd->payload.display.page_offset;
    bool is_ssd1306 = (cmd->payload.display.controller == 0);
    bool do_init = cmd->payload.display.init;

    if (bus > 1) {
        set_error(resp, "Invalid bus number");
        return;
    }

    size_t fb_size = (size_t)width * height / 8;

    // Read framebuffer from shared buffer
    uint8_t fb_data[MAX_DISPLAY_BUFFER_SIZE];
    size_t fb_len = 0;
    display_segment_t segments[MAX_DISPLAY_SEGMENTS];
    size_t segment_count = 0;

    if (!shared_display_buffer_read(fb_data, &fb_len, segments, &segment_count)) {
        set_error(resp, "No display data available");
        return;
    }

    // Resize local framebuffer if needed
    if (s_framebuffer.size() != fb_size) {
        s_framebuffer.resize(fb_size, 0);
    }

    // Apply segments to local framebuffer
    size_t total_written = 0;
    for (size_t i = 0; i < segment_count; i++) {
        size_t offset = segments[i].offset;
        size_t len = segments[i].length;
        if (offset + len <= fb_size && offset + len <= fb_len) {
            memcpy(&s_framebuffer[offset], &fb_data[offset], len);
            total_written += len;
        }
    }

    // If no segments, treat entire buffer as one segment
    if (segment_count == 0 && fb_len <= fb_size) {
        memcpy(s_framebuffer.data(), fb_data, fb_len);
        total_written = fb_len;
    }

    // Initialize display if requested
    if (do_init) {
        bool init_ok = is_ssd1306
            ? init_display_ssd1306(bus, addr, width, height)
            : init_display_sh1106(bus, addr, width, height);
        if (!init_ok) {
            set_error(resp, "Failed to initialize display");
            return;
        }
    }

    // Write framebuffer
    bool write_ok = is_ssd1306
        ? write_fb_ssd1306(bus, addr, width, height, col_offset, page_offset, s_framebuffer.data(), s_framebuffer.size())
        : write_fb_sh1106(bus, addr, width, height, col_offset, page_offset, s_framebuffer.data(), s_framebuffer.size());

    if (!write_ok) {
        set_error(resp, "Failed to write framebuffer");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    resp->data.display.width = width;
    resp->data.display.height = height;
    resp->data.display.controller = is_ssd1306 ? "ssd1306" : "sh1106";
    resp->data.display.segments_count = segment_count;
    resp->data.display.bytes_written = total_written;
}

// === Temperature handler ===

static void handle_get_temperature(const worker_command_t* cmd, worker_response_t* resp) {
    (void)cmd;
    float celsius = hal_get_temperature();
    resp->status = RESPONSE_SUCCESS;
    resp->data.temperature.celsius = celsius;
}

// === Watchdog handlers ===

static void handle_watchdog_configure(const worker_command_t* cmd, worker_response_t* resp) {
    uint32_t timeout_ms = cmd->payload.watchdog_configure.timeout_ms;
    bool enable = cmd->payload.watchdog_configure.enable;

    if (!hal_watchdog_configure(timeout_ms, enable)) {
        set_error(resp, "Failed to configure watchdog (cannot disable once enabled)");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_watchdog_feed(const worker_command_t* cmd, worker_response_t* resp) {
    (void)cmd;
    hal_watchdog_feed();
    resp->status = RESPONSE_SUCCESS;
}

// === SPI handlers ===

static void handle_spi_configure(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.spi_configure.bus;
    uint8_t clk = cmd->payload.spi_configure.clk_pin;
    uint8_t mosi = cmd->payload.spi_configure.mosi_pin;
    uint8_t miso = cmd->payload.spi_configure.miso_pin;
    uint8_t cs = cmd->payload.spi_configure.cs_pin;
    uint32_t freq = cmd->payload.spi_configure.frequency;
    uint8_t mode = cmd->payload.spi_configure.mode;

    if (!hal_spi_configure(bus, clk, mosi, miso, cs, freq, mode)) {
        set_error(resp, "Failed to configure SPI");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_spi_transfer(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.spi_transfer.bus;
    const uint8_t* data = cmd->payload.spi_transfer.data;
    size_t len = cmd->payload.spi_transfer.data_len;

    spi_transfer_result_t result = hal_spi_transfer(bus, data, len);
    if (result.len == 0) {
        set_error(resp, "SPI transfer failed");
        return;
    }

    // The request buffer holds up to MAX_SPI_DATA_LEN (4096) bytes, but the
    // response buffer is only MAX_SPI_RESPONSE_DATA (256). Guard the memcpy so
    // a large full-duplex transfer can't overflow the response struct.
    if (result.len > MAX_SPI_RESPONSE_DATA) {
        set_error(resp, "SPI transfer result too large");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    memcpy(resp->data.spi.data, result.data, result.len);
    resp->data.spi.data_len = result.len;
}

static void handle_spi_write(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.spi_transfer.bus;
    const uint8_t* data = cmd->payload.spi_transfer.data;
    size_t len = cmd->payload.spi_transfer.data_len;

    if (!hal_spi_write(bus, data, len)) {
        set_error(resp, "SPI write failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_spi_read(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t bus = cmd->payload.spi_read.bus;
    size_t len = cmd->payload.spi_read.length;

    if (len > MAX_SPI_RESPONSE_DATA) {
        set_error(resp, "SPI read length too large");
        return;
    }

    spi_transfer_result_t result = hal_spi_read(bus, len);
    if (result.len == 0) {
        set_error(resp, "SPI read failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
    memcpy(resp->data.spi.data, result.data, result.len);
    resp->data.spi.data_len = result.len;
}

// === UART handlers ===

static void handle_uart_configure(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t port = cmd->payload.uart_configure.port;
    uint8_t tx = cmd->payload.uart_configure.tx_pin;
    uint8_t rx = cmd->payload.uart_configure.rx_pin;
    uint32_t baud = cmd->payload.uart_configure.baud_rate;
    uint8_t data_bits = cmd->payload.uart_configure.data_bits;
    uint8_t stop_bits = cmd->payload.uart_configure.stop_bits;
    uint8_t parity = cmd->payload.uart_configure.parity;

    if (!hal_uart_configure(port, tx, rx, baud, data_bits, stop_bits, parity)) {
        set_error(resp, "Failed to configure UART");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_uart_write(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t port = cmd->payload.uart_write.port;
    const uint8_t* data = cmd->payload.uart_write.data;
    size_t len = cmd->payload.uart_write.data_len;

    if (!hal_uart_write(port, data, len)) {
        set_error(resp, "UART write failed");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_uart_read(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t port = cmd->payload.uart_read.port;
    size_t bytes = cmd->payload.uart_read.bytes_to_read;
    uint32_t timeout = cmd->payload.uart_read.timeout_ms;

    if (bytes > MAX_UART_RESPONSE_DATA) {
        set_error(resp, "UART read length too large");
        return;
    }

    uart_read_result_t result = hal_uart_read(port, bytes, timeout);

    resp->status = RESPONSE_SUCCESS;
    memcpy(resp->data.uart_read.data, result.data, result.len);
    resp->data.uart_read.data_len = result.len;
}

// === PIO WS2812 handlers ===

static void handle_pio_ws2812_configure(const worker_command_t* cmd, worker_response_t* resp) {
    uint8_t pin = cmd->payload.pio_ws2812_configure.pin;
    uint16_t num_leds = cmd->payload.pio_ws2812_configure.num_leds;

    if (!hal_pio_ws2812_configure(pin, num_leds)) {
        set_error(resp, "Failed to configure WS2812");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_pio_ws2812_update(const worker_command_t* cmd, worker_response_t* resp) {
    (void)cmd;

    // Read pixel data from shared buffer
    uint8_t pixel_data[MAX_WS2812_BUFFER_SIZE];
    size_t pixel_len = 0;

    if (!shared_ws2812_buffer_read(pixel_data, &pixel_len)) {
        set_error(resp, "No WS2812 pixel data available");
        return;
    }

    if (!hal_pio_ws2812_update(pixel_data, pixel_len)) {
        set_error(resp, "Failed to update WS2812 LEDs");
        return;
    }

    resp->status = RESPONSE_SUCCESS;
}

static void handle_reboot(const worker_command_t* cmd, worker_response_t* resp) {
    (void)cmd;
    resp->status = RESPONSE_SUCCESS;
    // Note: actual reboot happens after response is sent (handled by Core 0)
}

static worker_response_t execute_command(const worker_command_t* cmd) {
    worker_response_t resp = {0};
    resp.sequence_id = cmd->sequence_id;
    strncpy(resp.message_id, cmd->message_id, MAX_MESSAGE_ID_LEN - 1);
    resp.original_cmd = cmd->type;
    resp.status = RESPONSE_SUCCESS;

    switch (cmd->type) {
        case CMD_GPIO_SET:
            handle_gpio_set(cmd, &resp);
            break;
        case CMD_GPIO_GET_DIGITAL:
            handle_gpio_get_digital(cmd, &resp);
            break;
        case CMD_GPIO_GET_ANALOG:
            handle_gpio_get_analog(cmd, &resp);
            break;
        case CMD_GPIO_CONFIGURE_INPUT:
            handle_gpio_configure_input(cmd, &resp);
            break;
        case CMD_PWM_SET:
            handle_pwm_set(cmd, &resp);
            break;
        case CMD_I2C_CONFIGURE:
            handle_i2c_configure(cmd, &resp);
            break;
        case CMD_I2C_SCAN:
            handle_i2c_scan(cmd, &resp);
            break;
        case CMD_I2C_WRITE:
            handle_i2c_write(cmd, &resp);
            break;
        case CMD_I2C_READ:
            handle_i2c_read(cmd, &resp);
            break;
        case CMD_I2C_BATCH_WRITE:
            // TODO: implement batch write
            set_error(&resp, "Batch write not yet implemented");
            break;
        case CMD_GET_TEMPERATURE:
            handle_get_temperature(cmd, &resp);
            break;
        case CMD_WATCHDOG_CONFIGURE:
            handle_watchdog_configure(cmd, &resp);
            break;
        case CMD_WATCHDOG_FEED:
            handle_watchdog_feed(cmd, &resp);
            break;
        case CMD_SPI_CONFIGURE:
            handle_spi_configure(cmd, &resp);
            break;
        case CMD_SPI_TRANSFER:
            handle_spi_transfer(cmd, &resp);
            break;
        case CMD_SPI_WRITE:
            handle_spi_write(cmd, &resp);
            break;
        case CMD_SPI_READ:
            handle_spi_read(cmd, &resp);
            break;
        case CMD_UART_CONFIGURE:
            handle_uart_configure(cmd, &resp);
            break;
        case CMD_UART_WRITE:
            handle_uart_write(cmd, &resp);
            break;
        case CMD_UART_READ:
            handle_uart_read(cmd, &resp);
            break;
        case CMD_PIO_WS2812_CONFIGURE:
            handle_pio_ws2812_configure(cmd, &resp);
            break;
        case CMD_PIO_WS2812_UPDATE:
            handle_pio_ws2812_update(cmd, &resp);
            break;
        case CMD_DISPLAY_UPDATE:
            handle_display_update(cmd, &resp);
            break;
        case CMD_REBOOT:
            handle_reboot(cmd, &resp);
            break;
        default:
            set_error(&resp, "Unknown command type");
            break;
    }

    return resp;
}
