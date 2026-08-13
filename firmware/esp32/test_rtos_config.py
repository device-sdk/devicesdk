"""
RTOS configuration safety tests (no hardware).

Guards the single-core worker-task pin regression that hard-crashed ESP32-C3/C61
every boot: `xTaskCreatePinnedToCore` asserts at runtime on a core ID other than
0 when `configNUMBER_OF_CORES == 1` (ESP-IDF 5.5, freertos_tasks_c_additions.h:163).
CI compiles the firmware for esp32/esp32c3/esp32c61 but cannot run it, so the
runtime assert is unreachable in CI; this test enforces the source-level
invariant instead. The firmware also carries a `_Static_assert` for the same
invariant (compile error on single-core builds), so this test is the safety net.
"""

import re
from pathlib import Path

MAIN_C = Path(__file__).parent / "main" / "devicesdk_main.c"


def x_task_create_pinned_core_args(source):
    """Yield the core-ID argument of every xTaskCreatePinnedToCore(...) call.

    Handles multi-line calls (as written in this file) by capturing up to the
    closing paren and taking the last comma-separated argument.
    """
    for m in re.finditer(r"xTaskCreatePinnedToCore\s*\((.*?)\)\s*;", source, re.DOTALL):
        args = [a.strip() for a in m.group(1).split(",")]
        yield args[-1]


def test_worker_task_core_is_valid_on_single_core_targets():
    source = MAIN_C.read_text()
    calls = list(x_task_create_pinned_core_args(source))
    assert calls, "no xTaskCreatePinnedToCore calls found - did the source move?"

    for core_arg in calls:
        # A bare numeric literal other than 0 is invalid on single-core
        # targets: xTaskCreatePinnedToCore asserts on any xCoreID >= 1 there,
        # which reboot-loops the device before the WiFi retry can fire.
        # Allowed arguments: 0, configNUM_CORES - 1, tskNO_AFFINITY, or any
        # expression referencing a core-count macro.
        if re.fullmatch(r"\d+", core_arg):
            assert int(core_arg) == 0, (
                f"xTaskCreatePinnedToCore pinned to core {core_arg} in "
                f"{MAIN_C.name}; invalid on single-core ESP32-C3/C61 "
                "(asserts on every boot). Use configNUM_CORES - 1 "
                "(the last available core)."
            )


def test_worker_core_static_assert_is_present():
    source = MAIN_C.read_text()
    assert "_Static_assert(DEVICESDK_WORKER_CORE" in source, (
        "the compile-time core-ID guard (static assert on DEVICESDK_WORKER_CORE) "
        "was removed; a hardcoded core pin can regress silently on single-core "
        "targets because CI builds don't run the firmware."
    )
