import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { transferableAbortController } from "node:util";
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

// Node's native Request rejects jsdom's AbortSignal ("Expected signal to be an instance
// of AbortSignal"), and React Router, TanStack Query and openapi-fetch all pass one.
// Native signals go through untouched. A foreign signal is replaced by a native one that
// follows it, so aborting still cancels the request.
const NativeRequest = globalThis.Request;
const NativeSignal = Object.getPrototypeOf(transferableAbortController().signal)
  .constructor as typeof AbortSignal;
const isNative = (signal: AbortSignal): boolean => signal instanceof NativeSignal;
globalThis.Request = class extends NativeRequest {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    const foreign = init?.signal;
    if (!foreign || isNative(foreign)) {
      super(input, init);
      return;
    }
    const native = transferableAbortController();
    if (foreign.aborted) native.abort(foreign.reason);
    else foreign.addEventListener("abort", () => native.abort(foreign.reason), { once: true });
    super(input, { ...init, signal: native.signal });
  }
};

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
