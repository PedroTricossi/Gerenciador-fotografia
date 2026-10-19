import { type FormEvent, useState } from "react";
import { useTransportGuide } from "../../../api/overview";
import { formatIsoDate } from "../../../domain/dates";
import { formatKm, parseKm, transportKindLabel } from "../../../domain/expenses";
import { formatBrl } from "../../../domain/money";
import { Banner, Button, Field, FormSection, Loading, TextInput } from "../../../ui";
import styles from "./TransportGuide.module.css";

type Submitted = { tenths: number; leftHomeAt?: string };

export function TransportGuide() {
  const [distance, setDistance] = useState("");
  const [leftHome, setLeftHome] = useState("");
  const [error, setError] = useState<string>();
  const [submitted, setSubmitted] = useState<Submitted>();

  const base = useTransportGuide();
  const estimate = useTransportGuide(submitted?.tenths, submitted?.leftHomeAt);
  const guide = base.data;

  function submit(event: FormEvent) {
    event.preventDefault();
    const tenths = parseKm(distance);
    if (tenths === null) {
      setError("distância inválida");
      return;
    }
    setError(undefined);
    setSubmitted({ tenths, leftHomeAt: leftHome === "" ? undefined : leftHome });
  }

  if (!guide) return null;
  if (guide.trips_total === 0) {
    return (
      <FormSection title="Guia de transporte">
        <p className={styles.line}>
          Registre o transporte dos casamentos em Despesas para ver o guia.
        </p>
      </FormSection>
    );
  }

  const result = submitted ? estimate.data : undefined;
  const isNight = (time: string) => time >= "18:00";
  const perKind = guide.per_km_by_kind
    .map((item) => `${transportKindLabel(item.transport_kind)} ${formatBrl(item.cents_per_km)}/km`)
    .join(" · ");
  const hasDayNight = guide.day_cents_per_km != null && guide.night_cents_per_km != null;

  return (
    <FormSection title="Guia de transporte">
      <form className={styles.form} onSubmit={submit} noValidate>
        <Field label="Distância (km)" error={error} size="short">
          {(control) => (
            <TextInput
              {...control}
              inputMode="decimal"
              value={distance}
              onChange={(event) => setDistance(event.target.value)}
            />
          )}
        </Field>
        <Field label="Saída de casa" size="short">
          {(control) => (
            <TextInput
              {...control}
              type="time"
              value={leftHome}
              onChange={(event) => setLeftHome(event.target.value)}
            />
          )}
        </Field>
        <Button type="submit" variant="primary">
          Ver estimativa
        </Button>
      </form>
      <div className={styles.lines}>
        {perKind && <p className={styles.line}>{perKind}</p>}
        {hasDayNight && (
          <p className={styles.line}>
            {`Dia ${formatBrl(guide.day_cents_per_km!)}/km · Noite ${formatBrl(guide.night_cents_per_km!)}/km`}
          </p>
        )}
        {submitted && estimate.isPending && <Loading />}
        {submitted && estimate.isError && (
          <Banner tone="error">Não foi possível carregar a estimativa.</Banner>
        )}
        {result &&
          (result.typical_cents != null ? (
            <p className={styles.line}>
              {`Viagens parecidas: ${result.similar.length} · custo típico ${formatBrl(result.typical_cents)} (de ${formatBrl(result.min_cents ?? result.typical_cents)} a ${formatBrl(result.max_cents ?? result.typical_cents)})`}
            </p>
          ) : (
            <p className={styles.line}>Poucas viagens registradas ainda</p>
          ))}
      </div>
      {result && result.similar.length > 0 && (
        <ul className={styles.trips} aria-label="Viagens parecidas">
          {result.similar.map((trip) => (
            <li
              key={`${trip.contract_id}-${trip.event_kind}-${trip.date}-${trip.cost_cents}`}
              className={styles.trip}
            >
              {[
                formatIsoDate(trip.date),
                trip.contract_deleted
                  ? "(contrato excluído)"
                  : [trip.groom_name, trip.bride_name].filter(Boolean).join(" & "),
                formatKm(trip.distance_tenths),
                trip.left_home_at ? `saí ${trip.left_home_at}` : null,
                trip.transport_kind ? transportKindLabel(trip.transport_kind) : null,
                formatBrl(trip.cost_cents),
                submitted?.leftHomeAt &&
                trip.left_home_at &&
                isNight(trip.left_home_at) !== isNight(submitted.leftHomeAt)
                  ? isNight(trip.left_home_at)
                    ? "noite"
                    : "dia"
                  : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}
