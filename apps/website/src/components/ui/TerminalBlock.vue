<script setup lang="ts">
import CodeWindow from "./CodeWindow.vue";

defineProps<{
	title?: string;
}>();
</script>

<template>
  <CodeWindow :title="title ?? 'Terminal'" terminal>
    <slot />
  </CodeWindow>
</template>
