import { createHead } from "@unhead/vue/client";
import { createApp } from "vue";
import { createRouter, createWebHistory } from "vue-router";
import App from "./App.vue";
import "./input.css";
import "./styles/global.css";
import routes from "./generated/routes";

const head = createHead();
const router = createRouter({
	history: createWebHistory(),
	routes,
});

createApp(App).use(head).use(router).mount("#app");
