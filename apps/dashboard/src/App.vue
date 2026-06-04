<template>
  <router-view />
</template>

<script setup lang="ts">
import { onMounted } from 'vue';

// Remove the static boot splash (index.html) once the app is alive. By the time
// App mounts, the boot-time auth probe has resolved, so we're past the
// blank-screen window.
onMounted(() => {
  document.getElementById('app-splash')?.remove();
});
</script>
