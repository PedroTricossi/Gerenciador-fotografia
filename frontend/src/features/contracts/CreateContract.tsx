import { useState } from "react";
import { useNavigate } from "react-router";
import { downloadContractPdf, useCreateContract } from "../../api/contracts";
import { todayIso } from "../../domain/dates";
import { PageLayout, useToast } from "../../ui";
import { ContractForm } from "./ContractForm";
import { type ContractFormValues, defaultValues, formTotal, toRequest } from "./formModel";
import { PDF_AFTER_SAVE_FAILED } from "./messages";

export function CreateContract() {
  const navigate = useNavigate();
  const notify = useToast();
  const create = useCreateContract();
  const [initialValues] = useState(() => defaultValues(todayIso()));

  const submit = async (values: ContractFormValues) => {
    // A 422 propagates to the form; other failures are toasted by the query client.
    // Interim single-instalment plan for the current month; Task 5 replaces it with the plan form.
    const plan = [{ month: todayIso().slice(0, 7), amount_cents: formTotal(values) ?? 0 }];
    const contract = await create.mutateAsync({ ...toRequest(values), instalments: plan });
    try {
      await downloadContractPdf(contract.id);
      notify("Contrato salvo");
    } catch {
      notify(PDF_AFTER_SAVE_FAILED, { tone: "error" });
    }
    navigate(`/contratos/${contract.id}`, { replace: true });
  };

  return (
    <PageLayout title="Novo contrato">
      <ContractForm initialValues={initialValues} onSubmit={submit} />
    </PageLayout>
  );
}
