# DeviceSDK Marketing Website — Complete Site Structure

## Design Philosophy
Developer-focused marketing site that emphasizes **solutions and outcomes** over feature lists. Shows what you can build, not just how the API works.

---

## Site Map

```
DeviceSDK Website
├── Home (/)
├── Product (/product)
├── Pricing (/pricing)
├── Solutions (/solutions)
├── Documentation (/docs) → separate docs site
├── Examples (/examples)
├── Community (/community)
├── About (/about)
├── Changelog (external: https://devicesdk.com/docs/changelog)
└── Legal
    ├── Terms (/terms)
    └── Privacy (/privacy)
```

---

# PAGE 1: Homepage (/)

## Goal
Convert visitors into users within 30 seconds. Show value immediately.

---

## 1. Hero Section
**Goal:** Immediate value proposition and visual impact

**Content:**
- **Headline:** "Build IoT applications at the edge" or "Everything you need to ship IoT apps, running at the edge"
- **Subheadline:** Short description emphasizing speed, developer experience, and Cloudflare-powered infrastructure
- **Primary CTA:** "Start building" → Dashboard signup
- **Secondary CTA:** "View documentation" → Docs site
- **Visual:** Code snippet showing a simple device entrypoint or animated device connection flow
- **Pre-launch banner:** Sign-up form for early access/updates (currently in beta)

**Tone:** Confident, technical but accessible, forward-looking

---

### 2. What You Can Build
**Goal:** Show concrete solutions and use cases, not features

**Format:** Grid of cards with icons/illustrations

**Solutions to highlight:**
- **Remote device control** — Control hardware from anywhere with WebSocket connections
- **Fleet management** — Deploy code to hundreds of devices in seconds
- **Real-time monitoring** — Track device status and telemetry at the edge
- **Over-the-air updates** — Push firmware and script updates safely
- **IoT automation** — Build workflows that respond to device events
- **Sensor networks** — Collect and process data from distributed sensors

Each card:
- Icon/illustration
- Solution name
- 1-2 sentence description
- Optional "See example →" link to docs/examples

---

### 3. The Platform (Overview)
**Goal:** Show the complete ecosystem without overwhelming with features

**Layout:** Split into three columns

**Three pillars:**
1. **Build Locally**
   - TypeScript-first development
   - Local simulator for testing
   - Fast iteration with hot reload
   - CLI tools (devicesdk init, dev, build)

2. **Deploy Globally**
   - One command deployment
   - Cloudflare edge network
   - Per-device versioning
   - Instant rollback capability

3. **Manage Everything**
   - Web dashboard for fleet oversight
   - API tokens and authentication
   - Real-time device monitoring
   - Script version history

**Visual:** Diagram showing local dev → edge deployment → device connection flow

---

### 4. Developer Experience
**Goal:** Highlight the DX that makes DeviceSDK special

**Format:** Feature showcase with code examples

**Highlights:**
- **Get started in minutes**
  ```bash
  npm install -g @devicesdk/cli
  devicesdk login
  devicesdk init my-project
  ```

- **Write TypeScript, not firmware**
  Code snippet showing a simple DeviceEntrypoint class

- **Test without hardware**
  Screenshot/animation of local simulator

- **Deploy with confidence**
  ```bash
  devicesdk deploy -m "Add temperature alerts"
  ```

---

### 5. Built on Cloudflare
**Goal:** Leverage Cloudflare's credibility and global infrastructure

**Content:**
- **Global reach map:** Show Cloudflare's edge network presence
- **Key stats:**
  - X ms average latency
  - Runs on Cloudflare Workers
  - Durable Objects for device state
  - R2 for script storage
  - D1 for device metadata

**Messaging:**
- "Your devices connect to the nearest edge location"
- "Built on the same infrastructure powering millions of websites"
- "Scale from prototype to production without infrastructure changes"

---

### 6. Security & Reliability
**Goal:** Address enterprise concerns without being boring

**Format:** Icon grid with short descriptions

**Topics:**
- **OAuth authentication** — Google sign-in, session management
- **Secure credentials** — Device tokens, API key management
- **Encrypted connections** — TLS/WebSocket security
- **Per-device isolation** — Scripts run in isolated environments
- **Automatic backups** — Version history and rollback protection

---

### 7. Use Case Deep Dive (Optional Section)
**Goal:** Tell a story about a real-world application

**Format:** Narrative + code + visual

**Example flow:**
"Building a Temperature Monitoring System"
1. Define your device logic in TypeScript
2. Test locally with the simulator
3. Deploy to real hardware with one command
4. Monitor all sensors from the dashboard
5. Update behavior instantly across your fleet

**Include:** Actual code snippet, dashboard screenshot, deployment command

---

### 8. Comparison Table (Optional)
**Goal:** Position against traditional IoT platforms

**Format:** Table comparing DeviceSDK vs. Traditional IoT Platforms

**Rows:**
- Setup time
- Development environment
- Deployment process
- Global infrastructure
- Script updates
- Developer experience
- Pricing model

**Keep it factual, not aggressive**

---

### 9. Pricing / Plans
**Goal:** Set expectations, even in beta

**Current state:**
- Early access signup
- Enterprise plans coming soon

**Future state:**
- Free tier: X devices, Y deployments/month
- Pro tier: Unlimited devices, priority support
- Enterprise: Custom solutions, SLA

**CTA:** "Start free" or "Join waitlist"

---

### 10. Getting Started CTA
**Goal:** Final conversion push

**Layout:** Full-width colored section (gradient background)

**Content:**
- **Headline:** "Start building today" or "Build your first IoT app in minutes"
- **Subtext:** "Join developers shipping IoT applications at the edge"
- **Primary CTA:** "Sign up free" → Dashboard
- **Secondary CTA:** "Read quickstart" → Docs
- **Trust signals:** "No credit card required"

---

### 11. Community & Resources
**Goal:** Show ecosystem and support options

**Format:** 3-4 cards

**Links:**
- **Documentation** — Complete guides and API reference
- **GitHub** — Open source examples and tools
- **Discord/Community** — Get help from other developers
- **Changelog** — Latest updates and releases (https://devicesdk.com/docs/changelog)

---

### 12. Footer
**Standard footer with:**
- **Product:** Documentation, Dashboard, CLI, Examples
- **Company:** About, Blog, Terms, Privacy
- **Community:** GitHub, Discord, Twitter/X
- **Resources:** Status page, Support, Changelog
- **Copyright & legal**

---

## Key Messaging Principles

1. **Solution-oriented:** Focus on "what you can build" not "what we have"
2. **Developer respect:** Technical audience, no hand-holding, show code
3. **Speed emphasis:** Fast to start, fast to deploy, fast to scale
4. **Cloudflare credibility:** Leverage the platform's reputation
5. **No feature dumping:** Don't list API endpoints or CLI flags
6. **Visual storytelling:** Use code snippets, diagrams, screenshots
7. **Clear CTAs:** Every section should guide toward signup or docs

---

## Content Tone

- **Confident but humble:** "Built on Cloudflare" not "We're the best"
- **Technical but accessible:** Show code, explain value
- **Action-oriented:** "Build", "Deploy", "Ship" not "Manage", "Configure"
- **Modern:** Short sentences, scannable, visual

---

## Differences from Cloudflare Workers Approach

**What we keep:**
- Clean, developer-focused design
- Solutions over features
- Code examples throughout
- Clear CTAs
- Global infrastructure emphasis

**What we adapt:**
- Smaller scale (not millions of developers yet)
- Beta/early access messaging
- More focused use cases (IoT, not general compute)
- Stronger emphasis on hardware integration (Pico, firmware)

---

## Pages NOT Included Here

This document covers the **main marketing homepage**. Separate pages needed:
- Full documentation site (see documentation-structure.md)
- Pricing page (when out of beta)
- About/Company pages
- Blog/Updates section
- Legal pages (Terms, Privacy) — already have Terms

---

## Implementation Notes

- Use existing `public/index.html` as base template
- Fetch content from these markdown files via JavaScript
- Keep the modern gradient aesthetic from current site
- Ensure mobile responsiveness
- Add subtle animations (fade-in on scroll)
- Consider adding a "Watch demo video" option in hero

---

## Success Metrics

When this structure is implemented well:
- Developers understand what DeviceSDK does in <10 seconds
- Clear path from landing → signup → first deployment
- Code examples are copy-pasteable
- No questions about "what can I build with this?"
- Low bounce rate, high docs navigation rate
