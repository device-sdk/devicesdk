<template>
  <!-- Hero Section -->
  <section class="relative pt-20 pb-24 px-4 sm:px-6 lg:px-8 overflow-hidden">
    <div class="hero-mesh" aria-hidden="true"></div>
    <div class="max-w-7xl mx-auto hero-stack">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
        <!-- Left: Copy -->
        <div class="hero-enter">
          <div class="badge badge-emerald mb-6 inline-flex items-center gap-2">
            <span class="relative inline-flex w-1.5 h-1.5">
              <span class="pulse-soft absolute inset-0 rounded-full text-emerald-400"></span>
              <span class="relative inline-block w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            </span>
            Free &amp; open source · AGPL-3.0
          </div>
          <h1 class="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-[1.1]">
            Self-hosted IoT<br/>
            <span class="gradient-pan">in TypeScript</span>
          </h1>
          <p class="mt-6 text-lg text-zinc-400 max-w-xl leading-relaxed">
            Write TypeScript device scripts, run the open-source DeviceSDK server yourself — Raspberry Pi, NUC, NAS, any Docker host — and connect your ESP32 and Pico over WebSocket. Your hardware, your data, no cloud.
          </p>
          <div class="mt-8 flex flex-col sm:flex-row gap-3">
            <a href="/docs/quickstart/" class="btn-primary nudge h-11 px-6">
              <span>Get Started</span>
              <svg class="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
            </a>
            <a :href="GITHUB_URL" class="btn-secondary h-11 px-6">
              View on GitHub
            </a>
          </div>
        </div>

        <!-- Right: Code Window -->
        <div class="reveal" data-reveal="right">
          <div class="code-window">
            <div class="code-window-bar">
              <div class="code-window-dots"><span></span><span></span><span></span></div>
              <span class="code-window-title">src/devices/device.ts</span>
            </div>
            <pre><code><span class="syn-kw">import</span> { DeviceEntrypoint } <span class="syn-kw">from</span> <span class="syn-str">"@devicesdk/core"</span>;
<span class="syn-kw">import</span> { Pico } <span class="syn-kw">from</span> <span class="syn-str">"@devicesdk/core/devices/pico"</span>;

<span class="syn-kw">export class</span> <span class="syn-type">Device</span> <span class="syn-kw">extends</span> <span class="syn-type">DeviceEntrypoint</span> {
  <span class="syn-kw">async</span> <span class="syn-fn">onDeviceConnect</span>() {
    <span class="syn-cm">// Configure button on GPIO 14</span>
    <span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.<span class="syn-fn">configureGpioInputMonitoring</span>(<span class="syn-num">14</span>, <span class="syn-num">true</span>);

    <span class="syn-cm">// Init I2C display</span>
    <span class="syn-kw">const</span> display = Pico.<span class="syn-fn">i2c</span>({
      bus: <span class="syn-num">0</span>, sda_pin: <span class="syn-num">0</span>, scl_pin: <span class="syn-num">1</span>
    });

    <span class="syn-kw">let</span> count = <span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv.<span class="syn-fn">get</span>&lt;<span class="syn-type">number</span>&gt;(<span class="syn-str">"count"</span>) ?? <span class="syn-num">0</span>;
    console.<span class="syn-fn">info</span>(<span class="syn-str">`Count: ${count}`</span>);
  }

  <span class="syn-kw">async</span> <span class="syn-fn">onMessage</span>(message) {
    <span class="syn-kw">if</span> (message.type === <span class="syn-str">"gpio_state_changed"</span>) {
      <span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.<span class="syn-fn">setGpioState</span>(<span class="syn-num">99</span>, <span class="syn-str">"high"</span>);
      <span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv.<span class="syn-fn">put</span>(<span class="syn-str">"count"</span>, ++<span class="syn-kw">this</span>.count);
    }
  }
}</code></pre>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Scroll Assembly Scene — pieces fly in and connect into a live IoT system -->
  <section ref="assemblyScene" class="assembly-scene relative" data-scroll-scene="assembly" aria-label="How DeviceSDK connects code to hardware">
    <div class="assembly-sticky">
      <!-- Caption that swaps phrase as you scroll -->
      <div class="assembly-caption">
        <p class="assembly-caption-eyebrow">Watch it come together</p>
        <h2 class="assembly-caption-title">
          <span data-caption="0">Your TypeScript</span>
          <span data-caption="1">runs on your server</span>
          <span data-caption="2">streams to your hardware</span>
          <span data-caption="3">— live.</span>
        </h2>
      </div>

      <!-- Stage -->
      <div class="assembly-stage" aria-hidden="true">
        <!-- Connection lines (SVG, drawn last but z-indexed beneath pieces) -->
        <svg class="assembly-lines" viewBox="0 0 1000 600" preserveAspectRatio="none">
          <defs>
            <linearGradient id="line-grad" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%"   stop-color="#10b981" stop-opacity="0"/>
              <stop offset="50%"  stop-color="#34d399" stop-opacity="1"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
            </linearGradient>
          </defs>
          <!-- editor → cli -->
          <path class="line line-1" d="M 280 250 C 280 320, 320 360, 380 380" />
          <!-- cli → server -->
          <path class="line line-2" d="M 500 380 C 580 360, 640 300, 680 220" />
          <!-- server → device (websocket) -->
          <path class="line line-3" d="M 720 220 C 800 240, 850 320, 820 420" />
          <!-- packet dot travelling server → device -->
          <circle class="packet" r="4" fill="#34d399"/>
        </svg>

        <!-- Piece: TypeScript editor -->
        <div class="piece piece-editor">
          <div class="piece-window">
            <div class="piece-bar">
              <span></span><span></span><span></span>
              <span class="piece-bar-title">device.ts</span>
            </div>
            <pre><code><span class="syn-kw">export class</span> <span class="syn-type">Device</span> {
  <span class="syn-kw">async</span> <span class="syn-fn">onMessage</span>(m) {
    <span class="syn-kw">await</span> kv.<span class="syn-fn">put</span>(<span class="syn-str">"hit"</span>, ++n);
  }
}</code></pre>
          </div>
        </div>

        <!-- Piece: CLI command -->
        <div class="piece piece-cli">
          <div class="piece-cli-bar">
            <span class="text-zinc-500">$</span>
            <span class="cli-cmd">devicesdk deploy</span>
            <span class="cli-check">&#10003;</span>
          </div>
        </div>

        <!-- Piece: Cloud node -->
        <div class="piece piece-cloud">
          <div class="cloud-orb">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6">
              <path d="M7 18a5 5 0 010-10 6 6 0 0111.5 1.5A4 4 0 0119 18H7z" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
          </div>
          <div class="cloud-label">Your server</div>
          <div class="cloud-region">Raspberry Pi · NUC · Docker</div>
        </div>

        <!-- Piece: Device -->
        <div class="piece piece-device">
          <div class="device-board">
            <div class="device-chip">ESP32-C3</div>
            <div class="device-pins">
              <span></span><span></span><span></span><span></span>
              <span></span><span></span><span></span><span></span>
            </div>
            <div class="device-led" title="onboard LED">
              <span class="device-led-dot"></span>
            </div>
            <div class="device-label">ESP32 DevKit</div>
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- How It Works -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 bg-zinc-50">
    <div class="max-w-7xl mx-auto">
      <div class="text-center mb-16 fade-up">
        <h2 class="text-3xl sm:text-4xl font-bold text-zinc-900 tracking-tight">How it works</h2>
        <p class="mt-3 text-zinc-500 text-lg">From your own server to running hardware in four steps</p>
      </div>

      <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 reveal-stagger">
        <!-- Step 1 -->
        <div class="card-lift bg-white border border-zinc-200 rounded-xl p-6">
          <div class="text-xs font-mono text-emerald-600 font-medium mb-3">01</div>
          <h3 class="text-base font-semibold text-zinc-900 mb-2">Write</h3>
          <p class="text-sm text-zinc-500 mb-4">TypeScript with full type safety and autocomplete</p>
          <div class="bg-zinc-900 rounded-lg p-3 font-mono text-xs text-zinc-300">
            <span class="text-zinc-500">$</span> devicesdk init my-project
          </div>
        </div>

        <!-- Step 2 -->
        <div class="card-lift bg-white border border-zinc-200 rounded-xl p-6">
          <div class="text-xs font-mono text-emerald-600 font-medium mb-3">02</div>
          <h3 class="text-base font-semibold text-zinc-900 mb-2">Test</h3>
          <p class="text-sm text-zinc-500 mb-4">Local simulator with virtual hardware — no device needed</p>
          <div class="bg-zinc-900 rounded-lg p-3 font-mono text-xs text-zinc-300">
            <span class="text-zinc-500">$</span> devicesdk dev
          </div>
        </div>

        <!-- Step 3 -->
        <div class="card-lift bg-white border border-zinc-200 rounded-xl p-6">
          <div class="text-xs font-mono text-emerald-600 font-medium mb-3">03</div>
          <h3 class="text-base font-semibold text-zinc-900 mb-2">Deploy</h3>
          <p class="text-sm text-zinc-500 mb-4">One command pushes your code to your own server</p>
          <div class="bg-zinc-900 rounded-lg p-3 font-mono text-xs text-zinc-300">
            <span class="text-zinc-500">$</span> devicesdk deploy
          </div>
        </div>

        <!-- Step 4 -->
        <div class="card-lift bg-white border border-zinc-200 rounded-xl p-6">
          <div class="text-xs font-mono text-emerald-600 font-medium mb-3">04</div>
          <h3 class="text-base font-semibold text-zinc-900 mb-2">Connect</h3>
          <p class="text-sm text-zinc-500 mb-4">Flash firmware and your device runs your TypeScript</p>
          <div class="bg-zinc-900 rounded-lg p-3 font-mono text-xs text-zinc-300">
            <span class="text-zinc-500">$</span> devicesdk flash
          </div>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature 1: TypeScript-first -->
  <section class="py-24 px-4 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center fade-up">
        <div>
          <div class="badge badge-emerald mb-4">Type-safe</div>
          <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">TypeScript-first hardware</h2>
          <p class="mt-4 text-zinc-400 text-lg leading-relaxed">
            Full type definitions for every hardware API. Autocomplete for GPIO pins, I2C buses, ADC channels. Catch wiring mistakes at compile time, not at 3am.
          </p>
        </div>
        <div class="code-window">
          <div class="code-window-bar">
            <div class="code-window-dots"><span></span><span></span><span></span></div>
            <span class="code-window-title">i2c-setup.ts</span>
          </div>
          <pre><code><span class="syn-kw">import</span> { Pico } <span class="syn-kw">from</span> <span class="syn-str">"@devicesdk/core/devices/pico"</span>;

<span class="syn-cm">// Type-safe I2C configuration</span>
<span class="syn-kw">const</span> display = Pico.<span class="syn-fn">i2c</span>({
  bus: <span class="syn-num">0</span>,       <span class="syn-cm">// I2C bus 0 or 1</span>
  sda_pin: <span class="syn-num">0</span>,   <span class="syn-cm">// GPIO 0</span>
  scl_pin: <span class="syn-num">1</span>,   <span class="syn-cm">// GPIO 1</span>
});
<span class="syn-cm">//       ^ TypeError: '3' is not</span>
<span class="syn-cm">//         assignable to I2CBus</span></code></pre>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature 2: Local Simulator -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
    <div class="max-w-7xl mx-auto">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center fade-up">
        <div class="order-2 lg:order-1">
          <div class="code-window terminal">
            <div class="code-window-bar">
              <div class="code-window-dots"><span></span><span></span><span></span></div>
              <span class="code-window-title">Terminal</span>
            </div>
            <pre><code><span class="text-zinc-500">$</span> devicesdk dev
<span class="text-emerald-400">&#10003;</span> Built device.ts <span class="text-zinc-500">(42ms)</span>
<span class="text-sky-400">&#9654;</span> Starting local simulator...
<span class="text-emerald-400">&#10003;</span> Simulator running at <span class="text-zinc-300">http://localhost:8181</span>

<span class="text-zinc-500">[device]</span> onDeviceConnect called
<span class="text-zinc-500">[device]</span> GPIO 14 configured as input
<span class="text-zinc-500">[device]</span> I2C bus 0 initialized
<span class="text-zinc-500">[device]</span> Count: 0
<span class="text-zinc-500">[device]</span> Waiting for messages...<span class="animate-blink">_</span></code></pre>
          </div>
        </div>
        <div class="order-1 lg:order-2">
          <div class="badge badge-emerald mb-4">Local dev</div>
          <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">Test without hardware</h2>
          <p class="mt-4 text-zinc-400 text-lg leading-relaxed">
            <code class="text-sm font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">devicesdk dev</code> starts a local simulator with virtual GPIO, I2C, and ADC. Iterate on your code without touching a single wire.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature 3: Built-in KV -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
    <div class="max-w-7xl mx-auto">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center fade-up">
        <div>
          <div class="badge badge-emerald mb-4">Persistent state</div>
          <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">Built-in KV storage</h2>
          <p class="mt-4 text-zinc-400 text-lg leading-relaxed">
            Every device gets a key-value store that persists across reboots and deployments — backed by SQLite on your own server. Store sensor readings, configuration, or device state, accessible from your code and the dashboard.
          </p>
        </div>
        <div class="code-window">
          <div class="code-window-bar">
            <div class="code-window-dots"><span></span><span></span><span></span></div>
            <span class="code-window-title">kv-storage.ts</span>
          </div>
          <pre><code><span class="syn-cm">// Read with type safety</span>
<span class="syn-kw">const</span> ledOn = <span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv
  .<span class="syn-fn">get</span>&lt;<span class="syn-type">boolean</span>&gt;(<span class="syn-str">"ledOn"</span>);

<span class="syn-cm">// Write — persists across reboots</span>
<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv
  .<span class="syn-fn">put</span>(<span class="syn-str">"ledOn"</span>, !ledOn);

<span class="syn-cm">// Store sensor data</span>
<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv
  .<span class="syn-fn">put</span>(<span class="syn-str">"temperature"</span>, <span class="syn-num">23.5</span>);
<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv
  .<span class="syn-fn">put</span>(<span class="syn-str">"lastReading"</span>, Date.<span class="syn-fn">now</span>());</code></pre>
        </div>
      </div>
    </div>
  </section>

  <!-- Feature 4: OLED Display -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
    <div class="max-w-7xl mx-auto">
      <div class="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center fade-up">
        <div class="order-2 lg:order-1">
          <div class="code-window">
            <div class="code-window-bar">
              <div class="code-window-dots"><span></span><span></span><span></span></div>
              <span class="code-window-title">display.ts</span>
            </div>
            <pre><code><span class="syn-cm">// Fluent display API</span>
<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.display
  .<span class="syn-fn">clear</span>()
  .<span class="syn-fn">drawText</span>(<span class="syn-num">0</span>, <span class="syn-num">0</span>, <span class="syn-str">`Count: ${count}`</span>)
  .<span class="syn-fn">drawLine</span>(<span class="syn-num">0</span>, <span class="syn-num">16</span>, <span class="syn-num">128</span>, <span class="syn-num">16</span>)
  .<span class="syn-fn">drawCircle</span>(<span class="syn-num">64</span>, <span class="syn-num">40</span>, <span class="syn-num">12</span>)
  .<span class="syn-fn">render</span>();</code></pre>
          </div>
        </div>
        <div class="order-1 lg:order-2">
          <div class="badge badge-emerald mb-4">Display API</div>
          <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">OLED from TypeScript</h2>
          <p class="mt-4 text-zinc-400 text-lg leading-relaxed">
            Draw text, shapes, and graphics on SSD1306 OLED displays with a fluent, chainable API. Preview renders in the local simulator before deploying to hardware.
          </p>
        </div>
      </div>
    </div>
  </section>

  <!-- Run it anywhere -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
    <div class="max-w-3xl mx-auto text-center fade-up">
      <p class="text-zinc-500 text-sm font-mono uppercase tracking-wider mb-4">Self-hosted</p>
      <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">
        Run it anywhere.<br/>
        <span class="text-zinc-400">One container, one port.</span>
      </h2>
      <p class="mt-6 text-zinc-500 max-w-xl mx-auto">
        DeviceSDK ships as a single Docker image — server, dashboard, and firmware in one. Bring it up on a Raspberry Pi, a NUC, a NAS, or any Docker host. The first account you create becomes the admin.
      </p>
      <div class="code-window terminal text-left mt-8 max-w-xl mx-auto">
        <div class="code-window-bar">
          <div class="code-window-dots"><span></span><span></span><span></span></div>
          <span class="code-window-title">Terminal</span>
        </div>
        <pre><code><span class="text-zinc-500">$</span> docker compose up -d
<span class="text-emerald-400">&#10003;</span> DeviceSDK running at <span class="text-zinc-300">http://localhost:8080</span>
<span class="text-zinc-500"># open it, create the first account → you're admin</span></code></pre>
      </div>
      <a href="/docs/quickstart/" class="mt-8 nudge inline-flex items-center text-emerald-500 font-medium hover:text-emerald-400 transition-colors text-sm">
        <span class="link-underline">Read the quickstart</span>
        <svg class="ml-1 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"/></svg>
      </a>
    </div>
  </section>

  <!-- Final CTA -->
  <section class="py-24 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
    <div class="max-w-3xl mx-auto text-center fade-up">
      <h2 class="text-3xl sm:text-4xl font-bold tracking-tight">Start building.</h2>
      <p class="mt-4 text-zinc-400 text-lg">From <code class="text-sm font-mono bg-zinc-900 px-2 py-0.5 rounded border border-zinc-800">docker compose up</code> to running hardware in minutes.</p>
      <div class="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
        <a href="/docs/quickstart/" class="btn-primary nudge h-11 px-8">
          <span>Get Started</span>
          <svg class="ml-2 w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7l5 5m0 0l-5 5m5-5H6"/></svg>
        </a>
        <a :href="GITHUB_URL" class="btn-secondary h-11 px-8">View on GitHub</a>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { GITHUB_URL } from "@/config";
import { usePageData } from "@/composables/usePageContent";
import { useSiteHead } from "@/composables/useSiteHead";

const page = usePageData();
useSiteHead(page);

const assemblyScene = ref<HTMLElement | null>(null);

onMounted(() => {
  const scene = assemblyScene.value;
  if (!scene) return;

  const captions = scene.querySelectorAll<HTMLElement>("[data-caption]");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function slice(p: number, start: number, end: number): number {
    const t = Math.max(0, Math.min(1, (p - start) / (end - start)));
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function update() {
    const rect = scene.getBoundingClientRect();
    const vh = window.innerHeight;
    const travel = scene.offsetHeight - vh;
    const raw = travel > 0 ? -rect.top / travel : 0;
    const p = Math.max(0, Math.min(1, raw));
    scene.style.setProperty("--p", p.toFixed(4));
    scene.style.setProperty("--p1", slice(p, 0.0, 0.22).toFixed(4));
    scene.style.setProperty("--p2", slice(p, 0.18, 0.42).toFixed(4));
    scene.style.setProperty("--p3", slice(p, 0.34, 0.58).toFixed(4));
    scene.style.setProperty("--p4", slice(p, 0.5, 0.74).toFixed(4));
    scene.style.setProperty("--p5", slice(p, 0.68, 0.95).toFixed(4));

    const stage = p < 0.25 ? 0 : p < 0.5 ? 1 : p < 0.78 ? 2 : 3;
    captions.forEach((el) => {
      if (Number(el.getAttribute("data-caption")) === stage) {
        el.classList.add("is-active");
      } else {
        el.classList.remove("is-active");
      }
    });
  }

  if (reduced) {
    scene.style.setProperty("--p", "1");
    ["--p1", "--p2", "--p3", "--p4", "--p5"].forEach((v) =>
      scene.style.setProperty(v, "1"),
    );
    const last = scene.querySelector<HTMLElement>('[data-caption="3"]');
    last?.classList.add("is-active");
    return;
  }

  let ticking = false;
  function onScroll() {
    if (!ticking) {
      requestAnimationFrame(() => {
        update();
        ticking = false;
      });
      ticking = true;
    }
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  update();

  onUnmounted(() => {
    window.removeEventListener("scroll", onScroll);
    window.removeEventListener("resize", onScroll);
  });
});
</script>
