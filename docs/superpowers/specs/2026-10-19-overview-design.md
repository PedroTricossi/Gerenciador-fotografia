# Business Overview — Design

Date: 2026-10-19
Status: awaiting review
Branch: `feat/overview` (from `main`, which now has pieces 1 and 2)

## 1. Purpose

This is piece 3 of 3 of the business area:
1. **Instalments:** PR #16, merged.
2. **Expenses:** PR #17, merged.
3. **Overview:** this spec. It covers the Resumo and Extrato tabs and the transport price guide.

Pedro has to make calls like "can I buy an SD card now, or should I pay in instalments too, given what my couples still owe me?" To make them he needs three things:
- how much money is **free** right now;
- where the money that came in **went**;
- how much will **come in and go out** in the next months.

Pedro also wants to start charging transport properly. The trips he records (distance, kind of transport, time he left home, cost) should tell him what a trip of a given distance usually costs.

### Success criteria

- **Resumo** shows, for a month or a year:
  - what came in, what went out, and what was left free;
  - a bar where 100% is everything that came in. Each expense type is a coloured slice with its % and amount, and the rest is the "Livre" slice.
- **Free today:** Resumo shows everything that has come in minus everything that has gone out, since the platform started.
- **Próximos meses:** Resumo shows, per coming month, what's due to come in, what's due to go out, and a projected free balance carried from month to month.
- **Extrato** lists every received instalment and every expense of a month or a year by day, like a bank statement, with a running free balance.
- **Guia de transporte:** for a distance and a departure time Pedro types, it shows what similar past trips cost, cost per km by kind of transport, the day/night difference, and the trips the estimate came from.

### Non-goals

- A starting bank balance. Pedro said the platform starts at zero because all his active contracts are in it.
- A purchase simulator, where Pedro would type in a planned purchase to see its effect. Pedro said seeing the months as they are is enough.
- Online maps or distance lookup. The platform stays offline.
- Budgets, goals, alerts, exports, and charts other than the one bar.
- Suggesting a full price for a contract. The guide is about transport only.

### Anti-goals

- **Counting a promise as money:** an unpaid instalment or a future-dated expense counted in "Entrou", "Saiu" or "Livre hoje".
- **Numbers that disagree:** Resumo, Extrato and Despesas disagreeing about the same month.
- **A confident guess from too little data:** showing an estimate from one or two trips as if it were reliable.
- **Colour as the only signal:** a slice told apart by colour alone (WCAG 2.2 AA).

## 2. Pedro's decisions

- **Starting amount:** zero. "Livre hoje" is every instalment marked paid minus every expense up to today, from the first record on.
- **The bar:** 100% is everything that came in. Each kind of expense has its own colour, and the rest is free.
- **Periods:** like budgeting apps. Resumo opens on the current month, with ‹ month › arrows and a Mês / Ano switch.
- **Extrato:** a bank-style statement, with every instalment received and every expense by day and the free balance running alongside.
- **Mockup:** approved as shown ("It is perfect"). Its content is in `.superpowers/brainstorm/44206-1792428033/content/overview.html`.
- **No purchase simulator.**
- **Price guide:** approved as proposed. All the transport linked to one wedding (or pre-wedding) is added up and counted as one trip.

## 3. Behaviour

### 3.1 Tabs

- **Tabs:** the Negócio page's SegmentedControl ("Área") grows from Parcelas | Despesas to **Parcelas | Despesas | Resumo | Extrato**.
- **URL:** the chosen tab goes in the URL as `?aba=resumo` or `?aba=extrato`. Parcelas stays the default.

### 3.2 What counts, and when

**Money in**
- An instalment counts as money in on its `paid_on` date, for its amount.
- Instalments that aren't paid never count as money in.
- **Cash basis:** money in is keyed on `paid_on`, not on the instalment's due month. An instalment due in September and paid on 3 October is October money in, and it's no longer late.
- **`paid_on` after today (my call):** marking paid allows any date, and the UI sends today. An instalment paid with a future date counts from that date. Until then it shows in Próximos meses under A receber for its `paid_on` month, so it never vanishes.
- **Which instalments count:** contracts have no "cancelled" state, only deletion. The same filter as the Parcelas list applies, and `plan_needs_review` doesn't change anything here.

**Money out**
- Every expense entry from the existing read path (`/expense-entries`) counts as money out on its date: manual, fixed and second-photographer.
- Per-type sums group by the entry's `type_id`, so every automatic fee falls in the 2º fotógrafo slice.
- Entries flagged `missing_amount` count as R$ 0. Resumo shows a note: "Há N casamento(s) com 2º fotógrafo sem valor definido".

**Only up to today (my call)**
- "Entrou", "Saiu", the bar and Extrato count only money in and money out dated **on or before today**.
- Rows dated after today (the "prevista" ones in Despesas) belong to "Próximos meses", not to the period's totals.
- **Period entirely after today:** Resumo and Extrato say "Este período ainda não começou — veja Próximos meses."
- **Year view:** the year in progress counts up to today.

**Deleted contracts (my call)**
- An instalment that was paid on a contract later deleted still counts, because the money really arrived. In Extrato it shows "(contrato excluído)" without the couple's names, like dangling expenses.
- Unpaid instalments of deleted contracts never count anywhere.

**Today:** "today" is the browser's local date, as in pieces 1 and 2.

### 3.3 Resumo

- **Controls:** the period controls work like Despesas: ‹ month › arrows starting on the current month, plus a **Mês / Ano** switch. In Ano, the arrows move by year and the heading is "2026".
- **Totals:** three for the period: **Entrou**, **Saiu**, and **Livre no mês** (or **Livre no ano**), which is Entrou − Saiu.
- **The bar ("Para onde foi o que entrou"):**
  - One slice per expense type with money out in the period, sized by its share of Entrou. The remaining **Livre** slice fills the rest.
  - The order is largest first, with Livre last.
  - **Legend:** each slice has a legend line with a swatch, the type name, the % with one decimal place, and the amount. The legend carries the information, so colour is never the only signal.
  - **Colours:**
    - Each type keeps the same colour in every period. The colour follows the type, not its rank.
    - Colours are drawn from a fixed categorical order defined with `ui/` tokens, in both themes. They are validated for contrast and colour-blind separation.
    - Livre uses a neutral token.
    - **Colour assignment (my call):** each type takes the palette slot given by its position in creation order, counting every type including archived ones. The palette has 8 slots. Types from the 9th on share one "Outros" colour and are merged into one "Outros" slice. No migration is needed.
  - **When Saiu > Entrou**, including Entrou = 0 with some money out:
    - the bar is replaced by "Saiu mais do que entrou neste período: R$ x a mais", in the warning style with an icon;
    - the per-type amounts are listed without percentages (my call).
  - **When nothing happened:** "Nada entrou ou saiu neste período."
- **Livre hoje:** one figure, independent of the chosen period. It is all money in minus all money out on or before today. When negative, it uses the warning style.
- **Próximos meses:**
  - Independent of the chosen period.
  - The first row is the rest of the current month ("resto de outubro"). Then one row per month, for the next 3 months or up to the last month that still has an unpaid instalment, whichever is later, capped at 24 months (my call).
  - Columns:
    - **A receber:** unpaid instalments due that month. For the current month, unpaid ones due this month.
    - **A pagar:** expense entries dated that month. For the current month, those dated after today.
    - **Livre previsto:** carried forward from Livre hoje.
  - **Late instalments** (unpaid, month before the current one) aren't counted in A receber. A note under the table says "Parcelas atrasadas não contadas: R$ x", with a link to Parcelas (my call).
  - Footnote: "A receber = parcelas não pagas do mês · A pagar = despesas fixas, 2º fotógrafo e despesas lançadas com data futura."
- **Guia de transporte:** at the bottom of Resumo (my call). See §3.5.

### 3.4 Extrato

- **Controls:** the same period controls as Resumo, kept separately from it.
- **Opening row:** "Saldo anterior", the free balance at the end of the day before the period starts.
- **Rows:** one per paid instalment and one per expense entry in the period, up to today, ordered by date. Within a day, money in comes first, then money out in the Despesas order.
- **Columns:**
  - **Dia:** the day only in month view; "dd/mm" in year view.
  - **Descrição:**
    - for an instalment: "Parcela n/N · <casal>";
    - for an expense: the same text the Despesas tab shows, with its tags.
  - **Entrada** or **Saída.**
  - **Livre:** the running balance.
- **Footer:** "Entrou R$ x · Saiu R$ y".
- **Year view:** one long list with a month heading row between months (my call).

### 3.5 Guia de transporte

**The data: one trip per event**
- All transport-type manual expenses linked to the same event (contract + wedding or pre-wedding) make **one trip**. The cost is the sum of their amounts.
- **Distance:** the largest `distance_tenths` among the legs, i.e. the one-way distance (my call).
- **Departure time:** the earliest `left_home_at`.
- **Kind:** the kind of the leg with the earliest departure (my call).
- **Included:** legs dated on or before today, whatever happened to the contract since. The money was spent, and only the trip facts are used. A trip's cost sums only those legs (my call).
- **Missing distances:** a leg with no distance still adds its cost. A trip where no leg has a distance is left out of the guide (my call).
- **Excluded:** unlinked transport expenses. They have no distance.

**Input:** "Distância (km)" (same parsing as the expense form) and "Saída de casa" (`HH:MM`, optional).

**Result**
- **Similar trips:** trips within ±15 km, or ±25% of the typed distance, whichever is larger (my call).
- **When there are 3 or more:** "Viagens parecidas: N · custo típico R$ x (de R$ min a R$ max)". The typical cost is the median.
- **When there are fewer than 3:** "Poucas viagens registradas ainda" plus the ones that exist, and no typical cost.
- **Cost per km by kind of transport:** "Carro R$ 2,10/km · App (Uber/99) R$ 2,70/km". It is the median of cost ÷ distance over all trips of that kind, shown only for kinds with 3 or more trips. Distance here is the one-way distance, so the figure is per one-way km.
- **Day and night:**
  - A trip is **night** when its departure is at 18:00 or later, and **day** otherwise (my call). Trips with no departure time are left out of this part.
  - With 3 or more trips on each side, show the median cost per km for each: "Dia R$ 2,20/km · Noite R$ 2,90/km". Otherwise show nothing.
  - When a departure time is typed, the "similar trips" list prefers same-period trips. It doesn't exclude the others; it marks them (my call).
- **The trips behind it:** a list of the similar trips, with date, couple (or "(contrato excluído)"), km, departure time, kind and cost.

**Before any trip is recorded:** "Registre o transporte dos casamentos em Despesas para ver o guia."

### 3.6 Read path

Provide one server read for the overview, so Resumo and Extrato agree with Despesas by construction. It reuses the expense-entries logic and the instalments table, and the server computes all sums.

Given a period, plus "today" passed by the client because the client owns the local date, it returns the items below. The server checks only that "today" is a valid date (my call).
- the period totals and per-type money out;
- the Extrato rows and the opening balance;
- Livre hoje;
- the Próximos meses rows and the late total.

The guide gets its own read, either taking distance and departure time or returning all trips for the client to filter. That choice is the builder's.

## 4. Constraints

- All existing rules hold:
  - layered backend, RFC 9457 problems, money in integer centavos, months `YYYY-MM`;
  - no new tables unless needed. This piece is read-only, so no migration and no new audit actions are expected;
  - the retro `ui/` layer with tokens only and feature CSS for layout only;
  - WCAG 2.2 AA; CSP `default-src 'self'`; no chart library from a CDN;
  - Portuguese UI; tests query by role, label and text.
- **The bar:** plain HTML/CSS (or inline SVG) with a 2px surface gap between slices and a text legend. It needs an accessible name, and it has a table-like text alternative: the legend.
- **Colours:** the categorical colours come from new `ui/` tokens for light and dark. They must pass a contrast and colour-blind separation check, run with the palette validator from the dataviz guidance before shipping.
- **Privacy:** couple names appear only as the existing screens show them (`groom_name`/`bride_name`, null when anonymised). Nothing new is logged.
- **Performance:** a year view and Próximos meses should load in one request each, with no per-row requests.

## 5. Testing

- **Domain and service:**
  - **Totals:** Entrou, Saiu and per-type sums for a month and a year.
  - **Up to today:** only counted on or before today; a future period gives the "not started" state.
  - **Deleted contracts:** a paid instalment on a deleted contract counts; an unpaid one never does.
  - **Opening balance and running balance** across a month boundary.
  - **Próximos meses:**
    - rest of the current month;
    - the horizon of 3 months or the last unpaid month, with the 24-month cap;
    - late instalments left out and totalled.
  - **Missing-amount fees:** counted as 0 and counted in the note.
  - **Guide:**
    - grouping legs into one trip, with sum, max distance and earliest departure;
    - the similarity window;
    - median and min/max;
    - per-kind and day/night medians with the 3-trip threshold;
    - unlinked transport left out.
- **API:** shapes, validation of the period and "today", and agreement with `/expense-entries` for the same month (one test sums both).
- **Frontend (component):**
  - the four tabs and the URL;
  - period controls and Mês/Ano;
  - the three totals;
  - the bar's slices and legend;
  - the "saiu mais" state;
  - Livre hoje, including negative;
  - Próximos meses with the late note;
  - Extrato rows, the opening balance, the running balance and year headings;
  - the guide's empty, few and normal states.
- **End to end:**
  - mark an instalment paid and add an expense, then see Resumo and Extrato agree;
  - add two linked legs and see one trip in the guide;
  - axe and overflow on Resumo and Extrato in both themes at 1280 and 400px.

## 6. Left to the builder

- API routes and shapes; whether the guide filters on the server or the client.
- How the tab components are split, and the exact layout within `ui/`.
- The palette's token names and the exact steps, as long as they pass the validator.
