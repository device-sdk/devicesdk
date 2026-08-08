#include <gtest/gtest.h>
#include "commands/sensor_commands.h"
#include "hal_mock.h"
#include <array>
#include <cstring>
#include <string>
#include <vector>

// Parsing and dispatch for onewire_search / onewire_read_temp / dht_read.
// The bit-banged HAL itself needs real hardware; here the HAL is mocked and we
// assert on what reaches it and on the response frames that come back.

class SensorCommandsTest : public ::testing::Test {
protected:
    worker_command_t cmd{};
    worker_response_t resp{};
    std::string error;

    void SetUp() override {
        g_hal_mock.reset();
        cmd = {};
        resp = {};
        error.clear();
    }
};

// ==================== ROM HEX PARSING ====================

TEST_F(SensorCommandsTest, ParsesRomHexFamilyCodeFirst) {
    uint8_t rom[8] = {0};
    ASSERT_TRUE(sensor_parse_rom_hex("28FF641E8D3C4A41", rom));
    EXPECT_EQ(rom[0], 0x28);
    EXPECT_EQ(rom[1], 0xFF);
    EXPECT_EQ(rom[7], 0x41);
}

TEST_F(SensorCommandsTest, RejectsShortRomHex) {
    uint8_t rom[8] = {0};
    EXPECT_FALSE(sensor_parse_rom_hex("28FF", rom));
}

TEST_F(SensorCommandsTest, RejectsLowercaseRomHex) {
    uint8_t rom[8] = {0};
    EXPECT_FALSE(sensor_parse_rom_hex("28ff641e8d3c4a61", rom));
}

TEST_F(SensorCommandsTest, RejectsNonHexRomCharacters) {
    uint8_t rom[8] = {0};
    EXPECT_FALSE(sensor_parse_rom_hex("28FF641E8D3C4AZZ", rom));
}

// ==================== ONEWIRE SEARCH PARSING ====================

TEST_F(SensorCommandsTest, ParsesOnewireSearch) {
    picojson::object payload;
    payload["pin"] = picojson::value(4.0);

    ASSERT_TRUE(parse_onewire_search(payload, &cmd, &error));
    EXPECT_EQ(cmd.type, CMD_ONEWIRE_SEARCH);
    EXPECT_EQ(cmd.payload.onewire_search.pin, 4);
}

TEST_F(SensorCommandsTest, RejectsOnewireSearchWithoutPin) {
    picojson::object payload;
    EXPECT_FALSE(parse_onewire_search(payload, &cmd, &error));
    EXPECT_NE(error.find("pin"), std::string::npos);
}

TEST_F(SensorCommandsTest, RejectsOnewireSearchOnOutOfRangePin) {
    picojson::object payload;
    payload["pin"] = picojson::value(99.0);  // virtual onboard LED, not a bus
    EXPECT_FALSE(parse_onewire_search(payload, &cmd, &error));
}

TEST_F(SensorCommandsTest, RejectsFractionalPin) {
    picojson::object payload;
    payload["pin"] = picojson::value(4.5);  // truncating would read the wrong pin
    EXPECT_FALSE(parse_onewire_search(payload, &cmd, &error));
    EXPECT_NE(error.find("pin"), std::string::npos);
}

TEST_F(SensorCommandsTest, RejectsPinsReservedForWifi) {
    // GP23..GP25 drive the CYW43439 on the Pico W; a sensor bus there fights
    // the radio.
    for (double pin : {23.0, 24.0, 25.0}) {
        picojson::object payload;
        payload["pin"] = picojson::value(pin);
        EXPECT_FALSE(parse_onewire_search(payload, &cmd, &error));
    }
}

TEST_F(SensorCommandsTest, AcceptsHighestUsablePin) {
    picojson::object payload;
    payload["pin"] = picojson::value(28.0);
    ASSERT_TRUE(parse_onewire_search(payload, &cmd, &error));
    EXPECT_EQ(cmd.payload.onewire_search.pin, 28);
}

// ==================== ONEWIRE READ TEMP PARSING ====================

TEST_F(SensorCommandsTest, ParsesOnewireReadTempWithoutRomAsSkipRom) {
    picojson::object payload;
    payload["pin"] = picojson::value(4.0);

    ASSERT_TRUE(parse_onewire_read_temp(payload, &cmd, &error));
    EXPECT_EQ(cmd.type, CMD_ONEWIRE_READ_TEMP);
    EXPECT_EQ(cmd.payload.onewire_read_temp.pin, 4);
    EXPECT_FALSE(cmd.payload.onewire_read_temp.has_rom);
}

TEST_F(SensorCommandsTest, ParsesOnewireReadTempWithRom) {
    picojson::object payload;
    payload["pin"] = picojson::value(4.0);
    payload["rom"] = picojson::value(std::string("28FF641E8D3C4A41"));

    ASSERT_TRUE(parse_onewire_read_temp(payload, &cmd, &error));
    EXPECT_TRUE(cmd.payload.onewire_read_temp.has_rom);
    EXPECT_EQ(cmd.payload.onewire_read_temp.rom[0], 0x28);
    EXPECT_EQ(cmd.payload.onewire_read_temp.rom[7], 0x41);
}

TEST_F(SensorCommandsTest, RejectsMalformedRomRatherThanFallingBackToSkipRom) {
    picojson::object payload;
    payload["pin"] = picojson::value(4.0);
    payload["rom"] = picojson::value(std::string("not-a-rom"));

    EXPECT_FALSE(parse_onewire_read_temp(payload, &cmd, &error));
    EXPECT_NE(error.find("rom"), std::string::npos);
}

// ==================== DHT READ PARSING ====================

TEST_F(SensorCommandsTest, ParsesDht11) {
    picojson::object payload;
    payload["pin"] = picojson::value(15.0);
    payload["model"] = picojson::value(std::string("dht11"));

    ASSERT_TRUE(parse_dht_read(payload, &cmd, &error));
    EXPECT_EQ(cmd.type, CMD_DHT_READ);
    EXPECT_EQ(cmd.payload.dht_read.pin, 15);
    EXPECT_EQ(cmd.payload.dht_read.model, DHT_MODEL_DHT11);
}

TEST_F(SensorCommandsTest, ParsesDht22) {
    picojson::object payload;
    payload["pin"] = picojson::value(15.0);
    payload["model"] = picojson::value(std::string("dht22"));

    ASSERT_TRUE(parse_dht_read(payload, &cmd, &error));
    EXPECT_EQ(cmd.payload.dht_read.model, DHT_MODEL_DHT22);
}

TEST_F(SensorCommandsTest, RejectsUnknownDhtModel) {
    picojson::object payload;
    payload["pin"] = picojson::value(15.0);
    payload["model"] = picojson::value(std::string("dht12"));

    EXPECT_FALSE(parse_dht_read(payload, &cmd, &error));
}

TEST_F(SensorCommandsTest, RejectsDhtReadWithoutModel) {
    picojson::object payload;
    payload["pin"] = picojson::value(15.0);

    EXPECT_FALSE(parse_dht_read(payload, &cmd, &error));
    EXPECT_NE(error.find("model"), std::string::npos);
}

// ==================== DISPATCH ====================

TEST_F(SensorCommandsTest, SearchReturnsEveryRomTheBusReported) {
    g_hal_mock.onewire_search_roms = {
        {0x28, 0xFF, 0x64, 0x1E, 0x8D, 0x3C, 0x4A, 0x61},
        {0x28, 0xAA, 0x11, 0x22, 0x33, 0x44, 0x55, 0x66},
    };
    cmd.type = CMD_ONEWIRE_SEARCH;
    cmd.payload.onewire_search.pin = 4;

    handle_onewire_search(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.data.onewire_search.pin, 4);
    ASSERT_EQ(resp.data.onewire_search.count, 2);
    EXPECT_EQ(resp.data.onewire_search.roms[1][1], 0xAA);
    ASSERT_EQ(g_hal_mock.onewire_search_calls.size(), 1u);
    EXPECT_EQ(g_hal_mock.onewire_search_calls[0], 4);
}

TEST_F(SensorCommandsTest, SearchOnADeadBusIsAnError) {
    g_hal_mock.onewire_search_return = -1;
    cmd.type = CMD_ONEWIRE_SEARCH;
    cmd.payload.onewire_search.pin = 4;

    handle_onewire_search(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_NE(std::string(resp.error_msg).find("presence"), std::string::npos);
}

TEST_F(SensorCommandsTest, ReadTempWithoutRomPassesNullToTheHal) {
    g_hal_mock.onewire_read_celsius = 22.75f;
    cmd.type = CMD_ONEWIRE_READ_TEMP;
    cmd.payload.onewire_read_temp.pin = 4;
    cmd.payload.onewire_read_temp.has_rom = false;

    handle_onewire_read_temp(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_FLOAT_EQ(resp.data.onewire_temp.celsius, 22.75f);
    EXPECT_FALSE(resp.data.onewire_temp.has_rom);
    ASSERT_EQ(g_hal_mock.onewire_read_calls.size(), 1u);
    EXPECT_FALSE(g_hal_mock.onewire_read_calls[0].has_rom);
}

TEST_F(SensorCommandsTest, ReadTempEchoesTheAddressedRom) {
    cmd.type = CMD_ONEWIRE_READ_TEMP;
    cmd.payload.onewire_read_temp.pin = 4;
    cmd.payload.onewire_read_temp.has_rom = true;
    const uint8_t rom[8] = {0x28, 0xFF, 0x64, 0x1E, 0x8D, 0x3C, 0x4A, 0x61};
    memcpy(cmd.payload.onewire_read_temp.rom, rom, 8);

    handle_onewire_read_temp(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_TRUE(resp.data.onewire_temp.has_rom);
    EXPECT_EQ(memcmp(resp.data.onewire_temp.rom, rom, 8), 0);
    ASSERT_EQ(g_hal_mock.onewire_read_calls.size(), 1u);
    EXPECT_TRUE(g_hal_mock.onewire_read_calls[0].has_rom);
}

TEST_F(SensorCommandsTest, ReadTempCrcFailureIsAnError) {
    g_hal_mock.onewire_read_return = false;
    cmd.type = CMD_ONEWIRE_READ_TEMP;
    cmd.payload.onewire_read_temp.pin = 4;

    handle_onewire_read_temp(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_NE(std::string(resp.error_msg).find("CRC"), std::string::npos);
}

TEST_F(SensorCommandsTest, DhtReadReturnsBothMeasurements) {
    g_hal_mock.dht_celsius = 19.4f;
    g_hal_mock.dht_humidity_pct = 51.2f;
    cmd.type = CMD_DHT_READ;
    cmd.payload.dht_read.pin = 15;
    cmd.payload.dht_read.model = DHT_MODEL_DHT22;

    handle_dht_read(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.data.dht.pin, 15);
    EXPECT_FLOAT_EQ(resp.data.dht.celsius, 19.4f);
    EXPECT_FLOAT_EQ(resp.data.dht.humidity_pct, 51.2f);
    ASSERT_EQ(g_hal_mock.dht_read_calls.size(), 1u);
    EXPECT_EQ(g_hal_mock.dht_read_calls[0].model, DHT_MODEL_DHT22);
}

TEST_F(SensorCommandsTest, DhtReadFailureMentionsTheRateLimit) {
    g_hal_mock.dht_read_return = DHT_READ_RATE_LIMITED;
    cmd.type = CMD_DHT_READ;
    cmd.payload.dht_read.pin = 15;
    cmd.payload.dht_read.model = DHT_MODEL_DHT11;

    handle_dht_read(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_NE(std::string(resp.error_msg).find("2s"), std::string::npos);
}

TEST_F(SensorCommandsTest, DhtReadFailureMentionsTimeoutOrChecksum) {
    g_hal_mock.dht_read_return = DHT_READ_FAILED;
    cmd.type = CMD_DHT_READ;
    cmd.payload.dht_read.pin = 15;
    cmd.payload.dht_read.model = DHT_MODEL_DHT22;

    handle_dht_read(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_NE(std::string(resp.error_msg).find("checksum"), std::string::npos);
}

// ==================== CRC8 (known-answer vectors) ====================

TEST_F(SensorCommandsTest, Crc8KnownAnswerVectors) {
    const uint8_t one[1] = {0x01};
    EXPECT_EQ(sensor_ow_crc8(one, 1), 0x5E);  // Maxim AN27 published value

    const uint8_t ff[1] = {0xFF};
    EXPECT_EQ(sensor_ow_crc8(ff, 1), 0x35);

    // A valid 8-byte ROM: byte 7 is the CRC of bytes 0-6.
    const uint8_t rom[8] = {0x28, 0xFF, 0x64, 0x1E, 0x8D, 0x3C, 0x4A, 0x41};
    EXPECT_EQ(sensor_ow_crc8(rom, 8), 0x00);

    const uint8_t corrupted[8] = {0x28, 0xFF, 0x64, 0x1E, 0x8D, 0x3C, 0x4A, 0x42};
    EXPECT_NE(sensor_ow_crc8(corrupted, 8), 0x00);
}

// ==================== DHT FRAME DECODE ====================

TEST_F(SensorCommandsTest, Dht22DecodeTenthsAndHumidity) {
    // 26.7 % RH / 27.7 C; checksum = 0x01+0x0B+0x01+0x15 = 0x22.
    const uint8_t frame[5] = {0x01, 0x0B, 0x01, 0x15, 0x22};
    float c = 0.0f, h = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &c, &h));
    EXPECT_FLOAT_EQ(c, 27.7f);
    EXPECT_FLOAT_EQ(h, 26.7f);
}

TEST_F(SensorCommandsTest, Dht22DecodeNegativeTemperature) {
    // DHT22 is sign-magnitude: byte 2's high bit is the sign, the low 15 bits
    // the magnitude in tenths. -10.1 C = 0x8065, 45.6 % = 0x01C8.
    const uint8_t frame[5] = {0x01, 0xC8, 0x80, 0x65, 0xAE};
    float c = 0.0f, h = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &c, &h));
    EXPECT_FLOAT_EQ(c, -10.1f);
    EXPECT_FLOAT_EQ(h, 45.6f);
}

TEST_F(SensorCommandsTest, Dht11DecodeWholeNumbers) {
    // 45 % RH / 23 C; checksum = 0x2D+0x17 = 0x44.
    const uint8_t frame[5] = {0x2D, 0x00, 0x17, 0x00, 0x44};
    float c = 0.0f, h = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT11, frame, &c, &h));
    EXPECT_FLOAT_EQ(c, 23.0f);
    EXPECT_FLOAT_EQ(h, 45.0f);
}

TEST_F(SensorCommandsTest, DhtDecodeRejectsChecksumMismatch) {
    const uint8_t frame[5] = {0x01, 0x0B, 0x01, 0x15, 0x00};
    float c = 0.0f, h = 0.0f;
    EXPECT_FALSE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &c, &h));
}

// ==================== ROM SEARCH WALK (scripted bus) ====================

namespace {

std::array<uint8_t, 8> rom_of(const std::string& hex) {
    std::array<uint8_t, 8> rom{};
    for (size_t i = 0; i < 8; i++) {
        auto nib = [](char c) -> int {
            if (c >= '0' && c <= '9') return c - '0';
            if (c >= 'A' && c <= 'F') return c - 'A' + 10;
            return 0;
        };
        rom[i] = (uint8_t)((nib(hex[i * 2]) << 4) | nib(hex[i * 2 + 1]));
    }
    return rom;
}

// Emulates the open-drain wired-AND bus during a search: only devices whose
// ROM matches the prefix the walk has written so far drive the line.
class ScriptedOwBus {
public:
    std::vector<std::array<uint8_t, 8>> devices;
    int reset_calls = 0;

    bool reset(void*) {
        reset_calls++;
        active_.clear();
        for (size_t i = 0; i < devices.size(); i++) active_.push_back((int)i);
        read_count_ = 0;
        return !active_.empty();
    }

    bool read_bit(void*) {
        int pos = read_count_ / 2;
        bool is_cmp = (read_count_ % 2) == 1;
        read_count_++;
        if (active_.empty()) return true;  // released line: no device answers
        for (int idx : active_) {
            bool bit = bit_of(devices[(size_t)idx], pos);
            // id: the device sends its bit; cmp: it sends the complement.
            if (!(is_cmp ? !bit : bit)) return false;  // someone pulls low
        }
        return true;
    }

    void write_bit(void*, bool bit) {
        if (read_count_ == 0) return;  // search-ROM command byte, not a ROM bit
        int pos = (read_count_ - 1) / 2;
        std::vector<int> next;
        for (int idx : active_) {
            if (bit_of(devices[(size_t)idx], pos) == bit) next.push_back(idx);
        }
        active_ = next;
    }

private:
    std::vector<int> active_;
    int read_count_ = 0;

    static bool bit_of(const std::array<uint8_t, 8>& rom, int pos) {
        uint8_t mask = (uint8_t)(1u << (pos % 8));
        return (rom[(size_t)(pos / 8)] & mask) != 0;
    }
};

bool sb_reset(void* ctx) { return static_cast<ScriptedOwBus*>(ctx)->reset(ctx); }
bool sb_read_bit(void* ctx) {
    return static_cast<ScriptedOwBus*>(ctx)->read_bit(ctx);
}
void sb_write_bit(void* ctx, bool bit) {
    static_cast<ScriptedOwBus*>(ctx)->write_bit(ctx, bit);
}

}  // namespace

TEST_F(SensorCommandsTest, SearchFindsSingleDs18b20) {
    ScriptedOwBus bus;
    bus.devices = {rom_of("28FF641E8D3C4A41")};
    sensor_ow_bus_t vtable = {sb_reset, sb_read_bit, sb_write_bit};

    uint8_t roms[8][8];
    int count = sensor_ow_search(&vtable, &bus, roms, 8);

    ASSERT_EQ(count, 1);
    EXPECT_EQ(memcmp(roms[0], bus.devices[0].data(), 8), 0);
    EXPECT_EQ(bus.reset_calls, 1);  // no discrepancies: one pass terminates
}

TEST_F(SensorCommandsTest, SearchFindsBothDevicesOnMultiDropBus) {
    // Both ROMs are CRC-valid (byte 7 = CRC of bytes 0-6). The walk explores
    // the 0-branch first, so the second device is returned before the first.
    ScriptedOwBus bus;
    bus.devices = {
        rom_of("28FF641E8D3C4A41"),
        rom_of("28AA112233445535"),
    };
    sensor_ow_bus_t vtable = {sb_reset, sb_read_bit, sb_write_bit};

    uint8_t roms[8][8];
    int count = sensor_ow_search(&vtable, &bus, roms, 8);

    ASSERT_EQ(count, 2);
    EXPECT_EQ(memcmp(roms[0], bus.devices[1].data(), 8), 0);
    EXPECT_EQ(memcmp(roms[1], bus.devices[0].data(), 8), 0);
}

TEST_F(SensorCommandsTest, SearchSkipsNonDs18b20Devices) {
    // A DS2401 (family 0x01) shares the bus; only the DS18B20 is returned.
    ScriptedOwBus bus;
    bus.devices = {
        rom_of("01FF641E8D3C4A62"),  // not a DS18B20; CRC still must be valid
        rom_of("28AA112233445535"),
    };
    sensor_ow_bus_t vtable = {sb_reset, sb_read_bit, sb_write_bit};

    uint8_t roms[8][8];
    int count = sensor_ow_search(&vtable, &bus, roms, 8);

    ASSERT_EQ(count, 1);
    EXPECT_EQ(memcmp(roms[0], bus.devices[1].data(), 8), 0);
}

TEST_F(SensorCommandsTest, SearchOnDeadBusIsAnError) {
    ScriptedOwBus bus;  // no devices
    sensor_ow_bus_t vtable = {sb_reset, sb_read_bit, sb_write_bit};

    uint8_t roms[8][8];
    int count = sensor_ow_search(&vtable, &bus, roms, 8);

    EXPECT_EQ(count, -1);
}

TEST_F(SensorCommandsTest, SearchCapsAtMaxRoms) {
    ScriptedOwBus bus;
    bus.devices = {
        rom_of("28AA112233445535"),
        rom_of("28102030405060D6"),
        rom_of("2899887766554439"),
    };
    sensor_ow_bus_t vtable = {sb_reset, sb_read_bit, sb_write_bit};

    uint8_t roms[8][8];
    int count = sensor_ow_search(&vtable, &bus, roms, 2);

    EXPECT_EQ(count, 2);
}
