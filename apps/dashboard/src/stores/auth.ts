import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { API_HOST } from '@/config/apiHost';
import { ApiError } from '@/lib/api';
import { userService, type User } from '@/services/api.service';

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null);
  const loading = ref(true);
  // Flips true the first time fetchUser settles (success OR failure), so the
  // router guard probes auth exactly once.
  const initialized = ref(false);
  // True when the last auth probe failed because the server was unreachable
  // (as opposed to a genuine 401 "not logged in"). Lets the UI avoid treating a
  // transient network blip as a sign-out.
  const networkError = ref(false);

  const isAuthenticated = computed(() => user.value !== null);

  const fetchUser = async (): Promise<User | null> => {
    try {
      loading.value = true;
      const fetchedUser = await userService.getMe();
      user.value = fetchedUser;
      networkError.value = false;
      return fetchedUser;
    } catch (error) {
      console.error('Error fetching user', error);
      networkError.value = error instanceof ApiError && error.isNetworkError;
      user.value = null;
      return null;
    } finally {
      loading.value = false;
      initialized.value = true;
    }
  };

  const signIn = () => {
    const params = new URLSearchParams();
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    if (redirectUri) {
      params.append('redirect_uri', redirectUri);
    }
    const queryString = params.toString();
    window.location.href = `${API_HOST}/v1/auth/google${queryString ? '?' + queryString : ''}`;
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
    initialized,
    networkError,
    isAuthenticated,
    fetchUser,
    signIn,
    signOut,
  };
});
