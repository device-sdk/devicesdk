import type { Pinia } from 'pinia';
import type { App } from 'vue';
import { isAllowedRedirectUrl } from '@/lib/redirect';
import { useAuthStore } from '@/stores/auth';

export default async ({ app }: { app: App }) => {
  const pinia = (app as App & { $pinia?: Pinia }).$pinia;
  const authStore = useAuthStore(pinia);
  // The boot probe runs before the app paints, so a hung server shouldn't
  // leave the splash up forever - cap it at 15s (the default is 60s).
  await authStore.fetchUser(15_000);

  if (authStore.isAuthenticated) {
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    if (redirectUri) {
      sessionStorage.removeItem('auth_redirect_uri');
      if (isAllowedRedirectUrl(redirectUri)) {
        window.location.href = redirectUri;
      }
    }
  }
};
