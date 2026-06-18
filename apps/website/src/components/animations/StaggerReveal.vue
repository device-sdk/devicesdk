<script setup lang="ts">
import { ref, onMounted } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "~/composables/useReducedMotion";

gsap.registerPlugin(ScrollTrigger);

const props = defineProps<{
	stagger?: number;
}>();

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
		scrollTrigger: {
			trigger: el.value,
			start: "top 85%",
			toggleActions: "play none none none",
		},
		opacity: 0,
		y: 20,
		duration: 0.7,
		stagger: props.stagger ?? 0.07,
		ease: "power2.out",
	});
});
</script>

<template>
  <div ref="el">
    <slot />
  </div>
</template>
