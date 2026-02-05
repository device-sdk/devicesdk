#include "websocket_handler.h"
#include "hal.h"
#include <stdio.h>

void handle_websocket_message(const picojson::value& v) {
    if (!v.is<picojson::object>()) return;
    const picojson::object& obj = v.get<picojson::object>();

    auto type_it = obj.find("type");
    if (type_it == obj.end() || !type_it->second.is<std::string>()) return;
    const std::string& type = type_it->second.get<std::string>();

    if (type == "set_gpio_state") {
        auto payload_it = obj.find("payload");
        if (payload_it == obj.end() || !payload_it->second.is<picojson::object>()) return;
        const picojson::object& payload = payload_it->second.get<picojson::object>();

        auto pin_it = payload.find("pin");
        auto state_it = payload.find("state");

        if (pin_it != payload.end() && pin_it->second.is<double>() &&
            state_it != payload.end() && state_it->second.is<std::string>()) {
            
            uint8_t pin = (uint8_t)pin_it->second.get<double>();
            const std::string& state_str = state_it->second.get<std::string>();
            
            gpio_state_t state;
            if (state_str == "high") {
                state = GPIO_STATE_HIGH;
            } else if (state_str == "low") {
                state = GPIO_STATE_LOW;
            } else {
                printf("Invalid state value: %s\n", state_str.c_str());
                return;
            }
            
            printf("Setting pin %d to %s\n", pin, state_str.c_str());
            hal_set_gpio(pin, state);
        }
    }
}

