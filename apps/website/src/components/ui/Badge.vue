<script setup lang="ts">
defineProps<{
	variant?: "default" | "emerald" | "sky" | "purple" | "amber";
}>();

const variantClasses: Record<string, string> = {
	default: "border-zinc-700 text-zinc-300 bg-zinc-900",
	emerald: "border-emerald-500/30 text-emerald-400 bg-emerald-500/10",
	sky: "border-sky-500/30 text-sky-400 bg-sky-500/10",
	purple: "border-purple-500/30 text-purple-400 bg-purple-500/10",
	amber: "border-amber-500/30 text-amber-400 bg-amber-500/10",
};
</script>

<template>
  <span class="inline-flex items-center px-2.5 py-0.5 text-xs font-medium rounded-full border" :class="variantClasses[variant ?? 'default']">
    <slot />
  </span>
</template>
