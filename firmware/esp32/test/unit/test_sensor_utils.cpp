#include <gtest/gtest.h>
#include "sensor_utils.h"
#include "command_queue.h"

// Decode math for the DHT 40-bit frame. The bit-banged capture itself needs
// real hardware; here the captured bytes are fed through the same decoder the
// HAL uses, so the checksum, DHT22 sign-magnitude and DHT11 integer paths are
// pinned down without a board.

TEST(SensorUtilsTest, Dht22DecodeTenthsAndHumidity) {
    // 26.7 % RH / 27.7 C; checksum = 0x01+0x0B+0x01+0x15 = 0x22.
    const uint8_t frame[5] = {0x01, 0x0B, 0x01, 0x15, 0x22};
    float celsius = 0.0f, humidity = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &celsius, &humidity));
    EXPECT_FLOAT_EQ(celsius, 27.7f);
    EXPECT_FLOAT_EQ(humidity, 26.7f);
}

TEST(SensorUtilsTest, Dht22DecodeNegativeTemperature) {
    // DHT22 is sign-magnitude: byte 2's high bit is the sign, the low 15 bits
    // the magnitude in tenths. -10.1 C = 0x8065, 45.6 % = 0x01C8.
    const uint8_t frame[5] = {0x01, 0xC8, 0x80, 0x65, 0xAE};
    float celsius = 0.0f, humidity = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &celsius, &humidity));
    EXPECT_FLOAT_EQ(celsius, -10.1f);
    EXPECT_FLOAT_EQ(humidity, 45.6f);
}

TEST(SensorUtilsTest, Dht11DecodeWholeNumbers) {
    // 45 % RH / 23 C; checksum = 0x2D+0x17 = 0x44.
    const uint8_t frame[5] = {0x2D, 0x00, 0x17, 0x00, 0x44};
    float celsius = 0.0f, humidity = 0.0f;
    ASSERT_TRUE(sensor_dht_decode(DHT_MODEL_DHT11, frame, &celsius, &humidity));
    EXPECT_FLOAT_EQ(celsius, 23.0f);
    EXPECT_FLOAT_EQ(humidity, 45.0f);
}

TEST(SensorUtilsTest, RejectsChecksumMismatch) {
    const uint8_t frame[5] = {0x01, 0x0B, 0x01, 0x15, 0x00};
    float celsius = 0.0f, humidity = 0.0f;
    EXPECT_FALSE(sensor_dht_decode(DHT_MODEL_DHT22, frame, &celsius, &humidity));
}
