import { ViteSSG, type ViteSSGContext } from "vite-ssg";
import App from "./App.vue";
import { routes } from "./utils/routes";
import "./styles/main.css";

export const createApp = ViteSSG(
	App,
	{ routes, base: "/" },
	({ app, router, isClient }: ViteSSGContext) => {
		if (isClient) {
			router.beforeEach(() => {
				// Close mobile menu on route change
				const mobileMenu = document.getElementById("mobile-menu");
				if (mobileMenu) mobileMenu.classList.add("hidden");
			});
		}
	},
);
