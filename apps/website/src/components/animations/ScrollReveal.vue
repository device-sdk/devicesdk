<script setup lang="ts">
import { ref, onMounted } from "vue";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useReducedMotion } from "~/composables/useReducedMotion";

gsap.registerPlugin(ScrollTrigger);

const props = defineProps<{
	direction?: "up" | "left" | "right" | "scale";
	delay?: number;
}>();

const el = ref<HTMLElement | null>(null);
const { prefersReducedMotion } = useReducedMotion();

onMounted(() => {
	if (!el.value) return;
	if (prefersReducedMotion.value) {
		gsap.set(el.value, { opacity: 1, x: 0, y: 0, scale: 1 });
		return;
	}

	const from: gsap.TweenVars = {
		opacity: 0,
		duration: 0.85,
		ease: "power2.out",
	};
	if (props.direction === "left") from.x = -28;
	else if (props.direction === "right") from.x = 28;
	else if (props.direction === "scale") from.scale = 0.96;
	else from.y = 28;

	if (props.delay) from.delay = props.delay;

	gsap.from(el.value, {
		scrollTrigger: {
			trigger: el.value,
			start: "top 88%",
			toggleActions: "play none none none",
		},
		...from,
	});
});
</script>

<template>
  <div ref="el" class="opacity-0">
    <slot />
  </div>
</template>
