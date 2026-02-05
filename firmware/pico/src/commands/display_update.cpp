#include "display_update.h"
#include "i2c_command_handler.h"
#include "hal.h"
#include "base64.h"
#include "pico/cyw43_arch.h"
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

// Yield to WiFi stack to prevent connection timeout during long I2C operations
static inline void yield_to_wifi() {
    cyw43_arch_poll();
}

// Expected payload:
// {
//   "bus": 0,
//   "address": "0x3C",
//   "controller": "ssd1306",  // or "sh1106"
//   "width": 128,
//   "height": 64,
//   "init": true,             // Optional, send init sequence
//   "segments": [{ "offset": 0, "data": "base64..." }, ...]
// }

// Local framebuffer for accumulating sparse segments
static std::vector<uint8_t> s_framebuffer;

// SSD1306 command bytes
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

// I2C control bytes
#define CONTROL_BYTE_CMD    0x00
#define CONTROL_BYTE_DATA   0x40

static bool send_command(uint8_t bus, uint8_t address, uint8_t cmd) {
    uint8_t data[2] = { CONTROL_BYTE_CMD, cmd };
    return hal_i2c_write(bus, address, data, 2);
}

static bool send_command2(uint8_t bus, uint8_t address, uint8_t cmd, uint8_t arg) {
    uint8_t data[3] = { CONTROL_BYTE_CMD, cmd, arg };
    return hal_i2c_write(bus, address, data, 3);
}

static bool send_command3(uint8_t bus, uint8_t address, uint8_t cmd, uint8_t arg1, uint8_t arg2) {
    uint8_t data[4] = { CONTROL_BYTE_CMD, cmd, arg1, arg2 };
    return hal_i2c_write(bus, address, data, 4);
}

static bool init_ssd1306(uint8_t bus, uint8_t address, uint8_t width, uint8_t height) {
    // Display OFF
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_OFF)) return false;

    // Set clock divide ratio
    if (!send_command2(bus, address, SSD1306_CMD_SET_CLOCK_DIV, 0x80)) return false;

    // Set multiplex ratio
    if (!send_command2(bus, address, SSD1306_CMD_SET_MUX_RATIO, height - 1)) return false;

    // Set display offset
    if (!send_command2(bus, address, SSD1306_CMD_SET_DISPLAY_OFFSET, 0x00)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // Set start line
    if (!send_command(bus, address, SSD1306_CMD_SET_START_LINE)) return false;

    // Enable charge pump
    if (!send_command2(bus, address, SSD1306_CMD_CHARGE_PUMP, 0x14)) return false;

    // Set memory addressing mode (horizontal)
    if (!send_command2(bus, address, SSD1306_CMD_SET_MEMORY_MODE, 0x00)) return false;

    // Segment remap (flip horizontal)
    if (!send_command(bus, address, SSD1306_CMD_SEG_REMAP)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // COM scan direction (flip vertical)
    if (!send_command(bus, address, SSD1306_CMD_COM_SCAN_DEC)) return false;

    // Set COM pins based on height
    uint8_t com_pins = (height == 64) ? 0x12 : 0x02;
    if (!send_command2(bus, address, SSD1306_CMD_SET_COM_PINS, com_pins)) return false;

    // Set contrast
    if (!send_command2(bus, address, SSD1306_CMD_SET_CONTRAST, 0xCF)) return false;

    // Set pre-charge period
    if (!send_command2(bus, address, SSD1306_CMD_SET_PRECHARGE, 0xF1)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // Set VCOMH deselect level
    if (!send_command2(bus, address, SSD1306_CMD_SET_VCOM_DESELECT, 0x40)) return false;

    // Display from RAM
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_RAM)) return false;

    // Normal display (not inverted)
    if (!send_command(bus, address, SSD1306_CMD_NORMAL_DISPLAY)) return false;

    // Display ON
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_ON)) return false;

    return true;
}

static bool init_sh1106(uint8_t bus, uint8_t address, uint8_t width, uint8_t height) {
    // SH1106 is similar to SSD1306 but uses page addressing mode
    // Display OFF
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_OFF)) return false;

    // Set clock divide ratio
    if (!send_command2(bus, address, SSD1306_CMD_SET_CLOCK_DIV, 0x80)) return false;

    // Set multiplex ratio
    if (!send_command2(bus, address, SSD1306_CMD_SET_MUX_RATIO, height - 1)) return false;

    // Set display offset
    if (!send_command2(bus, address, SSD1306_CMD_SET_DISPLAY_OFFSET, 0x00)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // Set start line
    if (!send_command(bus, address, SSD1306_CMD_SET_START_LINE)) return false;

    // Enable charge pump
    if (!send_command2(bus, address, SSD1306_CMD_CHARGE_PUMP, 0x14)) return false;

    // Page addressing mode for SH1106
    if (!send_command2(bus, address, SSD1306_CMD_SET_MEMORY_MODE, 0x02)) return false;

    // Segment remap
    if (!send_command(bus, address, SSD1306_CMD_SEG_REMAP)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // COM scan direction
    if (!send_command(bus, address, SSD1306_CMD_COM_SCAN_DEC)) return false;

    // Set COM pins
    uint8_t com_pins = (height == 64) ? 0x12 : 0x02;
    if (!send_command2(bus, address, SSD1306_CMD_SET_COM_PINS, com_pins)) return false;

    // Set contrast
    if (!send_command2(bus, address, SSD1306_CMD_SET_CONTRAST, 0xCF)) return false;

    // Set pre-charge period
    if (!send_command2(bus, address, SSD1306_CMD_SET_PRECHARGE, 0xF1)) return false;

    yield_to_wifi();  // Keep WiFi alive

    // Set VCOMH deselect level
    if (!send_command2(bus, address, SSD1306_CMD_SET_VCOM_DESELECT, 0x40)) return false;

    // Display from RAM
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_RAM)) return false;

    // Normal display
    if (!send_command(bus, address, SSD1306_CMD_NORMAL_DISPLAY)) return false;

    // Display ON
    if (!send_command(bus, address, SSD1306_CMD_DISPLAY_ON)) return false;

    return true;
}

static bool write_framebuffer_ssd1306(uint8_t bus, uint8_t address, uint8_t width, uint8_t height,
                                       const std::vector<uint8_t>& buffer) {
    uint8_t pages = height / 8;

    // Set column address range
    if (!send_command3(bus, address, SSD1306_CMD_SET_COL_ADDR, 0x00, width - 1)) return false;

    // Set page address range
    if (!send_command3(bus, address, SSD1306_CMD_SET_PAGE_ADDR, 0x00, pages - 1)) return false;

    // Write data in chunks
    // Smaller chunks (32 bytes) are more reliable with background WiFi interrupts
    size_t chunk_size = 32;
    size_t offset = 0;
    size_t chunks_since_yield = 0;

    while (offset < buffer.size()) {
        size_t remaining = buffer.size() - offset;
        size_t to_send = (remaining > chunk_size) ? chunk_size : remaining;

        // Create buffer with control byte prefix
        std::vector<uint8_t> chunk(to_send + 1);
        chunk[0] = CONTROL_BYTE_DATA;
        memcpy(&chunk[1], &buffer[offset], to_send);

        if (!hal_i2c_write(bus, address, chunk.data(), chunk.size())) {
            return false;
        }

        offset += to_send;
        chunks_since_yield++;

        // Yield to WiFi every 4 chunks (~128 bytes) to keep connection alive
        if (chunks_since_yield >= 4) {
            yield_to_wifi();
            chunks_since_yield = 0;
        }
    }

    return true;
}

static bool write_framebuffer_sh1106(uint8_t bus, uint8_t address, uint8_t width, uint8_t height,
                                      const std::vector<uint8_t>& buffer) {
    uint8_t pages = height / 8;

    // SH1106 requires page-by-page writing with column offset of 2
    for (uint8_t page = 0; page < pages; page++) {
        // Set page address
        if (!send_command(bus, address, 0xB0 + page)) return false;

        // Set lower column address (with offset 2 for 128px displays)
        if (!send_command(bus, address, 0x02)) return false;

        // Set higher column address
        if (!send_command(bus, address, 0x10)) return false;

        // Write page data
        size_t page_offset = page * width;
        std::vector<uint8_t> page_data(width + 1);
        page_data[0] = CONTROL_BYTE_DATA;
        memcpy(&page_data[1], &buffer[page_offset], width);

        if (!hal_i2c_write(bus, address, page_data.data(), page_data.size())) {
            return false;
        }

        // Yield to WiFi every 2 pages to keep connection alive
        if ((page % 2) == 1) {
            yield_to_wifi();
        }
    }

    return true;
}

void handle_display_update(const picojson::object& payload) {
    auto bus_it = payload.find("bus");
    auto addr_it = payload.find("address");
    auto controller_it = payload.find("controller");
    auto width_it = payload.find("width");
    auto height_it = payload.find("height");
    auto segments_it = payload.find("segments");

    if (bus_it == payload.end() || !bus_it->second.is<double>() ||
        addr_it == payload.end() || !addr_it->second.is<std::string>() ||
        controller_it == payload.end() || !controller_it->second.is<std::string>() ||
        width_it == payload.end() || !width_it->second.is<double>() ||
        height_it == payload.end() || !height_it->second.is<double>() ||
        segments_it == payload.end() || !segments_it->second.is<picojson::array>()) {
        i2c_cmd_send_error("Missing required parameters: bus, address, controller, width, height, segments");
        return;
    }

    uint8_t bus = (uint8_t)bus_it->second.get<double>();
    std::string addr_str = addr_it->second.get<std::string>();
    std::string controller = controller_it->second.get<std::string>();
    uint8_t width = (uint8_t)width_it->second.get<double>();
    uint8_t height = (uint8_t)height_it->second.get<double>();
    const picojson::array& segments = segments_it->second.get<picojson::array>();

    if (bus > 1) {
        i2c_cmd_send_error("Invalid bus number (must be 0 or 1)");
        return;
    }

    uint8_t address = (uint8_t)strtol(addr_str.c_str(), nullptr, 16);

    // Validate controller type
    bool is_ssd1306 = (controller == "ssd1306");
    bool is_sh1106 = (controller == "sh1106");
    if (!is_ssd1306 && !is_sh1106) {
        i2c_cmd_send_error("Invalid controller type (use 'ssd1306' or 'sh1106')");
        return;
    }

    // Validate dimensions
    if (width != 128 || (height != 32 && height != 64)) {
        i2c_cmd_send_error("Invalid dimensions (supported: 128x32 or 128x64)");
        return;
    }

    size_t framebuffer_size = (size_t)width * height / 8;

    // Resize local framebuffer if needed (preserves existing content for incremental updates)
    if (s_framebuffer.size() != framebuffer_size) {
        s_framebuffer.resize(framebuffer_size, 0);
    }

    // Apply each segment to the local framebuffer
    size_t total_bytes_written = 0;
    for (size_t i = 0; i < segments.size(); i++) {
        if (!segments[i].is<picojson::object>()) {
            i2c_cmd_send_error("Invalid segment: must be an object");
            return;
        }

        const picojson::object& seg = segments[i].get<picojson::object>();
        auto offset_it = seg.find("offset");
        auto data_it = seg.find("data");

        if (offset_it == seg.end() || !offset_it->second.is<double>() ||
            data_it == seg.end() || !data_it->second.is<std::string>()) {
            i2c_cmd_send_error("Invalid segment: missing offset or data");
            return;
        }

        size_t offset = (size_t)offset_it->second.get<double>();
        const std::string& data_b64 = data_it->second.get<std::string>();

        std::vector<uint8_t> data = base64_decode(data_b64);
        if (data.empty() && !data_b64.empty()) {
            i2c_cmd_send_error("Failed to decode segment base64 data");
            return;
        }

        if (offset + data.size() > framebuffer_size) {
            char error_msg[128];
            snprintf(error_msg, sizeof(error_msg),
                     "Segment overflow: offset %zu + length %zu > buffer size %zu",
                     offset, data.size(), framebuffer_size);
            i2c_cmd_send_error(error_msg);
            return;
        }

        memcpy(&s_framebuffer[offset], data.data(), data.size());
        total_bytes_written += data.size();
    }

    // Check if init is requested
    bool do_init = false;
    auto init_it = payload.find("init");
    if (init_it != payload.end() && init_it->second.is<bool>()) {
        do_init = init_it->second.get<bool>();
    }

    // Initialize display if requested
    if (do_init) {
        bool init_success;
        if (is_ssd1306) {
            init_success = init_ssd1306(bus, address, width, height);
        } else {
            init_success = init_sh1106(bus, address, width, height);
        }

        if (!init_success) {
            i2c_cmd_send_error("Failed to initialize display");
            return;
        }
        printf("Display %s initialized at %s\n", controller.c_str(), addr_str.c_str());
    }

    // Write framebuffer
    bool write_success;
    if (is_ssd1306) {
        write_success = write_framebuffer_ssd1306(bus, address, width, height, s_framebuffer);
    } else {
        write_success = write_framebuffer_sh1106(bus, address, width, height, s_framebuffer);
    }

    if (!write_success) {
        i2c_cmd_send_error("Failed to write framebuffer to display");
        return;
    }

    printf("Display updated: %dx%d, %zu segments, %zu bytes\n",
           width, height, segments.size(), total_bytes_written);

    picojson::object ack;
    ack["command"] = picojson::value("display_update");
    ack["controller"] = picojson::value(controller);
    ack["width"] = picojson::value((double)width);
    ack["height"] = picojson::value((double)height);
    ack["segments_count"] = picojson::value((double)segments.size());
    ack["bytes_written"] = picojson::value((double)total_bytes_written);
    ack["status"] = picojson::value("success");
    i2c_cmd_send_response("command_ack", picojson::value(ack));
}
