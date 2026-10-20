import { act, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ToastProvider, useToast } from "./Toast";

function Trigger({ onUndo }: { onUndo?: () => void }) {
  const notify = useToast();
  return (
    <button
      onClick={() =>
        notify(
          "Contrato excluído",
          onUndo ? { action: { label: "Desfazer", onClick: onUndo } } : {},
        )
      }
    >
      disparar
    </button>
  );
}

test("an action runs once and closes its toast", async () => {
  const user = userEvent.setup();
  const onUndo = vi.fn();
  render(
    <ToastProvider>
      <Trigger onUndo={onUndo} />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "disparar" }));
  expect(screen.getByRole("status")).toHaveTextContent("Contrato excluído");
  await user.click(screen.getByRole("button", { name: "Desfazer" }));
  expect(onUndo).toHaveBeenCalledOnce();
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
});

test("a toast closes by itself, and the close button works", async () => {
  vi.useFakeTimers();
  // Testing Library only drains its async queue under fake timers when it sees a `jest` global.
  vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  render(
    <ToastProvider>
      <Trigger />
    </ToastProvider>,
  );
  await user.click(screen.getByRole("button", { name: "disparar" }));
  act(() => vi.advanceTimersByTime(5999));
  expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
  act(() => vi.advanceTimersByTime(1));
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "disparar" }));
  await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
  expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

test("useToast outside the provider fails loudly", () => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  expect(() => render(<Trigger />)).toThrow("useToast needs a ToastProvider");
});

describe("a toast with an action", () => {
  async function setup() {
    vi.useFakeTimers();
    vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger onUndo={vi.fn()} />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "disparar" }));
    return user;
  }
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  test("does not close while hovered", async () => {
    const user = await setup();
    await user.hover(screen.getByText("Contrato excluído"));
    act(() => vi.advanceTimersByTime(11_000));
    expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
    await user.unhover(screen.getByText("Contrato excluído"));
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
  });

  test("does not close while it has focus", async () => {
    await setup();
    const action = screen.getByRole("button", { name: "Desfazer" });
    act(() => action.focus());
    act(() => vi.advanceTimersByTime(11_000));
    expect(screen.getByText("Contrato excluído")).toBeInTheDocument();
    act(() => action.blur());
    act(() => vi.advanceTimersByTime(10_000));
    expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
  });
});

describe("toast motion", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal("jest", { advanceTimersByTime: vi.advanceTimersByTime });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  async function open() {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    render(
      <ToastProvider>
        <Trigger />
      </ToastProvider>,
    );
    await user.click(screen.getByRole("button", { name: "disparar" }));
    return user;
  }

  test("the message types on screen once the box is open, its text whole all along", async () => {
    await open();
    const message = screen.getByText("Contrato excluído");
    expect(message).toHaveAttribute("data-typed", "");
    act(() => vi.advanceTimersByTime(350 + 45 * 3));
    expect(message).toHaveAttribute("data-typed", "Con");
    expect(screen.getByRole("status")).toHaveTextContent("Contrato excluído");
    act(() => vi.advanceTimersByTime(600));
    expect(message).not.toHaveAttribute("data-typed");
  });

  test("a closing toast stays until its switch-off animation ends", async () => {
    const real = window.getComputedStyle;
    vi.spyOn(window, "getComputedStyle").mockImplementation((element) => {
      const style = real(element);
      return element.classList.contains("closing")
        ? ({ ...style, animationName: "switch-off" } as CSSStyleDeclaration)
        : style;
    });
    const user = await open();
    await user.click(screen.getByRole("button", { name: "Fechar aviso" }));
    const toast = screen.getByText("Contrato excluído").parentElement!;
    expect(toast).toHaveClass("closing");
    fireEvent.animationEnd(toast);
    expect(screen.queryByText("Contrato excluído")).not.toBeInTheDocument();
  });
});
