#include <gtest/gtest.h>
#include <vector>
#include <queue>
#include <string>
#include <algorithm>
#include <cstdlib>
#include <cstdint>

// Test the buffer management logic that was added to ws_client.cpp
// These tests verify the algorithms work correctly

// Constants from ws_client.cpp
#define MAX_RX_BUFFER_SIZE 16384
#define MAX_TX_QUEUE_SIZE 10

// ==================== RX BUFFER LIMIT TESTS ====================

class RxBufferTest : public ::testing::Test {
protected:
    std::vector<char> rx_buffer;

    bool simulateReceive(const char* data, size_t len) {
        // Simulate the overflow check from on_tcp_recv()
        if (rx_buffer.size() + len > MAX_RX_BUFFER_SIZE) {
            return false;  // Would overflow
        }
        rx_buffer.insert(rx_buffer.end(), data, data + len);
        return true;
    }
};

TEST_F(RxBufferTest, AcceptsDataWithinLimit) {
    std::vector<char> data(1000, 'x');
    EXPECT_TRUE(simulateReceive(data.data(), data.size()));
    EXPECT_EQ(rx_buffer.size(), 1000);
}

TEST_F(RxBufferTest, AcceptsDataUpToLimit) {
    std::vector<char> data(MAX_RX_BUFFER_SIZE, 'x');
    EXPECT_TRUE(simulateReceive(data.data(), data.size()));
    EXPECT_EQ(rx_buffer.size(), MAX_RX_BUFFER_SIZE);
}

TEST_F(RxBufferTest, RejectsDataExceedingLimit) {
    std::vector<char> data(MAX_RX_BUFFER_SIZE + 1, 'x');
    EXPECT_FALSE(simulateReceive(data.data(), data.size()));
    EXPECT_EQ(rx_buffer.size(), 0);  // Buffer unchanged
}

TEST_F(RxBufferTest, RejectsDataWhenBufferAlmostFull) {
    // Fill buffer almost to capacity
    std::vector<char> initial(MAX_RX_BUFFER_SIZE - 10, 'x');
    EXPECT_TRUE(simulateReceive(initial.data(), initial.size()));

    // Try to add more than remaining capacity
    std::vector<char> overflow(20, 'y');
    EXPECT_FALSE(simulateReceive(overflow.data(), overflow.size()));

    // Buffer should remain unchanged (still has initial data)
    EXPECT_EQ(rx_buffer.size(), MAX_RX_BUFFER_SIZE - 10);
}

TEST_F(RxBufferTest, AcceptsDataExactlyFillingRemaining) {
    // Fill buffer partially
    std::vector<char> initial(MAX_RX_BUFFER_SIZE - 100, 'x');
    EXPECT_TRUE(simulateReceive(initial.data(), initial.size()));

    // Add exactly remaining capacity
    std::vector<char> remaining(100, 'y');
    EXPECT_TRUE(simulateReceive(remaining.data(), remaining.size()));

    EXPECT_EQ(rx_buffer.size(), MAX_RX_BUFFER_SIZE);
}

// ==================== TX QUEUE LIMIT TESTS ====================

class TxQueueTest : public ::testing::Test {
protected:
    std::queue<std::string> tx_queue;

    void queueMessage(const std::string& msg) {
        // Simulate the queue limit from send_text()
        while (tx_queue.size() >= MAX_TX_QUEUE_SIZE) {
            tx_queue.pop();  // Drop oldest
        }
        tx_queue.push(msg);
    }
};

TEST_F(TxQueueTest, AcceptsMessagesUpToLimit) {
    for (int i = 0; i < MAX_TX_QUEUE_SIZE; i++) {
        queueMessage("msg" + std::to_string(i));
    }
    EXPECT_EQ(tx_queue.size(), MAX_TX_QUEUE_SIZE);
}

TEST_F(TxQueueTest, DropsOldestWhenFull) {
    // Fill queue
    for (int i = 0; i < MAX_TX_QUEUE_SIZE; i++) {
        queueMessage("msg" + std::to_string(i));
    }

    // Add one more
    queueMessage("new_msg");

    // Queue should still be at limit
    EXPECT_EQ(tx_queue.size(), MAX_TX_QUEUE_SIZE);

    // Oldest (msg0) should be dropped, front should now be msg1
    EXPECT_EQ(tx_queue.front(), "msg1");

    // Back should be the new message
    EXPECT_EQ(tx_queue.back(), "new_msg");
}

TEST_F(TxQueueTest, PreservesNewestMessages) {
    // Fill and overflow queue
    for (int i = 0; i < MAX_TX_QUEUE_SIZE + 5; i++) {
        queueMessage("msg" + std::to_string(i));
    }

    // Verify newest messages are kept
    std::vector<std::string> remaining;
    while (!tx_queue.empty()) {
        remaining.push_back(tx_queue.front());
        tx_queue.pop();
    }

    EXPECT_EQ(remaining.size(), MAX_TX_QUEUE_SIZE);
    // Should have msg5 through msg14 (the 10 newest)
    EXPECT_EQ(remaining.front(), "msg5");
    EXPECT_EQ(remaining.back(), "msg14");
}

// ==================== HEADER PARSING TESTS ====================

class HeaderParsingTest : public ::testing::Test {
protected:
    std::vector<char> rx_buffer;

    // Simulate the header search from process_rx_buffer()
    size_t findHeaderEnd() {
        const char* needle = "\r\n\r\n";
        auto it = std::search(rx_buffer.begin(), rx_buffer.end(), needle, needle + 4);
        if (it == rx_buffer.end()) {
            return std::string::npos;
        }
        return std::distance(rx_buffer.begin(), it);
    }

    bool checkUpgradeSuccess() {
        size_t header_end = findHeaderEnd();
        if (header_end == std::string::npos) {
            return false;
        }
        // Mirrors the real process_rx_buffer: exact status-line match instead
        // of a "101" substring search.
        std::string header(rx_buffer.begin(), rx_buffer.begin() + header_end);
        return header.compare(0, 12, "HTTP/1.1 101") == 0;
    }
};

TEST_F(HeaderParsingTest, FindsHeaderEnd) {
    std::string response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n";
    rx_buffer.assign(response.begin(), response.end());

    size_t header_end = findHeaderEnd();
    EXPECT_NE(header_end, std::string::npos);
    EXPECT_EQ(header_end, response.find("\r\n\r\n"));
}

TEST_F(HeaderParsingTest, ReturnsNposForIncompleteHeader) {
    std::string partial = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n";
    rx_buffer.assign(partial.begin(), partial.end());

    EXPECT_EQ(findHeaderEnd(), std::string::npos);
}

TEST_F(HeaderParsingTest, DetectsSuccessfulUpgrade) {
    std::string response = "HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\n\r\n";
    rx_buffer.assign(response.begin(), response.end());

    EXPECT_TRUE(checkUpgradeSuccess());
}

TEST_F(HeaderParsingTest, DetectsFailedUpgrade) {
    std::string response = "HTTP/1.1 400 Bad Request\r\nContent-Length: 0\r\n\r\n";
    rx_buffer.assign(response.begin(), response.end());

    EXPECT_FALSE(checkUpgradeSuccess());
}

TEST_F(HeaderParsingTest, HandlesWebSocketDataAfterHeader) {
    std::string response = "HTTP/1.1 101 Switching Protocols\r\n\r\n\x81\x05hello";
    rx_buffer.assign(response.begin(), response.end());

    size_t header_end = findHeaderEnd();
    EXPECT_NE(header_end, std::string::npos);
    EXPECT_TRUE(checkUpgradeSuccess());

    // Verify remaining data position
    size_t ws_data_start = header_end + 4;
    EXPECT_LT(ws_data_start, rx_buffer.size());
}

// ==================== BUFFER SHRINK TESTS ====================

TEST(BufferShrinkTest, ShrinkToFitReducesCapacity) {
    std::vector<char> buffer;
    buffer.reserve(10000);
    buffer.resize(100);

    size_t capacity_before = buffer.capacity();
    buffer.shrink_to_fit();
    size_t capacity_after = buffer.capacity();

    // shrink_to_fit should reduce capacity (implementation-dependent, but generally true)
    EXPECT_LE(capacity_after, capacity_before);
    EXPECT_EQ(buffer.size(), 100);  // Size unchanged
}

// ==================== CONSTANT VALIDATION TESTS ====================

TEST(ConstantsTest, RxBufferSizeIsReasonable) {
    // Buffer should be large enough for typical HTTP headers + initial WS frames
    EXPECT_GE(MAX_RX_BUFFER_SIZE, 1024);
    // But not so large it exhausts Pico W memory
    EXPECT_LE(MAX_RX_BUFFER_SIZE, 16384);
}

TEST(ConstantsTest, TxQueueSizeIsReasonable) {
    // Queue should hold enough for burst of GPIO notifications
    EXPECT_GE(MAX_TX_QUEUE_SIZE, 5);
    // But not so many that memory is exhausted
    EXPECT_LE(MAX_TX_QUEUE_SIZE, 50);
}

// ==================== PORT PARSING TESTS ====================

// Mirrors the connect() host/port heuristic: an explicit valid port selects
// plain WS, anything else (bare hostname, empty or non-numeric port) falls
// back to TLS on 443. The real code must never throw on malformed input.
struct ParsedHost {
    std::string host;
    uint16_t port;
    bool use_tls;
};

static ParsedHost parseHost(const std::string& host_str) {
    ParsedHost out = { host_str, 443, true };
    auto colon = host_str.find(':');
    bool port_ok = false;
    if (colon != std::string::npos) {
        std::string port_str = host_str.substr(colon + 1);
        port_ok = !port_str.empty();
        for (char c : port_str) {
            if (c < '0' || c > '9') {
                port_ok = false;
                break;
            }
        }
        if (port_ok) {
            long port = strtol(port_str.c_str(), nullptr, 10);
            if (port < 1 || port > 65535) {
                port_ok = false;
            } else {
                out.port = (uint16_t)port;
            }
        }
    }
    if (port_ok) {
        out.host = host_str.substr(0, colon);
        out.use_tls = false;
    }
    return out;
}

TEST(PortParsingTest, ExplicitPortSelectsPlainWs) {
    ParsedHost p = parseHost("192.168.1.10:8080");
    EXPECT_EQ(p.host, "192.168.1.10");
    EXPECT_EQ(p.port, 8080);
    EXPECT_FALSE(p.use_tls);
}

TEST(PortParsingTest, BareHostnameFallsBackToTls443) {
    ParsedHost p = parseHost("devicesdk.local");
    EXPECT_EQ(p.host, "devicesdk.local");
    EXPECT_EQ(p.port, 443);
    EXPECT_TRUE(p.use_tls);
}

TEST(PortParsingTest, EmptyPortDoesNotThrow) {
    ParsedHost p = parseHost("192.168.1.10:");
    EXPECT_EQ(p.port, 443);
    EXPECT_TRUE(p.use_tls);
}

TEST(PortParsingTest, NonNumericPortFallsBackToTls) {
    ParsedHost p = parseHost("host:abc");
    EXPECT_EQ(p.port, 443);
    EXPECT_TRUE(p.use_tls);
}

TEST(PortParsingTest, OutOfRangePortFallsBackToTls) {
    ParsedHost p = parseHost("host:70000");
    EXPECT_EQ(p.port, 443);
    EXPECT_TRUE(p.use_tls);
}

TEST(PortParsingTest, PortWithTrailingGarbageFallsBackToTls) {
    ParsedHost p = parseHost("host:8080junk");
    EXPECT_EQ(p.port, 443);
    EXPECT_TRUE(p.use_tls);
}

// ==================== FRAME BUILDER TESTS ====================

// Replicates the header-length logic of WebsocketClient::build_frame(). The
// real method masks against a hardware RNG and needs lwIP, so we mirror just
// the framing here (same pattern as the buffer/header tests above). Returns the
// total frame length, or 0 if the payload can't be framed — exactly what the
// caller checks before transmitting.
static size_t simulateBuildFrame(size_t buffer_len, size_t payload_len) {
    size_t header_len = 2;
    if (payload_len < 126) {
        // 7-bit length
    } else if (payload_len <= 0xFFFF) {
        header_len = 4;  // 126 marker + 16-bit length
    } else {
        return 0;        // 64-bit lengths unsupported
    }
    header_len += 4;     // client frames are always masked
    if (header_len + payload_len > buffer_len) return 0;
    return header_len + payload_len;
}

#define WS_BUF_SIZE 4096

TEST(FrameBuilderTest, SmallPayloadUsesTwoByteHeader) {
    // 16-byte {"type":"ping"} style frame: 2 header + 4 mask + 16 payload.
    EXPECT_EQ(simulateBuildFrame(WS_BUF_SIZE, 16), 2u + 4u + 16u);
}

TEST(FrameBuilderTest, BoundaryBelow126UsesShortHeader) {
    EXPECT_EQ(simulateBuildFrame(WS_BUF_SIZE, 125), 2u + 4u + 125u);
}

// Regression for the silent-drop bug: a typical command_ack carrying the
// server's 36-char id is ~132 bytes and MUST still produce a valid frame.
TEST(FrameBuilderTest, CommandAckSizedPayloadIsNotDropped) {
    size_t frame = simulateBuildFrame(WS_BUF_SIZE, 132);
    EXPECT_NE(frame, 0u);
    EXPECT_EQ(frame, 4u + 4u + 132u);  // extended 16-bit header + mask + payload
}

TEST(FrameBuilderTest, ExtendedLengthBoundary) {
    EXPECT_EQ(simulateBuildFrame(WS_BUF_SIZE, 126), 4u + 4u + 126u);
}

TEST(FrameBuilderTest, RejectsPayloadExceedingBuffer) {
    // Larger than BUF_SIZE can hold once header + mask are added.
    EXPECT_EQ(simulateBuildFrame(WS_BUF_SIZE, WS_BUF_SIZE), 0u);
}

TEST(FrameBuilderTest, Rejects64BitLengths) {
    EXPECT_EQ(simulateBuildFrame(100000, 0x10000), 0u);
}
