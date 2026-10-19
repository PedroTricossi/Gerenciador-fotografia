import createClient from "openapi-fetch";
import { type FieldError, parseProblem } from "../domain/problems";
import type { components, paths } from "./schema";

export type Schemas = components["schemas"];
export type ContractOut = Schemas["ContractOut"];
export type ContractCreate = Schemas["ContractCreate"];
export type ContractPatch = Schemas["ContractPatch"];
export type ClientOut = Schemas["ClientOut"];
export type ClientExportOut = Schemas["ClientExportOut"];
export type ItemOut = Schemas["ItemOut"];
export type ServiceOut = Schemas["ServiceOut"];
export type ServiceIn = Schemas["ServiceIn"];
export type ServicePatch = Schemas["ServicePatch"];
export type PreweddingIn = Schemas["PreweddingIn"];
export type PreweddingOut = Schemas["PreweddingOut"];
export type AgendaEntryOut = Schemas["AgendaEntryOut"];
export type ExpenseEntryOut = Schemas["ExpenseEntryOut"];
export type ExpenseIn = Schemas["ExpenseIn"];
export type ExpenseOut = Schemas["ExpenseOut"];
export type ExpenseEventOut = Schemas["ExpenseEventOut"];
export type ExpenseTypeOut = Schemas["ExpenseTypeOut"];
export type FixedCostOut = Schemas["FixedCostOut"];

export class ApiError extends Error {
  readonly status: number;
  readonly title: string;
  readonly detail: string;
  readonly errors: FieldError[];
  readonly requestId: string | null;
  readonly code: string | null;

  constructor(status: number, body: unknown) {
    const problem = parseProblem(status, body);
    super(problem.detail || problem.title);
    this.name = "ApiError";
    this.status = status;
    this.title = status === 0 ? "Sem conexão com o servidor" : problem.title;
    this.detail = problem.detail;
    this.errors = problem.errors;
    this.requestId = problem.requestId;
    this.code = problem.code;
  }
}

export const api = createClient<paths>({
  baseUrl: window.location.origin,
  credentials: "same-origin",
  // Looked up on every call so test interceptors installed later still apply.
  fetch: (request) => globalThis.fetch(request),
});

type Result<T> = { data?: T; error?: unknown; response: Response };

export async function send<T>(call: Promise<Result<T>>): Promise<{ data: T; response: Response }> {
  let result: Result<T>;
  try {
    result = await call;
  } catch {
    throw new ApiError(0, null);
  }
  if (!result.response.ok) throw new ApiError(result.response.status, result.error);
  return { data: result.data as T, response: result.response };
}

export async function unwrap<T>(call: Promise<Result<T>>): Promise<T> {
  return (await send(call)).data;
}
