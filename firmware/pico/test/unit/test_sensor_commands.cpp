#include <gtest/gtest.h>
#include "commands/sensor_commands.h"
#include "hal_mock.h"
#include <string>

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
    ASSERT_TRUE(sensor_parse_rom_hex("28FF641E8D3C4A61", rom));
    EXPECT_EQ(rom[0], 0x28);
    EXPECT_EQ(rom[1], 0xFF);
    EXPECT_EQ(rom[7], 0x61);
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
    payload["rom"] = picojson::value(std::string("28FF641E8D3C4A61"));

    ASSERT_TRUE(parse_onewire_read_temp(payload, &cmd, &error));
    EXPECT_TRUE(cmd.payload.onewire_read_temp.has_rom);
    EXPECT_EQ(cmd.payload.onewire_read_temp.rom[0], 0x28);
    EXPECT_EQ(cmd.payload.onewire_read_temp.rom[7], 0x61);
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
    g_hal_mock.dht_read_return = false;
    cmd.type = CMD_DHT_READ;
    cmd.payload.dht_read.pin = 15;
    cmd.payload.dht_read.model = DHT_MODEL_DHT11;

    handle_dht_read(&cmd, &resp);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_NE(std::string(resp.error_msg).find("2s"), std::string::npos);
}
