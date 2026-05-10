// Host-side stub for the Pico SDK's <pico/cyw43_arch.h>.
// Only the functions actually used by sources in TESTABLE_SOURCES need to be
// stubbed — the test build defines UNIT_TEST=1 and links against the mocks.
//
// Add new no-op stubs here as more firmware sources get pulled into the host
// test build.
#pragma once

inline void cyw43_arch_poll() {}
