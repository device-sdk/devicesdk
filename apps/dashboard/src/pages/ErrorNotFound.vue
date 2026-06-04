<template>
  <div class="not-found">
    <div class="not-found-inner">
      <div class="code">404</div>
      <h1 class="title">Page not found</h1>
      <p class="subtitle">
        The page you're looking for doesn't exist or may have moved.
      </p>
      <div class="actions">
        <q-btn
          unelevated
          color="primary"
          label="Back to Projects"
          icon="folder_open"
          no-caps
          @click="goBackToApp"
        />
        <q-btn
          flat
          no-caps
          label="Go to sign in"
          to="/login"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const auth = useAuth();

// Authenticated users land on their projects; everyone else goes to sign in.
function goBackToApp() {
  void router.push(auth.isAuthenticated ? '/projects' : '/login');
}
</script>

<style scoped lang="scss">
.not-found {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--background);
  color: var(--foreground);
  padding: 1.5rem;
  text-align: center;
}

.not-found-inner {
  max-width: 420px;
}

.code {
  font-size: 5rem;
  font-weight: 700;
  letter-spacing: -0.05em;
  color: var(--foreground-muted);
  line-height: 1;
}

.title {
  font-size: 1.5rem;
  font-weight: 600;
  letter-spacing: -0.025em;
  margin: 1rem 0 0.5rem;
}

.subtitle {
  color: var(--foreground-muted);
  font-size: 0.9375rem;
  margin: 0 0 1.5rem;
}

.actions {
  display: flex;
  gap: 0.5rem;
  justify-content: center;
  flex-wrap: wrap;
}
</style>
