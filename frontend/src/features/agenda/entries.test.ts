import { makeAgendaEntry } from "../../test/fixtures";
import { entryKey, entryLabel, groupByDate, kindLabel, timeLabel } from "./entries";

test("labels for kinds and times", () => {
  expect(kindLabel("wedding")).toBe("Casamento");
  expect(kindLabel("prewedding")).toBe("Pré-wedding");
  expect(timeLabel("16:00:00")).toBe("16:00");
  expect(timeLabel(null)).toBe("—");
});

test("an entry's accessible label names the couple, kind, time and place", () => {
  expect(entryLabel(makeAgendaEntry())).toBe("João & Ana, Casamento, às 16:00, Igreja Matriz");
  expect(
    entryLabel(
      makeAgendaEntry({ kind: "prewedding", start_time: null, venue_name: "Parque Barigui" }),
    ),
  ).toBe("João & Ana, Pré-wedding, sem horário, Parque Barigui");
  expect(
    entryLabel(makeAgendaEntry({ groom: { full_name: null }, bride: { full_name: null } })),
  ).toBe("Clientes anonimizados, Casamento, às 16:00, Igreja Matriz");
});

test("entries are grouped by date in the server's order", () => {
  const a = makeAgendaEntry({ date: "2026-10-16", contract_id: "a" });
  const b = makeAgendaEntry({ date: "2026-10-16", contract_id: "b", kind: "prewedding" });
  const c = makeAgendaEntry({ date: "2026-10-20", contract_id: "c" });
  expect(groupByDate([a, b, c])).toEqual([
    ["2026-10-16", [a, b]],
    ["2026-10-20", [c]],
  ]);
  expect(entryKey(b)).toBe("b:prewedding");
});
