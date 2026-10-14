import { useEffect } from "react";
import { useBlocker } from "react-router";

export function useUnsavedChangesGuard(active: boolean) {
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      active && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!active) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [active]);

  return {
    blocked: blocker.state === "blocked",
    stay: () => blocker.reset?.(),
    leave: () => blocker.proceed?.(),
  };
}
