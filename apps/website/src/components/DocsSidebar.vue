<template>
  <aside class="docs-sidebar" id="mobile-sidebar">
    <div class="docs-sidebar-content">
      <div class="mb-6">
        <a href="/docs/" class="text-sm font-semibold text-gray-900 hover:text-gray-600 transition-colors">
          Documentation
        </a>
      </div>

      <nav class="space-y-8">
        <!-- Getting Started -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Getting Started</h3>
          <ul class="space-y-2">
            <li><a href="/docs/quickstart/" :class="linkClass('/docs/quickstart/')">Quickstart</a></li>
            <li><a href="/docs/first-device/" :class="linkClass('/docs/first-device/')">Your First Device</a></li>
          </ul>
        </div>

        <!-- CLI Reference -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">CLI Reference</h3>
          <ul class="space-y-2">
            <li><a href="/docs/cli/" :class="linkClass('/docs/cli/')">Overview</a></li>
            <li><a href="/docs/cli/init/" :class="linkClass('/docs/cli/init/')">devicesdk init</a></li>
            <li><a href="/docs/cli/deploy/" :class="linkClass('/docs/cli/deploy/')">devicesdk deploy</a></li>
            <li><a href="/docs/cli/flash/" :class="linkClass('/docs/cli/flash/')">devicesdk flash</a></li>
          </ul>
        </div>

        <!-- Concepts -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Concepts</h3>
          <ul class="space-y-2">
            <li><a href="/docs/concepts/architecture/" :class="linkClass('/docs/concepts/architecture/')">Platform Architecture</a></li>
            <li><a href="/docs/concepts/entrypoints/" :class="linkClass('/docs/concepts/entrypoints/')">Device Entrypoints</a></li>
            <li><a href="/docs/concepts/versioning/" :class="linkClass('/docs/concepts/versioning/')">Script Versioning</a></li>
          </ul>
        </div>

        <!-- Guides -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Guides</h3>
          <ul class="space-y-2">
            <li><a href="/docs/guides/inter-device-communication/" :class="linkClass('/docs/guides/inter-device-communication/')">Inter-Device Communication</a></li>
            <li><a href="/docs/guides/using-spi/" :class="linkClass('/docs/guides/using-spi/')">Using SPI</a></li>
            <li><a href="/docs/guides/using-uart/" :class="linkClass('/docs/guides/using-uart/')">Using UART</a></li>
            <li><a href="/docs/guides/addressable-leds/" :class="linkClass('/docs/guides/addressable-leds/')">Addressable LEDs</a></li>
          </ul>
        </div>

        <!-- Hardware -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Hardware</h3>
          <ul class="space-y-2">
            <li><a href="/docs/hardware/" :class="linkClass('/docs/hardware/')">Overview</a></li>
            <li><a href="/docs/hardware/pico-w/" :class="linkClass('/docs/hardware/pico-w/')">Raspberry Pi Pico W</a></li>
            <li><a href="/docs/hardware/pico-2w/" :class="linkClass('/docs/hardware/pico-2w/')">Raspberry Pi Pico 2 W</a></li>
            <li><a href="/docs/hardware/esp32/" :class="linkClass('/docs/hardware/esp32/')">ESP32</a></li>
            <li><a href="/docs/hardware/esp32-c3/" :class="linkClass('/docs/hardware/esp32-c3/')">ESP32-C3</a></li>
            <li><a href="/docs/hardware/esp32-c61/" :class="linkClass('/docs/hardware/esp32-c61/')">ESP32-C61</a></li>
          </ul>
        </div>

        <!-- Resources -->
        <div>
          <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3">Resources</h3>
          <ul class="space-y-2">
            <li><a href="/docs/resources/troubleshooting/" :class="linkClass('/docs/resources/troubleshooting/')">Troubleshooting</a></li>
            <li><a href="/docs/resources/faq/" :class="linkClass('/docs/resources/faq/')">FAQ</a></li>
            <li><a href="/docs/resources/glossary/" :class="linkClass('/docs/resources/glossary/')">Glossary</a></li>
            <li><a href="/docs/changelog/" :class="linkClass('/docs/changelog/')">Changelog</a></li>
          </ul>
        </div>
      </nav>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { useRoute } from "vue-router";

const route = useRoute();

function linkClass(target: string): string {
  const base = "docs-nav-link";
  return route.path === target ? `${base} active` : base;
}
</script>
