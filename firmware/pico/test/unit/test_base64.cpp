#include <gtest/gtest.h>
#include "base64.h"

class Base64Test : public ::testing::Test {
protected:
    void SetUp() override {
        // Nothing to set up
    }
};

TEST_F(Base64Test, DecodeEmptyString) {
    std::vector<uint8_t> result = base64_decode("");
    EXPECT_TRUE(result.empty());
}

TEST_F(Base64Test, DecodeSingleByte) {
    // "AA==" decodes to a single null byte
    std::vector<uint8_t> result = base64_decode("AA==");
    ASSERT_EQ(result.size(), 1);
    EXPECT_EQ(result[0], 0x00);
}

TEST_F(Base64Test, DecodeTwoBytes) {
    // "AAA=" decodes to two null bytes
    std::vector<uint8_t> result = base64_decode("AAA=");
    ASSERT_EQ(result.size(), 2);
    EXPECT_EQ(result[0], 0x00);
    EXPECT_EQ(result[1], 0x00);
}

TEST_F(Base64Test, DecodeThreeBytes) {
    // "AAAA" decodes to three null bytes
    std::vector<uint8_t> result = base64_decode("AAAA");
    ASSERT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], 0x00);
    EXPECT_EQ(result[1], 0x00);
    EXPECT_EQ(result[2], 0x00);
}

TEST_F(Base64Test, DecodeHelloWorld) {
    // "SGVsbG8gV29ybGQh" decodes to "Hello World!"
    std::vector<uint8_t> result = base64_decode("SGVsbG8gV29ybGQh");
    std::string decoded(result.begin(), result.end());
    EXPECT_EQ(decoded, "Hello World!");
}

TEST_F(Base64Test, DecodeAllBytes) {
    // "/w==" decodes to 0xFF
    std::vector<uint8_t> result = base64_decode("/w==");
    ASSERT_EQ(result.size(), 1);
    EXPECT_EQ(result[0], 0xFF);
}

TEST_F(Base64Test, DecodeWithPlusAndSlash) {
    // Test base64 with + and / characters
    // "+/+/" decodes to [0xFB, 0xFF, 0xBF]
    std::vector<uint8_t> result = base64_decode("+/+/");
    ASSERT_EQ(result.size(), 3);
    EXPECT_EQ(result[0], 0xFB);
    EXPECT_EQ(result[1], 0xFF);
    EXPECT_EQ(result[2], 0xBF);
}

TEST_F(Base64Test, DecodeInvalidLength) {
    // Base64 strings must be multiples of 4
    std::vector<uint8_t> result = base64_decode("ABC");
    EXPECT_TRUE(result.empty());
}

TEST_F(Base64Test, DecodeInvalidCharacter) {
    // Invalid character in base64 string
    std::vector<uint8_t> result = base64_decode("AB!D");
    EXPECT_TRUE(result.empty());
}

TEST_F(Base64Test, DecodeInvalidPaddingPosition) {
    // Padding in wrong position
    std::vector<uint8_t> result = base64_decode("A===");
    EXPECT_TRUE(result.empty());
}

TEST_F(Base64Test, DecodedSizeEmpty) {
    EXPECT_EQ(base64_decoded_size(""), 0);
}

TEST_F(Base64Test, DecodedSizeNoPadding) {
    // 4 chars -> 3 bytes
    EXPECT_EQ(base64_decoded_size("AAAA"), 3);
    // 8 chars -> 6 bytes
    EXPECT_EQ(base64_decoded_size("AAAAAAAA"), 6);
}

TEST_F(Base64Test, DecodedSizeOnePadding) {
    // 4 chars with 1 padding -> 2 bytes
    EXPECT_EQ(base64_decoded_size("AAA="), 2);
}

TEST_F(Base64Test, DecodedSizeTwoPadding) {
    // 4 chars with 2 padding -> 1 byte
    EXPECT_EQ(base64_decoded_size("AA=="), 1);
}

TEST_F(Base64Test, DecodeLargeBuffer) {
    // Create a base64 string representing 1024 bytes of zeros
    // 1024 bytes = 1024 * 4 / 3 base64 chars (rounded up with padding)
    // This is a simplified test with known output
    std::string encoded(1368, 'A'); // AAAA... decodes to 0x00 bytes
    std::vector<uint8_t> result = base64_decode(encoded);
    EXPECT_EQ(result.size(), 1026); // 1368 * 3 / 4 = 1026
    for (uint8_t byte : result) {
        EXPECT_EQ(byte, 0x00);
    }
}

TEST_F(Base64Test, DecodeBinaryData) {
    // Decode some known binary data
    // [0x01, 0x02, 0x03, 0x04] encodes to "AQIDBA=="
    std::vector<uint8_t> result = base64_decode("AQIDBA==");
    ASSERT_EQ(result.size(), 4);
    EXPECT_EQ(result[0], 0x01);
    EXPECT_EQ(result[1], 0x02);
    EXPECT_EQ(result[2], 0x03);
    EXPECT_EQ(result[3], 0x04);
}
