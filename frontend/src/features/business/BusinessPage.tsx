import { useSearchParams } from "react-router";
import { PageLayout, SegmentedControl } from "../../ui";
import styles from "./BusinessPage.module.css";
import { InstalmentsTab } from "./InstalmentsTab";
import { ExpensesTab } from "./expenses/ExpensesTab";
import { ExtratoTab } from "./overview/ExtratoTab";
import { ResumoTab } from "./overview/ResumoTab";

type Tab = "parcelas" | "despesas" | "resumo" | "extrato";

const TABS = [
  { value: "parcelas", label: "Parcelas" },
  { value: "despesas", label: "Despesas" },
  { value: "resumo", label: "Resumo" },
  { value: "extrato", label: "Extrato" },
] as const;

export function BusinessPage() {
  const [params, setParams] = useSearchParams();
  const aba = params.get("aba");
  const tab: Tab = TABS.some((t) => t.value === aba) ? (aba as Tab) : "parcelas";

  return (
    <PageLayout title="Negócio">
      <div className={styles.tabs}>
        <SegmentedControl
          label="Área"
          options={TABS}
          value={tab}
          onChange={(next) => setParams(next === "parcelas" ? {} : { aba: next })}
        />
      </div>
      {tab === "parcelas" && <InstalmentsTab />}
      {tab === "despesas" && <ExpensesTab />}
      {tab === "resumo" && <ResumoTab />}
      {tab === "extrato" && <ExtratoTab />}
    </PageLayout>
  );
}
