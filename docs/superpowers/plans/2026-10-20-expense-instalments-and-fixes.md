# Instalment Expenses and Three Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a manual expense be paid in 2–24 monthly instalments, close the fixed-cost dialog after a successful add, and give the Contratos list a fixed, one-line action order.

**Architecture:** Instalments are derived at read time from `(spent_on, amount_cents = total, instalment_count)`, exactly like fixed-cost occurrences. Nothing is stored per instalment. `ExpenseEntryService` emits one entry per instalment, so Despesas, Resumo and Extrato pick them up. The two UI fixes are independent, frontend-only tasks.

**Tech Stack:** FastAPI, SQLAlchemy 2, Alembic, pytest (backend). React, TypeScript, Vitest, Testing Library, Playwright (frontend).

**Spec:** `docs/superpowers/specs/2026-10-20-instalment-expenses-design.md`

**Parallel tracks.** The tracks share no files, so they can run side by side:
- **A (backend instalments):** Tasks 1 → 2 → 3 → 4.
- **B (frontend instalments):** Tasks 5 → 6 → 7. Starts after Task 3, because it needs the regenerated `ExpenseIn`/`ExpenseOut` types; Task 6's row labels need Task 4.
- **C (fixed-cost dialog):** Task 8.
- **D (Contratos actions):** Task 9.
- **Item 1 (instalment-sum check):** the contract form already shows "Faltam / Excede em" live and blocks the save (`PlanSection.tsx`, `formModel.ts` `validatePlan`). It's held back pending Pedro's answer. See the end of this plan.

## Global Constraints

- **Instalment count:** from 1 to 24, inclusive. 1 means a single payment, which is the default and covers every existing row.
- **`amount_cents`:** always the purchase **total**, > 0 and ≤ 100_000_000. It must also be ≥ `instalment_count`, with the error on `amount_cents`.
- **Split:** `split_equally` (floor each, leftover on the last). Instalment *k* is dated `occurrence_date(add_months(month_of(spent_on), k-1), spent_on.day)`.
- **Label suffix:** ` · parcela k/N`, only when N > 1.
- **Entry ids:** `manual:{id}:{k}` when N > 1, otherwise `manual:{id}` (unchanged).
- **PATCH:** keeps full replacement. A body without `instalment_count` sets it to 1.
- **Próximos meses:** stays unchanged. Do not touch `OverviewService._upcoming` or `upcoming_months`.
- **Copy (pt-BR, exact):**
  - "Parcelado"
  - "Nº de parcelas"
  - "Valor total"
  - "Use de 2 a 24 parcelas."
  - "Editar despesa parcelada"
  - "Todas as N parcelas serão excluídas."
  - preview: "3x de R$ 333,33 (última R$ 333,34)" / "10x de R$ 120,00"
- **No personal data in audit details:** only field names, version and count.
- **Coverage:** `domain/` stays at 100% (`make check-backend`).

## Review Focus

1. **A purchase that started before the viewed range,** for example bought in March 10x while viewing September: it must show instalment 7/10. Pinned in Task 4, `test_a_purchase_before_the_range_shows_its_later_instalments`.
2. **A purchase on the 29th–31st:** later instalments clamp to the month's end without drifting back. For example, 31/01 gives 28/02 and then 31/03, not 28/03. Pinned in Task 1, `test_day_31_clamps_per_month_without_drifting`.
3. **Editing a 10x purchase down to 1x:** the later months must lose their rows at once, and the entry id must go back to `manual:{id}`. Pinned in Task 4, `test_reducing_the_count_removes_later_rows`.
4. **A total smaller than the count** (R$ 0,05 in 10x): refused on `amount_cents`, never stored as zero-value instalments. Pinned in Task 3, `test_total_below_count_is_refused`.
5. **The Overview month totals across the whole span** must add up to exactly the total typed, with no lost centavo. Pinned in Task 4, `test_month_totals_sum_to_the_purchase_total`.

---

### Task 1: Instalment rule in the domain

**Files:**
- Modify: `backend/src/gerenciador/domain/expenses.py`
- Test: `backend/tests/domain/test_expenses.py`

**Interfaces:**
- Produces:
  - `MAX_EXPENSE_INSTALMENTS = 24`
  - `expense_instalments(spent_on: dt.date, total_cents: int, count: int) -> list[tuple[int, dt.date, int]]`, returning `(number, date, amount)` with `number` 1-based.

- [ ] **Step 1: Write the failing tests**

```python
def test_one_instalment_is_the_whole_amount_on_the_date():
    assert expense_instalments(dt.date(2026, 10, 10), 2500, 1) == [
        (1, dt.date(2026, 10, 10), 2500)
    ]


def test_split_puts_leftover_on_the_last():
    assert expense_instalments(dt.date(2026, 1, 15), 100000, 3) == [
        (1, dt.date(2026, 1, 15), 33333),
        (2, dt.date(2026, 2, 15), 33333),
        (3, dt.date(2026, 3, 15), 33334),
    ]


def test_day_31_clamps_per_month_without_drifting():
    dates = [d for _, d, _ in expense_instalments(dt.date(2026, 1, 31), 300, 3)]
    assert dates == [dt.date(2026, 1, 31), dt.date(2026, 2, 28), dt.date(2026, 3, 31)]


def test_twenty_four_instalments_cross_two_years():
    result = expense_instalments(dt.date(2026, 12, 5), 2400, 24)
    assert len(result) == 24 and result[-1][1] == dt.date(2028, 11, 5)
    assert sum(amount for _, _, amount in result) == 2400
```

- [ ] **Step 2: Run them and check they fail.** Run `cd backend && uv run python -m pytest tests/domain/test_expenses.py -v`. Expected: ImportError on `expense_instalments`.

- [ ] **Step 3: Implement `expense_instalments`.** It reuses `split_equally`, `add_months`, `month_of` (from `domain/instalments.py`) and `occurrence_date`, and anchors every date on `spent_on.day`, not on the previous instalment's date.

- [ ] **Step 4: Run the tests and check they pass.** Run the same command. Expected: PASS.

- [ ] **Step 5: Commit** with `feat: derive expense instalments from total and count`.

### Task 2: `instalment_count` column and migration 0006

**Files:**
- Create: `backend/migrations/versions/0006_expense_instalments.py` (revision `"0006"`, down_revision `"0005"`)
- Modify: `backend/src/gerenciador/db/models.py` (the `Expense` class)
- Test: `backend/tests/db/test_expense_instalments_migration.py`

**Interfaces:**
- Produces: `Expense.instalment_count: Mapped[int]`, NOT NULL, server default `1`, with the check `ck_expenses_instalment_count_range` (`instalment_count BETWEEN 1 AND 24`).

- [ ] **Step 1: Write the failing tests.** Use the same fixture shape as `test_expenses_migration.py`, upgrading to `"0005"` first.
  - `test_upgrade_gives_existing_expenses_one_instalment`: insert an expense row at 0005, upgrade to 0006, and assert `instalment_count == 1`.
  - `test_count_outside_1_to_24_is_rejected`: inserting 0 or 25 raises `IntegrityError`.
  - `test_downgrade_drops_the_column`: `instalment_count` is not in `inspect(engine).get_columns("expenses")`.
- [ ] **Step 2: Run them and check they fail.** Run `uv run python -m pytest tests/db/test_expense_instalments_migration.py -v`. Expected: FAIL, because there's no revision 0006.
- [ ] **Step 3: Implement the migration** with `batch_alter_table` (SQLite), and add the model column plus the check to `Expense.__table_args__`.
- [ ] **Step 4: Run the migration tests and `tests/db`.** Expected: PASS.
- [ ] **Step 5: Commit** with `feat: store an instalment count on expenses`.

### Task 3: Create, read, update and delete with instalments

**Files:**
- Modify: `backend/src/gerenciador/services/expense_service.py` (`ExpenseInput`, `ExpenseView`, `_view`, `create`, `update`)
- Modify: `backend/src/gerenciador/api/v1/schemas.py` (`ExpenseIn`, `ExpenseOut`)
- Modify: `openapi.json` and `frontend/src/api/schema.d.ts` (regenerate them with `make api-types`)
- Test: `backend/tests/api/test_expenses_api.py`

**Interfaces:**
- Consumes: `MAX_EXPENSE_INSTALMENTS` from Task 1, and the model column from Task 2.
- Produces:
  - `ExpenseInput.instalment_count: int`, the last field, with default `1`;
  - `ExpenseView.instalment_count: int`;
  - `ExpenseIn.instalment_count: Annotated[int, Field(strict=True, ge=1, le=24)] = 1`;
  - `ExpenseOut.instalment_count: int`.

- [ ] **Step 1: Write the failing API tests.** Use the existing `_body` and `_create` helpers.
  - `test_create_with_instalments_returns_the_total_and_count`: POST `_body(api, "Equipamento", amount_cents=100000, instalment_count=3)` → 201, `amount_cents == 100000`, `instalment_count == 3`. A GET returns the same.
  - `test_count_defaults_to_one`: POST without the field → `instalment_count == 1`.
  - `test_count_outside_1_to_24_is_refused`: 0 and 25 → 422 with an error at `instalment_count`.
  - `test_total_below_count_is_refused`: `amount_cents=5, instalment_count=10` → 422 with an error at `amount_cents`.
  - `test_patch_without_count_resets_to_one`: create 3x, then PATCH the full body without `instalment_count` → `instalment_count == 1` and `version == 2`.
  - `test_patch_changes_the_count_and_audits_it`: 3x → 10x, and the `expense.updated` audit details list `"instalment_count"` in `fields`.
  - `test_delete_removes_an_instalment_expense`: → 204, then GET → 404.
- [ ] **Step 2: Run them and check they fail.** Run `uv run python -m pytest tests/api/test_expenses_api.py -v`. Expected: the new tests FAIL with 422 on the unknown field, or a missing key.
- [ ] **Step 3: Implement the change.**
  - The service raises `ContractRuleError("amount_cents", "o valor total deve ser de pelo menos 1 centavo por parcela")` when `amount_cents < instalment_count`, on both create and update.
  - `update` adds `("instalment_count", ...)` to the `changed` list and assigns the field.
  - `created` audit details become `{"version": 1, "instalment_count": n}`.
- [ ] **Step 4: Run `tests/api/test_expenses_api.py` and `tests/test_export_openapi.py`, then run `make api-types`.** Expected: PASS, and `schema.d.ts` shows `instalment_count` on `ExpenseIn` and `ExpenseOut`.
- [ ] **Step 5: Commit** with `feat: accept and return an expense's instalment count`.

### Task 4: One entry per instalment in the month views

**Files:**
- Modify: `backend/src/gerenciador/services/expense_entry_service.py` (`ExpenseEntry`, `_manual`)
- Modify: `backend/src/gerenciador/api/v1/schemas.py` (`ExpenseEntryOut`)
- Modify: `openapi.json` and `frontend/src/api/schema.d.ts` (`make api-types`)
- Test: `backend/tests/api/test_expense_entries_api.py` and `backend/tests/api/test_overview_api.py`

**Interfaces:**
- Consumes: `expense_instalments` (Task 1) and `Expense.instalment_count` (Task 2).
- Produces: `ExpenseEntry` / `ExpenseEntryOut` gain `instalment_number: int | None` and `instalment_count: int | None`. Both are null when the count is 1. The entry `amount_cents` is that instalment's amount.

- [ ] **Step 1: Write the failing tests.** In `test_expense_entries_api.py`, query the existing entries endpoint:
  - `test_instalments_land_one_per_month`: a 3x purchase of R$ 1.000,00 on 2026-01-15. For 2026-01..2026-03 there are three `manual` entries with amounts `[33333, 33333, 33334]`, numbers 1..3, count 3, and ids `manual:{id}:1..3`.
  - `test_a_purchase_before_the_range_shows_its_later_instalments`: a 10x purchase on 2026-03-10. Querying `from=2026-09&to=2026-09` returns exactly one entry, number 7, dated 2026-09-10.
  - `test_a_range_in_the_middle_shows_only_those_instalments`: the same purchase, `2026-05..2026-06` → numbers `[3, 4]`.
  - `test_reducing_the_count_removes_later_rows`: PATCH 10x → 1x. 2026-04 is then empty, and 2026-03 has id `manual:{id}` with null instalment fields.
  - `test_single_payment_entries_are_unchanged`: a 1x expense keeps id `manual:{id}` with `instalment_number is None`.

  In `test_overview_api.py`:
  - `test_month_totals_sum_to_the_purchase_total`: a 7x purchase of R$ 1.000,00. The Extrato/Resumo monthly expense totals over its seven months sum to `100000`, and each month holds only its instalment.
- [ ] **Step 2: Run them and check they fail.** Run `uv run python -m pytest tests/api/test_expense_entries_api.py tests/api/test_overview_api.py -v`.
- [ ] **Step 3: Implement the change in `_manual`.**
  - The query becomes `Expense.spent_on <= end` and `Expense.spent_on >= occurrence_date(add_months(month_of(start), -(MAX_EXPENSE_INSTALMENTS - 1)), 1)`.
  - For each expense, iterate `expense_instalments(...)` and keep the instalments with `start <= date <= end`.
  - Build the entry as today, with `id`, `date`, `amount_cents`, `instalment_number` and `instalment_count` set per the Global Constraints.
- [ ] **Step 4: Run all of `tests/` and then `make api-types`.** Expected: PASS. Also check that the transport guide tests are untouched and passing (the guide reads `Expense.amount_cents`, the total).
- [ ] **Step 5: Commit** with `feat: list each expense instalment in its own month`.

### Task 5: Expense form model with Parcelado

**Files:**
- Modify: `frontend/src/features/business/expenses/expenseForm.ts`
- Test: `frontend/src/features/business/expenses/expenseForm.test.ts`

**Interfaces:**
- Consumes: `ExpenseIn.instalment_count` and `ExpenseOut.instalment_count` (Task 3 types).
- Produces:
  - `ExpenseFormValues` gains `split: boolean` and `instalmentCount: string`;
  - `ExpenseField` gains `"instalmentCount"`;
  - `MAX_EXPENSE_INSTALMENTS = 24`;
  - `instalmentPreview(amount: string, count: string): string | null`.

- [ ] **Step 1: Write the failing tests.**
  - `emptyExpenseValues` has `split: false, instalmentCount: ""`.
  - `fromExpense({...instalment_count: 3})` → `split: true, instalmentCount: "3"`. With a count of 1 → `split: false, instalmentCount: ""`.
  - `validateExpense` with `split` and count `""` → `instalmentCount: "campo obrigatório"`. Counts `"1"`, `"25"` and `"2,5"` → `"Use de 2 a 24 parcelas."`. With `split: false`, the count is ignored.
  - `toRequest` sends `instalment_count: 3` when split, and `1` when not.
  - `fieldFor("instalment_count") === "instalmentCount"`.
  - `instalmentPreview("1.000,00", "3") === "3x de R$ 333,33 (última R$ 333,34)"`, `instalmentPreview("1.200,00", "10") === "10x de R$ 120,00"`, and an invalid amount or count → `null`.
- [ ] **Step 2: Run them and check they fail.** Run `cd frontend && npm test -- src/features/business/expenses/expenseForm.test.ts`.
- [ ] **Step 3: Implement.** `instalmentPreview` uses `splitEqually` from `domain/instalments.ts` and `formatBrl`.
- [ ] **Step 4: Run the tests and check they pass.**
- [ ] **Step 5: Commit** with `feat: model instalments in the expense form`.

### Task 6: Parcelado in the dialog, and the "parcela k/N" row label

**Files:**
- Modify: `frontend/src/features/business/expenses/ExpenseDialog.tsx` and `ExpenseDialog.module.css` if needed
- Modify: `frontend/src/features/business/expenses/describe.ts`
- Modify: `frontend/src/features/business/expenses/testData.ts` (add the new entry fields to its fixtures)
- Test: `ExpenseDialog.test.tsx`, `ExpensesTab.test.tsx`, `frontend/src/features/business/overview/ExtratoTab.test.tsx`

**Interfaces:**
- Consumes: Task 5's exports, and `ExpenseEntryOut.instalment_number` / `instalment_count` (Task 4 types).

- [ ] **Step 1: Write the failing tests.**
  - **Dialog:**
    - ticking the `Parcelado` checkbox shows `Nº de parcelas` and relabels `Valor` to `Valor total`;
    - typing 1.000,00 and 3 shows the text "3x de R$ 333,33 (última R$ 333,34)";
    - saving POSTs `instalment_count: 3`;
    - opening an expense with count 10 shows the title "Editar despesa parcelada", the box ticked, and 10;
    - Excluir on it shows "Todas as 10 parcelas serão excluídas.";
    - a 422 at `instalment_count` shows on that field.
  - **describe:** an entry with `instalment_number: 2, instalment_count: 5, description: "Lente"` → `"Lente · parcela 2/5"`. With no description → `"Equipamento · parcela 2/5"`. A linked trip → it ends with `" · parcela 2/5"`. Null fields → unchanged output.
  - **ExpensesTab / Extrato:** a row shows "Lente · parcela 2/5", and Editar opens the expense by `expense_id`.
- [ ] **Step 2: Run them and check they fail.** Run `npm test -- src/features/business`.
- [ ] **Step 3: Implement.**
  - Use the existing `Checkbox` from `ui` below the Valor field, and a short `Field` for the count, as in the `Dia` field in `FixedCostsDialog`.
  - Show the preview as a `Hint` with `aria-live="polite"`.
  - In `describe`, append the suffix in one place, after the existing branches compute the base text.
- [ ] **Step 4: Run all frontend checks.** Run `npm test`, `npm run lint` and `npm run typecheck` (or `make check-frontend`). Expected: PASS.
- [ ] **Step 5: Commit** with `feat: enter instalment expenses and label each instalment`.

### Task 7: E2E for instalment expenses

**Files:**
- Test: `frontend/e2e/expenses.spec.ts`

- [ ] **Step 1: Write the test.**
  - `test("a 3x expense shows one instalment in each of three months", ...)`:
    1. Create an Equipamento expense of R$ 900,00 in 3x through the dialog, dated on the 1st of the current month.
    2. Check that the current month lists "· parcela 1/3" for R$ 300,00.
    3. Click › twice and check "parcela 3/3", tagged prevista.
  - Use a unique description via `uniqueSuffix`.
- [ ] **Step 2: Run it.** Run `make e2e` (or `cd frontend && npm run e2e -- expenses.spec.ts`). Expected: PASS.
- [ ] **Step 3: Commit** with `test: e2e for instalment expenses`.

### Task 8: Fixed-cost dialog closes after Adicionar (track C)

**Files:**
- Modify: `frontend/src/features/business/expenses/FixedCostsDialog.tsx`
- Test: `frontend/src/features/business/expenses/FixedCostsDialog.test.tsx`

**Interfaces:**
- `NewCostForm` gains the prop `onCreated: () => void`, and `FixedCostsDialog` passes `onClose`.

- [ ] **Step 1: Update the test** `creates a fixed cost with the expected body`.
  - After the POST resolves, assert that `onClose` was called once and that the toast "Despesa fixa criada" is shown.
  - Add `test("a refused create keeps the dialog open with the field error")`: a 422 at `amount_cents` → `onClose` not called, and the error is on Valor.
- [ ] **Step 2: Run it and check it fails.** Run `npm test -- FixedCostsDialog`.
- [ ] **Step 3: Implement the change.** In the `.then((ok) => …)` branch, keep the toast and replace the field resets with `onCreated()`.
- [ ] **Step 4: Run it and check it passes.**
- [ ] **Step 5: Commit** with `fix: close the fixed-cost dialog after adding one`.

### Task 9: Contratos list — fixed action order on one line (track D)

**Files:**
- Modify: `frontend/src/features/contracts/ContractListPage.tsx` (the Ações cell)
- Modify: `frontend/src/features/contracts/ContractListPage.module.css` (`.actions`)
- Test: `frontend/src/features/contracts/ContractListPage.test.tsx`, `frontend/e2e/layout.spec.ts`

**Decisions (my calls):**
- **Order:** `Editar · Baixar PDF · <pré-wedding> · Excluir`. Excluir stays last, as the dangerous action.
- **Rows without a pre-wedding:** keep the slot with an empty `<span aria-hidden="true" />`, so the column lines up.
- **Layout:** `.actions` becomes `display: grid; grid-auto-flow: column; grid-template-columns: auto auto minmax(var(--prewedding-slot, 9.5rem), auto) auto; justify-content: end; gap: var(--space-2)`. The buttons in it get `white-space: nowrap` (override the `.table td button` rule with `.actions button`). The page's `PageLayout` already scrolls the table horizontally on narrow screens. Check this in Step 4; at 400px, wrapping onto two lines is acceptable.

- [ ] **Step 1: Write the failing tests.**
  - **Unit:** `test("actions keep one order, with the pré-wedding slot kept on every row")`. A row with a pre-wedding gives the button names `["Editar", "Baixar PDF", "Pré-wedding 12/05", "Excluir"]`. A row without one gives `["Editar", "Baixar PDF", "Excluir"]`, and its actions container has 4 children.
  - **E2E** in `layout.spec.ts`, `test("contract actions sit on one line at 1024px and wider")`: for widths 1024, 1280 and 1440, every button in the first row's Ações cell has the same `boundingBox().y`, and the pre-wedding button's `x` matches across two rows that have one.
- [ ] **Step 2: Run them and check they fail.** Run `npm test -- ContractListPage`, then `npm run e2e -- layout.spec.ts`.
- [ ] **Step 3: Implement the order, the placeholder and the CSS.**
- [ ] **Step 4: Run them and check they pass.** Also check the 400px and 800px screenshots in the existing layout tests for horizontal overflow.
- [ ] **Step 5: Commit** with `fix: keep contract actions in one order on one line`.

### Item 1 (instalment sum): on hold

The contract form already does what was asked:
- `PlanSection.tsx` shows "Faltam R$ x" or "Excede em R$ x" live under the plan.
- `formModel.ts` `validatePlan` sets `plan.sum`, which blocks submit.
- The server rejects the save too.

There's no task until Pedro says where he saw a mismatch get through.
