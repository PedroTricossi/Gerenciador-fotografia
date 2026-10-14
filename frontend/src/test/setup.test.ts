import { transferableAbortController } from "node:util";

const URL_ = "http://localhost/x";

test("a native AbortSignal passed to Request keeps working", () => {
  const controller = transferableAbortController();
  const request = new Request(URL_, { signal: controller.signal });
  expect(request.signal.aborted).toBe(false);
  controller.abort();
  expect(request.signal.aborted).toBe(true);
});

test("a jsdom AbortSignal is accepted and its abort is forwarded", () => {
  const controller = new AbortController();
  const request = new Request(URL_, { signal: controller.signal });
  expect(request.signal.aborted).toBe(false);
  controller.abort();
  expect(request.signal.aborted).toBe(true);
});

test("an already aborted jsdom AbortSignal yields an aborted request", () => {
  const controller = new AbortController();
  controller.abort();
  expect(new Request(URL_, { signal: controller.signal }).signal.aborted).toBe(true);
});
