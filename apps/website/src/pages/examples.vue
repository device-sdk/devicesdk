<script setup lang="ts">
import { ref, computed } from "vue";
import { useHead } from "@vueuse/head";
import HeroEnter from "~/components/animations/HeroEnter.vue";
import ScrollReveal from "~/components/animations/ScrollReveal.vue";
import StaggerReveal from "~/components/animations/StaggerReveal.vue";
import CodeWindow from "~/components/ui/CodeWindow.vue";

useHead({
	title: "Examples | DeviceSDK",
	meta: [
		{
			name: "description",
			content:
				"Real code, ready to deploy. Browse example DeviceSDK projects by category.",
		},
	],
});

const activeFilter = ref("all");
const filters = [
	"all",
	"basic",
	"sensors",
	"integrations",
	"advanced",
] as const;
type Filter = (typeof filters)[number];

const examples: {
	title: string;
	category: Filter;
	tags: string[];
	code: string;
}[] = [
	{
		title: "Blink LED",
		category: "basic",
		tags: ["Pico W"],
		code: `<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE\n  .<span class="syn-fn">setGpioState</span>(<span class="syn-num">99</span>, <span class="syn-str">"high"</span>);\n<span class="syn-cm">// Pin 99 = onboard LED</span>`,
	},
	{
		title: "Button Input",
		category: "basic",
		tags: ["Pico W"],
		code: `<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE\n  .<span class="syn-fn">configureGpioInputMonitoring</span>(\n    <span class="syn-num">14</span>, <span class="syn-num">true</span>);\n<span class="syn-cm">// Fires gpio_state_changed</span>`,
	},
	{
		title: "OLED Counter",
		category: "basic",
		tags: ["I2C"],
		code: `<span class="syn-kw">this</span>.env.DEVICE.display\n  .<span class="syn-fn">clear</span>()\n  .<span class="syn-fn">drawText</span>(<span class="syn-num">0</span>,<span class="syn-num">0</span>,<span class="syn-str">\`Count: \${n}\`</span>)\n  .<span class="syn-fn">render</span>();`,
	},
	{
		title: "Temperature Monitor",
		category: "sensors",
		tags: ["ADC"],
		code: `<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE\n  .<span class="syn-fn">configureGpioInputMonitoring</span>(\n    <span class="syn-num">26</span>, <span class="syn-num">true</span>);`,
	},
	{
		title: "BME280 Weather",
		category: "sensors",
		tags: ["I2C"],
		code: `<span class="syn-kw">const</span> sensor = Pico.<span class="syn-fn">i2c</span>({\n  bus: <span class="syn-num">0</span>,\n  sda_pin: <span class="syn-num">0</span>, scl_pin: <span class="syn-num">1</span>\n});`,
	},
	{
		title: "Motion Detector",
		category: "sensors",
		tags: ["GPIO"],
		code: `<span class="syn-kw">if</span> (msg.type === <span class="syn-str">"gpio_state_changed"</span>)\n  <span class="syn-kw">await</span> kv.<span class="syn-fn">put</span>(<span class="syn-str">"lastMotion"</span>,\n    Date.<span class="syn-fn">now</span>());`,
	},
	{
		title: "Discord Alerts",
		category: "integrations",
		tags: ["Webhook"],
		code: `<span class="syn-kw">await</span> <span class="syn-fn">fetch</span>(WEBHOOK_URL, {\n  method: <span class="syn-str">"POST"</span>,\n  body: JSON.<span class="syn-fn">stringify</span>({\n    content: <span class="syn-str">\`Temp: \${t}C\`</span>\n  })\n});`,
	},
	{
		title: "Data Logger",
		category: "integrations",
		tags: ["KV"],
		code: `<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICE.kv\n  .<span class="syn-fn">put</span>(<span class="syn-str">\`reading:\${ts}\`</span>,\n    { temp, humidity });`,
	},
	{
		title: "Smart Thermostat",
		category: "advanced",
		tags: ["Multi-sensor"],
		code: `<span class="syn-kw">if</span> (temp &lt; target) {\n  <span class="syn-kw">await</span> device.<span class="syn-fn">setGpioState</span>(\n    RELAY_PIN, <span class="syn-str">"high"</span>);\n  display.<span class="syn-fn">drawText</span>(<span class="syn-num">0</span>,<span class="syn-num">0</span>,<span class="syn-str">"Heating"</span>);\n}`,
	},
	{
		title: "Multi-Device System",
		category: "advanced",
		tags: ["Fleet"],
		code: `<span class="syn-cm">// Same script deploys to</span>\n<span class="syn-cm">// multiple devices — each</span>\n<span class="syn-cm">// gets its own KV store</span>\nkv.<span class="syn-fn">put</span>(<span class="syn-str">"role"</span>, <span class="syn-str">"sensor-a"</span>);`,
	},
	{
		title: "Plant Watering",
		category: "advanced",
		tags: ["ADC + GPIO"],
		code: `<span class="syn-kw">if</span> (moisture &lt; <span class="syn-num">30</span>) {\n  <span class="syn-kw">await</span> device.<span class="syn-fn">setGpioState</span>(\n    PUMP_PIN, <span class="syn-str">"high"</span>);\n  <span class="syn-kw">await</span> <span class="syn-fn">delay</span>(<span class="syn-num">5000</span>);\n}`,
	},
	{
		title: "Device-to-Device RPC",
		category: "advanced",
		tags: ["RPC"],
		code: `<span class="syn-kw">await</span> <span class="syn-kw">this</span>.env.DEVICES[\n  <span class="syn-str">"light"</span>\n].<span class="syn-fn">turnOn</span>();\n<span class="syn-cm">// { status: "on" }</span>`,
	},
];

const filtered = computed(() =>
	activeFilter.value === "all"
		? examples
		: examples.filter((e) => e.category === activeFilter.value),
);

const badgeVariant = (category: Filter) => {
	switch (category) {
		case "basic":
			return "emerald";
		case "sensors":
			return "sky";
		case "integrations":
			return "purple";
		case "advanced":
			return "amber";
		default:
			return "default";
	}
};
</script>

<template>
  <div>
    <section class="relative pt-20 pb-12 px-4 sm:px-6 lg:px-8 overflow-hidden">
      <div class="hero-mesh subtle" aria-hidden="true"></div>
      <div class="max-w-4xl mx-auto text-center hero-stack hero-enter">
        <HeroEnter>
          <h1 class="text-4xl sm:text-5xl font-bold tracking-tight">
            Example<br />
            <span class="gradient-pan">projects</span>
          </h1>
          <p class="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto">
            Real code, ready to deploy. Browse by category or dive into the source.
          </p>
        </HeroEnter>
      </div>
    </section>

    <section class="pb-24 px-4 sm:px-6 lg:px-8">
      <div class="max-w-7xl mx-auto">
        <ScrollReveal>
          <div class="flex flex-wrap gap-2 justify-center mb-12">
            <button
              v-for="filter in filters"
              :key="filter"
              class="filter-pill px-4 py-1.5 text-sm font-medium rounded-full border transition-colors"
              :class="activeFilter === filter ? 'active' : 'border-zinc-800 text-zinc-400 hover:text-zinc-50 hover:border-zinc-600'"
              @click="activeFilter = filter"
            >
              {{ filter.charAt(0).toUpperCase() + filter.slice(1) }}
            </button>
          </div>
        </ScrollReveal>

        <StaggerReveal>
          <div class="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            <div
              v-for="example in filtered"
              :key="example.title"
              class="card card-lift p-5"
            >
              <div class="flex items-center gap-2 mb-3">
                <span class="badge" :class="`badge-${badgeVariant(example.category)}`">
                  {{ example.category.charAt(0).toUpperCase() + example.category.slice(1) }}
                </span>
                <span v-for="tag in example.tags" :key="tag" class="badge">{{ tag }}</span>
              </div>
              <h3 class="font-semibold text-zinc-50">{{ example.title }}</h3>
              <CodeWindow class="text-xs mt-4">
                <pre class="!p-3"><code v-html="example.code"></code></pre>
              </CodeWindow>
            </div>
          </div>
        </StaggerReveal>
      </div>
    </section>

    <section class="py-20 px-4 sm:px-6 lg:px-8 border-t border-zinc-800">
      <div class="max-w-3xl mx-auto text-center">
        <ScrollReveal>
          <h2 class="text-2xl font-bold tracking-tight">Want the full source?</h2>
          <p class="mt-3 text-zinc-400">All examples are available on GitHub with instructions.</p>
          <div class="mt-6 flex flex-col sm:flex-row gap-3 justify-center">
            <a href="https://github.com/device-sdk/devicesdk-monorepo" target="_blank" rel="noopener" class="btn-secondary h-10 px-5 text-sm">
              <svg class="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                <path fill-rule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clip-rule="evenodd" />
              </svg>
              View on GitHub
            </a>
            <a href="/docs/quickstart/" class="btn-primary h-10 px-5 text-sm">Start building</a>
          </div>
        </ScrollReveal>
      </div>
    </section>
  </div>
</template>
