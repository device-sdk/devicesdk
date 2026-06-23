#ifndef CONFIG_H
#define CONFIG_H

/*
 * BUILD-TIME PATCH PLACEHOLDERS — NOT real credentials.
 *
 * These fixed-length ASCII strings are baked into the compiled firmware binary.
 * When a user downloads firmware via the DeviceSDK server, the server locates
 * these exact byte sequences and replaces them in-memory with the real Wi-Fi
 * credentials, API token, host, project ID, and device ID before streaming the
 * binary to the client. See apps/server/src/endpoints/devices/downloadFirmware.ts.
 *
 * IMPORTANT: Do NOT change the strings or their lengths — the patch logic depends
 * on finding these exact byte patterns. Do NOT use these values as real credentials.
 */
#define DEVICESDK_WIFI_SSID     "8d477eda147344f8b9b8d3e3bef7505b"
#define DEVICESDK_WIFI_PASSWORD "ebc8394548904aa583916609049d5ea527021de49780437a98915189223dcf8"
#define DEVICESDK_API_TOKEN     "e343ecb8036442e093a47718463c1716"
#define DEVICESDK_API_HOST      "3ed66c2c3ed1474382278f70ba01dc4c"
#define DEVICESDK_PROJECT_ID "288f2d2493094af68ab37a96ef73a118"
#define DEVICESDK_DEVICE_ID  "d09f91a7729141eb8911d7a0f1e1595f"

// 5-minute keepalive. A short interval just keeps the idle WebSocket warm;
// the server's idle-disconnect window is generous (single-digit minutes), so
// there's no need to ping more aggressively.
#define DEVICESDK_PING_INTERVAL_MS 300000

#endif
