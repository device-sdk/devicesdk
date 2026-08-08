import {
  createMemoryHistory,
  createRouter,
  createWebHashHistory,
  createWebHistory,
} from 'vue-router';
import { Notify } from 'quasar';
import routes from './routes';
import { useAuthStore } from '@/stores/auth';
import { isAllowedRedirectUrl } from '@/lib/redirect';

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
        // An authenticated user who lands on /login (e.g. via a stale
        // bookmark with ?redirect_uri=) is bounced to their destination
        // instead of the home page, matching what LoginPage does for
        // anonymous users after they sign in.
        const redirectUri = to.query.redirect_uri;
        if (typeof redirectUri === 'string' && isAllowedRedirectUrl(redirectUri)) {
          window.location.href = redirectUri;
        } else {
          next('/');
        }
      } else {
        next();
      }
    } else {
      if (!isAuthenticated) {
        if (authStore.networkError) {
          // The auth probe failed because the server was unreachable - that
          // is not a sign-out. Don't bounce to /login (which would present
          // the outage as bad credentials); hold the navigation and tell the
          // user to retry.
          Notify.create({
            type: 'warning',
            message:
              'Unable to reach the server. Check your connection and try again.',
            position: 'top',
          });
          next(false);
        } else {
          next('/login');
        }
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
