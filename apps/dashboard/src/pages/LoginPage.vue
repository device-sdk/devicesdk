<template>
  <div class="login-container">
    <div class="login-card">
      <div class="logo-section">
        <div class="logo">
          <img src="/favicon.svg" alt="DeviceSDK" class="logo-icon" />
          <span class="logo-text">DeviceSDK</span>
        </div>
        <p class="tagline">IoT Device Management Platform</p>
      </div>

      <div class="login-content">
        <h1 class="welcome-title">Welcome back</h1>
        <p class="welcome-subtitle">Sign in to your account to continue</p>

        <q-btn
          unelevated
          class="full-width google-btn"
          @click="handleSignIn"
          :loading="loading"
        >
          <svg class="google-icon" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039L38.804 12.8C34.782 9.244 29.732 7 24 7 12.955 7 4 15.955 4 27s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z"></path>
            <path fill="#FF3D00" d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 13 24 13c3.059 0 5.842 1.154 7.961 3.039L38.804 12.8C34.782 9.244 29.732 7 24 7 16.318 7 9.656 10.337 6.306 14.691z"></path>
            <path fill="#4CAF50" d="M24 47c5.732 0 10.782-2.244 14.804-5.804l-6.571-4.819C29.961 38.846 27.245 40 24 40c-5.039 0-9.345-2.108-11.124-5.491l-6.571 4.819C9.656 43.663 16.318 47 24 47z"></path>
            <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.16-4.082 5.571l6.571 4.819C42.871 35.438 45.425 29.613 45.425 23c0-1.341-.138-2.65-.389-3.917z"></path>
          </svg>
          Continue with Google
        </q-btn>

        <p class="terms-text">
          By signing in, you agree to our
          <router-link to="/terms" class="terms-link">Terms of Service</router-link>
        </p>
      </div>

      <div class="login-footer">
        <q-icon name="lock" size="14px" />
        <span>Secured with OAuth 2.0</span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const auth = useAuth();
const loading = ref(false);

onMounted(() => {
  if (auth.isAuthenticated) {
    void router.push('/');
  }
  
  const redirectUri = new URLSearchParams(window.location.search).get('redirect_uri');
  if (redirectUri) {
    try {
      const url = new URL(redirectUri);
      const hostname = url.hostname;
      if (hostname === 'localhost' || hostname === 'devicesdk.com' || hostname.endsWith('.devicesdk.com')) {
        sessionStorage.setItem('auth_redirect_uri', redirectUri);
      }
    } catch {
      // Invalid URL, skip
    }
  }
});

const handleSignIn = () => {
  loading.value = true;
  auth.signIn();
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

.google-btn {
  background: var(--background) !important;
  color: var(--foreground) !important;
  border: 1px solid var(--border) !important;
  font-weight: 500;
  padding: 0.75rem 1rem;
  font-size: 0.875rem;
  transition: all 0.15s ease;

  &:hover {
    background: var(--accent) !important;
    border-color: hsl(240, 6%, 80%) !important;
  }
}

.google-icon {
  width: 18px;
  height: 18px;
  margin-right: 0.625rem;
}

.terms-text {
  font-size: 0.75rem;
  color: var(--foreground-muted);
  text-align: center;
  margin: 1.5rem 0 0;
}

.terms-link {
  color: var(--foreground);
  text-decoration: underline;
  text-underline-offset: 2px;

  &:hover {
    color: var(--foreground-muted);
  }
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
