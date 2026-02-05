import { useAuthStore } from '@/stores/auth';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default async ({ app }: any) => {
  const authStore = useAuthStore(app.$pinia);
  await authStore.fetchUser();
  
  if (authStore.isAuthenticated) {
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    if (redirectUri) {
      sessionStorage.removeItem('auth_redirect_uri');
      window.location.href = redirectUri;
    }
  }
};
