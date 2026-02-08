#include <gtest/gtest.h>
#include <cstdlib>
#include <cstring>

extern "C" {
#include "base64.h"
}

class Base64Test : public ::testing::Test {};

TEST_F(Base64Test, EncodeEmpty) {
    char *result = base64_encode(NULL, 0);
    ASSERT_NE(result, nullptr);
    EXPECT_STREQ(result, "");
    free(result);
}

TEST_F(Base64Test, EncodeSingleByte) {
    uint8_t data[] = {0x00};
    char *result = base64_encode(data, 1);
    ASSERT_NE(result, nullptr);
    EXPECT_STREQ(result, "AA==");
    free(result);
}

TEST_F(Base64Test, EncodeHelloWorld) {
    const char *input = "Hello World!";
    char *result = base64_encode((const uint8_t *)input, strlen(input));
    ASSERT_NE(result, nullptr);
    EXPECT_STREQ(result, "SGVsbG8gV29ybGQh");
    free(result);
}

TEST_F(Base64Test, EncodeAllBytes) {
    uint8_t data[] = {0xFF};
    char *result = base64_encode(data, 1);
    ASSERT_NE(result, nullptr);
    EXPECT_STREQ(result, "/w==");
    free(result);
}

TEST_F(Base64Test, EncodeFourBytes) {
    uint8_t data[] = {0x01, 0x02, 0x03, 0x04};
    char *result = base64_encode(data, 4);
    ASSERT_NE(result, nullptr);
    EXPECT_STREQ(result, "AQIDBA==");
    free(result);
}

TEST_F(Base64Test, DecodeEmpty) {
    size_t len = 0;
    uint8_t *result = base64_decode("", &len);
    ASSERT_NE(result, nullptr);
    EXPECT_EQ(len, 0u);
    free(result);
}

TEST_F(Base64Test, DecodeSingleByte) {
    size_t len = 0;
    uint8_t *result = base64_decode("AA==", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 1u);
    EXPECT_EQ(result[0], 0x00);
    free(result);
}

TEST_F(Base64Test, DecodeTwoBytes) {
    size_t len = 0;
    uint8_t *result = base64_decode("AAA=", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 2u);
    EXPECT_EQ(result[0], 0x00);
    EXPECT_EQ(result[1], 0x00);
    free(result);
}

TEST_F(Base64Test, DecodeThreeBytes) {
    size_t len = 0;
    uint8_t *result = base64_decode("AAAA", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 3u);
    free(result);
}

TEST_F(Base64Test, DecodeHelloWorld) {
    size_t len = 0;
    uint8_t *result = base64_decode("SGVsbG8gV29ybGQh", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 12u);
    EXPECT_EQ(memcmp(result, "Hello World!", 12), 0);
    free(result);
}

TEST_F(Base64Test, DecodeFF) {
    size_t len = 0;
    uint8_t *result = base64_decode("/w==", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 1u);
    EXPECT_EQ(result[0], 0xFF);
    free(result);
}

TEST_F(Base64Test, DecodeBinaryData) {
    size_t len = 0;
    uint8_t *result = base64_decode("AQIDBA==", &len);
    ASSERT_NE(result, nullptr);
    ASSERT_EQ(len, 4u);
    EXPECT_EQ(result[0], 0x01);
    EXPECT_EQ(result[1], 0x02);
    EXPECT_EQ(result[2], 0x03);
    EXPECT_EQ(result[3], 0x04);
    free(result);
}

TEST_F(Base64Test, DecodeInvalidLength) {
    size_t len = 0;
    uint8_t *result = base64_decode("ABC", &len);
    EXPECT_EQ(result, nullptr);
}

TEST_F(Base64Test, DecodeInvalidCharacter) {
    size_t len = 0;
    uint8_t *result = base64_decode("AB!D", &len);
    EXPECT_EQ(result, nullptr);
}

TEST_F(Base64Test, RoundTrip) {
    uint8_t data[] = {0xDE, 0xAD, 0xBE, 0xEF, 0x01, 0x23, 0x45, 0x67};
    char *encoded = base64_encode(data, sizeof(data));
    ASSERT_NE(encoded, nullptr);

    size_t len = 0;
    uint8_t *decoded = base64_decode(encoded, &len);
    ASSERT_NE(decoded, nullptr);
    ASSERT_EQ(len, sizeof(data));
    EXPECT_EQ(memcmp(decoded, data, sizeof(data)), 0);

    free(encoded);
    free(decoded);
}

TEST_F(Base64Test, RoundTripLargeBuffer) {
    // 1024 bytes
    uint8_t data[1024];
    for (int i = 0; i < 1024; i++) data[i] = (uint8_t)(i & 0xFF);

    char *encoded = base64_encode(data, sizeof(data));
    ASSERT_NE(encoded, nullptr);

    size_t len = 0;
    uint8_t *decoded = base64_decode(encoded, &len);
    ASSERT_NE(decoded, nullptr);
    ASSERT_EQ(len, sizeof(data));
    EXPECT_EQ(memcmp(decoded, data, sizeof(data)), 0);

    free(encoded);
    free(decoded);
}
