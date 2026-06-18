<template>
  <nav class="fixed w-full top-0 z-50 bg-zinc-950/95 backdrop-blur-md border-b border-zinc-800 transition-colors duration-200">
    <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <div class="flex justify-between items-center h-14">
        <div class="flex items-center">
          <a href="/" class="flex items-center space-x-2.5">
            <img src="/logo.svg" alt="DeviceSDK" class="w-7 h-7">
            <span class="text-[15px] font-semibold text-zinc-50 tracking-tight">DeviceSDK</span>
          </a>
          <div class="hidden md:block ml-8">
            <div class="flex items-center space-x-1">
              <a
                v-for="item in MAIN_MENU"
                :key="item.url"
                :href="item.url"
                :target="isExternal(item.url) ? '_blank' : undefined"
                :rel="isExternal(item.url) ? 'noopener' : undefined"
                class="px-3 py-1.5 text-[13px] font-medium text-zinc-400 hover:text-zinc-50 rounded-md transition-colors"
              >
                {{ item.name }}
              </a>
            </div>
          </div>
        </div>
        <div class="hidden md:flex items-center space-x-3">
          <button
            type="button"
            onclick="document.getElementById('devicesdk-search')?.open()"
            aria-label="Search the docs"
            class="flex items-center gap-2 px-3 h-8 w-56 rounded-md border border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-400 hover:text-zinc-50 text-[13px] transition-colors"
          >
            <svg class="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
            <span class="flex-1 text-left">Search the docs</span>
            <kbd class="text-[10px] font-mono px-1.5 py-0.5 rounded border border-zinc-700 bg-zinc-800 text-zinc-400">⌘K</kbd>
          </button>
          <a :href="DASHBOARD_URL" class="btn-primary text-[13px] h-8 px-3">
            Get Started
          </a>
        </div>
        <div class="flex md:hidden items-center">
          <button
            type="button"
            onclick="document.getElementById('devicesdk-search')?.open()"
            aria-label="Search the docs"
            class="p-2 text-zinc-400 hover:text-zinc-50"
          >
            <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="11" cy="11" r="7"/>
              <path d="m21 21-4.3-4.3"/>
            </svg>
          </button>
          <button id="mobile-menu-button" class="p-2 text-zinc-400 hover:text-zinc-50">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/>
            </svg>
          </button>
        </div>
      </div>
    </div>

    <div id="mobile-menu" class="hidden md:hidden border-t border-zinc-800 bg-zinc-950">
      <div class="px-4 py-3 space-y-1">
        <a
          v-for="item in MAIN_MENU"
          :key="item.url"
          :href="item.url"
          :target="isExternal(item.url) ? '_blank' : undefined"
          :rel="isExternal(item.url) ? 'noopener' : undefined"
          class="block px-4 py-2 text-base font-medium text-zinc-400 hover:text-zinc-50 hover:bg-zinc-900 rounded-lg"
        >
          {{ item.name }}
        </a>
        <div class="pt-3 border-t border-zinc-800">
          <a :href="DASHBOARD_URL" class="block w-full btn-primary text-center">Get Started</a>
        </div>
      </div>
    </div>
  </nav>
</template>

<script setup lang="ts">
import { DASHBOARD_URL, MAIN_MENU } from "@/config";

function isExternal(url: string): boolean {
  return url.startsWith("http");
}
</script>
