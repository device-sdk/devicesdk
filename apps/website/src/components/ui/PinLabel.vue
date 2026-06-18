<script setup lang="ts">
defineProps<{
	label: string;
}>();
</script>

<template>
  <span class="inline-flex items-center px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-amber-400 border border-amber-500/30 rounded bg-amber-500/10">
    {{ label }}
  </span>
</template>
