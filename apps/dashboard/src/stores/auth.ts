import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import { ApiError } from '@/lib/api';
import { authService, userService, type User } from '@/services/api.service';

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

  const signIn = async (email: string, password: string): Promise<User> => {
    const signedIn = await authService.login(email, password);
    user.value = signedIn;
    networkError.value = false;
    return signedIn;
  };

  const register = async (
    email: string,
    password: string,
    name?: string,
  ): Promise<User> => {
    const created = await authService.register(email, password, name);
    user.value = created;
    networkError.value = false;
    return created;
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
    register,
    signOut,
  };
});
