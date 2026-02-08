#include "shared_buffers.h"
#include <string.h>

#ifndef UNIT_TEST
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

static SemaphoreHandle_t s_mutex = NULL;
#endif

static uint8_t s_data[MAX_DISPLAY_BUFFER_SIZE];
static display_segment_t s_segments[MAX_DISPLAY_SEGMENTS];
static size_t s_segment_count = 0;
static size_t s_total_length = 0;
static bool s_ready = false;

void shared_buffers_init(void) {
#ifndef UNIT_TEST
    if (!s_mutex) {
        s_mutex = xSemaphoreCreateMutex();
    }
#endif
    s_total_length = 0;
    s_segment_count = 0;
    s_ready = false;
}

bool shared_display_buffer_write(const uint8_t *data, size_t length,
                                  const display_segment_t *segments, size_t segment_count) {
    if (length > MAX_DISPLAY_BUFFER_SIZE || segment_count > MAX_DISPLAY_SEGMENTS) {
        return false;
    }

#ifndef UNIT_TEST
    xSemaphoreTake(s_mutex, portMAX_DELAY);
#endif

    memcpy(s_data, data, length);
    s_total_length = length;

    if (segments && segment_count > 0) {
        memcpy(s_segments, segments, segment_count * sizeof(display_segment_t));
        s_segment_count = segment_count;
    } else {
        s_segment_count = 0;
    }

    s_ready = true;

#ifndef UNIT_TEST
    xSemaphoreGive(s_mutex);
#endif
    return true;
}

bool shared_display_buffer_read(uint8_t *data, size_t *length,
                                 display_segment_t *segments, size_t *segment_count) {
#ifndef UNIT_TEST
    xSemaphoreTake(s_mutex, portMAX_DELAY);
#endif

    if (!s_ready) {
#ifndef UNIT_TEST
        xSemaphoreGive(s_mutex);
#endif
        return false;
    }

    if (data && length) {
        memcpy(data, s_data, s_total_length);
        *length = s_total_length;
    }

    if (segments && segment_count) {
        memcpy(segments, s_segments, s_segment_count * sizeof(display_segment_t));
        *segment_count = s_segment_count;
    }

    s_ready = false;

#ifndef UNIT_TEST
    xSemaphoreGive(s_mutex);
#endif
    return true;
}
