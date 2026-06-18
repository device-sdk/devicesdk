<script setup lang="ts">
import AppHeader from "./AppHeader.vue";
import AppFooter from "./AppFooter.vue";
</script>

<template>
  <div class="font-sans antialiased bg-zinc-950 text-zinc-50">
    <AppHeader />
    <main class="pt-14">
      <slot />
    </main>
    <AppFooter />
  </div>
</template>
