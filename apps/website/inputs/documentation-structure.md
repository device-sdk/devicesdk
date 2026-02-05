# DeviceSDK Documentation Structure

## Documentation Philosophy

**Target audience:** Developers building IoT applications who need practical, example-driven guidance.

**Core principles:**
- **Example-first:** Show working code before explaining theory
- **Progressive depth:** Quick starts → Guides → API reference → Advanced patterns
- **Searchable:** Clear navigation, good SEO, cmd+k search
- **Versioned:** Match docs to SDK/CLI versions
- **Tested:** All code examples should run
- **Visual:** Diagrams for architecture, flows, and concepts

---

## Documentation Site Structure

### Top-Level Navigation

```
┌─ Getting Started
├─ Guides
├─ API Reference
├─ CLI Reference
├─ Examples
├─ Concepts
└─ Resources
```

---

## 1. Getting Started

**Goal:** Get developers from zero to first deployment in <15 minutes

### 1.1 Quickstart
**Path:** `/docs/quickstart`

**Content:**
1. Have node 22 installed or newer
3. Login (`npx @devicesdk/cli login`)
4. Create first project (`npx @devicesdk/cli init hello-world`)
5. Run locally (`npx @devicesdk/cli dev`)
6. Deploy (`npx @devicesdk/cli deploy`)
7. View in dashboard
8. **Next steps:** Links to tutorials, examples

**Format:** Single page, step-by-step with code blocks, screenshots where helpful

---

### 1.2 Installation
**Path:** `/docs/installation`

**Content:**
- System requirements (OS, Node.js, npm/yarn/pnpm)
- CLI installation methods (npm, yarn, pnpm)
- Verifying installation (`npx @devicesdk/cli --version`)
- Troubleshooting common install issues
- Updating to latest version

---

### 1.3 Your First Device
**Path:** `/docs/first-device`

**Content:**
- Understanding device entrypoints
- Basic DeviceEntrypoint class structure
- Handling device connection (`onDeviceConnect`)
- Handling messages (`onMessage`)
- Sending messages to devices
- Testing in the simulator
- Deploying to real hardware

**Format:** Tutorial with complete working example (LED blink or button press)

---

### 1.4 Project Structure
**Path:** `/docs/project-structure`

**Content:**
- `devicesdk.ts` configuration file
- `src/devices/` directory organization
- `.devicesdk/` build output directory
- Environment variables and secrets
- Multiple device management
- TypeScript configuration

---

## 2. Guides

**Goal:** Task-oriented tutorials for common use cases

### 2.1 Device Basics

#### 2.1.1 Working with GPIO
**Path:** `/docs/guides/gpio`
- Reading digital inputs
- Writing digital outputs
- Monitoring pin changes
- Pull-up/pull-down resistors
- Debouncing buttons
- **Example:** Button-controlled LED

#### 2.1.2 Analog Inputs (ADC)
**Path:** `/docs/guides/adc`
- Reading analog sensors
- Voltage dividers
- Sensor calibration
- **Example:** Temperature sensor reading

#### 2.1.3 PWM (Pulse Width Modulation)
**Path:** `/docs/guides/pwm`
- PWM basics and configuration
- Controlling LED brightness
- Motor speed control
- Servo positioning
- **Example:** Breathing LED effect

#### 2.1.4 I2C Communication
**Path:** `/docs/guides/i2c`
- I2C protocol overview
- Reading from I2C sensors
- Writing to I2C devices
- Common I2C sensors (BME280, OLED displays)
- **Example:** Environmental sensor monitoring

#### 2.1.5 SPI Communication
**Path:** `/docs/guides/spi`
- SPI protocol overview
- Configuring SPI devices
- Common SPI peripherals
- **Example:** SD card logging

---

### 2.2 Networking & Connectivity

#### 2.2.1 Device-to-Cloud Communication
**Path:** `/docs/guides/device-cloud`
- Message format and types
- Sending telemetry data
- Receiving commands
- WebSocket connection lifecycle
- Handling disconnections and reconnects
- **Example:** Sensor data reporting

#### 2.2.2 WiFi Configuration
**Path:** `/docs/guides/wifi`
- Setting WiFi credentials
- Multiple network profiles
- Connection status monitoring
- Handling network failures
- **Example:** WiFi manager with fallback

#### 2.2.3 Device State Management
**Path:** `/docs/guides/state`
- Using device KV storage (`env.DEVICE.kv`)
- Persistent state vs. volatile state
- State synchronization patterns
- **Example:** Maintaining device configuration

---

### 2.3 Development Workflow

#### 2.3.1 Local Development
**Path:** `/docs/guides/local-dev`
- Using the simulator (`devicesdk dev`)
- Simulator capabilities and limitations
- Hot reload and debugging
- Simulating GPIO, I2C, sensors
- Testing without hardware

#### 2.3.2 Building and Deploying
**Path:** `/docs/guides/deploy`
- Build process (`devicesdk build`)
- Single device vs. fleet deployment
- Deploy messages and versioning
- Deployment strategies (canary, blue-green)
- Rollback procedures

#### 2.3.3 Firmware Flashing
**Path:** `/docs/guides/flashing`
- Raspberry Pi Pico support
- BOOTSEL mode
- `devicesdk flash` command
- Firmware with device credentials
- Troubleshooting flash issues
- Supported hardware list

#### 2.3.4 Version Management
**Path:** `/docs/guides/versions`
- Understanding script versions
- Version history in dashboard
- Deploying specific versions
- Rolling back deployments
- Per-device version tracking

---

#### 2.5.3 Production Best Practices
**Path:** `/docs/guides/production`
- Error handling patterns
- Logging and monitoring
- Graceful degradation
- Update strategies
- Health checks
- Fleet management at scale

## 4. CLI Reference

**Goal:** Complete command-line interface documentation

### 4.1 CLI Overview
**Path:** `/docs/cli`
- Installation
- Configuration (`devicesdk.ts`)
- Global flags (`--config`, `--verbose`)
- Environment variables

### 4.2 Commands

Each command gets its own page under `/docs/cli/[command]`:

#### `devicesdk login`
- Purpose
- Authentication flow
- Credential storage
- Flags and options

#### `devicesdk logout`
- Purpose
- Credential cleanup

#### `devicesdk whoami`
- Purpose
- Output format

#### `devicesdk init`
- Purpose
- Interactive vs. non-interactive
- Templates (basic, multi-device, empty)
- Flags: `--yes`, `--template`, `--name`

#### `devicesdk dev`
- Purpose
- Simulator features
- Port configuration
- Flags: `--port`

#### `devicesdk build`
- Purpose
- Build output location
- Per-device builds
- Flags: `--device`, `--outdir`, `--minify`, `--sourcemap`

#### `devicesdk deploy`
- Purpose
- Single vs. all devices
- Deploy messages
- Dry-run mode
- Flags: `--device`, `--message`, `--dry-run`

#### `devicesdk flash`
- Purpose
- Raspberry Pi Pico flashing
- BOOTSEL mode detection
- Timeout configuration
- Flags: `--timeout`

**Format:** Each command page includes:
- Synopsis
- Description
- Arguments and flags
- Examples (basic and advanced)
- Related commands
- Troubleshooting tips

---

## 5. Examples

**Goal:** Real-world, copy-paste-ready projects

**Path:** `/docs/examples`

### Example Categories:

#### 5.1 Basic Examples
- **Blink LED** - Hello world for hardware
- **Button Input** - Reading GPIO with debouncing
- **Temperature Monitor** - ADC sensor reading
- **PWM LED Fade** - Smooth LED brightness control

#### 5.2 Sensor Examples
- **BME280 Environmental Sensor** - I2C temperature/humidity/pressure
- **Light Level Monitor** - Photoresistor with ADC
- **Motion Detector** - PIR sensor integration
- **Distance Sensor** - Ultrasonic ranging (HC-SR04)

#### 5.3 Actuator Examples
- **Servo Control** - Positioning servos with PWM
- **Motor Controller** - DC motor speed and direction
- **Relay Control** - Switching high-power devices
- **RGB LED Strip** - NeoPixel/WS2812B control

#### 5.4 Integration Examples
- **Discord Bot** - Send sensor data to Discord
- **Temperature Alerts** - Email notifications with Resend
- **Data Logger** - Store readings in D1 database
- **Dashboard Widget** - Real-time device status display

#### 5.5 Advanced Examples
- **Multi-Device System** - Coordinated device fleet
- **Edge AI Inference** - Using Cloudflare Workers AI
- **Firmware OTA Updates** - Safe remote update patterns
- **Device Provisioning** - Zero-touch setup flow

**Format for each example:**
- Problem statement
- Hardware requirements (if any)
- Complete source code (GitHub link)
- Step-by-step setup
- Expected output
- Variations and extensions

---

## 6. Concepts

**Goal:** Explain architecture and design decisions

**Path:** `/docs/concepts`

### 6.1 Platform Architecture
- How DeviceSDK works end-to-end
- Device → WebSocket → Script execution flow

### 6.2 Device Entrypoints
- Lifecycle methods
- Message handling model
- Environment bindings (`env.DEVICE`, `env.logger`)
- State management patterns

### 6.3 WebSocket Protocol
- Connection establishment
- Message format specification
- Standard message types
- Custom message types
- Connection lifecycle

### 6.4 Script Versioning
- How versions are created
- Version immutability
- Deployment model
- Rollback mechanics

### 6.5 Security Model
- OAuth flow
- Token types and scopes
- Device credential injection
- Session management
- API authentication

### 6.6 Local Simulator
- Architecture and limitations
- Simulated vs. real hardware
- When to use simulator vs. hardware

---

## 7. Resources

**Path:** `/docs/resources`

### 7.1 Hardware Compatibility
- Supported microcontrollers (Raspberry Pi Pico, Pico W)
- Roadmap for future hardware
- Community-tested boards

### 7.2 Troubleshooting
- Common errors and solutions
- CLI troubleshooting
- Deployment issues
- Hardware debugging
- Network connectivity issues

### 7.3 Migration Guides
- Migrating from other IoT platforms
- Upgrading between DeviceSDK versions

### 7.4 FAQ
- General questions
- Pricing and limits
- Technical capabilities
- Roadmap questions

### 7.5 Glossary
- Device
- Project
- Script
- Version
- Durable Object
- Entrypoint
- Firmware
- etc.

### 7.6 Changelog
**Path:** `/changelog`
- Latest releases and fixes
- Breaking changes and migrations
- Planned upcoming changes (if any)

### 7.7 Community Resources
- GitHub repositories
- Discord community
- Example gallery
- Third-party integrations

---

## What NOT to Document

### Avoid documenting:
1. **Internal implementation details** - Don't explain Workers internals, D1 schema, etc.
2. **Cloudflare basics** - Assume familiarity with Cloudflare ecosystem
3. **JavaScript/TypeScript tutorials** - Link to external resources instead
4. **Hardware fundamentals** - Link to electronics tutorials, not teach Ohm's law
5. **Every possible edge case** - Focus on common patterns
6. **Future features** - Document what exists, maybe have a "Coming soon" section
7. **Dashboard UI walkthrough** - UI should be self-explanatory; document concepts not clicks

### Keep out of main docs (but may exist elsewhere):
- **Blog posts** - Announcements, case studies, deep dives
- **Marketing content** - Already covered in marketing-site-pages.md
- **Legal docs** - Terms, privacy policy
- **Internal developer docs** - Contributing guides, architecture decisions

---

## Documentation Organization Best Practices

### File Structure
```
docs/
├── index.md (landing page)
├── quickstart.md
├── installation.md
├── first-device.md
├── project-structure.md
├── guides/
│   ├── gpio.md
│   ├── adc.md
│   ├── pwm.md
│   ├── i2c.md
│   ├── spi.md
│   ├── device-cloud.md
│   ├── wifi.md
│   ├── state.md
│   ├── local-dev.md
│   ├── deploy.md
│   ├── flashing.md
│   ├── versions.md
│   ├── external-apis.md
│   ├── databases.md
│   ├── webhooks.md
│   ├── cloudflare-integration.md
│   ├── auth.md
│   ├── security.md
│   └── production.md
├── api/
│   ├── index.md
│   ├── authentication.md
│   ├── projects.md
│   ├── devices.md
│   ├── scripts.md
│   ├── tokens.md
│   └── websocket.md
├── cli/
│   ├── index.md
│   ├── login.md
│   ├── logout.md
│   ├── whoami.md
│   ├── init.md
│   ├── dev.md
│   ├── build.md
│   ├── deploy.md
│   └── flash.md
├── examples/
│   ├── index.md
│   ├── blink-led.md
│   ├── button-input.md
│   ├── temperature-monitor.md
│   ├── [more examples].md
├── concepts/
│   ├── architecture.md
│   ├── entrypoints.md
│   ├── websocket-protocol.md
│   ├── versioning.md
│   ├── security.md
│   └── simulator.md
└── resources/
    ├── hardware.md
    ├── troubleshooting.md
    ├── faq.md
    ├── glossary.md
    ├── changelog.md
    └── community.md
```

### Writing Guidelines

1. **Use active voice:** "Deploy your device" not "Devices can be deployed"
2. **Code first:** Show example before explanation
3. **Test all examples:** Every code snippet should be verified
4. **Link generously:** Cross-reference related docs
5. **Use consistent formatting:**
   - Command-line: `devicesdk deploy`
   - Code: Triple backticks with language
   - Paths: `/docs/api`
   - UI elements: **Bold**
   - Parameters: `projectId`

6. **Add metadata to each page:**
   ```yaml
   ---
   title: Working with GPIO
   description: Learn how to read and write GPIO pins on your devices
   category: Guides
   difficulty: Beginner
   last_updated: 2025-12-31
   ---
   ```

7. **Include "Next steps":** End each guide with related topics
8. **Show prerequisites:** List requirements at the start
9. **Provide context:** Explain *why* not just *how*
10. **Keep it scannable:** Use headings, lists, code blocks

---

## Documentation Tools & Infrastructure

### Recommended Stack
- **Framework:** Docusaurus, VitePress, or Mintlify
- **Search:** Algolia DocSearch or local search
- **Hosting:** Cloudflare Pages
- **Versioning:** Branch per major version
- **Analytics:** Track popular pages, search terms
- **Feedback:** "Was this helpful?" on each page

### Navigation Structure
- Sticky sidebar with collapsible sections
- Breadcrumbs at top
- Previous/Next links at bottom
- Table of contents on right (for long pages)
- Mobile-friendly hamburger menu

### Search Requirements
- Full-text search across all docs
- Keyboard shortcut (cmd/ctrl+K)
- Search suggestions
- Highlight search terms in results
- Filter by category (Guide, API, CLI, Example)

---

## Success Metrics

Good documentation means:
- **Low support volume** - Common questions answered in docs
- **High completion rate** - Users finish tutorials
- **Fast onboarding** - Zero to deployment in <30 minutes
- **Strong search usage** - Users find answers via search
- **Community contributions** - Examples and guides from users

Track:
- Page views and time-on-page
- Search queries (what are users looking for?)
- Feedback ratings per page
- External links (GitHub issues mentioning docs)
- Tutorial completion (using analytics events)

---

## Maintenance Plan

### Regular updates:
- **Weekly:** Fix typos, broken links
- **With each release:** Update changelog, version-specific changes
- **Monthly:** Review most-searched terms, add missing content
- **Quarterly:** Audit for outdated information, deprecated features

### Content review checklist:
- [ ] All code examples still work
- [ ] Screenshots match current UI
- [ ] Links are not broken
- [ ] API reference matches OpenAPI spec
- [ ] CLI reference matches `--help` output
- [ ] Version numbers are current
- [ ] "Coming soon" features are launched or removed

---

## Content Priority (Phase 1 Launch)

**Must have before public launch:**
1. Quickstart
2. Installation
3. Your First Device
4. Project Structure
5. CLI Reference (all commands)
6. API Reference (core endpoints)
7. 3-5 basic examples
8. GPIO, ADC, PWM guides
9. Device-to-cloud communication guide
10. Troubleshooting

**Nice to have (can add post-launch):**
11. Advanced integration guides
12. All sensor/actuator examples
13. Concepts deep-dives
14. Migration guides
15. Video tutorials

**Future additions:**
- Interactive tutorials
- Playground/sandbox
- Community example gallery
- Live API explorer
- Video walkthroughs
