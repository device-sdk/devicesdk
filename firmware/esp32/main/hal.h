#ifndef HAL_H
#define HAL_H

#include <stdint.h>

typedef enum {
    GPIO_STATE_LOW = 0,
    GPIO_STATE_HIGH = 1
} gpio_state_t;

void iotkit_hal_init(void);
void iotkit_hal_set_gpio(uint8_t pin, gpio_state_t state);
void iotkit_hal_blink_led(int count);

#endif
