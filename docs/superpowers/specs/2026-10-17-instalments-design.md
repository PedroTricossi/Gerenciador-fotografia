# Instalments — Design

Date: 2026-10-17
Status: approved
Branch: `feat/instalments` (based on `main`)

## 1. Purpose

This is piece 1 of 3 toward a business area where Pedro controls his money:
1. **Instalments:** this spec.
2. **Expenses:** one-off and recurring expenses, the second photographer's fee per wedding, and transport linked to a wedding with distance and departure time.
3. **Business overview:** the Resumo and Extrato tabs, with a percentage bar of where the income went, and a per-trip price guide.

Today Pedro tracks who owes what with a post-it on his desk. Most weddings are paid in instalments by PIX. Each contract says "à vista ou em até 4 parcelas via PIX, conforme cronograma acordado entre as partes", but the platform stores nothing about the schedule.

This piece gives every contract a payment plan, lets Pedro mark each instalment paid, and reminds him in the Agenda, in the last week of the month, which couples still owe that month. Pieces 2 and 3 will read the paid instalments as the business's income.

### Success criteria

- Every contract has a payment plan, either à vista or 1 to 4 instalments. Each instalment has a month and an amount, and the amounts add up to the contract's total after the PIX discount.
- A new contract's plan is set in the contract form. By default it is split equally, and each amount can be changed.
- When a contract's total changes, the difference is spread equally over its unpaid instalments. Paid instalments never change.
- A new **Negócio** page lists instalments: late ones, this month's (paid or open) and the coming months'. Each open instalment can be marked paid in one click, and a paid one can be undone.
- In the last week of each month, the Agenda shows a reminder for every unpaid instalment due that month or earlier.
- Existing contracts get a starting plan: one instalment for the full total in the month the change is installed, marked "Revisar plano".
- The contract PDF does not change.

### Non-goals

- Printing the plan in the contract PDF. Pedro decided the plan lives only in the platform.
- Partial payments of an instalment. An instalment is paid whole or not at all.
- Expenses, the Resumo and Extrato tabs, and the price guide (pieces 2 and 3).
- Sending messages to couples. The reminder tells Pedro whom to message, and he sends the message himself.
- Interest, fines or late fees.

### Anti-goals

- A plan whose amounts don't add up to the contract total, in any state.
- A paid instalment that changes amount or month without being undone first.
- Personal data (names, CPFs, addresses) in instalment audit details or logs.

## 2. Pedro's decisions

- **Plan shape:** à vista (one instalment) or up to 4 instalments. "Em até 4" matches the contract text.
- **Amounts:** split equally by default. Pedro may set custom amounts (e.g. 30/30/40). The amounts are taken from the total after the PIX discount, because the discount also applies to instalments.
- **Dates:** each instalment belongs to a **month**, not a day. The couple pays any time in that month, and the end of the month is the deadline.
- **Partial payments:** none. An instalment is paid whole.
- **Total changes:** the difference (up or down) is spread equally over the unpaid instalments.
- **Marking paid:** done on the Negócio page.
- **Reminder:** in the platform's Agenda, in the last week of the month, for couples who haven't paid.
- **PDF:** unchanged.
- **Existing contracts:** start with a plan whose first instalment is in the current month. The number of instalments isn't stored anywhere, so each gets one instalment for the full total, marked "Revisar plano", and Pedro adjusts it by hand.

## 3. Behaviour

### 3.1 The payment plan

- Each instalment has a number (1..N), a month (`YYYY-MM`) and an amount in centavos (> 0). It also has a paid date when paid.
- N is 1 to 4. "À vista" is N = 1.
- **My call:** months are strictly increasing, so each instalment is in a later month than the previous one.
- The amounts must add up exactly to the contract's `total_cents`, which is the total after the PIX discount.
- **Equal split (my call):** each instalment gets `floor(total / N)`, and any leftover centavos go to the last instalment.
- **Default months for a new plan (my call):** the first instalment is in the current month, and each next one is in the month after.

### 3.2 The contract form

- The form gets a new section, **Parcelas**, between Pagamento and Assinatura (my call). It contains:
  - "Total após desconto PIX", which shows the contract total live;
  - a choice between **À vista** and **Parcelado**;
  - the number of instalments (2–4) when Parcelado is chosen;
  - one row per instalment with a month and an amount.
- **Defaults for a new contract (my call):** À vista, in the current month.
- Changing the number of instalments, or the total while no amount has been edited by hand, re-splits equally.
- Once Pedro edits an amount, the form stops re-splitting and shows the difference against the total until the amounts add up. Saving is blocked while they don't.
- **Paid instalments** show as locked rows ("paga em 05/10"). Their month and amount can't be edited in the form, and they can't be removed. The number of instalments can't drop below the number paid.
- **Saving:** the plan saves with the contract (create, or PATCH with the same `If-Match` version rule). A plan change counts as a contract change, so it bumps the version and is audited as `contract.updated`, with the plan named among the changed fields.

### 3.3 When the contract total changes

- When an edit changes `total_cents` and the plan itself wasn't edited in the same save, the server spreads the difference equally over the unpaid instalments, with leftover centavos on the last unpaid one.
- **Blocked saves (my call):** the server refuses the save with a field error on the plan, so Pedro adjusts it in the same form, in either of these cases:
  - every instalment is already paid;
  - the spread would make an unpaid instalment zero or negative.
- When Pedro edits the plan in the same save, his plan is taken as given. It still must add up to the new total.

### 3.4 Marking paid

- On the Negócio page, **Marcar como paga** records today's date (local) as the paid date.
- **Desfazer** clears the paid date.
- Neither action changes the contract's version or PDF; they work like scheduling a pre-wedding. Each is audited: `instalment.paid` and `instalment.unpaid`. Details hold the contract id, the instalment number and the month, but no names or amounts.
- A deleted contract's instalments can't be marked (409) until the contract is restored.

### 3.5 The Negócio page

- **Navigation:** a new **Negócio** entry in the side menu, after Serviços (my call). Its route is `/negocio`.
- **Tabs (my call):** this piece shows only the instalments view, titled **Parcelas**. The Resumo and Extrato tabs appear when piece 3 builds them, not as disabled placeholders now.
- **Groups:**
  - **Atrasadas:** unpaid instalments whose month is before the current month. The oldest is first, and each is highlighted with an icon and the word "Atrasada", not by colour alone.
  - **This month** (titled with the month, e.g. "Outubro"): every instalment of the current month, paid ("✓ paga em dd/mm" plus Desfazer) or open (Marcar como paga).
  - **Próximos meses:** unpaid instalments of later months, grouped by month.
- **Each row shows:** the couple ("Bruno & Ana"), the instalment number out of the total ("2/3"), the month and the amount. It links to the contract.
- **Revisar plano:** contracts whose plan still needs review show a **Revisar plano** badge on their rows. *My call:* any contract save that includes the plan clears the flag, even if the plan is unchanged. Pedro reviewed it by saving it. A save that doesn't send the plan leaves the flag as it is.
- **Deleted contracts:** their instalments are hidden. Restoring the contract brings them back.

### 3.6 The Agenda reminder

- **When:** during the last 7 days of the month. These are the days from the month's last day minus 6 through its last day, in local time.
- **Where:** the Agenda shows a **Cobranças** box above both the list and the calendar views.
- **What it lists:** every unpaid instalment whose month is the current month or earlier, on a contract that isn't deleted. Each line reads "Cobrar parcela: Caio & Duda · 1/4 · R$ 990,00" and links to the Negócio page.
- **Outside that window:** the box doesn't appear. Late instalments are still visible on the Negócio page.
- **My call:** earlier months' unpaid instalments are included too, because they also need chasing.

### 3.7 Existing contracts (migration)

- The migration gives every contract that has no plan, including deleted ones, a single unpaid instalment. The amount is `total_cents`, the month is the month the migration runs, and the contract is flagged `plan_needs_review`.
- **My call:** the migration does not change the contract's version, does not write audit events and does not touch the PDF.

## 4. Constraints

- Follow the existing architecture and specs: layered backend (`api` → `services` → `repositories`/`domain`), Alembic migration `0004`, RFC 9457 problems, `If-Match` on contract edits, audit rules (append-only, same transaction, no personal data), and the retro `ui/` layer with tokens only.
- The redesign's guidelines still apply: WCAG 2.2 AA, no external resources, CSP `default-src 'self'`, tests that query by role, label and text, and Portuguese UI text.
- Money is integer centavos everywhere.
- Months are stored and compared as `YYYY-MM`. "Current month" and "today" use the server's local date for the migration and the client's local date in the UI.

## 5. Testing

- **Domain (unit):**
  - equal split with leftover centavos;
  - spreading a total change over unpaid instalments, both increase and decrease, including the blocked cases;
  - plan validation: 1–4 instalments, strictly increasing months, amounts > 0, sum equal to the total;
  - the last-7-days window, including February and 30/31-day months.
- **API (integration):**
  - a contract created with a plan;
  - a PATCH that changes the total re-spreads the unpaid instalments;
  - paid instalments can't be changed;
  - marking paid and undoing it, with audit events and no version bump;
  - deleted contract → 409;
  - the instalment list groups and the reminder list.
- **Migration test:** existing contracts get one instalment with the full total in the run month, flagged for review.
- **Frontend (component):**
  - the Parcelas section's equal split, custom amounts blocking save until they add up, and locked paid rows;
  - the Negócio page groups, Marcar como paga, Desfazer and the Revisar plano badge;
  - the Agenda Cobranças box shown only in the last 7 days.
- **End to end:**
  - create a contract with 3 instalments, mark one paid on the Negócio page, and see it as paid;
  - in a simulated last week of the month, the Agenda shows the unpaid one;
  - an axe scan of the Negócio page in both themes.

## 6. Left to the builder

- API shapes and routes for listing instalments and marking them paid or unpaid.
- Where the plan lives in the data model (an `instalments` table keyed by contract and number is the obvious fit).
- Exact layout of the Parcelas section and the Negócio page within the existing `ui/` components.
- How the Agenda fetches the reminder list.
