<script setup lang="ts">
import AppHeader from "./AppHeader.vue";
</script>

<template>
  <div class="font-sans antialiased bg-white text-gray-900">
    <AppHeader />
    <main class="pt-14">
      <slot />
    </main>
  </div>
</template>
