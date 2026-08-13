#include "backoff.h"

uint32_t wifi_backoff_delay_ms(uint32_t retry_count, uint32_t random) {
    uint32_t base_ms = (retry_count >= 5) ? 30000 : (1000U << retry_count);
    return base_ms + (random % (base_ms / 5 + 1));
}
