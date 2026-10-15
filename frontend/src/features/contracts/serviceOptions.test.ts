import { IDS, SERVICES, makeService } from "../../test/fixtures";
import { serviceOptions } from "./serviceOptions";

test("lists active services by their current names", () => {
  expect(serviceOptions(SERVICES, []).map((o) => o.label)).toEqual([
    "Cobertura da cerimônia na igreja",
    "Diária segundo fotógrafo",
    "Ensaio de pré-wedding",
  ]);
});

test("an item already on the contract keeps its wording, archived ones are marked", () => {
  const renamed = SERVICES.map((s) =>
    s.id === IDS.serviceCeremony ? makeService({ name: "Cerimônia (novo nome)" }) : s,
  );
  const options = serviceOptions(renamed, [
    { service_id: IDS.serviceCeremony, description: "Cobertura da cerimônia na igreja" },
    { service_id: IDS.serviceArchived, description: "Álbum antigo" },
  ]);
  expect(options.map((o) => o.label)).toEqual([
    "Álbum antigo (arquivado)",
    "Cobertura da cerimônia na igreja",
    "Diária segundo fotógrafo",
    "Ensaio de pré-wedding",
  ]);
  expect(options[0]).toEqual({
    id: IDS.serviceArchived,
    label: "Álbum antigo (arquivado)",
    defaultPriceCents: 30000,
  });
});
