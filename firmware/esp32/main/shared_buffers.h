#ifndef SHARED_BUFFERS_H
#define SHARED_BUFFERS_H

#include <stdint.h>
#include <stddef.h>
#include <stdbool.h>

// Maximum display framebuffer size (128x64 / 8 = 1024 bytes)
#define MAX_DISPLAY_BUFFER_SIZE 1024

// Segment info for display update
typedef struct {
    size_t offset;
    size_t length;
} display_segment_t;

// Maximum segments per display update
#define MAX_DISPLAY_SEGMENTS 16

// Initialize shared buffers (call once at startup)
void shared_buffers_init(void);

// Write display data to shared buffer (thread-safe)
// Returns true if buffer was available and data was written
bool shared_display_buffer_write(const uint8_t *data, size_t length,
                                  const display_segment_t *segments, size_t segment_count);

// Read display data from shared buffer (thread-safe)
// Returns true if data was available
bool shared_display_buffer_read(uint8_t *data, size_t *length,
                                 display_segment_t *segments, size_t *segment_count);

#endif // SHARED_BUFFERS_H
