#ifndef DEVICESDK_BACKOFF_H
#define DEVICESDK_BACKOFF_H

#include <cstdint>

// Exponential backoff: 1s, 2s, 4s, 8s, 16s, then capped at 30s, plus up to
// ~20% jitter. `random` is caller-provided (get_rand_32()) so the pure math is
// host-testable without linking the pico-sdk.
uint32_t wifi_backoff_delay_ms(uint32_t retry_count, uint32_t random);

#endif // DEVICESDK_BACKOFF_H
