import { ApiError } from "./client";

export function isUnexpected(error: unknown): boolean {
  if (!(error instanceof ApiError)) return true;
  return error.status === 0 || error.status === 400 || error.status === 403 || error.status >= 500;
}

function headline(status: number): string {
  if (status === 0) return "Sem conexão com o servidor";
  if (status >= 500) return "Erro no servidor";
  return "O servidor recusou o pedido";
}

export function describeUnexpected(error: unknown): string {
  if (!(error instanceof ApiError)) return "Erro inesperado. Recarregue a página.";
  const code = error.requestId ? ` Código: ${error.requestId}` : "";
  return `${headline(error.status)}.${code}`;
}
