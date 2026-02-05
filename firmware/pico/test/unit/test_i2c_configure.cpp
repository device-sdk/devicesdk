#include <gtest/gtest.h>
#include "i2c_command_handler.h"
#include "i2c_configure.h"
#include "hal_mock.h"
#include <string>
#include <vector>

// Test fixture for I2C configure tests
class I2CConfigureTest : public ::testing::Test {
protected:
    std::vector<std::pair<std::string, picojson::value>> responses;
    std::vector<std::string> errors;
    std::string message_id;

    static void response_callback(const char* type, const picojson::value& data) {
        getInstance()->responses.emplace_back(type, data);
    }

    static void error_callback(const char* message) {
        getInstance()->errors.emplace_back(message);
    }

    static I2CConfigureTest* getInstance() {
        return s_instance;
    }

    void SetUp() override {
        s_instance = this;
        g_hal_mock.reset();
        responses.clear();
        errors.clear();
        message_id.clear();
        i2c_commands_init(response_callback, error_callback, &message_id);
    }

    void TearDown() override {
        s_instance = nullptr;
    }

    picojson::object makePayload(uint8_t bus, uint8_t sda, uint8_t scl, uint32_t freq = 0) {
        picojson::object payload;
        payload["bus"] = picojson::value((double)bus);
        payload["sda_pin"] = picojson::value((double)sda);
        payload["scl_pin"] = picojson::value((double)scl);
        if (freq > 0) {
            payload["frequency"] = picojson::value((double)freq);
        }
        return payload;
    }

private:
    static I2CConfigureTest* s_instance;
};

I2CConfigureTest* I2CConfigureTest::s_instance = nullptr;

TEST_F(I2CConfigureTest, ValidI2C0DefaultPins) {
    picojson::object payload = makePayload(0, 4, 5);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "command_ack");

    // Verify HAL was called
    ASSERT_EQ(g_hal_mock.i2c_configure_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].bus, 0);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].sda_pin, 4);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].scl_pin, 5);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].frequency, 100000);
}

TEST_F(I2CConfigureTest, ValidI2C0AlternatePins) {
    picojson::object payload = makePayload(0, 8, 9);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    ASSERT_EQ(g_hal_mock.i2c_configure_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].sda_pin, 8);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].scl_pin, 9);
}

TEST_F(I2CConfigureTest, ValidI2C1DefaultPins) {
    picojson::object payload = makePayload(1, 6, 7);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    ASSERT_EQ(g_hal_mock.i2c_configure_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].bus, 1);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].sda_pin, 6);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].scl_pin, 7);
}

TEST_F(I2CConfigureTest, CustomFrequency) {
    picojson::object payload = makePayload(0, 4, 5, 400000);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(g_hal_mock.i2c_configure_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls[0].frequency, 400000);
}

TEST_F(I2CConfigureTest, InvalidBusNumber) {
    picojson::object payload = makePayload(2, 4, 5);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid bus") != std::string::npos);
    EXPECT_EQ(responses.size(), 0);
    EXPECT_EQ(g_hal_mock.i2c_configure_calls.size(), 0);
}

TEST_F(I2CConfigureTest, InvalidPinCombinationForI2C0) {
    // GP2/GP3 is valid for I2C1, not I2C0
    picojson::object payload = makePayload(0, 2, 3);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid pin") != std::string::npos);
    EXPECT_EQ(responses.size(), 0);
}

TEST_F(I2CConfigureTest, InvalidPinCombinationForI2C1) {
    // GP4/GP5 is valid for I2C0, not I2C1
    picojson::object payload = makePayload(1, 4, 5);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid pin") != std::string::npos);
    EXPECT_EQ(responses.size(), 0);
}

TEST_F(I2CConfigureTest, MissingBusParameter) {
    picojson::object payload;
    payload["sda_pin"] = picojson::value(4.0);
    payload["scl_pin"] = picojson::value(5.0);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing required") != std::string::npos);
}

TEST_F(I2CConfigureTest, MissingSdaPin) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["scl_pin"] = picojson::value(5.0);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing required") != std::string::npos);
}

TEST_F(I2CConfigureTest, MissingSclPin) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["sda_pin"] = picojson::value(4.0);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing required") != std::string::npos);
}

TEST_F(I2CConfigureTest, AllValidI2C0Pins) {
    // Test all valid I2C0 pin combinations
    std::vector<std::pair<uint8_t, uint8_t>> valid_pins = {
        {0, 1}, {4, 5}, {8, 9}, {12, 13}, {16, 17}, {20, 21}
    };

    for (const auto& pins : valid_pins) {
        g_hal_mock.reset();
        responses.clear();
        errors.clear();

        picojson::object payload = makePayload(0, pins.first, pins.second);
        handle_i2c_configure(payload);

        ASSERT_EQ(errors.size(), 0) << "Failed for pins GP" << (int)pins.first << "/GP" << (int)pins.second;
        ASSERT_EQ(responses.size(), 1);
    }
}

TEST_F(I2CConfigureTest, AllValidI2C1Pins) {
    // Test all valid I2C1 pin combinations
    std::vector<std::pair<uint8_t, uint8_t>> valid_pins = {
        {2, 3}, {6, 7}, {10, 11}, {14, 15}, {18, 19}, {26, 27}
    };

    for (const auto& pins : valid_pins) {
        g_hal_mock.reset();
        responses.clear();
        errors.clear();

        picojson::object payload = makePayload(1, pins.first, pins.second);
        handle_i2c_configure(payload);

        ASSERT_EQ(errors.size(), 0) << "Failed for pins GP" << (int)pins.first << "/GP" << (int)pins.second;
        ASSERT_EQ(responses.size(), 1);
    }
}

TEST_F(I2CConfigureTest, ResponseContainsCorrectFields) {
    picojson::object payload = makePayload(0, 4, 5, 400000);

    handle_i2c_configure(payload);

    ASSERT_EQ(responses.size(), 1);
    const picojson::value& resp = responses[0].second;
    ASSERT_TRUE(resp.is<picojson::object>());

    const picojson::object& obj = resp.get<picojson::object>();
    EXPECT_EQ(obj.at("command").get<std::string>(), "i2c_configure");
    EXPECT_EQ(obj.at("bus").get<double>(), 0);
    EXPECT_EQ(obj.at("sda_pin").get<double>(), 4);
    EXPECT_EQ(obj.at("scl_pin").get<double>(), 5);
    EXPECT_EQ(obj.at("frequency").get<double>(), 400000);
    EXPECT_EQ(obj.at("status").get<std::string>(), "success");
}

TEST_F(I2CConfigureTest, HalConfigureFailure) {
    g_hal_mock.i2c_configure_return = false;
    picojson::object payload = makePayload(0, 4, 5);

    handle_i2c_configure(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Failed to configure") != std::string::npos);
    EXPECT_EQ(responses.size(), 0);
}
