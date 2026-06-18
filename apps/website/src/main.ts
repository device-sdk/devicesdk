import { ViteSSG } from "vite-ssg";
import App from "./App.vue";
import "./input.css";
import "./styles/global.css";
import routes from "./generated/routes";

export const createApp = ViteSSG(App, { routes });
