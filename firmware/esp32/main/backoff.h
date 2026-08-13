#ifndef BACKOFF_H
#define BACKOFF_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s, plus up to
// ~20% jitter. `random` is caller-provided (esp_random()) so the pure math is
// host-testable without linking ESP-IDF.
uint32_t wifi_backoff_delay_ms(uint32_t retry_count, uint32_t random);

#ifdef __cplusplus
}
#endif

#endif
