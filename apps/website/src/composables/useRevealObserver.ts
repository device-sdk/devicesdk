import { nextTick, onMounted, onUnmounted, watch } from "vue";
import { useRoute } from "vue-router";

const REVEAL_SELECTOR = ".fade-up, .reveal, .reveal-stagger";

export function useRevealObserver() {
	const route = useRoute();
	let revealObserver: IntersectionObserver | null = null;
	let mutationObserver: MutationObserver | null = null;
	const observed = new WeakSet<Element>();

	function revealElement(el: Element) {
		el.classList.add(el.classList.contains("fade-up") ? "animate-in" : "is-revealed");
	}

	function createObserver() {
		revealObserver?.disconnect();
		revealObserver = new IntersectionObserver(
			(entries) => {
				entries.forEach((entry) => {
					if (entry.isIntersecting) {
						revealElement(entry.target);
						revealObserver?.unobserve(entry.target);
					}
				});
			},
			{ threshold: 0, rootMargin: "0px" },
		);
	}

	function observeAll() {
		if (!revealObserver) return;
		document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
			if (
				!observed.has(el) &&
				!el.classList.contains("animate-in") &&
				!el.classList.contains("is-revealed")
			) {
				observed.add(el);
				revealObserver?.observe(el);
			}
		});
	}

	function revealInViewport() {
		const vh = window.innerHeight;
		const buffer = Math.max(800, vh);
		document.querySelectorAll(REVEAL_SELECTOR).forEach((el) => {
			if (
				el.classList.contains("animate-in") ||
				el.classList.contains("is-revealed")
			) {
				return;
			}
			const rect = el.getBoundingClientRect();
			if (rect.top < vh + buffer && rect.bottom > -buffer) {
				revealElement(el);
			}
		});
	}

	function setup() {
		createObserver();
		observeAll();
		revealInViewport();

		mutationObserver?.disconnect();
		mutationObserver = new MutationObserver(() => observeAll());
		mutationObserver.observe(document.body, {
			childList: true,
			subtree: true,
		});
	}

	onMounted(() => {
		setup();

		const onScroll = () => revealInViewport();
		window.addEventListener("scroll", onScroll, { passive: true });
		window.addEventListener("resize", onScroll);

		watch(
			() => route.path,
			async () => {
				await nextTick();
				observeAll();
				revealInViewport();
			},
			{ immediate: true },
		);

		onUnmounted(() => {
			window.removeEventListener("scroll", onScroll);
			window.removeEventListener("resize", onScroll);
		});
	});

	onUnmounted(() => {
		revealObserver?.disconnect();
		mutationObserver?.disconnect();
	});
}
