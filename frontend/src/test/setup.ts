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

beforeAll(() => server.listen({ onUnhandledRequest: "error" }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
  vi.clearAllMocks();
});
afterAll(() => server.close());
