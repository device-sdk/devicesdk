<script setup lang="ts">
import { ref, onMounted } from "vue";
import { gsap } from "gsap";
import { useReducedMotion } from "~/composables/useReducedMotion";

const el = ref<HTMLElement | null>(null);
const { prefersReducedMotion } = useReducedMotion();

onMounted(() => {
	if (!el.value) return;
	const children = el.value.children;
	if (!children.length) return;

	if (prefersReducedMotion.value) {
		gsap.set(children, { opacity: 1, y: 0 });
		return;
	}

	gsap.from(children, {
		opacity: 0,
		y: 16,
		duration: 0.9,
		stagger: 0.08,
		ease: "power2.out",
		delay: 0.1,
	});
});
</script>

<template>
  <div ref="el">
    <slot />
  </div>
</template>
