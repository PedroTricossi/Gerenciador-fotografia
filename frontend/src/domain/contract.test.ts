import { discountError, subtotalCents, totalCents } from "./contract";

const DISCOUNT_MESSAGE = "o desconto deve ser maior que zero e menor que a soma dos itens";

test("subtotal adds every amount", () => {
  expect(subtotalCents([50000, 120000, 60000])).toBe(230000);
});

test.each([[[50000, null]], [[50000, Number.NaN]], [[0]], [[-1]], [[]]])(
  "subtotal is unknown for %j",
  (amounts) => {
    expect(subtotalCents(amounts)).toBeNull();
  },
);

test("total subtracts a valid discount", () => {
  expect(totalCents([50000, 120000, 60000], 30000)).toBe(200000);
  expect(totalCents([50000], null)).toBe(50000);
});

test.each([0, -1, 50000, 60000, Number.NaN])("discount %d on R$ 500,00 is refused", (discount) => {
  expect(discountError([50000], discount)).toBe(DISCOUNT_MESSAGE);
  expect(totalCents([50000], discount)).toBeNull();
});

test("no discount and a discount below the sum are fine", () => {
  expect(discountError([50000], null)).toBeNull();
  expect(discountError([50000], 49999)).toBeNull();
});

test("the discount is not judged while the items are incomplete", () => {
  expect(discountError([null], 30000)).toBeNull();
});
