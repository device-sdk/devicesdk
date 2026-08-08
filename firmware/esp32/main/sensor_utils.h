#ifndef SENSOR_UTILS_H
#define SENSOR_UTILS_H

#include <stdbool.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Decodes a DHT 40-bit frame (5 bytes: humidity hi/lo, temp hi/lo, checksum).
// `model` is a dht_model_t from command_queue.h (0 = DHT11, 1 = DHT22).
// Returns false on a checksum mismatch. DHT22 is sign-magnitude: the high bit
// of byte 2 is the temperature sign, the low 15 bits the magnitude in tenths.
//
// Lives in its own SDK-free translation unit so the host unit tests can cover
// the decode math without ESP-IDF (see test/CMakeLists.txt).
bool sensor_dht_decode(uint8_t model, const uint8_t bytes[5],
                       float *celsius, float *humidity_pct);

#ifdef __cplusplus
}
#endif

#endif // SENSOR_UTILS_H
