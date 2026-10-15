export type FieldError = { field: string; message: string };

export type Problem = {
  title: string;
  detail: string;
  errors: FieldError[];
  requestId: string | null;
  code: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFieldError(value: unknown): value is FieldError {
  return isRecord(value) && typeof value.field === "string" && typeof value.message === "string";
}

export function parseProblem(status: number, body: unknown): Problem {
  const record = isRecord(body) ? body : {};
  const errors = Array.isArray(record.errors) ? record.errors.filter(isFieldError) : [];
  return {
    title: typeof record.title === "string" ? record.title : `Erro ${status}`,
    detail: typeof record.detail === "string" ? record.detail : "",
    errors: errors.map(({ field, message }) => ({ field, message })),
    requestId: typeof record.request_id === "string" ? record.request_id : null,
    code: typeof record.code === "string" ? record.code : null,
  };
}

export function splitFieldErrors(
  errors: readonly FieldError[],
  isField: (path: string) => boolean,
): { fields: Record<string, string>; other: string[] } {
  const fields: Record<string, string> = {};
  const other: string[] = [];
  for (const { field, message } of errors) {
    if (isField(field)) {
      fields[field] ??= message;
    } else {
      other.push(field === "" ? message : `${field}: ${message}`);
    }
  }
  return { fields, other };
}
