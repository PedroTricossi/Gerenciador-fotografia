// jsdom has a WebkitAnimation style but no AnimationEvent, and from that React decides
// the browser only fires webkitAnimationEnd, so onAnimationEnd would never hear the
// standard animationend that browsers (and fireEvent) send. Every browser we support
// has AnimationEvent; this runs before React loads so it picks the standard name.
if (!("AnimationEvent" in globalThis)) {
  class AnimationEvent extends Event {
    readonly animationName: string;
    readonly elapsedTime: number;
    readonly pseudoElement: string;
    constructor(type: string, init: AnimationEventInit = {}) {
      super(type, init);
      this.animationName = init.animationName ?? "";
      this.elapsedTime = init.elapsedTime ?? 0;
      this.pseudoElement = init.pseudoElement ?? "";
    }
  }
  Object.defineProperty(globalThis, "AnimationEvent", {
    configurable: true,
    value: AnimationEvent,
  });
}
