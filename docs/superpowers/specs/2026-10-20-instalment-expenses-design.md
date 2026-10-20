# Instalment Expenses — Design

Date: 2026-10-20
Status: awaiting review

## 1. Purpose

Pedro buys some things in instalments, such as a lens in 10x on his card. Today a manual expense has one date and one amount, so he either records the whole purchase in the month he bought it or adds ten separate expenses by hand. Neither matches what leaves his account each month.

This change lets one manual expense be paid in instalments. He types the **total** and the **number of instalments**, and each instalment shows up in its own month in Despesas and in the overview.

This ships alongside three small, unrelated fixes agreed in chat (instalment-sum feedback in the contract form, auto-closing the fixed-cost dialog, and the order of actions on the Contratos list). They're not part of this document.

### Success criteria

- In Nova despesa, Pedro ticks **Parcelado**, types the total and the number of instalments, and saves once.
- The total is split evenly. Leftover centavos go on the last instalment, as `split_equally` already does for contracts: R$ 1.000,00 in 3x is 333,33 + 333,33 + 333,34.
- Instalment *k* (1-based) is dated on the expense date's day, *k − 1* months later, clamped to the month's last day (as `occurrence_date` already does). For example, a purchase on 31/01 has its second instalment on 28/02 or 29/02.
- Each instalment is its own row in Despesas, in its month, labelled "<description> · parcela k/N" and counted in that month's total. Future instalments get the existing **prevista** tag.
- Resumo, Extrato and every other place that reads the month's expenses see the instalments, not the whole purchase.
- Editing changes the whole purchase. A new total, count or date recalculates every instalment. Deleting removes every instalment.

### Non-goals

- Marking single instalments as paid, or changing one instalment's amount or date.
- Interest, or instalments that differ on purpose.
- Instalments on fixed costs or on the second photographer's fee.

### Anti-goals

- A month total that counts the whole purchase instead of that month's instalment.
- Instalments that don't add up exactly to the total typed.
- Behaviour that changes for existing single-payment expenses.

## 2. Pedro's decisions

- He types the total and the number of instalments, not the amount of each one.
- The split is even, with the leftover centavos on the last instalment.
- The first instalment is on the expense date, and the others on the same day of the following months.
- Each instalment appears in its own month in Despesas, tagged **prevista** when it's in the future.
- Month totals count only that month's instalment.
- Editing and deleting act on the whole purchase.

## 3. Behaviour

### 3.1 Data

- **New column:** `expenses.instalment_count`, an integer, NOT NULL, default 1, with a check of `BETWEEN 1 AND 24`. One instalment is today's behaviour, so existing rows need no backfill. The cap of 24 matches the 24-month range cap already in `domain/expenses.py`.
  - *My call:* the cap of 24. It's a constant and can change.
- **Meaning of `amount_cents`:** it stays the **total** of the purchase. Instalments are derived from `(spent_on, amount_cents, instalment_count)` and not stored, like fixed-cost occurrences.
- **Amount check:** the total stays > 0 and ≤ R$ 1.000.000,00. It must also be at least `instalment_count` centavos, so no instalment is zero. The error goes on `amount_cents`.
- **Migration:** `0006_expense_instalments.py`, with a migration test like the existing ones.

### 3.2 Pure rule

`domain/expenses.py` gets one function:

```python
def expense_instalments(
    spent_on: date, total_cents: int, count: int
) -> list[tuple[int, date, int]]:
    """(number, date, amount) for each instalment, 1-based."""
```

It reuses `split_equally` from `domain/instalments.py` and `occurrence_date` with `add_months`.

### 3.3 Reading entries

- **`ExpenseEntryService._manual`:** this method fetches expenses by `spent_on` in the range today, which would miss a purchase made before the range whose later instalments fall inside it.
  - It should fetch expenses whose span overlaps the range: `spent_on <= end`, and the last instalment's month on or after `start`'s month. *My call:* filter on `spent_on >= start − 23 months` in SQL, then keep only the instalments dated inside `[start, end]` in Python.
  - It emits one `ExpenseEntry` per instalment in range.
- **New `ExpenseEntry` fields:** `instalment_number: int | None` and `instalment_count: int | None`. Both are set only when the expense has `instalment_count > 1`.
  - The entry id becomes `manual:{expense.id}:{k}` for instalment expenses. Single-payment expenses keep `manual:{expense.id}` so nothing that matches on it today breaks.
  - `amount_cents` on the entry is that instalment's amount.
- **The expense's own read (`GET /expenses/{id}`, `ExpenseOut`):** adds `instalment_count`, and `amount_cents` stays the total. The edit form reads this.
- **Overview:** Resumo and Extrato build on `ExpenseEntryService`, so they pick up instalments without other changes. `OverviewService`'s first-expense lookup (`min(spent_on)`) stays correct, because the first instalment is on `spent_on`.
- **Próximos meses (Resumo):** instalments don't extend this range (Pedro's decision). It keeps showing the near future, and the instalments that fall inside it count there. To see further ahead, Pedro opens the detail view (Despesas / Extrato for later months). `OverviewService._upcoming` and `upcoming_months` stay unchanged.
- **Transport price guide (`transport_guide_service`):** keeps using the expense's `amount_cents` (the trip's total cost), which is what a price guide wants. *My call:* a transport expense may be paid in instalments, for example a plane ticket, and the guide still shows the total.

### 3.4 Writing

- **`ExpenseIn`** gains `instalment_count`: optional, default 1, from 1 to 24. It's used for both create and PATCH.
  - *My call:* PATCH keeps its current full-replacement behaviour, which already clears `description` and `trip` when they're left out. A PATCH without `instalment_count` therefore sets it to 1. The frontend always sends the full body, so it always sends the count. The API tests cover this explicitly.
- **Audit:** the existing expense audit entries record the count in their details. The details carry no description text, as today.

### 3.5 The form (frontend)

- **The "Parcelado" checkbox:** sits under Valor in the Nova despesa / Editar form. Ticking it shows **Nº de parcelas** (a short numeric field), and the Valor label becomes **Valor total**.
  - Under the fields, a live line reads "3x de R$ 333,33 (última R$ 333,34)". When all instalments are equal, it reads "10x de R$ 120,00".
  - Unticking hides the field and sends `instalment_count: 1`.
- **Validation:** the count must be a whole number from 2 to 24 when Parcelado is ticked (`campo obrigatório` / "Use de 2 a 24 parcelas."). Server 422s on `instalment_count` map onto that field.
- **Editing an instalment expense:** the form opens with Parcelado ticked and the stored count, with Valor total showing the stored total. Opening Editar from any instalment's row edits the whole purchase. *My call:* the dialog title shows "Editar despesa parcelada" so it's clear that every instalment changes.
- **Deleting:** for an instalment expense, the confirmation says "Todas as N parcelas serão excluídas."
- **Rows in Despesas:** the description reads "<description> · parcela k/N". With no description, it reads "<type name> · parcela k/N". For a transport expense linked to a trip, the suffix goes at the end of the existing trip summary: "Avião · casamento X & Y · 850,0 km · saí 05:00 · parcela 2/5" (my call). The amount is that instalment's amount. Editar works as it does for manual rows.
- **Extrato:** shows the same "parcela k/N" suffix wherever it shows an expense's description. *My call.*

## 4. Tests

- **Domain:** split and dates for 1, 2, 3 and 24 instalments, plus a purchase on the 31st across short months.
- **Entries service:**
  - a purchase before the range with instalments inside it;
  - a range covering only the middle instalments;
  - month totals adding up to the purchase total across the whole span.
- **API:**
  - create, read, patch the count up and down, and delete;
  - 422s for counts of 0 and 25, and for a total smaller than the count.
- **Migration:** existing rows get `instalment_count = 1`.
- **Frontend:**
  - the form's checkbox, the live preview line, validation, and pre-filling on edit;
  - the row label in Despesas.
- **E2E:** create a 3x expense and see one row in each of three months.

## 5. Left to the builder

- Exact component and CSS placement of the checkbox and preview line, following the existing `Field`/`Checkbox` patterns.
- Whether the "parcela k/N" label is built in a shared helper (`describe.ts` looks like the right place).
- Regenerating `frontend/src/api/schema.d.ts` from the OpenAPI export, as earlier features did.
