import { filenameFromDisposition } from "./filename";

test.each([
  ['attachment; filename="contrato-ana-bruno-2027-03-14.pdf"', "contrato-ana-bruno-2027-03-14.pdf"],
  ["attachment; filename=contrato.pdf", "contrato.pdf"],
  ["attachment; filename*=UTF-8''contrato%20final.pdf", "contrato final.pdf"],
])("reads %j", (header, name) => {
  expect(filenameFromDisposition(header, "fallback.pdf")).toBe(name);
});

test.each([null, "", "attachment", 'attachment; filename=""', 'attachment; filename="../x/../.."'])(
  "falls back for %j",
  (header) => {
    expect(filenameFromDisposition(header, "fallback.pdf")).toBe("fallback.pdf");
  },
);

test("strips any folder part a header might carry", () => {
  expect(filenameFromDisposition('attachment; filename="a/b\\\\c.pdf"', "f.pdf")).toBe("c.pdf");
});
