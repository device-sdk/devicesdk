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

TEST_F(WebSocketHandlerTest, UnknownCommandType) {
    const char *msg = "{\"type\":\"unknown_command\",\"payload\":{}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}

TEST_F(WebSocketHandlerTest, MessageWithNoId) {
    const char *msg = "{\"type\":\"set_gpio_state\","
                      "\"payload\":{\"pin\":5,\"state\":\"high\"}}";
    EXPECT_TRUE(handle_websocket_message(msg));
}
