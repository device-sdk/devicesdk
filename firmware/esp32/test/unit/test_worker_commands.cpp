#include <gtest/gtest.h>
#include <cstring>

extern "C" {
#include "hal.h"
#include "command_queue.h"
#include "response_queue.h"
#include "worker_task.h"
#include "hal_mock.h"
}

class WorkerCommandTest : public ::testing::Test {
protected:
    void SetUp() override {
        hal_mock_reset();
        worker_task_init();
    }

    worker_command_t make_cmd(command_type_t type, const char *msg_id = "test-123") {
        worker_command_t cmd;
        memset(&cmd, 0, sizeof(cmd));
        cmd.type = type;
        cmd.sequence_id = 1;
        strncpy(cmd.message_id, msg_id, MAX_MESSAGE_ID_LEN - 1);
        return cmd;
    }
};

TEST_F(WorkerCommandTest, GpioSetHigh) {
    worker_command_t cmd = make_cmd(CMD_GPIO_SET);
    cmd.payload.gpio.pin = 5;
    cmd.payload.gpio.state = WORKER_GPIO_HIGH;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_GPIO_SET);
    EXPECT_STREQ(resp.message_id, "test-123");
    EXPECT_EQ(resp.data.gpio.pin, 5);
    EXPECT_EQ(g_hal_mock.gpio_set_call_count, 1);
    EXPECT_EQ(g_hal_mock.gpio_set_calls[0].pin, 5);
    EXPECT_EQ(g_hal_mock.gpio_set_calls[0].state, 1);
}

TEST_F(WorkerCommandTest, GpioSetLow) {
    worker_command_t cmd = make_cmd(CMD_GPIO_SET);
    cmd.payload.gpio.pin = 2;
    cmd.payload.gpio.state = WORKER_GPIO_LOW;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(g_hal_mock.gpio_set_calls[0].state, 0);
}

TEST_F(WorkerCommandTest, GpioGetDigitalHigh) {
    g_hal_mock.gpio_digital_return = true;

    worker_command_t cmd = make_cmd(CMD_GPIO_GET_DIGITAL);
    cmd.payload.gpio.pin = 10;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_GPIO_GET_DIGITAL);
    EXPECT_EQ(resp.data.gpio.pin, 10);
    EXPECT_TRUE(resp.data.gpio.digital_value);
    EXPECT_STREQ(resp.data.gpio.mode, "digital");
}

TEST_F(WorkerCommandTest, GpioGetAnalog) {
    g_hal_mock.gpio_analog_return = 2048;

    worker_command_t cmd = make_cmd(CMD_GPIO_GET_ANALOG);
    cmd.payload.gpio.pin = 34;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_GPIO_GET_ANALOG);
    EXPECT_EQ(resp.data.gpio.pin, 34);
    EXPECT_EQ(resp.data.gpio.analog_value, 2048);
    EXPECT_STREQ(resp.data.gpio.mode, "analog");
}

TEST_F(WorkerCommandTest, GpioConfigureInput) {
    worker_command_t cmd = make_cmd(CMD_GPIO_CONFIGURE_INPUT);
    cmd.payload.gpio.pin = 15;
    cmd.payload.gpio.pull = WORKER_PULL_UP;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_GPIO_CONFIGURE_INPUT);
    EXPECT_EQ(resp.data.gpio.pin, 15);
    EXPECT_EQ(g_hal_mock.gpio_configure_input_call_count, 1);
    EXPECT_EQ(g_hal_mock.gpio_configure_input_calls[0].pin, 15);
    EXPECT_EQ(g_hal_mock.gpio_configure_input_calls[0].pull, (int)GPIO_PULL_UP);
}

TEST_F(WorkerCommandTest, PwmSet) {
    worker_command_t cmd = make_cmd(CMD_PWM_SET);
    cmd.payload.pwm.pin = 18;
    cmd.payload.pwm.frequency = 1000;
    cmd.payload.pwm.duty_cycle = 0.5f;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_PWM_SET);
    EXPECT_EQ(g_hal_mock.pwm_set_call_count, 1);
    EXPECT_EQ(g_hal_mock.pwm_set_calls[0].pin, 18);
    EXPECT_EQ(g_hal_mock.pwm_set_calls[0].frequency, 1000u);
    EXPECT_FLOAT_EQ(g_hal_mock.pwm_set_calls[0].duty_cycle, 0.5f);
}

TEST_F(WorkerCommandTest, I2cConfigure) {
    worker_command_t cmd = make_cmd(CMD_I2C_CONFIGURE);
    cmd.payload.i2c_configure.bus = 0;
    cmd.payload.i2c_configure.sda_pin = 21;
    cmd.payload.i2c_configure.scl_pin = 22;
    cmd.payload.i2c_configure.frequency = 400000;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.data.i2c_configure.bus, 0);
    EXPECT_EQ(resp.data.i2c_configure.sda_pin, 21);
    EXPECT_EQ(resp.data.i2c_configure.scl_pin, 22);
    EXPECT_EQ(resp.data.i2c_configure.frequency, 400000u);
}

TEST_F(WorkerCommandTest, I2cConfigureFailure) {
    g_hal_mock.i2c_configure_return = false;

    worker_command_t cmd = make_cmd(CMD_I2C_CONFIGURE);
    cmd.payload.i2c_configure.bus = 0;
    cmd.payload.i2c_configure.sda_pin = 21;
    cmd.payload.i2c_configure.scl_pin = 22;
    cmd.payload.i2c_configure.frequency = 100000;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
    EXPECT_STRNE(resp.error_msg, "");
}

TEST_F(WorkerCommandTest, I2cConfigureInvalidBus) {
    worker_command_t cmd = make_cmd(CMD_I2C_CONFIGURE);
    cmd.payload.i2c_configure.bus = 5;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
}

TEST_F(WorkerCommandTest, I2cScan) {
    g_hal_mock.i2c_scan_addresses[0] = 0x3C;
    g_hal_mock.i2c_scan_addresses[1] = 0x50;
    g_hal_mock.i2c_scan_address_count = 2;

    worker_command_t cmd = make_cmd(CMD_I2C_SCAN);
    cmd.payload.i2c_scan.bus = 0;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.data.i2c_scan.bus, 0);
    EXPECT_EQ(resp.data.i2c_scan.count, 2);
    EXPECT_EQ(resp.data.i2c_scan.addresses[0], 0x3C);
    EXPECT_EQ(resp.data.i2c_scan.addresses[1], 0x50);
}

TEST_F(WorkerCommandTest, I2cScanInvalidBus) {
    worker_command_t cmd = make_cmd(CMD_I2C_SCAN);
    cmd.payload.i2c_scan.bus = 3;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
}

TEST_F(WorkerCommandTest, I2cWrite) {
    worker_command_t cmd = make_cmd(CMD_I2C_WRITE);
    cmd.payload.i2c_write.bus = 0;
    cmd.payload.i2c_write.address = 0x3C;
    cmd.payload.i2c_write.data[0] = 0xAE;
    cmd.payload.i2c_write.data_len = 1;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(g_hal_mock.i2c_write_call_count, 1);
    EXPECT_EQ(g_hal_mock.i2c_write_calls[0].address, 0x3C);
}

TEST_F(WorkerCommandTest, I2cWriteFailure) {
    g_hal_mock.i2c_write_return = false;

    worker_command_t cmd = make_cmd(CMD_I2C_WRITE);
    cmd.payload.i2c_write.bus = 0;
    cmd.payload.i2c_write.address = 0x3C;
    cmd.payload.i2c_write.data[0] = 0xAE;
    cmd.payload.i2c_write.data_len = 1;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
}

TEST_F(WorkerCommandTest, I2cRead) {
    g_hal_mock.i2c_read_data[0] = 0xAB;
    g_hal_mock.i2c_read_data[1] = 0xCD;
    g_hal_mock.i2c_read_data_len = 2;
    g_hal_mock.i2c_read_return = 2;

    worker_command_t cmd = make_cmd(CMD_I2C_READ);
    cmd.payload.i2c_read.bus = 0;
    cmd.payload.i2c_read.address = 0x50;
    cmd.payload.i2c_read.length = 2;
    cmd.payload.i2c_read.reg = 0x10;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.data.i2c_read.bus, 0);
    EXPECT_EQ(resp.data.i2c_read.address, 0x50);
    EXPECT_EQ(resp.data.i2c_read.data_len, 2u);
    EXPECT_EQ(resp.data.i2c_read.data[0], 0xAB);
    EXPECT_EQ(resp.data.i2c_read.data[1], 0xCD);
}

TEST_F(WorkerCommandTest, I2cReadFailure) {
    g_hal_mock.i2c_read_return = -1;

    worker_command_t cmd = make_cmd(CMD_I2C_READ);
    cmd.payload.i2c_read.bus = 0;
    cmd.payload.i2c_read.address = 0x50;
    cmd.payload.i2c_read.length = 2;
    cmd.payload.i2c_read.reg = -1;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
}

TEST_F(WorkerCommandTest, I2cReadTooLarge) {
    worker_command_t cmd = make_cmd(CMD_I2C_READ);
    cmd.payload.i2c_read.bus = 0;
    cmd.payload.i2c_read.address = 0x50;
    cmd.payload.i2c_read.length = MAX_I2C_READ_DATA + 1;
    cmd.payload.i2c_read.reg = -1;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_ERROR);
}

TEST_F(WorkerCommandTest, Reboot) {
    worker_command_t cmd = make_cmd(CMD_REBOOT);

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.status, RESPONSE_SUCCESS);
    EXPECT_EQ(resp.original_cmd, CMD_REBOOT);
    EXPECT_STREQ(resp.message_id, "test-123");
}

TEST_F(WorkerCommandTest, MessageIdPreserved) {
    worker_command_t cmd = make_cmd(CMD_GPIO_SET, "unique-msg-id-456");
    cmd.payload.gpio.pin = 1;
    cmd.payload.gpio.state = WORKER_GPIO_LOW;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_STREQ(resp.message_id, "unique-msg-id-456");
}

TEST_F(WorkerCommandTest, SequenceIdPreserved) {
    worker_command_t cmd = make_cmd(CMD_GPIO_SET);
    cmd.sequence_id = 42;
    cmd.payload.gpio.pin = 1;
    cmd.payload.gpio.state = WORKER_GPIO_LOW;

    worker_response_t resp = worker_execute_command(&cmd);

    EXPECT_EQ(resp.sequence_id, 42u);
}
