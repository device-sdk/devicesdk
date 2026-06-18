import { onMounted, ref } from "vue";

export function useReducedMotion() {
	const prefersReducedMotion = ref(false);

	onMounted(() => {
		prefersReducedMotion.value = window.matchMedia(
			"(prefers-reduced-motion: reduce)",
		).matches;
	});

	return { prefersReducedMotion };
}
