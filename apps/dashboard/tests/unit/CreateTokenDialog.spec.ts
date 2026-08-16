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

  const createToken = async (wrapper: ReturnType<typeof mountDialog>) => {
    vi.mocked(tokenService.create).mockResolvedValue({
      id: "tok-1",
      token: "dsdk_test_abc123",
      created_at: Date.now(),
    });
    await wrapper.find("q-form").trigger("submit");
    await flushPromises();
  };

  const stubClipboard = (writeText: ReturnType<typeof vi.fn>) => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText },
      configurable: true,
    });
  };

  it("marks the token copied only after the clipboard write resolves", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    stubClipboard(writeText);

    const wrapper = mountDialog();
    await createToken(wrapper);
    expect(wrapper.text()).toContain("Copy this token before closing");

    await wrapper.find('[aria-label="Copy token to clipboard"]').trigger("click");
    await flushPromises();

    expect(writeText).toHaveBeenCalledWith("dsdk_test_abc123");
    expect(wrapper.text()).not.toContain("Copy this token before closing");
  });

  it("keeps the warning and token visible when the clipboard write fails", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("clipboard denied"));
    stubClipboard(writeText);

    const wrapper = mountDialog();
    await createToken(wrapper);

    await wrapper.find('[aria-label="Copy token to clipboard"]').trigger("click");
    await flushPromises();

    // The token must stay on screen with the warning so the user can copy it
    // manually - a failed write is not a successful copy.
    expect(writeText).toHaveBeenCalledWith("dsdk_test_abc123");
    expect(wrapper.text()).toContain("dsdk_test_abc123");
    expect(wrapper.text()).toContain("Copy this token before closing");
  });
});
