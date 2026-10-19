import { useRef, useState } from "react";
import { ApiError } from "../../../api/client";
import { describeUnexpected } from "../../../api/errors";
import { MAX_CENTS, parseBrl } from "../../../domain/money";

export const CHANGED =
  "Esta despesa foi alterada em outro lugar. Feche e abra de novo para ver a versão atual.";
export const GONE = "Esta despesa não existe mais. A lista foi atualizada.";

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
export function useWrite() {
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
      if (error.status === 412) setBanner(CHANGED);
      else if (error.status === 404) setBanner(GONE);
      else setBanner(error.detail || describeUnexpected(error));
      return false;
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return { banner, setBanner, busy, run };
}
