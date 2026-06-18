<script setup lang="ts">
import { useHead } from "@vueuse/head";
import ScrollReveal from "~/components/animations/ScrollReveal.vue";

useHead({
	title: "Terms of Service | DeviceSDK",
	meta: [
		{
			name: "description",
			content:
				"Terms governing the DeviceSDK open-source software and the devicesdk.com website.",
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
            <h1 class="text-4xl font-bold text-gray-900">Terms of Service</h1>
            <p class="mt-4 text-xl text-gray-600">
              Terms governing the DeviceSDK open-source software and the devicesdk.com website
            </p>
          </header>
        </ScrollReveal>

        <div class="prose-legal max-w-none">
          <p><strong>Effective Date:</strong> June 12, 2026</p>
          <p>
            DeviceSDK is <strong>free, open-source software</strong> that you run yourself. We do <strong>not</strong> operate a hosted service, store your data, or manage your account — you download the software, run it on your own hardware, and your devices connect to <em>your</em> server.
          </p>
          <p>
            These Terms cover two things only: (1) the terms under which the DeviceSDK software is licensed to you, and (2) your use of the marketing and documentation website at <strong>devicesdk.com</strong> (the "Website"). They do <strong>not</strong> create a service relationship — there is no SaaS, subscription, or account to manage with us.
          </p>

          <h2>1. The Software License</h2>
          <p>
            The DeviceSDK software (server, CLI, dashboard, firmware, and libraries) is licensed under the <strong>GNU Affero General Public License v3.0 (AGPL-3.0-only)</strong>. Your rights to use, modify, and distribute the software are governed entirely by that license, the full text of which ships in the <code>LICENSE</code> file of the source repository.
          </p>
          <p>
            In short, the AGPL-3.0 lets you run, study, modify, and share the software, provided that if you distribute it — or make a modified version available to others over a network — you also make the corresponding source code available under the same license. If any provision of these Terms conflicts with the AGPL-3.0 as applied to the software, the AGPL-3.0 controls.
          </p>

          <h2>2. No Warranty</h2>
          <p>
            As stated in the AGPL-3.0, the software is provided <strong>"as is", without warranty of any kind</strong>, express or implied, including but not limited to the warranties of merchantability, fitness for a particular purpose, and non-infringement.
          </p>
          <p>
            You run DeviceSDK on your own infrastructure and connect your own hardware to it. <strong>You are solely responsible</strong> for how you deploy and operate it, including the security of the server you run, the scripts you write and deploy, and the behaviour of the physical devices you control. We are not responsible for damage to hardware, data loss, or unintended device behaviour resulting from software you run or scripts you deploy.
          </p>
          <p>
            Do not use DeviceSDK to operate critical safety systems (medical devices, industrial safety controllers, or any system where failure could cause physical harm) without independent safeguards appropriate to that risk.
          </p>

          <h2>3. Your Data Stays Yours</h2>
          <p>
            Because DeviceSDK is self-hosted, the projects, devices, scripts, logs, and telemetry you create live on <strong>your</strong> server. We never receive them. The DeviceSDK software contains no telemetry or phone-home. See the <a href="/privacy/">Privacy Policy</a> for how the Website itself handles data.
          </p>

          <h2>4. Acceptable Use of the Website</h2>
          <p>
            The Website is provided for informational purposes. You agree not to attempt to disrupt, attack, or gain unauthorised access to the Website or its infrastructure, and not to use it in violation of applicable law.
          </p>

          <h2>5. Trademarks</h2>
          <p>
            The AGPL-3.0 grants rights to the software's source code; it does <strong>not</strong> grant rights to the "DeviceSDK" name or logo. You may make accurate references to DeviceSDK (for example, "compatible with DeviceSDK"), but please don't use the name or branding in a way that implies endorsement or that could cause confusion about the origin of a product.
          </p>

          <h2>6. Contributions</h2>
          <p>
            If you contribute code, documentation, or other material to the project, you agree your contribution is provided under the project's license (AGPL-3.0-only) unless the repository states otherwise.
          </p>

          <h2>7. Changes to These Terms</h2>
          <p>
            We may update these Terms from time to time. Material changes will be reflected by updating the effective date above and posting the revised Terms here.
          </p>

          <h2>8. Governing Law</h2>
          <p>
            To the extent these Terms (as distinct from the AGPL-3.0, which has its own terms) require a governing law, they are governed by the laws applicable at the maintainers' principal place of business, without regard to conflict-of-law principles.
          </p>

          <h2>9. Contact</h2>
          <p>
            Questions about these Terms or the project can be raised on GitHub:
          </p>
          <p>
            <strong>GitHub:</strong> <a href="https://github.com/device-sdk/devicesdk-monorepo" target="_blank" rel="noopener">github.com/device-sdk/devicesdk-monorepo</a>
          </p>
        </div>
      </div>
    </article>
  </div>
</template>
