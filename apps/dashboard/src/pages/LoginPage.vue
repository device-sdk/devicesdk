<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo">
          <img src="/favicon.svg" alt="DeviceSDK" class="logo-icon" />
          <span class="logo-text">DeviceSDK</span>
        </div>
        <p class="tagline">Self-Hosted IoT Platform</p>
      </div>

      <div class="login-content">
        <q-banner v-if="sessionExpired" class="session-expired-banner q-mb-md" rounded>
          <template v-slot:avatar>
            <q-icon name="info" color="warning" />
          </template>
          Your session has expired. Please sign in again.
        </q-banner>

        <h1 class="welcome-title">{{ isRegisterMode ? 'Create your account' : 'Welcome back' }}</h1>
        <p class="welcome-subtitle">
          {{
            isRegisterMode
              ? firstRun
                ? 'Set up the first account for this server'
                : 'Register a new account on this server'
              : 'Sign in to your account to continue'
          }}
        </p>

        <q-form @submit.prevent="handleSubmit">
          <q-input
            v-if="isRegisterMode"
            v-model="name"
            label="Name"
            outlined
            dense
            class="q-mb-sm"
            autocomplete="name"
          />
          <q-input
            v-model="email"
            label="Email"
            type="email"
            outlined
            dense
            class="q-mb-sm"
            autocomplete="email"
            :rules="[(v) => !!v || 'Email is required']"
          />
          <q-input
            v-model="password"
            label="Password"
            :type="showPassword ? 'text' : 'password'"
            outlined
            dense
            class="q-mb-md"
            :autocomplete="isRegisterMode ? 'new-password' : 'current-password'"
            :rules="[
              (v) => !!v || 'Password is required',
              (v) => !isRegisterMode || v.length >= 8 || 'At least 8 characters',
            ]"
          >
            <template v-slot:append>
              <q-icon
                :name="showPassword ? 'visibility_off' : 'visibility'"
                class="cursor-pointer"
                @click="showPassword = !showPassword"
              />
            </template>
          </q-input>

          <q-btn
            unelevated
            type="submit"
            color="primary"
            class="full-width submit-btn"
            :loading="loading"
            :label="isRegisterMode ? 'Create account' : 'Sign in'"
          />
        </q-form>

        <p v-if="registrationEnabled || isRegisterMode" class="toggle-text">
          <template v-if="isRegisterMode">
            Already have an account?
            <a href="#" class="toggle-link" @click.prevent="isRegisterMode = false">Sign in</a>
          </template>
          <template v-else>
            New to this server?
            <a href="#" class="toggle-link" @click.prevent="isRegisterMode = true">Create an account</a>
          </template>
        </p>
      </div>

      <div class="login-footer">
        <q-icon name="home" size="14px" />
        <span>Self-hosted on your own hardware</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useQuasar } from 'quasar';
import { useAuth } from '@/composables/useAuth';
import { isAllowedRedirectUrl } from '@/lib/redirect';
import { authService } from '@/services/api.service';

const router = useRouter();
const $q = useQuasar();
const auth = useAuth();

const loading = ref(false);
const sessionExpired = ref(new URLSearchParams(window.location.search).has('expired'));
const isRegisterMode = ref(false);
const registrationEnabled = ref(true);
const firstRun = ref(false);
const name = ref('');
const email = ref('');
const password = ref('');
const showPassword = ref(false);

onMounted(async () => {
  if (auth.isAuthenticated) {
    void router.push('/');
  }

  const redirectUri = new URLSearchParams(window.location.search).get('redirect_uri');
  if (redirectUri && isAllowedRedirectUrl(redirectUri)) {
    sessionStorage.setItem('auth_redirect_uri', redirectUri);
  }

  // First run (no accounts yet) jumps straight into registration.
  try {
    const status = await authService.status();
    registrationEnabled.value = status.registration_enabled;
    if (!status.has_users) {
      firstRun.value = true;
      isRegisterMode.value = true;
    }
  } catch {
    // Server unreachable — the sign-in attempt will surface the error.
  }
});

const handleSubmit = async () => {
  loading.value = true;
  try {
    if (isRegisterMode.value) {
      await auth.register(email.value, password.value, name.value || undefined);
    } else {
      await auth.signIn(email.value, password.value);
    }
    const redirectUri = sessionStorage.getItem('auth_redirect_uri');
    sessionStorage.removeItem('auth_redirect_uri');
    if (redirectUri && isAllowedRedirectUrl(redirectUri)) {
      window.location.href = redirectUri;
    } else {
      void router.push('/');
    }
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Sign-in failed. Please try again.';
    $q.notify({ type: 'negative', message, position: 'top' });
  } finally {
    loading.value = false;
  }
};
</script>

<style scoped lang="scss">
.login-container {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background: var(--background-secondary);
  padding: 1rem;
}

.login-card {
  width: 100%;
  max-width: 400px;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.logo-section {
  padding: 2rem 2rem 1.5rem;
  text-align: center;
  border-bottom: 1px solid var(--border);
}

.logo {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.logo-icon {
  width: 28px;
  height: 28px;
  border-radius: 4px;
}

.logo-text {
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: -0.025em;
}

.tagline {
  font-size: 0.75rem;
  color: var(--foreground-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin: 0;
}

.login-content {
  padding: 2rem;
}

.welcome-title {
  font-size: 1.5rem;
  font-weight: 600;
  color: var(--foreground);
  margin: 0 0 0.5rem;
  letter-spacing: -0.025em;
}

.welcome-subtitle {
  font-size: 0.875rem;
  color: var(--foreground-muted);
  margin: 0 0 1.5rem;
}

.submit-btn {
  font-weight: 500;
  padding: 0.625rem 1rem;
  font-size: 0.875rem;
}

.toggle-text {
  font-size: 0.8125rem;
  color: var(--foreground-muted);
  text-align: center;
  margin: 1.25rem 0 0;
}

.toggle-link {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    color: var(--foreground-muted);
  }
}

.session-expired-banner {
  background: var(--background-secondary);
  border: 1px solid var(--border);
  font-size: 0.875rem;
  color: var(--foreground);
}

.login-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 1rem;
  background: var(--background-secondary);
  border-top: 1px solid var(--border);
  font-size: 0.75rem;
  color: var(--foreground-muted);
}
</style>
