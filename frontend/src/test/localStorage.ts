// Newer Node versions define their own `localStorage` global, which stays unusable
// without --localstorage-file, hides jsdom's and warns when read (MSW reads it on
// import). This runs before the other setup files so jsdom's is in place first.
const jsdomWindow = (globalThis as unknown as { jsdom?: { window: Window } }).jsdom?.window;
if (jsdomWindow) {
  Object.defineProperty(globalThis, "localStorage", {
    configurable: true,
    value: jsdomWindow.localStorage,
  });
}
