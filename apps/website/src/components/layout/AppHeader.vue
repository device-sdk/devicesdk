<script setup lang="ts">
import { ref, onMounted, onUnmounted } from "vue";

const scrolled = ref(false);
const mobileOpen = ref(false);

function onScroll() {
	scrolled.value = window.scrollY > 10;
}

onMounted(() => {
	window.addEventListener("scroll", onScroll, { passive: true });
});

onUnmounted(() => {
	window.removeEventListener("scroll", onScroll);
});

const mainNav = [
	{ name: "Product", url: "/product/" },
	{ name: "Solutions", url: "/solutions/" },
	{ name: "Examples", url: "/examples/" },
	{ name: "Docs", url: "/docs/" },
	{ name: "Community", url: "/community/" },
	{
		name: "GitHub",
		url: "https://github.com/device-sdk/devicesdk-monorepo",
		external: true,
	},
];
</script>

<template>
  <nav
    class="fixed w-full top-0 z-50 bg-zinc-950/95 backdrop-blur-md border-b transition-colors duration-200"
    :class="scrolled ? 'border-b-zinc-700' : 'border-b-zinc-800'"
  >
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-14">
        <div class="flex items-center">
          <a href="/" class="flex items-center space-x-2.5">
            <img src="/logo.svg" alt="DeviceSDK" class="w-7 h-7" />
            <span class="text-[15px] font-semibold text-zinc-50 tracking-tight">DeviceSDK</span>
          </a>
          <div class="hidden md:block ml-8">
            <div class="flex items-center space-x-1">
              <a
                v-for="item in mainNav"
                :key="item.name"
                :href="item.url"
                :target="item.external ? '_blank' : undefined"
                :rel="item.external ? 'noopener' : undefined"
                class="px-3 py-1.5 text-[13px] font-medium text-zinc-400 hover:text-zinc-50 rounded-md transition-colors"
              >
                {{ item.name }}
              </a>
            </div>
          </div>
        </div>
        <div class="hidden md:flex items-center space-x-3">
          <a
            href="/docs/quickstart/"
            class="btn-primary text-[13px] h-8 px-3"
          >
            Get Started
          </a>
        </div>
        <div class="flex md:hidden items-center">
          <button
            type="button"
            class="p-2 text-zinc-400 hover:text-zinc-50"
            @click="mobileOpen = !mobileOpen"
            aria-label="Toggle menu"
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16" />
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div
      id="mobile-menu"
      class="md:hidden border-t border-zinc-800 bg-zinc-950"
      :class="mobileOpen ? 'block' : 'hidden'"
    >
      <div class="px-4 py-3 space-y-1">
        <a
          v-for="item in mainNav"
          :key="item.name"
          :href="item.url"
          :target="item.external ? '_blank' : undefined"
          :rel="item.external ? 'noopener' : undefined"
          class="block px-4 py-2 text-base font-medium text-zinc-400 hover:text-zinc-50 hover:bg-zinc-900 rounded-lg"
        >
          {{ item.name }}
        </a>
        <div class="pt-3 border-t border-zinc-800">
          <a href="/docs/quickstart/" class="block w-full btn-primary text-center">Get Started</a>
        </div>
      </div>
    </div>
  </nav>
</template>
