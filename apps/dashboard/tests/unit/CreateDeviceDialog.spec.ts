import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateDeviceDialog from "@/components/CreateDeviceDialog.vue";

vi.mock("@/services/api.service", () => ({
  deviceService: {
    create: vi.fn(),
  },
}));

describe("CreateDeviceDialog", () => {
  const mountDialog = () =>
    mount(CreateDeviceDialog, {
      props: {
        modelValue: true,
        projectId: "smart-home",
      },
    });

  it("renders the dialog", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Add Device");
    expect(wrapper.text()).toContain("Recommended: Use the CLI");
  });

  it("shows CLI config example on step 1", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("devicesdk.ts");
    expect(wrapper.text()).toContain("npx @devicesdk/cli deploy");
  });

  it("contains manual creation option and device form", () => {
    const wrapper = mountDialog();
    const html = wrapper.html();

    // The "Create manually instead" button exists as a q-btn stub
    expect(html).toContain('label="Create manually instead"');

    // Step 2 content (Device Slug form) is rendered in the DOM
    // because q-stepper is stubbed and both steps are visible
    expect(wrapper.text()).toContain("Device Slug");
  });
});
