<script setup lang="ts">
defineProps<{
	title?: string;
	terminal?: boolean;
}>();
</script>

<template>
  <div class="code-window" :class="{ terminal }">
    <div class="code-window-bar">
      <div class="code-window-dots">
        <span></span>
        <span></span>
        <span></span>
      </div>
      <span v-if="title" class="code-window-title">{{ title }}</span>
    </div>
    <pre><code><slot /></code></pre>
  </div>
</template>
