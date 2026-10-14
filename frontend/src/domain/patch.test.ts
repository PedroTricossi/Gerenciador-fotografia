import { changedSections } from "./patch";

const base = {
  couple_address: "Rua A",
  event: { date: "2027-03-14", venue_address: null as string | null },
  payment: { items: [{ description: "Cerimônia", amount_cents: 1000 }] },
  photographer_count: 2,
};

test("nothing changed gives an empty patch", () => {
  expect(changedSections(base, structuredClone(base))).toEqual({});
});

test("a changed nested value sends its whole section", () => {
  const after = structuredClone(base);
  after.event.venue_address = "Rua B";
  expect(changedSections(base, after)).toEqual({
    event: { date: "2027-03-14", venue_address: "Rua B" },
  });
});

test("a changed list is sent whole", () => {
  const after = structuredClone(base);
  after.payment.items.push({ description: "Jantar", amount_cents: 500 });
  expect(changedSections(base, after)).toEqual({ payment: after.payment });
});

test("scalars and clearing to null count as changes", () => {
  const before = { ...base, event: { ...base.event, venue_address: "Rua B" } };
  const after = { ...base, photographer_count: 3 };
  expect(changedSections(before, after)).toEqual({
    event: { date: "2027-03-14", venue_address: null },
    photographer_count: 3,
  });
});
