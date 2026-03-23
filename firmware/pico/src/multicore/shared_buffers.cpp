#include "shared_buffers.h"
#include <string.h>

// Global shared display buffer
static shared_display_buffer_t g_display_buffer;

// Global shared WS2812 pixel buffer
static shared_ws2812_buffer_t g_ws2812_buffer;

void shared_buffers_init(void) {
    mutex_init(&g_display_buffer.mutex);
    g_display_buffer.total_length = 0;
    g_display_buffer.segment_count = 0;
    g_display_buffer.ready = false;

    mutex_init(&g_ws2812_buffer.mutex);
    g_ws2812_buffer.length = 0;
    g_ws2812_buffer.ready = false;
}

shared_display_buffer_t* get_shared_display_buffer(void) {
    return &g_display_buffer;
}

bool shared_display_buffer_write(const uint8_t* data, size_t length,
                                  const display_segment_t* segments, size_t segment_count) {
    if (length > MAX_DISPLAY_BUFFER_SIZE || segment_count > MAX_DISPLAY_SEGMENTS) {
        return false;
    }

    mutex_enter_blocking(&g_display_buffer.mutex);

    // Copy data
    memcpy(g_display_buffer.data, data, length);
    g_display_buffer.total_length = length;

    // Copy segment info
    if (segments && segment_count > 0) {
        memcpy(g_display_buffer.segments, segments, segment_count * sizeof(display_segment_t));
        g_display_buffer.segment_count = segment_count;
    } else {
        g_display_buffer.segment_count = 0;
    }

    g_display_buffer.ready = true;

    mutex_exit(&g_display_buffer.mutex);
    return true;
}

bool shared_display_buffer_read(uint8_t* data, size_t* length,
                                 display_segment_t* segments, size_t* segment_count) {
    mutex_enter_blocking(&g_display_buffer.mutex);

    if (!g_display_buffer.ready) {
        mutex_exit(&g_display_buffer.mutex);
        return false;
    }

    // Copy data out
    if (data && length) {
        memcpy(data, g_display_buffer.data, g_display_buffer.total_length);
        *length = g_display_buffer.total_length;
    }

    // Copy segment info
    if (segments && segment_count) {
        memcpy(segments, g_display_buffer.segments,
               g_display_buffer.segment_count * sizeof(display_segment_t));
        *segment_count = g_display_buffer.segment_count;
    }

    g_display_buffer.ready = false;

    mutex_exit(&g_display_buffer.mutex);
    return true;
}

bool shared_display_buffer_is_ready(void) {
    // Quick non-blocking check
    if (!mutex_try_enter(&g_display_buffer.mutex, NULL)) {
        return false;  // Mutex held, assume not ready
    }

    bool ready = g_display_buffer.ready;
    mutex_exit(&g_display_buffer.mutex);
    return ready;
}

// === WS2812 shared buffer functions ===

shared_ws2812_buffer_t* get_shared_ws2812_buffer(void) {
    return &g_ws2812_buffer;
}

bool shared_ws2812_buffer_write(const uint8_t* data, size_t length) {
    if (length > MAX_WS2812_BUFFER_SIZE) {
        return false;
    }

    mutex_enter_blocking(&g_ws2812_buffer.mutex);

    memcpy(g_ws2812_buffer.data, data, length);
    g_ws2812_buffer.length = length;
    g_ws2812_buffer.ready = true;

    mutex_exit(&g_ws2812_buffer.mutex);
    return true;
}

bool shared_ws2812_buffer_read(uint8_t* data, size_t* length) {
    mutex_enter_blocking(&g_ws2812_buffer.mutex);

    if (!g_ws2812_buffer.ready) {
        mutex_exit(&g_ws2812_buffer.mutex);
        return false;
    }

    if (data && length) {
        memcpy(data, g_ws2812_buffer.data, g_ws2812_buffer.length);
        *length = g_ws2812_buffer.length;
    }

    g_ws2812_buffer.ready = false;

    mutex_exit(&g_ws2812_buffer.mutex);
    return true;
}
