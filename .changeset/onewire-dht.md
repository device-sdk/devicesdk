---
"@devicesdk/core": minor
"@devicesdk/server": minor
"@devicesdk/cli": minor
"@devicesdk/simulation": minor
"@devicesdk/firmware-esp32": minor
"@devicesdk/firmware-pico": minor
"@devicesdk/docs": minor
---

Add DS18B20 (1-Wire) and DHT11/DHT22 sensor support end to end.

Three new device commands are available from device scripts:

- `DEVICE.onewireSearch(pin)` - walks the 1-Wire bus and returns one ROM code per DS18B20, so several probes can share a single GPIO.
- `DEVICE.onewireReadTemperature(pin, rom?)` - reads one addressed probe, or the only probe on the bus when `rom` is omitted (Skip ROM).
- `DEVICE.dhtRead(pin, "dht11" | "dht22")` - returns temperature and humidity in one command.

Both firmwares implement the protocols natively: the Pico bit-bangs 1-Wire and DHT on core 1, and the ESP32 drives 1-Wire through `espressif/onewire_bus` (RMT backend) with DHT bit-banged in a critical section. Scratchpad CRC and DHT checksum failures surface as command errors instead of bogus readings, and DHT reads are rate-limited to one every 2 seconds per pin in firmware.

The `devicesdk dev` simulator answers all three commands with plausible canned data, and the new `/recipes/ds18b20-probe/` page documents wiring (including the required 4.7 kOhm pull-up) and usage.
