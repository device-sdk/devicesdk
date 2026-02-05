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

    if (authStore.loading && authStore.user === null) {
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

  return Router;
}
