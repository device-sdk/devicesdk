#include <gtest/gtest.h>
#include <cstring>

extern "C" {
#include "websocket_handler.h"
#include "command_queue.h"
#include "hal_mock.h"
}

// Since we compile with UNIT_TEST, queue_command is a no-op.
// We test that handle_websocket_message returns true/false correctly
// and doesn't crash on various inputs.

class WebSocketHandlerTest : public ::testing::Test {
protected:
    void SetUp() override {
        hal_mock_reset();
        websocket_handler_init(NULL);
    }
};

TEST_F(WebSocketHandlerTest, NullMessage) {
    EXPECT_FALSE(handle_websocket_message(NULL));
}

TEST_F(WebSocketHandlerTest, EmptyString) {
    EXPECT_FALSE(handle_websocket_message(""));
}

TEST_F(WebSocketHandlerTest, InvalidJson) {
    EXPECT_FALSE(handle_websocket_message("{invalid json"));
}

TEST_F(WebSocketHandlerTest, MissingType) {
    EXPECT_FALSE(handle_websocket_message("{\"payload\":{}}"));
}

TEST_F(WebSocketHandlerTest, NonStringType) {
    EXPECT_FALSE(handle_websocket_message("{\"type\":123}"));
}

TEST_F(WebSocketHandlerTest, SetGpioState) {
    const char *msg = "{\"type\":\"set_gpio_state\",\"id\":\"msg-1\","
                      "\"payload\":{\"pin\":5,\"state\":\"high\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, SetGpioStateLow) {
    const char *msg = "{\"type\":\"set_gpio_state\",\"id\":\"msg-2\","
                      "\"payload\":{\"pin\":2,\"state\":\"low\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, SetGpioStateMissingPayload) {
    const char *msg = "{\"type\":\"set_gpio_state\"}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, SetGpioStateMissingPin) {
    const char *msg = "{\"type\":\"set_gpio_state\",\"payload\":{\"state\":\"high\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, GetPinStateDigital) {
    const char *msg = "{\"type\":\"get_pin_state\",\"id\":\"msg-3\","
                      "\"payload\":{\"pin\":10,\"mode\":\"digital\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, GetPinStateAnalog) {
    const char *msg = "{\"type\":\"get_pin_state\",\"id\":\"msg-4\","
                      "\"payload\":{\"pin\":34,\"mode\":\"analog\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, GetPinStateInvalidMode) {
    const char *msg = "{\"type\":\"get_pin_state\","
                      "\"payload\":{\"pin\":10,\"mode\":\"invalid\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, SetPwmState) {
    const char *msg = "{\"type\":\"set_pwm_state\",\"id\":\"msg-5\","
                      "\"payload\":{\"pin\":18,\"frequency\":1000,\"duty_cycle\":0.5}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, ConfigureGpioInputMonitoring) {
    const char *msg = "{\"type\":\"configure_gpio_input_monitoring\",\"id\":\"msg-6\","
                      "\"payload\":{\"pin\":15,\"enable\":true,\"pull\":\"up\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, ConfigureGpioInputMonitoringDisable) {
    const char *msg = "{\"type\":\"configure_gpio_input_monitoring\","
                      "\"payload\":{\"pin\":15,\"enable\":false}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, ConfigureGpioInputMonitoringPullDown) {
    const char *msg = "{\"type\":\"configure_gpio_input_monitoring\","
                      "\"payload\":{\"pin\":15,\"enable\":true,\"pull\":\"down\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cConfigure) {
    const char *msg = "{\"type\":\"i2c_configure\",\"id\":\"msg-7\","
                      "\"payload\":{\"bus\":0,\"sda_pin\":21,\"scl_pin\":22,\"frequency\":400000}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cConfigureDefaultFrequency) {
    const char *msg = "{\"type\":\"i2c_configure\","
                      "\"payload\":{\"bus\":0,\"sda_pin\":21,\"scl_pin\":22}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cScan) {
    const char *msg = "{\"type\":\"i2c_scan\",\"id\":\"msg-8\","
                      "\"payload\":{\"bus\":0}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cWrite) {
    const char *msg = "{\"type\":\"i2c_write\",\"id\":\"msg-9\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"data\":\"AQID\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cRead) {
    const char *msg = "{\"type\":\"i2c_read\",\"id\":\"msg-10\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x50\",\"length\":4,\"register\":16}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, I2cReadNoRegister) {
    const char *msg = "{\"type\":\"i2c_read\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x50\",\"length\":4}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, Reboot) {
    const char *msg = "{\"type\":\"reboot\",\"id\":\"msg-11\"}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, RebootNoPayload) {
    const char *msg = "{\"type\":\"reboot\"}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, DisplayUpdate) {
    const char *msg = "{\"type\":\"display_update\",\"id\":\"msg-12\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":128,\"height\":64,\"init\":true,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, DisplayUpdateSH1106) {
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"sh1106\","
                      "\"width\":128,\"height\":64,\"init\":false,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, DisplayUpdateInvalidController) {
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"invalid\","
                      "\"width\":128,\"height\":64,\"init\":false,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

// 0.42" SSD1306 boards (e.g. ESP32-C3 0.42 OLED) use a 72x40 window offset to column 30.
// The parser must accept columnOffset / pageOffset and forward them into the queued command.
TEST_F(WebSocketHandlerTest, DisplayUpdate072x40WithOffset) {
    test_reset_last_queued_command();
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":72,\"height\":40,\"columnOffset\":30,\"pageOffset\":0,"
                      "\"init\":true,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));

    const worker_command_t *last = test_get_last_queued_command();
    ASSERT_NE(last, nullptr);
    EXPECT_EQ(last->type, CMD_DISPLAY_UPDATE);
    EXPECT_EQ(last->payload.display.width, 72);
    EXPECT_EQ(last->payload.display.height, 40);
    EXPECT_EQ(last->payload.display.controller, 0);  // ssd1306
    EXPECT_EQ(last->payload.display.col_offset, 30);
    EXPECT_EQ(last->payload.display.page_offset, 0);
    EXPECT_TRUE(last->payload.display.init);
}

// Default payload (no columnOffset/pageOffset fields) must queue with zero offsets —
// ensures the 128x64 common case is unchanged.
TEST_F(WebSocketHandlerTest, DisplayUpdate128x64DefaultsToZeroOffset) {
    test_reset_last_queued_command();
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":128,\"height\":64,\"init\":false,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));

    const worker_command_t *last = test_get_last_queued_command();
    ASSERT_NE(last, nullptr);
    EXPECT_EQ(last->payload.display.col_offset, 0);
    EXPECT_EQ(last->payload.display.page_offset, 0);
}

// Width > 128 must be rejected and no command queued.
TEST_F(WebSocketHandlerTest, DisplayUpdateOversizeWidthRejected) {
    test_reset_last_queued_command();
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":200,\"height\":64,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
    EXPECT_EQ(test_get_last_queued_command(), nullptr);
}

// Height not a multiple of 8 must be rejected.
TEST_F(WebSocketHandlerTest, DisplayUpdateHeightNotMultipleOfEightRejected) {
    test_reset_last_queued_command();
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":128,\"height\":33,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
    EXPECT_EQ(test_get_last_queued_command(), nullptr);
}

// columnOffset + width > 128 must be rejected (would write past controller RAM).
TEST_F(WebSocketHandlerTest, DisplayUpdateColOffsetPlusWidthExceedsRamRejected) {
    test_reset_last_queued_command();
    const char *msg = "{\"type\":\"display_update\","
                      "\"payload\":{\"bus\":0,\"address\":\"0x3C\",\"controller\":\"ssd1306\","
                      "\"width\":100,\"height\":32,\"columnOffset\":50,"
                      "\"segments\":[{\"offset\":0,\"data\":\"AAAA\"}]}}";
    EXPECT_TRUE(handle_websocket_message(msg));
    EXPECT_EQ(test_get_last_queued_command(), nullptr);
}

TEST_F(WebSocketHandlerTest, UnknownCommandType) {
    const char *msg = "{\"type\":\"unknown_command\",\"payload\":{}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, MessageWithNoId) {
    const char *msg = "{\"type\":\"set_gpio_state\","
                      "\"payload\":{\"pin\":5,\"state\":\"high\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}
