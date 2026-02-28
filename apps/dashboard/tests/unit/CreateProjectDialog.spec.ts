import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateProjectDialog from "@/components/CreateProjectDialog.vue";

vi.mock("@/services/api.service", () => ({
  projectService: {
    create: vi.fn(),
  },
}));

describe("CreateProjectDialog", () => {
  const mountDialog = () =>
    mount(CreateProjectDialog, {
      props: {
        modelValue: true,
      },
    });

  it("renders the dialog with stepper", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Create New Project");
    expect(wrapper.text()).toContain("Recommended: Use the CLI");
  });

  it("shows CLI recommendation on step 1", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("npx @devicesdk/cli init");
  });

  it("contains manual creation option and project form", () => {
    const wrapper = mountDialog();
    const html = wrapper.html();

    // The "Create manually instead" button exists as a q-btn stub
    expect(html).toContain('label="Create manually instead"');

    // Step 2 content (Project Slug form) is rendered in the DOM
    // because q-stepper is stubbed and both steps are visible
    expect(wrapper.text()).toContain("Project Slug");
  });
});
