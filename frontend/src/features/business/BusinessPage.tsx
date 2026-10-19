import { useSearchParams } from "react-router";
import { PageLayout, SegmentedControl } from "../../ui";
import styles from "./BusinessPage.module.css";
import { InstalmentsTab } from "./InstalmentsTab";
import { ExpensesTab } from "./expenses/ExpensesTab";

type Tab = "parcelas" | "despesas";

const TABS = [
  { value: "parcelas", label: "Parcelas" },
  { value: "despesas", label: "Despesas" },
] as const;

export function BusinessPage() {
  const [params, setParams] = useSearchParams();
  const tab: Tab = params.get("aba") === "despesas" ? "despesas" : "parcelas";

  return (
    <PageLayout title="Negócio">
      <div className={styles.tabs}>
        <SegmentedControl
          label="Seção"
          options={TABS}
          value={tab}
          onChange={(next) => setParams(next === "parcelas" ? {} : { aba: next })}
        />
      </div>
      {tab === "parcelas" ? <InstalmentsTab /> : <ExpensesTab />}
    </PageLayout>
  );
}
