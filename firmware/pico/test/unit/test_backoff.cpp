#include <gtest/gtest.h>

#include "backoff.h"

TEST(BackoffTest, DoublingSequenceWithoutJitter) {
    // random == 0 selects the base delay: 1s, 2s, 4s, 8s, 16s, then capped at 30s.
    EXPECT_EQ(wifi_backoff_delay_ms(0, 0), 1000);
    EXPECT_EQ(wifi_backoff_delay_ms(1, 0), 2000);
    EXPECT_EQ(wifi_backoff_delay_ms(2, 0), 4000);
    EXPECT_EQ(wifi_backoff_delay_ms(3, 0), 8000);
    EXPECT_EQ(wifi_backoff_delay_ms(4, 0), 16000);
    EXPECT_EQ(wifi_backoff_delay_ms(5, 0), 30000);
    EXPECT_EQ(wifi_backoff_delay_ms(6, 0), 30000);
}

TEST(BackoffTest, JitterStaysWithinTwentyPercent) {
    for (uint32_t count = 0; count < 10; count++) {
        uint32_t base = (count >= 5) ? 30000 : (1000U << count);
        for (uint32_t random = 0; random < 1000; random += 37) {
            uint32_t delay = wifi_backoff_delay_ms(count, random);
            EXPECT_GE(delay, base);
            EXPECT_LE(delay, base + base / 5);
        }
    }
}

TEST(BackoffTest, CapAppliesAtAndAboveThirtySeconds) {
    EXPECT_EQ(wifi_backoff_delay_ms(20, 0), 30000);
    EXPECT_EQ(wifi_backoff_delay_ms(31, 0), 30000);
    EXPECT_EQ(wifi_backoff_delay_ms(32, 0), 30000);
}
