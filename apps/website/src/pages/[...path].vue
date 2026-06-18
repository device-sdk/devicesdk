<script setup lang="ts">
import { useHead } from "@vueuse/head";
import HeroEnter from "~/components/animations/HeroEnter.vue";

useHead({
	title: "Page Not Found | DeviceSDK",
	meta: [
		{
			name: "description",
			content: "The requested page could not be found.",
		},
	],
});
</script>

<template>
  <section class="min-h-[70vh] pt-32 pb-20 px-4 sm:px-6 lg:px-8 text-center">
    <div class="max-w-2xl mx-auto hero-enter">
      <HeroEnter>
        <p class="text-sm font-mono text-amber-400 mb-4">404</p>
        <h1 class="text-4xl sm:text-5xl font-bold tracking-tight">Page not found</h1>
        <p class="mt-6 text-lg text-zinc-400">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div class="mt-8">
          <a href="/" class="btn-primary h-11 px-6">Go home</a>
        </div>
      </HeroEnter>
    </div>
  </section>
</template>
