import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import routes from './routes';
import { useAuthStore } from '@/stores/auth';

export default function () {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory;

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,

    // Leave this as is and make changes in quasar.conf.js instead!
    // quasar.conf.js -> build -> vueRouterMode
    // quasar.conf.js -> build -> publicPath
    history: createHistory(process.env.VUE_ROUTER_BASE),
  });

  Router.beforeEach(async (to, from, next) => {
    const authStore = useAuthStore();

    // Resolve auth exactly once. The boot/auth file usually does this before the
    // first navigation; this guard covers direct hits that bypass it. Gating on
    // `initialized` (not `loading && user === null`) avoids re-probing after a
    // failed fetch, which would otherwise leave the guard firing repeatedly.
    if (!authStore.initialized) {
      await authStore.fetchUser();
    }

    const isPublic = to.meta.public === true;
    const isAuthenticated = authStore.isAuthenticated;

    if (isPublic) {
      if (isAuthenticated && to.path === '/login') {
        next('/');
      } else {
        next();
      }
    } else {
      if (!isAuthenticated) {
        next('/login');
      } else {
        next();
      }
    }
  });

  // Keep the document title in sync with the active route so browser tabs,
  // history entries, and screen-reader announcements are distinguishable
  // instead of all reading "DeviceSDK".
  Router.afterEach((to) => {
    const title = to.meta.title as string | undefined;
    document.title = title ? `${title} · DeviceSDK` : 'DeviceSDK';
  });

  return Router;
}
