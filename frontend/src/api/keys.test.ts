import { agendaKeys, contractKeys } from "./keys";

test("the agenda lives under the contracts key, so contract changes refresh it", () => {
  expect(agendaKeys.range("2026-10-01", "2026-10-31").slice(0, 1)).toEqual([...contractKeys.all]);
});
