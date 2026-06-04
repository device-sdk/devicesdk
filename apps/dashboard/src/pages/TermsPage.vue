<template>
  <div class="terms-container">
    <div class="terms-card">
      <div class="terms-header">
        <a class="back-link" href="#" @click.prevent="goBack">
          <q-icon name="arrow_back" size="18px" />
          {{ auth.isAuthenticated ? 'Back to Dashboard' : 'Back to Login' }}
        </a>
        <div class="logo">
          <span class="logo-icon">&#9670;</span>
          <span class="logo-text">DeviceSDK</span>
        </div>
      </div>

      <div class="terms-content">
        <h1>Terms of Service</h1>
        <p class="last-updated">Last updated: {{ LAST_UPDATED }}</p>

        <section>
          <h2>1. Acceptance of Terms</h2>
          <p>
            By accessing or using DeviceSDK ("Service"), you agree to be bound by these Terms of Service. 
            If you do not agree to these terms, please do not use the Service.
          </p>
        </section>

        <section>
          <h2>2. Description of Service</h2>
          <p>
            DeviceSDK provides an IoT device management platform that allows users to manage projects, 
            deploy scripts to devices, and monitor device connectivity. The Service includes web-based 
            dashboards, APIs, and command-line tools.
          </p>
        </section>

        <section>
          <h2>3. User Accounts</h2>
          <p>
            You must create an account to use certain features of the Service. You are responsible for 
            maintaining the confidentiality of your account credentials and for all activities that occur 
            under your account.
          </p>
          <ul>
            <li>You must provide accurate and complete information when creating an account</li>
            <li>You must notify us immediately of any unauthorized use of your account</li>
            <li>You may not share your account credentials with others</li>
          </ul>
        </section>

        <section>
          <h2>4. Acceptable Use</h2>
          <p>You agree not to use the Service to:</p>
          <ul>
            <li>Violate any applicable laws or regulations</li>
            <li>Infringe on the intellectual property rights of others</li>
            <li>Transmit malicious code or interfere with the Service</li>
            <li>Attempt to gain unauthorized access to any part of the Service</li>
            <li>Use the Service for any illegal or unauthorized purpose</li>
          </ul>
        </section>

        <section>
          <h2>5. Data and Privacy</h2>
          <p>
            Your use of the Service is also governed by our Privacy Policy. By using the Service, 
            you consent to the collection and use of your information as described in our Privacy Policy.
          </p>
        </section>

        <section>
          <h2>6. API Usage</h2>
          <p>
            Access to the DeviceSDK API is subject to rate limits and usage quotas. Excessive use or 
            abuse of the API may result in temporary or permanent suspension of access.
          </p>
        </section>

        <section>
          <h2>7. Intellectual Property</h2>
          <p>
            The Service and its original content, features, and functionality are owned by DeviceSDK 
            and are protected by international copyright, trademark, and other intellectual property laws.
          </p>
        </section>

        <section>
          <h2>8. Termination</h2>
          <p>
            We may terminate or suspend your account and access to the Service immediately, without 
            prior notice, for conduct that we believe violates these Terms of Service or is harmful 
            to other users, us, or third parties.
          </p>
        </section>

        <section>
          <h2>9. Disclaimer of Warranties</h2>
          <p>
            The Service is provided "as is" and "as available" without warranties of any kind, either 
            express or implied. We do not guarantee that the Service will be uninterrupted, secure, 
            or error-free.
          </p>
        </section>

        <section>
          <h2>10. Limitation of Liability</h2>
          <p>
            In no event shall DeviceSDK be liable for any indirect, incidental, special, consequential, 
            or punitive damages arising out of or related to your use of the Service.
          </p>
        </section>

        <section>
          <h2>11. Changes to Terms</h2>
          <p>
            We reserve the right to modify these Terms of Service at any time. We will notify users 
            of any material changes by posting the updated terms on this page. Your continued use of 
            the Service after such changes constitutes acceptance of the new terms.
          </p>
        </section>

        <section>
          <h2>12. Contact</h2>
          <p>
            If you have any questions about these Terms of Service, please contact us at 
            <a href="mailto:support@devicesdk.com">support@devicesdk.com</a>.
          </p>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useRouter } from 'vue-router';
import { useAuth } from '@/composables/useAuth';

const router = useRouter();
const auth = useAuth();

// Single maintained constant — bump this whenever the terms text changes.
const LAST_UPDATED = 'June 2026';

// Context-aware: signed-in users return to their dashboard instead of being
// dumped on the login screen; everyone else goes to login.
function goBack() {
  void router.push(auth.isAuthenticated ? '/projects' : '/login');
}
</script>

<style scoped lang="scss">
.terms-container {
  min-height: 100vh;
  background: var(--background-secondary);
  padding: 2rem 1rem;
}

.terms-card {
  max-width: 720px;
  margin: 0 auto;
  background: var(--background);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  overflow: hidden;
}

.terms-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.back-link {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  color: var(--foreground-muted);
  text-decoration: none;
  font-size: 0.875rem;
  font-weight: 500;
  transition: color 0.15s ease;

  &:hover {
    color: var(--foreground);
  }
}

.logo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.logo-icon {
  font-size: 1.25rem;
  color: var(--foreground);
}

.logo-text {
  font-size: 1rem;
  font-weight: 600;
  color: var(--foreground);
  letter-spacing: -0.025em;
}

.terms-content {
  padding: 2rem;

  h1 {
    font-size: 1.75rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 0.5rem;
    letter-spacing: -0.025em;
  }

  .last-updated {
    font-size: 0.875rem;
    color: var(--foreground-muted);
    margin: 0 0 2rem;
  }

  section {
    margin-bottom: 1.5rem;

    &:last-child {
      margin-bottom: 0;
    }
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    color: var(--foreground);
    margin: 0 0 0.75rem;
  }

  p {
    font-size: 0.875rem;
    color: var(--foreground-muted);
    line-height: 1.6;
    margin: 0 0 0.75rem;

    &:last-child {
      margin-bottom: 0;
    }
  }

  ul {
    margin: 0.5rem 0 0;
    padding-left: 1.25rem;

    li {
      font-size: 0.875rem;
      color: var(--foreground-muted);
      line-height: 1.6;
      margin-bottom: 0.375rem;

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  a {
    color: var(--foreground);
    text-decoration: underline;
    text-underline-offset: 2px;

    &:hover {
      color: var(--foreground-muted);
    }
  }
}
</style>
