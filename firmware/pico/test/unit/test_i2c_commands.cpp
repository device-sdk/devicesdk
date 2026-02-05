#include <gtest/gtest.h>
#include "i2c_command_handler.h"
#include "i2c_scan.h"
#include "i2c_write.h"
#include "i2c_read.h"
#include "i2c_batch_write.h"
#include "hal_mock.h"
#include <string>
#include <vector>

// Test fixture for I2C command tests
class I2CCommandsTest : public ::testing::Test {
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

    static I2CCommandsTest* getInstance() {
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

private:
    static I2CCommandsTest* s_instance;
};

I2CCommandsTest* I2CCommandsTest::s_instance = nullptr;

// ==================== I2C SCAN TESTS ====================

TEST_F(I2CCommandsTest, ScanValidBus) {
    g_hal_mock.i2c_scan_addresses = {0x3C, 0x68, 0x76};

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);

    handle_i2c_scan(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "i2c_scan_result");

    const picojson::object& result = responses[0].second.get<picojson::object>();
    EXPECT_EQ(result.at("bus").get<double>(), 0);

    const picojson::array& addresses = result.at("addresses_found").get<picojson::array>();
    ASSERT_EQ(addresses.size(), 3);
    EXPECT_EQ(addresses[0].get<std::string>(), "0x3C");
    EXPECT_EQ(addresses[1].get<std::string>(), "0x68");
    EXPECT_EQ(addresses[2].get<std::string>(), "0x76");
}

TEST_F(I2CCommandsTest, ScanNoDevices) {
    g_hal_mock.i2c_scan_addresses.clear();

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);

    handle_i2c_scan(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    const picojson::object& result = responses[0].second.get<picojson::object>();
    const picojson::array& addresses = result.at("addresses_found").get<picojson::array>();
    EXPECT_EQ(addresses.size(), 0);
}

TEST_F(I2CCommandsTest, ScanInvalidBus) {
    picojson::object payload;
    payload["bus"] = picojson::value(2.0);

    handle_i2c_scan(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid bus") != std::string::npos);
}

TEST_F(I2CCommandsTest, ScanMissingBus) {
    picojson::object payload;

    handle_i2c_scan(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing") != std::string::npos);
}

// ==================== I2C WRITE TESTS ====================

TEST_F(I2CCommandsTest, WriteValidData) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x3C");
    picojson::array data;
    data.push_back(picojson::value("0x00"));
    data.push_back(picojson::value("0xAE"));
    payload["data"] = picojson::value(data);

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "command_ack");

    // Verify HAL was called correctly
    ASSERT_EQ(g_hal_mock.i2c_write_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].bus, 0);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].address, 0x3C);
    ASSERT_EQ(g_hal_mock.i2c_write_calls[0].data.size(), 2);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].data[0], 0x00);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].data[1], 0xAE);
}

TEST_F(I2CCommandsTest, WriteInvalidAddress) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x80");  // Out of range
    picojson::array data;
    data.push_back(picojson::value("0x00"));
    payload["data"] = picojson::value(data);

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid I2C address") != std::string::npos);
}

TEST_F(I2CCommandsTest, WriteTooLowAddress) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x07");  // Too low
    picojson::array data;
    data.push_back(picojson::value("0x00"));
    payload["data"] = picojson::value(data);

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid I2C address") != std::string::npos);
}

TEST_F(I2CCommandsTest, WriteEmptyData) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x3C");
    payload["data"] = picojson::value(picojson::array());

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("empty") != std::string::npos);
}

TEST_F(I2CCommandsTest, WriteHalFailure) {
    g_hal_mock.i2c_write_return = false;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x3C");
    picojson::array data;
    data.push_back(picojson::value("0x00"));
    payload["data"] = picojson::value(data);

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("write failed") != std::string::npos);
}

TEST_F(I2CCommandsTest, WriteMissingParams) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    // Missing address and data

    handle_i2c_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing") != std::string::npos);
}

// ==================== I2C READ TESTS ====================

TEST_F(I2CCommandsTest, ReadValidData) {
    g_hal_mock.i2c_read_data = {0x12, 0x34, 0x56};
    g_hal_mock.i2c_read_return = 3;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x68");
    payload["bytes_to_read"] = picojson::value(3.0);

    handle_i2c_read(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "i2c_read_result");

    const picojson::object& result = responses[0].second.get<picojson::object>();
    EXPECT_EQ(result.at("bus").get<double>(), 0);
    EXPECT_EQ(result.at("address").get<std::string>(), "0x68");

    const picojson::array& data = result.at("data").get<picojson::array>();
    ASSERT_EQ(data.size(), 3);
    EXPECT_EQ(data[0].get<std::string>(), "0x12");
    EXPECT_EQ(data[1].get<std::string>(), "0x34");
    EXPECT_EQ(data[2].get<std::string>(), "0x56");
}

TEST_F(I2CCommandsTest, ReadWithRegister) {
    g_hal_mock.i2c_read_data = {0xAB};
    g_hal_mock.i2c_read_return = 1;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x68");
    payload["bytes_to_read"] = picojson::value(1.0);
    payload["register_to_read"] = picojson::value("0x75");

    handle_i2c_read(payload);

    ASSERT_EQ(errors.size(), 0);

    // Verify HAL was called with register
    ASSERT_EQ(g_hal_mock.i2c_read_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_read_calls[0].reg, 0x75);
}

TEST_F(I2CCommandsTest, ReadWithoutRegister) {
    g_hal_mock.i2c_read_data = {0xAB};
    g_hal_mock.i2c_read_return = 1;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x68");
    payload["bytes_to_read"] = picojson::value(1.0);

    handle_i2c_read(payload);

    ASSERT_EQ(errors.size(), 0);

    // Verify HAL was called without register (-1)
    ASSERT_EQ(g_hal_mock.i2c_read_calls.size(), 1);
    EXPECT_EQ(g_hal_mock.i2c_read_calls[0].reg, -1);
}

TEST_F(I2CCommandsTest, ReadHalFailure) {
    g_hal_mock.i2c_read_return = -1;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x68");
    payload["bytes_to_read"] = picojson::value(1.0);

    handle_i2c_read(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("read failed") != std::string::npos);
}

TEST_F(I2CCommandsTest, ReadInvalidAddress) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x80");
    payload["bytes_to_read"] = picojson::value(1.0);

    handle_i2c_read(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid I2C address") != std::string::npos);
}

// ==================== I2C BATCH WRITE TESTS ====================

TEST_F(I2CCommandsTest, BatchWriteValid) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x76");

    picojson::array writes;
    picojson::array write1;
    write1.push_back(picojson::value("0xF2"));
    write1.push_back(picojson::value("0x01"));
    writes.push_back(picojson::value(write1));

    picojson::array write2;
    write2.push_back(picojson::value("0xF4"));
    write2.push_back(picojson::value("0x27"));
    writes.push_back(picojson::value(write2));

    payload["writes"] = picojson::value(writes);

    handle_i2c_batch_write(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "command_ack");

    // Verify HAL was called twice
    ASSERT_EQ(g_hal_mock.i2c_write_calls.size(), 2);

    // First write
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].address, 0x76);
    ASSERT_EQ(g_hal_mock.i2c_write_calls[0].data.size(), 2);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].data[0], 0xF2);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].data[1], 0x01);

    // Second write
    EXPECT_EQ(g_hal_mock.i2c_write_calls[1].address, 0x76);
    ASSERT_EQ(g_hal_mock.i2c_write_calls[1].data.size(), 2);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[1].data[0], 0xF4);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[1].data[1], 0x27);

    // Check response
    const picojson::object& ack = responses[0].second.get<picojson::object>();
    EXPECT_EQ(ack.at("writes_completed").get<double>(), 2);
}

TEST_F(I2CCommandsTest, BatchWriteStopsOnError) {
    // Fail on the second write
    int write_count = 0;
    g_hal_mock.i2c_write_return = true;

    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x76");

    picojson::array writes;
    picojson::array write1;
    write1.push_back(picojson::value("0xF2"));
    writes.push_back(picojson::value(write1));

    picojson::array write2;
    write2.push_back(picojson::value("0xF4"));
    writes.push_back(picojson::value(write2));

    payload["writes"] = picojson::value(writes);

    // Make the second write fail
    g_hal_mock.i2c_write_return = false;

    handle_i2c_batch_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Write 0 failed") != std::string::npos);
    // Since failure happened on first write
}

TEST_F(I2CCommandsTest, BatchWriteEmptyWrites) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x76");
    payload["writes"] = picojson::value(picojson::array());

    handle_i2c_batch_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("empty") != std::string::npos);
}

TEST_F(I2CCommandsTest, BatchWriteInvalidAddress) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    payload["address"] = picojson::value("0x80");

    picojson::array writes;
    picojson::array write1;
    write1.push_back(picojson::value("0xF2"));
    writes.push_back(picojson::value(write1));
    payload["writes"] = picojson::value(writes);

    handle_i2c_batch_write(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid I2C address") != std::string::npos);
}

// ==================== COMMAND DISPATCHER TESTS ====================

TEST_F(I2CCommandsTest, DispatcherRecognizesI2CCommands) {
    picojson::object empty_payload;

    EXPECT_TRUE(try_handle_i2c_command("i2c_configure", empty_payload));
    EXPECT_TRUE(try_handle_i2c_command("i2c_scan", empty_payload));
    EXPECT_TRUE(try_handle_i2c_command("i2c_write", empty_payload));
    EXPECT_TRUE(try_handle_i2c_command("i2c_read", empty_payload));
    EXPECT_TRUE(try_handle_i2c_command("i2c_batch_write", empty_payload));
    EXPECT_TRUE(try_handle_i2c_command("display_update", empty_payload));
}

TEST_F(I2CCommandsTest, DispatcherRejectsUnknownCommands) {
    picojson::object empty_payload;

    EXPECT_FALSE(try_handle_i2c_command("unknown_command", empty_payload));
    EXPECT_FALSE(try_handle_i2c_command("set_gpio_state", empty_payload));
    EXPECT_FALSE(try_handle_i2c_command("reboot", empty_payload));
}
