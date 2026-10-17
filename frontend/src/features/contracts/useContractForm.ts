import { useEffect, useRef, useState } from "react";
import {
  type FieldErrors,
  type FieldPath,
  type Resolver,
  useFieldArray,
  useForm,
} from "react-hook-form";
import { ApiError } from "../../api/client";
import { describeUnexpected, isUnexpected } from "../../api/errors";
import { changedSections } from "../../domain/patch";
import { splitFieldErrors } from "../../domain/problems";
import {
  type ContractFormValues,
  MAX_ITEMS,
  type PlanRow,
  emptyItem,
  formPath,
  formTotal,
  isFormField,
  resizePlan,
  respreadForTotal,
  splitUnpaid,
  toRequest,
  validate,
} from "./formModel";

/** React Hook Form wants errors nested like the values; `validate` returns flat paths. */
function nest(flat: Record<string, string>): FieldErrors<ContractFormValues> {
  const root: Record<string, unknown> = {};
  for (const [path, message] of Object.entries(flat)) {
    const parts = path.split(".");
    let node: Record<string, unknown> = root;
    parts.slice(0, -1).forEach((part, position) => {
      // React Hook Form shifts field-array errors only when they sit in a real array.
      node[part] ??= /^\d+$/.test(parts[position + 1]!) ? [] : {};
      node = node[part] as Record<string, unknown>;
    });
    node[parts[parts.length - 1]!] = { type: "validate", message };
  }
  return root as FieldErrors<ContractFormValues>;
}

const resolver: Resolver<ContractFormValues> = async (values) => {
  const flat = validate(values);
  return Object.keys(flat).length === 0
    ? { values, errors: {} }
    : { values: {}, errors: nest(flat) };
};

export function useContractForm(
  initialValues: ContractFormValues,
  submit: (values: ContractFormValues) => Promise<void>,
) {
  const form = useForm<ContractFormValues>({
    defaultValues: initialValues,
    resolver,
    mode: "onTouched",
  });
  const items = useFieldArray({ control: form.control, name: "payment.items" });
  const planRows = useFieldArray({ control: form.control, name: "plan.rows" });
  // Once an amount is typed by hand, the form stops re-splitting the plan on its own.
  const planEdited = useRef(false);
  const [baseline] = useState(() => toRequest(initialValues));
  const [serverMessages, setServerMessages] = useState<string[]>([]);
  const inFlight = useRef(false);

  const values = form.watch();
  // Compared as API requests, so "1200" and "1.200,00" are the same value.
  const hasChanges = Object.keys(changedSections(baseline, toRequest(values))).length > 0;

  const total = formTotal(values);
  useEffect(() => {
    if (planEdited.current || total === null || Number.isNaN(total)) return;
    const plan = form.getValues("plan");
    const next = respreadForTotal(plan, total);
    if (next !== null && next !== plan.rows) planRows.replace(next);
    // Only a new total re-splits; the plan itself is read fresh from the form.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [total]);

  const paidCount = values.plan.rows.filter((row) => row.paidOn !== null).length;

  const setPlanCount = (count: number) => {
    const resized = resizePlan(form.getValues("plan.rows") as PlanRow[], count);
    const split = total === null || Number.isNaN(total) ? null : splitUnpaid(resized, total);
    planEdited.current = false;
    planRows.replace(split ?? resized);
    form.setValue("plan.mode", count > 1 ? "split" : "single", { shouldDirty: true });
  };
  const setPlanMode = (mode: "single" | "split") => {
    const current = form.getValues("plan.rows").length;
    if (mode === "single") {
      if (paidCount <= 1) setPlanCount(1);
    } else if (current > 1) {
      form.setValue("plan.mode", "split", { shouldDirty: true });
    } else {
      setPlanCount(2);
    }
  };

  const onSubmit = form.handleSubmit(async (submitted) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setServerMessages([]);
    try {
      await submit(submitted);
    } catch (error) {
      if (!(error instanceof ApiError)) throw error;
      if (error.status !== 422) {
        // Unexpected statuses are already toasted by the query client.
        if (!isUnexpected(error)) setServerMessages([describeUnexpected(error)]);
        return;
      }
      const { fields, other } = splitFieldErrors(error.errors, (path) =>
        isFormField(path, submitted.payment.items.length, submitted.plan.rows.length),
      );
      for (const [serverPath, message] of Object.entries(fields)) {
        const path = formPath(serverPath);
        form.setError(path as FieldPath<ContractFormValues>, { type: "server", message });
      }
      const nothingMapped = other.length === 0 && Object.keys(fields).length === 0;
      setServerMessages(
        nothingMapped ? [error.detail || "Revise os campos do formulário."] : other,
      );
    } finally {
      inFlight.current = false;
    }
  });

  return {
    form,
    items,
    planRows,
    values,
    total,
    paidCount,
    setPlanCount,
    setPlanMode,
    markPlanEdited: () => {
      planEdited.current = true;
    },
    hasChanges,
    serverMessages,
    onSubmit,
    canAddItem: items.fields.length < MAX_ITEMS,
    addItem: () => items.append(emptyItem()),
    removeItem: (index: number) => items.remove(index),
  };
}

export type ContractFormState = ReturnType<typeof useContractForm>;
