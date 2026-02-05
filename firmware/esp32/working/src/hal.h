#ifndef HAL_H
#define HAL_H

#include <stdint.h>

typedef enum {
    GPIO_STATE_LOW,
    GPIO_STATE_HIGH
} gpio_state_t;

void hal_init();
void hal_set_gpio(uint8_t pin, gpio_state_t state);

#endif // HAL_H
