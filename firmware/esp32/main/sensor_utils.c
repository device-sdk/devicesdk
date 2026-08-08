// Pure sensor-protocol helpers for the ESP32 firmware, kept free of ESP-IDF
// headers so the host unit tests (test/CMakeLists.txt) can compile them.

#include "sensor_utils.h"
#include "command_queue.h"

bool sensor_dht_decode(uint8_t model, const uint8_t bytes[5],
                       float *celsius, float *humidity_pct) {
    uint8_t checksum = (uint8_t)(bytes[0] + bytes[1] + bytes[2] + bytes[3]);
    if (checksum != bytes[4]) return false;

    if (model == DHT_MODEL_DHT11) {  // integer humidity and temperature
        *humidity_pct = (float)bytes[0];
        *celsius = (float)bytes[2];
    } else {  // DHT22: tenths, with the temperature sign in the high bit
        *humidity_pct = (float)((bytes[0] << 8) | bytes[1]) / 10.0f;
        float temp = (float)(((bytes[2] & 0x7F) << 8) | bytes[3]) / 10.0f;
        *celsius = (bytes[2] & 0x80) ? -temp : temp;
    }
    return true;
}
