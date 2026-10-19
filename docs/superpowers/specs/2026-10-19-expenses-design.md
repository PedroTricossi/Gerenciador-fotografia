# Expenses — Design

Date: 2026-10-19
Status: awaiting review
Branch: `feat/expenses` (based on `feat/instalments`, PR #16, which it builds on)

## 1. Purpose

This is piece 2 of 3 of the business area:
1. **Instalments:** PR #16.
2. **Expenses:** this spec.
3. **Business overview:** the Resumo and Extrato tabs, the percentage bar, and the per-trip price guide.

Pedro keeps his expenses in his head and on paper. This piece lets him record them in the platform, so piece 3 can show what came in, what went out and what's "free". His usual expenses are:
- transport to the wedding venue,
- camera equipment,
- the café where he edits,
- two monthly subscriptions (the Adobe package and his online gallery),
- the second photographer's fee for each wedding.

Pedro records expenses on his Mac after each event, typing them in while looking at his bank app.

Transport costs are hard to predict. Pedro wants to build a record of trips (distance, kind of transport, time he left home, cost) so he can charge future clients properly. Piece 3 turns that record into a price guide. This piece stores the data.

### Success criteria

- Pedro adds, edits and deletes an expense with a date, an amount, a type and an optional description.
- **Transport:** a transport expense can be linked to a wedding or a pre-wedding. When it is, it records the kind of transport, the time Pedro left home and the distance in km, all typed by Pedro. The venue address comes from the contract.
- **Monthly fixed costs:** set up once, they appear in every month from their start month until they're stopped. A price change applies from a chosen month onwards, and earlier months keep their amounts.
- **Second photographer:** a fee appears automatically for every wedding with 2 or more photographers, in the month of the wedding, at the standard fee in force that month. Pedro can change one wedding's fee without touching the standard. A change to the standard applies from that month onwards.
- **Types:** expense types are kept in a table. Pedro can add, rename and archive types. The six starting types are listed in §2.
- A **Despesas** tab on the Negócio page lists a month's expenses (manual, fixed and automatic) with the month total.

### Non-goals

- Receipt uploads, bank or statement import, and looking up distances online. The platform stays offline.
- More than one automatic extra-photographer fee per wedding. Anything else is a normal expense.
- The Resumo and Extrato tabs, the percentage bar and the price guide (piece 3).
- Editing one month's occurrence of a fixed cost. Price changes and stopping are the only changes.
- Taxes, invoices, multiple currencies.

### Anti-goals

- **Rewriting history:** a price or fee change that alters an amount in a month before the change.
- **Automatic costs that disagree with their contract:** a fee for a deleted contract, or a fee in a month the wedding isn't in.
- **Personal data in audit details or logs:** names, CPFs, addresses, or the text of descriptions.

## 2. Pedro's decisions

- **Entry:** typing only, on the Mac, after the event.
- **Types:** Transporte, Equipamento, Café, Assinatura, 2º fotógrafo and Outro to start. Pedro can add more, and they're kept in a table.
- **Transport linked to a wedding:** records the kind of transport, the amount, the time he left home and the distance, which he types himself (no online map service). The address comes from the contract.
- **Monthly fixed costs:** fixed every month, set once, added automatically.
- **Second photographer:**
  - The fee is fixed per wedding and added automatically for weddings with two photographers, in the wedding's month.
  - One wedding's fee can be changed on its own.
  - Weddings with 3 or more photographers still get one fee. Anything else Pedro adds as a normal expense.
- **Price changes:** a new subscription price or standard fee applies from that month on, and past months stay as they were.
- **Where:** a Despesas tab on the Negócio page, as in the approved mockup.

## 3. Behaviour

### 3.1 Expense types

- **Fields:** name (1–60 characters, unique ignoring case), created and updated timestamps, and `archived_at` (null when active).
- **Starting types:** the six names in §2. Two of them carry behaviour, and the platform knows them by a fixed internal key, not by name:
  - **Transporte** (`transport`): enables the trip fields (§3.2).
  - **2º fotógrafo** (`second_photographer`): the type used for automatic fees.

  Pedro can rename these two, but can't archive them (my call).
- **Archived types:** they keep their past expenses and aren't offered for new ones. Restoring is allowed.
- **Where they're managed:** a **Tipos de despesa** list, opened from the Despesas tab's Configurações box (my call). It works like the Serviços screen: add, rename, archive, restore.

### 3.2 Manual expenses

- **Fields:**
  - date (required);
  - amount in centavos (> 0, at most R$ 1.000.000,00, like contract amounts);
  - an active type (required);
  - description (optional, up to 200 characters, no control characters).
- **Trip fields (transport type only):** a transport expense may be linked to one event, either a contract's wedding or that contract's pre-wedding, on a contract that isn't deleted.
  - **When linked**, the expense also needs:
    - **kind of transport**: one of *Carro*, *App (Uber/99)*, *Ônibus*, *Avião* or *Outro* (my call);
    - **time Pedro left home** (`HH:MM`);
    - **distance in km**, from 0.1 to 5000 with one decimal place, stored as an integer in tenths (my call).
  - The venue name and address are shown from the contract or pre-wedding, read live and not copied (my call).
  - An unlinked transport expense, such as a trip to buy gear, needs none of the trip fields.
- **Editing and deleting:** both are allowed. Deleting asks for confirmation.
- **How the link is stored (my call):** as the contract id plus the event kind (`wedding` or `prewedding`), not the pre-wedding row. A pre-wedding can be cancelled (`DELETE /contracts/{id}/prewedding`), and the expense must survive that.
- **When the linked event goes away:** the expense stays, because the money was really spent, and its link and trip fields stay too. *My call:* it still counts in its month, and the event shows as "(contrato excluído)" or "(pré-wedding cancelado)", without the venue name or address.
  - Linking a new or edited expense to a deleted contract, or to a pre-wedding that doesn't exist, is refused.
  - An existing dangling link can be kept when the expense is edited.
- **Changing the type away from Transporte (my call):** this clears the link and the trip fields. The form says so before saving.
- **Dates:** the expense date isn't tied to the event date (my call).

### 3.3 Monthly fixed costs

- **Fields:**
  - name (1–100 characters);
  - type: any active type except 2º fotógrafo, default Assinatura (my call). If the type is archived later, the cost keeps it, and its price changes and stopping still work.
  - day of the month, 1–31. In shorter months it falls on the last day (my call).
  - start month;
  - an optional end month;
  - a price history of `(from_month, amount_cents)` entries.
- **Occurrences:** in each month from start to end inclusive, the cost appears once, on its day, at the price whose `from_month` is the latest on or before that month.
- **Not stored per month (my call):** occurrences are derived from the schedule and price history. Past months therefore can't drift, and later months reflect a change only from its `from_month` on.
- **Changing the price:** adds an entry from a month Pedro chooses, the current month by default. That month may be in the past, to backdate a change he forgot. Earlier months never change.
- **Stopping:** sets the end month, the current month by default. A stopped cost can be resumed by clearing the end month.
- **Deleting:** removes it from every month, past months included. This is for a cost created by mistake. It's always offered, but less prominent than **Parar**, and its confirmation says past months will change too (my call). Stopping is the normal action.

### 3.4 Second photographer's fee

- **Standard fee:** a setting with a history of `(from_month, amount_cents)` entries. It starts empty. As with fixed costs, Pedro picks the `from_month` of each entry, the current month by default, and may pick a past month.
- **No standard fee in force (my call):** if a wedding's month comes before the first entry, the wedding's row still appears, as "2º fotógrafo · <casal> — sem valor", with **Ajustar**. It counts as R$ 0 and carries a `missing_amount` flag in the read path, so the missing amount is visible and never silently dropped.
- **Which weddings get a fee:** every contract that isn't deleted and has `photographer_count ≥ 2` has one automatic fee:
  - dated on its `event_date`;
  - at the standard fee in force for that month;
  - unless the contract has its own fee override, which then wins.
- **Changing one wedding's fee:** "Ajustar" sets a per-contract override amount, or clears it to go back to the standard.
- **Where the override lives (my call):** in its own table keyed by contract id. Setting it doesn't change the contract's `version`, its PDF or its contract audit entries. It has its own audit entry, holding the contract id only.
- **Contract changes are followed automatically:**
  - when the wedding date changes, the fee moves to the new month;
  - when the photographer count drops below 2, the fee disappears;
  - when the contract is deleted, the fee disappears, and restoring it brings the fee back, override included.
- **Derived, not stored as expense rows (my call),** like fixed costs. Only the override is stored, on the contract.
- **Pre-weddings:** they get no automatic fee. A second photographer at a pre-wedding is a normal expense.

### 3.5 The Despesas tab

- **Tabs:** the Negócio page gets a **SegmentedControl** with Parcelas and Despesas. Its existing heading and contents become the Parcelas tab.
- **Month view (Despesas):**
  - **‹ month ›** navigation, starting on the current month, with "+ Nova despesa".
  - **Rows:** one per expense in the month, ordered by day then creation. Each row has the day, the description and the type.
    - Fixed costs are tagged **fixa**, and the second photographer's fee **automática**.
    - Transport rows show the linked couple, the distance and the time Pedro left home.
    - The amount is shown in BRL.
  - **Actions:** **Editar** for manual expenses, **Ajustar** for automatic fees, and **Gerenciar** for fixed costs (opens §3.3).
  - **Total:** "Total de <mês>: R$ x".
- **Configurações box:**
  - the fixed costs with their current prices, and **Gerenciar**;
  - the standard second-photographer fee, and **Alterar**;
  - **Tipos de despesa**.
- **Forms:** Nova despesa and Editar use one form, as in the mockup, opened as a dialog (my call). The trip fields appear only when the chosen type is Transporte.
  - **Event picker:** lists weddings and pre-weddings of contracts that aren't deleted. Events closest to the expense date come first (my call), each labelled "<casal> · casamento|pré-wedding dd/mm".
- **Future months (my call):**
  - Fixed costs and automatic fees appear in future months, so Pedro can see what's coming.
  - Rows dated after today are tagged **prevista**.
  - The total keeps them in. Piece 3 splits spent from upcoming using the date.
- **Empty month:** "Nenhuma despesa neste mês."

## 4. Constraints

- Follow the existing architecture and specs:
  - layered backend, new Alembic migration, RFC 9457 problems;
  - audit rules: append-only, same transaction, no personal data. Details hold ids, field names and months only, never description text;
  - Origin and JSON checks on writes;
  - the retro `ui/` layer with tokens only, WCAG 2.2 AA, CSP `default-src 'self'`, Portuguese UI, and tests that query by role, label and text.
- Money is integer centavos, distance is integer tenths of a km, and months are `YYYY-MM`.
- Descriptions are Pedro's own business notes, not client personal data, so they aren't encrypted. The UI hint says not to type CPFs or addresses there.
- Piece 3 must be able to ask the server for every expense, manual and derived, in a month range, each with its type, amount, date and (for transport) the trip fields. Provide that read path now, used by the Despesas tab.
  - Every entry has a stable id and a source (`manual`, `fixed` or `second_photographer`), so the UI can choose between Editar, Gerenciar and Ajustar. For example `fixed:<id>:<YYYY-MM>` or `fee:<contract_id>`; the format is the builder's choice.
  - The range is capped at 24 months (my call).
- Audit details may hold ids, months and field names. Like the existing service and instalment audit entries, they never hold amounts, names, addresses or description text.

## 5. Testing

- **Domain (unit):**
  - fixed-cost occurrences per month: start and end bounds, day 31 in February, 30-day months and leap years;
  - the price picked by `from_month`, and a backdated change;
  - the standard fee picked by month;
  - override precedence;
  - distance parsing (one decimal place, range).
- **API (integration):**
  - type CRUD, including the built-in transport and second-photographer types, which can't be archived;
  - manual expense create, edit and delete, with validation and the trip fields required only when linked;
  - linking to a deleted contract refused, while an existing link survives a later delete;
  - fixed-cost price change and stop, with past months unchanged;
  - fees following date changes, photographer count changes, deletion, restore and overrides;
  - the month listing merging all three sources in order with the right total;
  - audit details free of descriptions and names.
- **Migration:** creates the six types with the two internal keys.
- **Frontend (component):**
  - the month navigation and the tags;
  - the form showing trip fields only for Transporte and requiring them when an event is linked;
  - Ajustar, the fixed-cost price change from a month, and stopping;
  - managing types;
  - the Parcelas and Despesas tabs.
- **End to end:**
  - record a transport expense linked to a wedding and see it in the month;
  - set a fixed cost and a standard fee and see them appear;
  - change one wedding's fee;
  - axe and overflow checks on the Despesas tab in both themes.

## 6. Left to the builder

- API routes and shapes, and the table layout (as long as derived occurrences stay derived).
- The exact form layout within `ui/` components, and the transport kinds' internal values.
- How the event picker is fetched.
