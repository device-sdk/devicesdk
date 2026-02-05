import { DeviceSDKConfig } from 'devicekit/dist/config';

export const config: DeviceSDKConfig = {
    devices: {
        temperatureSensor: {
            className: "TemperatureSensor",
            entryPoint: "./src/devices/temperatureSensor.ts",
        },
    },
};
