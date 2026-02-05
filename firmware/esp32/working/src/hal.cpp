#include "hal.h"
#include "pico/stdlib.h"
#include "pico/cyw43_arch.h"

void hal_init() {
    // Nothing to do here for now
}

void hal_set_gpio(uint8_t pin, gpio_state_t state) {
    bool pin_state = (state == GPIO_STATE_HIGH);
    if (pin == 99) { // Special case for the onboard LED
        cyw43_arch_gpio_put(CYW43_WL_GPIO_LED_PIN, pin_state);
    } else {
        gpio_init(pin);
        gpio_set_dir(pin, GPIO_OUT);
        gpio_put(pin, pin_state);
    }
}
