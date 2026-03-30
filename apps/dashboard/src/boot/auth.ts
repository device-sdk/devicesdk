import { useAuthStore } from '@/stores/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async ({ app }: any) => {
  const authStore = useAuthStore(app.$pinia);
  await authStore.fetchUser();
  
  if (authStore.isAuthenticated) {
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    if (redirectUri) {
      sessionStorage.removeItem('auth_redirect_uri');
      try {
        const url = new URL(redirectUri);
        const h = url.hostname;
        if (h === 'localhost' || h === 'devicesdk.com' || h.endsWith('.devicesdk.com')) {
          window.location.href = redirectUri;
        }
      } catch {
        // Invalid URL, ignore
      }
    }
  }
};
