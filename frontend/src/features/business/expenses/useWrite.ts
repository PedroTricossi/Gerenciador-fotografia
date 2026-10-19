import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { ApiError } from "../../../api/client";
import { expenseKeys } from "../../../api/expenses";
import { describeUnexpected } from "../../../api/errors";
import { MAX_CENTS, parseBrl } from "../../../domain/money";

export type WriteMessages = { changed: string; gone: string };

const make = (subject: string, feminine: boolean): WriteMessages => ({
  changed: `${subject} foi alterad${feminine ? "a" : "o"} em outro lugar. Feche e abra de novo para ver a versão atual.`,
  gone: `${subject} não existe mais. A lista foi atualizada.`,
});

export const EXPENSE_MESSAGES = make("Esta despesa", true);
export const TYPE_MESSAGES = make("Este tipo", false);
export const FIXED_COST_MESSAGES = make("Esta despesa fixa", true);
export const STANDARD_MESSAGES = make("O valor padrão", false);
export const WEDDING_MESSAGES = make("Este casamento", false);

/** Cents from the typed text, or the message for the field. */
export function amountFrom(text: string): { cents: number } | { error: string } {
  const cents = parseBrl(text);
  if (cents === null) return { error: "campo obrigatório" };
  if (Number.isNaN(cents) || cents > MAX_CENTS) return { error: "valor inválido" };
  return { cents };
}

/** A server 422 message for the field whose path ends in `name`, if any. */
export function fieldMessage(error: ApiError, name: string): string | undefined {
  return error.errors.find((item) => item.field === name || item.field.endsWith(`.${name}`))
    ?.message;
}

/**
 * Runs one write at a time for a dialog. `busy` is for the buttons and for guarding Escape; the
 * ref guards a second click before React has re-rendered. A failure that `onError` does not
 * handle lands in the banner.
 */
export function useWrite(messages: WriteMessages = EXPENSE_MESSAGES) {
  const client = useQueryClient();
  const [banner, setBanner] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const run = async (
    action: () => Promise<unknown>,
    onError?: (error: ApiError) => boolean,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    setBanner(null);
    try {
      await action();
      return true;
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (onError?.(error)) return false;
      if (error.status === 412 || error.status === 404) {
        // What the dialog showed is stale, so the lists behind it must catch up.
        void client.invalidateQueries({ queryKey: expenseKeys.all });
        setBanner(error.status === 412 ? messages.changed : messages.gone);
      } else setBanner(error.detail || describeUnexpected(error));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { banner, setBanner, busy, run };
}
