import { coupleLabel } from "./names";

test("joins the first names", () => {
  expect(coupleLabel({ full_name: "Bruno Costa" }, { full_name: "  Ana  Lima " })).toBe(
    "Bruno & Ana",
  );
});

test("names an anonymised person without inventing a name", () => {
  expect(coupleLabel({ full_name: null }, { full_name: "Ana Lima" })).toBe(
    "Cliente anonimizado & Ana",
  );
  expect(coupleLabel({ full_name: null }, { full_name: null })).toBe("Clientes anonimizados");
});
