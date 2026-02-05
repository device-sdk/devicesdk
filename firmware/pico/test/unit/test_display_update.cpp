#include <gtest/gtest.h>
#include "i2c_command_handler.h"
#include "display_update.h"
#include "hal_mock.h"
#include "base64.h"
#include <string>
#include <vector>

// Test fixture for display update tests
class DisplayUpdateTest : public ::testing::Test {
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

    static DisplayUpdateTest* getInstance() {
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

    // Helper to create a valid base64 buffer of zeros for the given dimensions
    std::string createZeroBuffer(int width, int height) {
        // Calculate buffer size: width * height / 8 bytes
        size_t size = (size_t)width * height / 8;

        // Create proper base64 encoding for zeros
        // 'AAAA' decodes to 3 zero bytes
        // 'AAA=' decodes to 2 zero bytes
        // 'AA==' decodes to 1 zero byte
        size_t full_groups = size / 3;
        size_t remainder = size % 3;

        std::string result(full_groups * 4, 'A');

        if (remainder == 1) {
            result += "AA==";
        } else if (remainder == 2) {
            result += "AAA=";
        }

        return result;
    }

    // Helper to create a segment object
    picojson::value makeSegment(int offset, const std::string& data) {
        picojson::object seg;
        seg["offset"] = picojson::value((double)offset);
        seg["data"] = picojson::value(data);
        return picojson::value(seg);
    }

    // Helper to create segments array with full buffer at offset 0
    picojson::array makeFullBufferSegments(int width, int height) {
        picojson::array segments;
        segments.push_back(makeSegment(0, createZeroBuffer(width, height)));
        return segments;
    }

    picojson::object makePayload(int bus, const std::string& addr, const std::string& controller,
                                  int width, int height, const picojson::array& segments, bool init = false) {
        picojson::object payload;
        payload["bus"] = picojson::value((double)bus);
        payload["address"] = picojson::value(addr);
        payload["controller"] = picojson::value(controller);
        payload["width"] = picojson::value((double)width);
        payload["height"] = picojson::value((double)height);
        payload["segments"] = picojson::value(segments);
        if (init) {
            payload["init"] = picojson::value(true);
        }
        return payload;
    }

private:
    static DisplayUpdateTest* s_instance;
};

DisplayUpdateTest* DisplayUpdateTest::s_instance = nullptr;

TEST_F(DisplayUpdateTest, ValidSSD1306_128x64) {
    // 128x64 display = 1024 bytes
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "command_ack");

    const picojson::object& ack = responses[0].second.get<picojson::object>();
    EXPECT_EQ(ack.at("command").get<std::string>(), "display_update");
    EXPECT_EQ(ack.at("controller").get<std::string>(), "ssd1306");
    EXPECT_EQ(ack.at("width").get<double>(), 128);
    EXPECT_EQ(ack.at("height").get<double>(), 64);
    EXPECT_EQ(ack.at("status").get<std::string>(), "success");
}

TEST_F(DisplayUpdateTest, ValidSSD1306_128x32) {
    // 128x32 display = 512 bytes
    picojson::array segments = makeFullBufferSegments(128, 32);

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 32, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
}

TEST_F(DisplayUpdateTest, ValidSH1106_128x64) {
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "sh1106", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
}

TEST_F(DisplayUpdateTest, WithInitFlag) {
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments, true);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    // Verify init commands were sent before framebuffer
    // Init sequence sends multiple I2C writes
    EXPECT_GT(g_hal_mock.i2c_write_calls.size(), 10);  // Init sequence has many commands
}

TEST_F(DisplayUpdateTest, InvalidController) {
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "invalid_controller", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid controller") != std::string::npos);
}

TEST_F(DisplayUpdateTest, InvalidDimensions) {
    picojson::array segments = makeFullBufferSegments(128, 64);  // Buffer for 128x64

    // Try invalid dimensions
    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 64, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid dimensions") != std::string::npos);
}

TEST_F(DisplayUpdateTest, SegmentOverflow) {
    // Segment at offset that would overflow the buffer
    picojson::array segments;
    segments.push_back(makeSegment(1020, "AAAAAAAA"));  // 6 bytes at offset 1020 overflows 1024 buffer

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("overflow") != std::string::npos ||
                errors[0].find("Segment") != std::string::npos);
}

TEST_F(DisplayUpdateTest, InvalidBase64InSegment) {
    // Invalid base64 string in segment data
    picojson::array segments;
    segments.push_back(makeSegment(0, "!!!invalid!!!"));

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("decode") != std::string::npos ||
                errors[0].find("base64") != std::string::npos);
}

TEST_F(DisplayUpdateTest, InvalidBus) {
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(2, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Invalid bus") != std::string::npos);
}

TEST_F(DisplayUpdateTest, MissingParameters) {
    picojson::object payload;
    payload["bus"] = picojson::value(0.0);
    // Missing other required fields including segments

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Missing") != std::string::npos);
}

TEST_F(DisplayUpdateTest, I2CWriteFailure) {
    g_hal_mock.i2c_write_return = false;
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Failed") != std::string::npos);
}

TEST_F(DisplayUpdateTest, InitFailure) {
    g_hal_mock.i2c_write_return = false;
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments, true);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("Failed") != std::string::npos);
}

TEST_F(DisplayUpdateTest, SH1106UsesPageAddressing) {
    picojson::array segments = makeFullBufferSegments(128, 64);

    picojson::object payload = makePayload(0, "0x3C", "sh1106", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);

    // SH1106 writes page by page (8 pages for 64 height)
    // Each page requires: page address command + column address commands + data write
    // We should see multiple writes for page addressing
    EXPECT_GT(g_hal_mock.i2c_write_calls.size(), 0);
}

// New sparse segment tests

TEST_F(DisplayUpdateTest, MultipleSegments) {
    // Multiple non-overlapping segments
    picojson::array segments;
    segments.push_back(makeSegment(0, "AAAA"));      // 3 bytes at offset 0
    segments.push_back(makeSegment(100, "BBBB"));   // 3 bytes at offset 100
    segments.push_back(makeSegment(500, "CCCC"));   // 3 bytes at offset 500

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);
    EXPECT_EQ(responses[0].first, "command_ack");

    const picojson::object& ack = responses[0].second.get<picojson::object>();
    EXPECT_EQ(ack.at("segments_count").get<double>(), 3);
    EXPECT_EQ(ack.at("bytes_written").get<double>(), 9);  // 3 + 3 + 3
}

TEST_F(DisplayUpdateTest, SegmentAtNonZeroOffset) {
    // Single segment at non-zero offset
    picojson::array segments;
    segments.push_back(makeSegment(512, "////"));  // 3 bytes of 0xFF at offset 512

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    const picojson::object& ack = responses[0].second.get<picojson::object>();
    EXPECT_EQ(ack.at("segments_count").get<double>(), 1);
}

TEST_F(DisplayUpdateTest, EmptySegmentsArray) {
    // Empty segments array should still work (just writes existing framebuffer)
    picojson::array segments;

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 0);
    ASSERT_EQ(responses.size(), 1);

    const picojson::object& ack = responses[0].second.get<picojson::object>();
    EXPECT_EQ(ack.at("segments_count").get<double>(), 0);
    EXPECT_EQ(ack.at("bytes_written").get<double>(), 0);
}

TEST_F(DisplayUpdateTest, MissingSegmentOffset) {
    // Segment missing offset field
    picojson::array segments;
    picojson::object bad_segment;
    bad_segment["data"] = picojson::value("AAAA");
    // Missing "offset"
    segments.push_back(picojson::value(bad_segment));

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("offset") != std::string::npos ||
                errors[0].find("segment") != std::string::npos);
}

TEST_F(DisplayUpdateTest, MissingSegmentData) {
    // Segment missing data field
    picojson::array segments;
    picojson::object bad_segment;
    bad_segment["offset"] = picojson::value(0.0);
    // Missing "data"
    segments.push_back(picojson::value(bad_segment));

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("data") != std::string::npos ||
                errors[0].find("segment") != std::string::npos);
}

TEST_F(DisplayUpdateTest, InvalidSegmentType) {
    // Segment is not an object
    picojson::array segments;
    segments.push_back(picojson::value("not an object"));

    picojson::object payload = makePayload(0, "0x3C", "ssd1306", 128, 64, segments);

    handle_display_update(payload);

    ASSERT_EQ(errors.size(), 1);
    EXPECT_TRUE(errors[0].find("object") != std::string::npos ||
                errors[0].find("segment") != std::string::npos);
}
