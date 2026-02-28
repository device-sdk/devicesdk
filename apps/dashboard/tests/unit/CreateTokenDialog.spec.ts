import { mount, flushPromises } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import CreateTokenDialog from "@/components/CreateTokenDialog.vue";

vi.mock("@/services/api.service", () => ({
  tokenService: {
    create: vi.fn(),
  },
}));

import { tokenService } from "@/services/api.service";

describe("CreateTokenDialog", () => {
  const mountDialog = () =>
    mount(CreateTokenDialog, {
      props: {
        modelValue: true,
      },
    });

  it("renders the dialog with form", () => {
    const wrapper = mountDialog();
    expect(wrapper.text()).toContain("Create API Token");
    expect(wrapper.text()).toContain("What are API tokens?");
  });

  it("shows Generate Token button", () => {
    const wrapper = mountDialog();
    const html = wrapper.html();
    // q-btn renders as a stub element with label attribute
    expect(html).toContain('label="Generate Token"');
  });

  it("shows success state after token creation", async () => {
    const mockToken = "dsdk_test_abc123";
    vi.mocked(tokenService.create).mockResolvedValue({
      id: "tok-1",
      token: mockToken,
      created_at: Date.now(),
    });

    const wrapper = mountDialog();

    // Find the q-form stub and trigger its submit event
    const form = wrapper.find("q-form");
    await form.trigger("submit");

    await flushPromises();

    expect(wrapper.text()).toContain("Token Created Successfully!");
  });
});
