import { saveBlob } from "./download";

test("saveBlob clicks a temporary download link and revokes its URL", () => {
  const clicked: HTMLAnchorElement[] = [];
  const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    clicked.push(this);
  });

  saveBlob(new Blob(["%PDF"], { type: "application/pdf" }), "contrato.pdf");

  expect(click).toHaveBeenCalledOnce();
  expect(clicked[0]!.download).toBe("contrato.pdf");
  expect(clicked[0]!.href).toBe("blob:test");
  expect(clicked[0]!.isConnected).toBe(false);
  expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:test");
});
