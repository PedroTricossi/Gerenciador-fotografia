import {
  emptyPrewedding,
  isBlankPrewedding,
  preweddingButtonLabel,
  preweddingSummary,
  preweddingValues,
  toPreweddingRequest,
  validatePrewedding,
} from "./preweddingForm";

const SCHEDULED = {
  date: "2027-01-20",
  venue_name: "Parque Barigui",
  venue_address: null,
  start_time: "16:00:00",
  version: 3,
};

test("date and place are required, address and time are not", () => {
  expect(validatePrewedding(emptyPrewedding())).toEqual({
    date: "campo obrigatório",
    venue_name: "campo obrigatório",
  });
  expect(validatePrewedding({ ...emptyPrewedding(), date: "2027-01-20", venue_name: "X" })).toEqual(
    {},
  );
});

test("blank means every field is empty", () => {
  expect(isBlankPrewedding({ ...emptyPrewedding(), venue_address: "  " })).toBe(true);
  expect(isBlankPrewedding({ ...emptyPrewedding(), start_time: "10:00" })).toBe(false);
});

test("converts to and from the API", () => {
  expect(preweddingValues(SCHEDULED)).toEqual({
    date: "2027-01-20",
    venue_name: "Parque Barigui",
    venue_address: "",
    start_time: "16:00",
  });
  expect(
    toPreweddingRequest({
      date: "2027-01-20",
      venue_name: " Parque ",
      venue_address: " ",
      start_time: "",
    }),
  ).toEqual({ date: "2027-01-20", venue_name: "Parque", venue_address: null, start_time: null });
});

test("summary and button label", () => {
  expect(preweddingSummary(SCHEDULED)).toBe("20/01/2027 às 16:00 · Parque Barigui");
  expect(preweddingSummary({ ...SCHEDULED, start_time: null })).toBe("20/01/2027 · Parque Barigui");
  expect(preweddingButtonLabel(SCHEDULED)).toBe("Pré-wedding 20/01");
  expect(preweddingButtonLabel(null)).toBe("Agendar pré-wedding");
});
