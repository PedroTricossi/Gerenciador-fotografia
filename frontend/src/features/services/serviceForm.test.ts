import { makeService } from "../../test/fixtures";
import {
  emptyServiceValues,
  serviceValues,
  toServiceRequest,
  validateService,
} from "./serviceForm";

test("starts empty, or from a service", () => {
  expect(emptyServiceValues()).toEqual({ name: "", price: "", isPrewedding: false });
  expect(serviceValues(makeService({ is_prewedding: true }))).toEqual({
    name: "Cobertura da cerimônia na igreja",
    price: "1.200,00",
    isPrewedding: true,
  });
});

test("checks the name and the price like the API", () => {
  expect(validateService({ name: " ", price: "", isPrewedding: false })).toEqual({
    name: "campo obrigatório",
    default_price_cents: "campo obrigatório",
  });
  expect(validateService({ name: "x".repeat(201), price: "0", isPrewedding: false })).toEqual({
    name: "máximo de 200 caracteres",
    default_price_cents: "o valor deve ser maior que zero",
  });
  expect(validateService({ name: "Álbum", price: "1.500", isPrewedding: true })).toEqual({});
});

test("builds the request with a trimmed name and cents", () => {
  expect(toServiceRequest({ name: "  Álbum ", price: "1.500,50", isPrewedding: true })).toEqual({
    name: "Álbum",
    default_price_cents: 150050,
    is_prewedding: true,
  });
});
