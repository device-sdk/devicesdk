import type { App } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";

// quasar's `Notify` is a frozen object on the client build, so vi.spyOn can't
// intercept it. Mock the module directly so we get a fresh fn we control.
const notifyCreate = vi.fn();
vi.mock("quasar", async () => {
  const actual = (await vi.importActual("quasar")) as Record<string, unknown>;
  return { ...actual, Notify: { create: notifyCreate } };
});

const errorHandlerBoot = (await import("@/boot/error-handler")).default;

// Minimal Vue app stub - the boot file only touches app.config.{errorHandler,warnHandler},
// so we only need to expose those two slots.
function makeAppStub() {
  return {
    config: {
      errorHandler: null as null | ((err: unknown, instance: unknown, info: string) => void),
      warnHandler: null as null | ((msg: string, instance: unknown, trace: string) => void),
    },
  } as unknown as App;
}

describe("error-handler boot file", () => {
  afterEach(() => {
    notifyCreate.mockReset();
    vi.restoreAllMocks();
  });

  it("installs an errorHandler that fires a Quasar Notify toast with the error message", () => {
    const app = makeAppStub();
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandlerBoot({ app });

    expect(app.config.errorHandler).toBeTypeOf("function");

    const err = new Error("kaboom");
    app.config.errorHandler!(err, null, "render function");

    expect(notifyCreate).toHaveBeenCalledOnce();
    const firstCall = notifyCreate.mock.calls[0];
    expect(firstCall).toBeDefined();
    const call = firstCall![0] as {
      type: string;
      message: string;
      caption?: string;
    };
    expect(call.type).toBe("negative");
    expect(call.message).toBe("kaboom");
    // Vue's `info` arg names the lifecycle hook where the error occurred - surfacing
    // it as caption helps users (and us) triage in the wild.
    expect(call.caption).toBe("at render function");
    expect(consoleSpy).toHaveBeenCalled();
  });

  it("falls back to a generic message when the thrown value isn't an Error", () => {
    const app = makeAppStub();
    vi.spyOn(console, "error").mockImplementation(() => {});

    errorHandlerBoot({ app });
    app.config.errorHandler!("a bare string", null, "");

    const firstCall = notifyCreate.mock.calls[0];
    expect(firstCall).toBeDefined();
    const call = firstCall![0] as {
      message: string;
      caption?: string;
    };
    expect(call.message).toBe("An unexpected error occurred");
    // Empty info string should NOT produce a caption - the conditional spread is the
    // workaround for exactOptionalPropertyTypes that would otherwise reject `undefined`.
    expect(call.caption).toBeUndefined();
  });

  it("installs a warnHandler that writes to console.warn without notifying", () => {
    const app = makeAppStub();
    const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

    errorHandlerBoot({ app });

    expect(app.config.warnHandler).toBeTypeOf("function");
    app.config.warnHandler!("noisy warn", null, "stack");

    expect(consoleWarn).toHaveBeenCalled();
    // Warns are dev-noise; they should not produce a user-visible toast.
    expect(notifyCreate).not.toHaveBeenCalled();
  });
});
