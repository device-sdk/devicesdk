<script setup lang="ts">
defineProps<{
	corner?: "tl" | "tr" | "bl" | "br";
}>();
</script>

<template>
  <div class="relative border border-zinc-800 bg-zinc-900/40 rounded-lg p-6">
    <div class="absolute -top-px -left-px w-4 h-4 border-t-2 border-l-2 border-amber-500/50 rounded-tl-lg"></div>
    <div class="absolute -top-px -right-px w-4 h-4 border-t-2 border-r-2 border-amber-500/50 rounded-tr-lg"></div>
    <div class="absolute -bottom-px -left-px w-4 h-4 border-b-2 border-l-2 border-amber-500/50 rounded-bl-lg"></div>
    <div class="absolute -bottom-px -right-px w-4 h-4 border-b-2 border-r-2 border-amber-500/50 rounded-br-lg"></div>
    <slot />
  </div>
</template>
