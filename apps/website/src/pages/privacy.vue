<script setup lang="ts">
import { useHead } from "@vueuse/head";
import ScrollReveal from "~/components/animations/ScrollReveal.vue";

useHead({
	title: "Privacy Policy | DeviceSDK",
	meta: [
		{
			name: "description",
			content:
				"How devicesdk.com handles data — and why the self-hosted software collects none.",
		},
	],
});
</script>

<template>
  <div class="min-h-screen bg-white">
    <article class="pt-8 pb-20 px-4 sm:px-6 lg:px-8">
      <div class="max-w-4xl mx-auto">
        <ScrollReveal>
          <header class="mb-12">
            <h1 class="text-4xl font-bold text-gray-900">Privacy Policy</h1>
            <p class="mt-4 text-xl text-gray-600">
              How devicesdk.com handles data — and why the self-hosted software collects none
            </p>
          </header>
        </ScrollReveal>

        <div class="prose-legal max-w-none">
          <p><strong>Effective Date:</strong> June 12, 2026</p>
          <p>
            DeviceSDK is <strong>free, open-source, self-hosted software</strong>. We do not operate a cloud service, we do not host your devices, and we never receive your data. This Privacy Policy therefore covers only the marketing and documentation website at <strong>devicesdk.com</strong> (the "Website").
          </p>

          <h2>1. The Software Collects Nothing</h2>
          <p>
            The DeviceSDK software you download and run contains <strong>no telemetry and no phone-home</strong>. It does not send usage data, device data, or analytics back to us or anyone else.
          </p>
          <p>
            Everything you create — accounts, projects, devices, scripts, logs, environment variables, and telemetry — is stored <strong>only</strong> on the server you run, under your control. Your account on a DeviceSDK server is a local email/password account on <em>your</em> machine; it is not registered with us. We have no access to any of it.
          </p>
          <p>
            If you choose to enable an optional third-party integration (for example, sending data to a Discord webhook or to your own Home Assistant instance), that data flows directly from your server to the service you configured, never through us.
          </p>

          <h2>2. Information the Website Collects</h2>
          <p>
            The Website is a static documentation and marketing site. We aim to collect as little as possible:
          </p>
          <ul>
            <li>
              <strong>Server logs.</strong> Like any website, requests may be logged by our hosting/CDN provider (e.g. IP address, user agent, requested URL) for security and reliability. These are not used to build profiles of you.
            </li>
            <li>
              <strong>No accounts.</strong> There is nothing to sign up for on the Website, so we collect no names, emails, or passwords through it.
            </li>
            <li>
              <strong>No advertising or cross-site tracking cookies.</strong>
            </li>
          </ul>

          <h2>3. How We Use Website Data</h2>
          <p>
            Any data described above is used solely to operate, secure, and improve the Website. We do <strong>not</strong> sell personal information.
          </p>

          <h2>4. Third Parties</h2>
          <p>
            The Website may be served through a hosting or CDN provider that processes requests on our behalf. Documentation pages may link to third-party sites (GitHub, Discord, etc.); those services have their own privacy policies, and visiting them is subject to those policies.
          </p>

          <h2>5. Your Rights</h2>
          <p>
            Because the Website collects no account data, there is typically nothing personal for us to access, correct, or delete. If you believe we hold information about you and wish to exercise a data-protection right (including rights under the GDPR or CCPA), contact us via GitHub and we will respond in good faith.
          </p>

          <h2>6. Children's Privacy</h2>
          <p>
            The Website is not directed to children under 16, and we do not knowingly collect personal information from children through it.
          </p>

          <h2>7. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. Material changes will be reflected by updating the effective date above and posting the revised policy here.
          </p>

          <h2>8. Contact</h2>
          <p>
            Questions about this policy can be raised on GitHub:
          </p>
          <p>
            <strong>GitHub:</strong> <a href="https://github.com/device-sdk/devicesdk-monorepo" target="_blank" rel="noopener">github.com/device-sdk/devicesdk-monorepo</a>
          </p>
        </div>
      </div>
    </article>
  </div>
</template>
