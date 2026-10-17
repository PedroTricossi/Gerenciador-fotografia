import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { ThemeSwitch } from "./ThemeSwitch";

const theme = () => document.documentElement.dataset.theme;

describe("ThemeSwitch", () => {
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });
  afterEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    document.documentElement.removeAttribute("data-theme");
  });

  test("starts on Automático with nothing stored and sets no data-theme", () => {
    render(<ThemeSwitch />);
    expect(screen.getByText("Tema: Automático")).toBeInTheDocument();
    expect(theme()).toBeUndefined();
  });

  test("each press cycles Automático → Claro → Escuro → Automático", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(screen.getByText("Tema: Claro")).toBeInTheDocument();
    expect(theme()).toBe("light");
    expect(localStorage.getItem("gf-theme")).toBe("light");

    await user.click(button);
    expect(screen.getByText("Tema: Escuro")).toBeInTheDocument();
    expect(theme()).toBe("dark");
    expect(localStorage.getItem("gf-theme")).toBe("dark");

    await user.click(button);
    expect(screen.getByText("Tema: Automático")).toBeInTheDocument();
    expect(theme()).toBeUndefined();
    expect(localStorage.getItem("gf-theme")).toBeNull();
  });

  test("the accessible name describes the next choice", async () => {
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    await user.click(screen.getByRole("button", { name: "Mudar tema para Claro" }));
    await user.click(screen.getByRole("button", { name: "Mudar tema para Escuro" }));
    expect(
      screen.getByRole("button", { name: "Mudar tema para Automático (segue o Mac)" }),
    ).toBeInTheDocument();
  });

  test('a stored "dark" choice is shown as Tema: Escuro', () => {
    localStorage.setItem("gf-theme", "dark");
    render(<ThemeSwitch />);
    expect(screen.getByText("Tema: Escuro")).toBeInTheDocument();
  });

  test("blocked storage still switches the theme for the session", async () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const user = userEvent.setup();
    render(<ThemeSwitch />);
    const button = screen.getByRole("button");

    await user.click(button);
    expect(theme()).toBe("light");
    await user.click(button);
    expect(theme()).toBe("dark");
    await user.click(button);
    expect(theme()).toBeUndefined();
  });
});
