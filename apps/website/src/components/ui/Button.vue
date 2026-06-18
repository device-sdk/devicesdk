<script setup lang="ts">
defineProps<{
	href?: string;
	variant?: "primary" | "secondary";
	external?: boolean;
}>();
</script>

<template>
  <component
    :is="href ? 'a' : 'button'"
    :href="href"
    :target="external ? '_blank' : undefined"
    :rel="external ? 'noopener' : undefined"
    class="inline-flex items-center justify-center px-6 h-11 text-sm font-medium rounded-md transition-all"
    :class="variant === 'secondary' ? 'btn-secondary' : 'btn-primary'"
  >
    <slot />
  </component>
</template>
