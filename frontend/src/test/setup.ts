import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { server } from "./server";

// jsdom has no modal dialogs. These stubs keep the `open` attribute in step with
// showModal/close and fire `close`, which is what the components rely on.
HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
  this.setAttribute("open", "");
};
HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
  this.removeAttribute("open");
  this.dispatchEvent(new Event("close"));
};

// jsdom has no object URLs. Downloads create and revoke one each.
URL.createObjectURL = vi.fn(() => "blob:test");
URL.revokeObjectURL = vi.fn();

// jsdom's AbortSignal is not the one Node's native Request accepts, and React Router
// passes one on every navigation. Dropping it only loses request cancellation in tests.
const NativeRequest = globalThis.Request;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    if (init?.signal) {
      super(input, { ...init, signal: undefined });
    } else {
      super(input, init);
    }
  }
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
