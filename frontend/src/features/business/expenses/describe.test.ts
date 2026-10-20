import { makeExpenseEntry } from "../../../test/fixtures";
import { describe as describeEntry } from "./describe";

const part = { instalment_number: 2, instalment_count: 5 };

test("an instalment gets the parcela suffix after its description", () => {
  expect(describeEntry(makeExpenseEntry({ description: "Lente", ...part }))).toBe(
    "Lente · parcela 2/5",
  );
});

test("without a description the type name carries the suffix", () => {
  expect(describeEntry(makeExpenseEntry({ type_name: "Equipamento", ...part }))).toBe(
    "Equipamento · parcela 2/5",
  );
});

test("a linked trip ends with the suffix", () => {
  const label = describeEntry(
    makeExpenseEntry({
      transport_kind: "car",
      link_state: "contract_deleted",
      event_kind: "wedding",
      ...part,
    }),
  );
  expect(label.endsWith(" · parcela 2/5")).toBe(true);
});

test("null instalment fields leave the label unchanged", () => {
  expect(describeEntry(makeExpenseEntry({ description: "Lente" }))).toBe("Lente");
});
