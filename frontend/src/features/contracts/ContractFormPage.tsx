import { CreateContract } from "./CreateContract";
import { EditContract } from "./EditContract";

export function ContractFormPage({ id }: { id?: string }) {
  return id === undefined ? <CreateContract /> : <EditContract id={id} />;
}
