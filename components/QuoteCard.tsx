/**
 * Renders straight from `cotizar_consulta`'s tool output (PRD Anexo C rule
 * 4 / guia-construccion.md Parte 2 rule 4: "La tarjeta de cotización se
 * renderiza desde la salida de la herramienta, nunca parseando el texto del
 * modelo"). Purely presentational — no fetching, no state.
 *
 * Each hospital is one radio-style row with a single prominent number (what
 * the patient pays); states are said in words, and the breakdown is a
 * sentence shown only for the recommended or chosen option.
 */
import { Check, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { CotizarConsultaOutput, OpcionCotizacion } from "@/lib/agent/tools";
import { computeEffectiveBreakdown } from "@/lib/domain/effective-breakdown";
import { carenciaLabel, optionStatusLines, type StatusTone } from "@/lib/format/marks";
import { formatMoney } from "@/lib/format/money";

function especialidadLabel(especialidad: string): string {
  const withSpaces = especialidad.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

const STATUS_TONE_CLASS: Record<StatusTone, string> = {
  recommended: "font-medium text-brand",
  danger: "text-destructive",
  muted: "text-muted-foreground",
};

function StatusLines({ opcion, isRecommended }: { opcion: OpcionCotizacion; isRecommended: boolean }) {
  return optionStatusLines(opcion.marcas, isRecommended).map((line) => (
    <span key={line.text} className={"text-[13px] " + STATUS_TONE_CLASS[line.tone]}>
      {line.text}
    </span>
  ));
}

function Breakdown({ opcion }: { opcion: OpcionCotizacion }) {
  // Components actually charged (capped to total_paciente), never the raw bruto parts.
  const effective = computeEffectiveBreakdown(opcion);
  const parts = [
    effective.aDeducible > 0 ? `${formatMoney(effective.aDeducible)} van a tu deducible` : null,
    effective.coaseguro > 0 ? `${formatMoney(effective.coaseguro)} de coaseguro` : null,
    effective.copagoFijo > 0 ? `${formatMoney(effective.copagoFijo)} de copago fijo` : null,
  ].filter((p): p is string => p !== null);

  return (
    <p className="pt-1.5 text-[13px] leading-relaxed text-muted-foreground tabular-nums">
      La consulta cuesta {formatMoney(opcion.precio)}.
      {parts.length > 0 && ` Pagas ${parts.join(", ")}.`}{" "}
      {opcion.total_aseguradora > 0 ? (
        <span className="text-foreground">Tu seguro pone {formatMoney(opcion.total_aseguradora)}.</span>
      ) : (
        <span className="text-foreground">Tu seguro no cubre esta consulta.</span>
      )}
    </p>
  );
}

interface OptionRowProps {
  opcion: OpcionCotizacion;
  isRecommended: boolean;
  isSelected: boolean;
  onSelect?: (hospital: string) => void;
  selecting?: boolean;
  selectionLocked?: boolean;
}

function OptionRow({ opcion, isRecommended, isSelected, onSelect, selecting, selectionLocked }: OptionRowProps) {
  const outOfNetwork = opcion.marcas.includes("fuera_de_red");
  const interactive = !!onSelect && !selectionLocked;
  const showBreakdown = isSelected || (isRecommended && !isSelected);

  const content = (
    <>
      {onSelect && (
        <span className="pt-0.5" aria-hidden="true">
          {isSelected ? (
            <span className="flex size-5 items-center justify-center rounded-full bg-brand">
              <Check className="size-3 text-primary-foreground" strokeWidth={3} />
            </span>
          ) : (
            <span className="block size-5 rounded-full border-[1.5px] border-border bg-card" />
          )}
        </span>
      )}
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-medium">{opcion.hospital}</span>
        <StatusLines opcion={opcion} isRecommended={isRecommended} />
        <span className="text-[13px] text-muted-foreground">
          Tier {opcion.tier} · {opcion.zona}
        </span>
        {showBreakdown && <Breakdown opcion={opcion} />}
      </span>
      <span className="flex flex-col items-end gap-0.5">
        <span
          className={
            "text-[22px] leading-none font-semibold tracking-tight tabular-nums " +
            (outOfNetwork ? "text-muted-foreground" : "text-foreground")
          }
        >
          {formatMoney(opcion.total_paciente)}
        </span>
        <span className="text-xs text-muted-foreground">{selecting ? "eligiendo…" : "pagas tú"}</span>
      </span>
    </>
  );

  const className =
    "flex w-full items-start gap-3.5 rounded-2xl bg-card px-4.5 py-3.5 text-left transition-shadow " +
    (isSelected ? "ring-[1.5px] ring-brand" : "shadow-soft") +
    (interactive ? " cursor-pointer hover:ring-1 hover:ring-brand/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none" : "");

  if (!onSelect) {
    return <div className={className}>{content}</div>;
  }

  return (
    <button
      type="button"
      role="radio"
      aria-checked={isSelected}
      aria-label={`${opcion.hospital}, pagas ${formatMoney(opcion.total_paciente)}`}
      disabled={selecting || selectionLocked}
      onClick={() => onSelect(opcion.hospital)}
      className={className + " disabled:cursor-default"}
    >
      {content}
    </button>
  );
}

const ERROR_TITLES: Record<string, string> = {
  POLIZA_INACTIVA: "Póliza inactiva",
  // Internal ordering-enforcement errors: the model normally self-corrects within the turn.
  FALTA_BUSCAR_ESPECIALIDAD: "Falta un paso previo",
  SIN_ESPECIALIDAD_CONFIRMADA: "Falta confirmar el síntoma",
};

export interface QuoteCardProps {
  quote: CotizarConsultaOutput;
  /** Hospital currently chosen for this quote, or `null`/`undefined` if none yet. */
  seleccion?: string | null;
  /** Once "cerrada", selection can no longer be changed (see POST /api/quote/close). */
  estado?: "abierta" | "cerrada";
  /** Presence of this prop makes the rows selectable — omit it for a read-only historical quote. */
  onSelect?: (hospital: string) => void;
  /** Hospital currently being selected (all rows disable meanwhile). */
  selectingHospital?: string | null;
}

export function QuoteCard({ quote, seleccion, estado, onSelect, selectingHospital }: QuoteCardProps) {
  if ("error" in quote) {
    return (
      <Alert variant="destructive" className="bg-card">
        <ShieldAlert />
        <AlertTitle>{ERROR_TITLES[quote.error] ?? "No se pudo cotizar"}</AlertTitle>
        <AlertDescription>{quote.mensaje}</AlertDescription>
      </Alert>
    );
  }

  const opciones = [...quote.opciones].sort((a, b) => a.total_paciente - b.total_paciente);

  return (
    <section className="flex flex-col gap-2.5" aria-label={`Cotización de ${especialidadLabel(quote.especialidad)}`}>
      <div className="flex flex-col gap-0.5 px-0.5">
        <p className="text-[15px] font-semibold">
          Consulta de {especialidadLabel(quote.especialidad).toLowerCase()}
          {estado === "cerrada" && <span className="font-normal text-muted-foreground"> · cerrada</span>}
        </p>
        <p className="text-[13px] text-muted-foreground">Calculado con tu {quote.plan}</p>
      </div>

      {quote.carencia.enCarencia && (
        <p className="flex items-start gap-2 rounded-2xl bg-card px-4 py-3 text-[13px] leading-relaxed shadow-soft">
          <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-warning" aria-hidden="true" />
          <span>
            <span className="font-semibold">{carenciaLabel(quote.carencia.diasRestantes)}.</span>{" "}
            <span className="text-muted-foreground">Mientras dure, pagas completa la consulta con especialistas.</span>
          </span>
        </p>
      )}

      {opciones.length === 0 ? (
        <p className="text-sm text-muted-foreground">No hay hospitales de la red que ofrezcan esta especialidad todavía.</p>
      ) : (
        <div role={onSelect ? "radiogroup" : undefined} aria-label="Elige un hospital" className="flex flex-col gap-2">
          {opciones.map((opcion) => (
            <OptionRow
              key={`${opcion.hospital}-${opcion.tier}`}
              opcion={opcion}
              isRecommended={quote.recomendado !== null && opcion.hospital === quote.recomendado}
              isSelected={seleccion === opcion.hospital}
              onSelect={onSelect}
              selecting={selectingHospital === opcion.hospital}
              selectionLocked={estado === "cerrada" || (!!selectingHospital && selectingHospital !== opcion.hospital)}
            />
          ))}
        </div>
      )}
    </section>
  );
}
