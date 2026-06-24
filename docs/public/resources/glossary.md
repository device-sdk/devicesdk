---
title: Glossary
description: Key terms and definitions for DeviceSDK
social_image: /og-images/docs/resources/glossary.png
---

## A

### ADC (Analog-to-Digital Converter)
Hardware that converts analog voltage signals (0-3.3V) to digital values. Used for reading sensors like temperature, light, and pressure.

### API Token
Authentication credential for accessing the DeviceSDK API programmatically. Generated in your server's dashboard for CI/CD and automation.

## B

### BOOTSEL Mode
Special mode on Raspberry Pi Pico that allows firmware flashing. Entered by holding the BOOTSEL button while connecting USB.

## C

### CLI (Command-Line Interface)
The `@devicesdk/cli` tool for developing, building, and deploying device applications from the terminal. Point it at your server with `devicesdk login --host http://<server>:8080`.

## D

### Dashboard
Web interface served by your DeviceSDK server (same origin, default `http://<server>:8080`) for managing projects, devices, deployments, and viewing logs.

### Device
A physical microcontroller (like Raspberry Pi Pico W) running DeviceSDK firmware and connected to your project.

### Device Credentials
Unique authentication tokens embedded in device firmware during flashing. Used to securely connect devices to your project.

### Device Entrypoint
A TypeScript class that handles device communication. Contains lifecycle methods like `onDeviceConnect`, `onMessage`, and `onDeviceDisconnect`.

### Device ID
Unique identifier for each device in your project. Set during firmware flashing.

### Deployment
The process of uploading and activating device scripts on your server. Creates a new immutable version, stored under `DATA_DIR/scripts/`.

## E

### Runtime
The in-process JavaScript runtime where device scripts execute - they run inside the Bun server process on your own hardware, not in a sandboxed or serverless environment.

### Environment Bindings
Objects accessible in device entrypoints like `this.env.DEVICE`, providing access to platform features. Standard `console` methods are also available for logging.

## F

### Firmware
The software running on the microcontroller that handles hardware communication and maintains the WebSocket connection to DeviceSDK.

### Flashing
The process of installing firmware onto a microcontroller's flash memory.

## G

### GPIO (General Purpose Input/Output)
Programmable digital pins on microcontrollers for reading buttons, controlling LEDs, etc.

## H

### Hot Reload
Development feature that automatically rebuilds and applies code changes without restarting the dev server.

## I

### I2C (Inter-Integrated Circuit)
Serial communication protocol for connecting sensors and peripherals. Commonly used for temperature sensors, displays, etc.

### Immutable Version
A deployed script version that cannot be modified. Ensures consistency and enables safe rollbacks.

## K

### KV Storage
Key-value storage for storing device state and configuration.

## L

### Lifecycle Methods
Functions in device entrypoints called at specific points: `onDeviceConnect`, `onMessage`, `onDeviceDisconnect`.

## M

### Message
A unit of communication between a device and your server, sent via WebSocket.

### Microcontroller
A small computer on a single chip, like Raspberry Pi Pico, that runs embedded firmware.

## O

### onDeviceConnect
Lifecycle method called when a device establishes a WebSocket connection.

### onDeviceDisconnect
Lifecycle method called when a device's WebSocket connection closes.

### onMessage
Lifecycle method called when a device sends a message to your server.

## P

### Pin
Physical connection point on a microcontroller for GPIO, ADC, I2C, etc.

### Project
A collection of device entrypoints, configuration, and deployments. Corresponds to one DeviceSDK application.

### PWM (Pulse Width Modulation)
Technique for controlling power to devices by rapidly switching on/off. Used for LED dimming, motor speed control, etc.

## R

### Rollback
Reverting to a previous version of deployed code. Available instantly via the dashboard.

### RP2040
The microcontroller chip used in Raspberry Pi Pico, featuring dual ARM Cortex-M0+ cores.

## S

### Script
Compiled JavaScript code running in the server's in-process runtime that handles device communication. Built from TypeScript entrypoints.

### Simulator
Local development environment (`devicesdk dev`) that emulates device connections without physical hardware.

### SPI (Serial Peripheral Interface)
High-speed serial communication protocol for peripherals like SD cards and displays.

### Staging
Environment for testing deployments before production. Implemented using separate projects.

## T

### TLS (Transport Layer Security)
Encryption protocol for WebSocket connections. On a LAN install the server speaks plain HTTP/`ws://`; for installs exposed beyond the LAN you put it behind a reverse proxy or TLS terminator (optional built-in HTTPS is on the roadmap).

### TypeScript
Primary programming language for DeviceSDK device entrypoints, providing type safety and modern features.

## V

### Version
An immutable snapshot of deployed code. Each deployment creates a new version with unique identifier.

### Version History
Record of all deployments in a project, including timestamps, authors, and deployment messages.

## W

### WebSocket
Persistent, bidirectional communication protocol connecting devices to your server.

### WiFi
Wireless networking technology used by devices to reach your DeviceSDK server. Currently supports 2.4GHz 802.11n.

## Common Acronyms

- **API** - Application Programming Interface
- **CI/CD** - Continuous Integration/Continuous Deployment
- **GPIO** - General Purpose Input/Output
- **HTTP** - Hypertext Transfer Protocol
- **IoT** - Internet of Things
- **JSON** - JavaScript Object Notation
- **LED** - Light Emitting Diode
- **RAM** - Random Access Memory
- **REST** - Representational State Transfer
- **SDK** - Software Development Kit
- **TLS** - Transport Layer Security
- **UART** - Universal Asynchronous Receiver-Transmitter
- **USB** - Universal Serial Bus
- **UUID** - Universally Unique Identifier

## Related Resources

- [Platform Architecture](/docs/concepts/architecture/) - How components fit together
- [Your First Device](/docs/first-device/) - Hands-on tutorial
- [FAQ](/docs/resources/faq/) - Common questions
