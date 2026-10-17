import { act, render, screen } from "@testing-library/react";
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
