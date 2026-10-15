import type { ReactNode } from "react";
import { Banner, Button, ConfirmDialog } from "../../ui";
import styles from "./ContractForm.module.css";
import type { ContractFormValues } from "./formModel";
import { CoupleSection } from "./sections/CoupleSection";
import { EventSection } from "./sections/EventSection";
import type { SavedItem } from "./serviceOptions";
import type { PreweddingOut } from "../../api/client";
import { PaymentSection } from "./sections/PaymentSection";
import { PreweddingSection } from "./sections/PreweddingSection";
import { PhotographersSection } from "./sections/PhotographersSection";
import { SigningSection } from "./sections/SigningSection";
import { useContractForm } from "./useContractForm";
import { useUnsavedChangesGuard } from "./useUnsavedChangesGuard";

type Props = {
  initialValues: ContractFormValues;
  onSubmit: (values: ContractFormValues) => Promise<void>;
  readOnly?: boolean;
  /** Items the contract already has, so their services stay selectable even if archived. */
  savedItems?: SavedItem[];
  requireChanges?: boolean;
  /** Absent while creating. When editing, the stored pre-wedding, shown read-only. */
  prewedding?: PreweddingOut | null;
  actions?: (state: { hasChanges: boolean }) => ReactNode;
};

export function ContractForm({
  initialValues,
  onSubmit,
  readOnly = false,
  savedItems = [],
  requireChanges = false,
  prewedding,
  actions,
}: Props) {
  const state = useContractForm(initialValues, onSubmit);
  const { form } = state;
  const submitting = form.formState.isSubmitting;
  // While a save runs, its own navigation (create -> edit page) must not be blocked.
  const guard = useUnsavedChangesGuard(!readOnly && state.hasChanges && !submitting);

  return (
    <form noValidate onSubmit={(event) => void state.onSubmit(event)}>
      {state.serverMessages.length > 0 && (
        <Banner tone="error">
          <p>O servidor recusou o contrato:</p>
          <ul>
            {state.serverMessages.map((message, index) => (
              <li key={index}>{message}</li>
            ))}
          </ul>
        </Banner>
      )}
      <CoupleSection form={form} disabled={readOnly} />
      <EventSection form={form} disabled={readOnly} />
      <PhotographersSection form={form} disabled={readOnly} />
      <PaymentSection state={state} disabled={readOnly} savedItems={savedItems} />
      <PreweddingSection state={state} disabled={readOnly} summary={prewedding} />
      <SigningSection form={form} disabled={readOnly} />
      {!readOnly && (
        <div className={styles.actions}>
          <Button
            type="submit"
            variant="primary"
            busy={submitting}
            disabled={requireChanges && !state.hasChanges}
          >
            Salvar
          </Button>
          {actions?.({ hasChanges: state.hasChanges })}
        </div>
      )}
      <ConfirmDialog
        open={guard.blocked}
        title="Descartar alterações?"
        confirmLabel="Sair sem salvar"
        tone="danger"
        onConfirm={guard.leave}
        onCancel={guard.stay}
      >
        <p>Você tem alterações não salvas neste contrato.</p>
      </ConfirmDialog>
    </form>
  );
}
