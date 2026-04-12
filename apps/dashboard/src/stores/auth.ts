import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { userService, type User } from '@/services/api.service';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(true);

  const isAuthenticated = computed(() => user.value !== null);

  const fetchUser = async (): Promise<User | null> => {
    try {
      loading.value = true;
      const fetchedUser = await userService.getMe();
      user.value = fetchedUser;
      return fetchedUser;
    } catch (error) {
      console.error('Error fetching user', error);
      user.value = null;
      return null;
    } finally {
      loading.value = false;
    }
  };

  const signIn = () => {
    const apiHost = import.meta.env.PROD
      ? 'https://api.devicesdk.com'
      : 'http://localhost:8787';
    const params = new URLSearchParams();
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    if (redirectUri) {
      params.append('redirect_uri', redirectUri);
    }
    const queryString = params.toString();
    window.location.href = `${apiHost}/v1/auth/google${queryString ? '?' + queryString : ''}`;
  };

  const signOut = async () => {
    try {
      await userService.logout();
    } catch (error) {
      console.error('Server-side logout failed:', error);
    }
    user.value = null;
    window.location.href = '/login';
  };

  return {
    user,
    loading,
    isAuthenticated,
    fetchUser,
    signIn,
    signOut,
  };
});
