#ifndef SHARED_BUFFERS_H
#define SHARED_BUFFERS_H

#include "pico/mutex.h"
#include <stdint.h>
#include <stddef.h>

// Maximum display framebuffer size (128x64 / 8 = 1024 bytes)
#define MAX_DISPLAY_BUFFER_SIZE 1024

// Segment info for display update
typedef struct {
    size_t offset;
    size_t length;
} display_segment_t;

// Maximum segments per display update
#define MAX_DISPLAY_SEGMENTS 16

// Shared display buffer structure
typedef struct {
    mutex_t mutex;
    uint8_t data[MAX_DISPLAY_BUFFER_SIZE];
    display_segment_t segments[MAX_DISPLAY_SEGMENTS];
    size_t segment_count;
    size_t total_length;
    bool ready;
} shared_display_buffer_t;

// Initialize shared buffers (call once at startup)
void shared_buffers_init(void);

// Display buffer access functions
// These are thread-safe (use mutex internally)

// Core 0: Write display data to shared buffer
// Returns true if buffer was available and data was written
bool shared_display_buffer_write(const uint8_t* data, size_t length,
                                  const display_segment_t* segments, size_t segment_count);

// Core 1: Read display data from shared buffer
// Returns true if data was available and ready is now false
bool shared_display_buffer_read(uint8_t* data, size_t* length,
                                 display_segment_t* segments, size_t* segment_count);

// Check if display buffer has data ready (non-blocking)
bool shared_display_buffer_is_ready(void);

// Get global shared display buffer (for direct mutex access if needed)
shared_display_buffer_t* get_shared_display_buffer(void);

#endif // SHARED_BUFFERS_H
