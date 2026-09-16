/**
 * Renders straight from `cotizar_consulta`'s tool output (PRD Anexo C rule
 * 4 / guia-construccion.md Parte 2 rule 4: "La tarjeta de cotización se
 * renderiza desde la salida de la herramienta, nunca parseando el texto del
 * modelo"). Purely presentational — no fetching, no state — so it's easy to
 * unit-test by hand and to drop into app/chat/page.tsx wherever
 * `extractLatestQuote` finds a result.
 */
import { AlertTriangle, Award, BadgeCheck, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { CotizarConsultaOutput, OpcionCotizacion } from "@/lib/agent/tools";
import { computeEffectiveBreakdown } from "@/lib/domain/effective-breakdown";
import { carenciaLabel, markLabel, type MarkTone } from "@/lib/format/marks";
import { formatMoney } from "@/lib/format/money";

const TONE_BADGE_CLASS: Record<MarkTone, string> = {
  destructive: "",
  warning: "border-amber-300 bg-amber-50 text-amber-800 dark:border-amber-800 dark:bg-amber-950 dark:text-amber-300",
  info: "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950 dark:text-sky-300",
};

function especialidadLabel(especialidad: string): string {
  const withSpaces = especialidad.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

function MarkBadges({ marcas }: { marcas: readonly string[] }) {
  if (marcas.length === 0) return null;
  return (
    <div className="flex flex-wrap gap-1.5">
      {marcas.map((mark) => {
        const { label, tone } = markLabel(mark);
        const variant = tone === "destructive" ? "destructive" : "outline";
        return (
          <Badge key={mark} variant={variant} className={TONE_BADGE_CLASS[tone]}>
            {label}
          </Badge>
        );
      })}
    </div>
  );
}

function BreakdownRow({ label, value, emphasis }: { label: string; value: string; emphasis?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className={emphasis ? "font-medium" : "text-muted-foreground"}>{label}</span>
      <span className={emphasis ? "font-semibold tabular-nums" : "tabular-nums"}>{value}</span>
    </div>
  );
}

interface OptionCardProps {
  opcion: OpcionCotizacion;
  isRecommended: boolean;
  isSelected: boolean;
  /** Present (even as a no-op-until-clicked callback) only when the card is interactive — i.e. this is the session's active quote. */
  onSelect?: (hospital: string) => void;
  /** True while a select request for THIS hospital is in flight, to disable/label its button without blocking the rest of the card. */
  selecting?: boolean;
  /** Selection is closed for editing once the quote itself is closed (estado === "cerrada"). */
  selectionLocked?: boolean;
}

function OptionCard({ opcion, isRecommended, isSelected, onSelect, selecting, selectionLocked }: OptionCardProps) {
  const outOfNetwork = opcion.marcas.includes("fuera_de_red");
  // Display-only fix: a_deducible + coaseguro + copago_fijo (PRD 7.4's
  // `bruto`) can exceed total_paciente once the precio/tope cap (step 9)
  // fires — showing the raw components would misleadingly imply the patient
  // paid more than they did (e.g. "Copago fijo $8.00" while the whole price
  // went to the deductible and total_paciente = precio). These are what was
  // actually charged; totals below are unchanged, straight from the tool.
  const effective = computeEffectiveBreakdown(opcion);

  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (isSelected
          ? "border-emerald-500 bg-emerald-50 ring-1 ring-emerald-400/40 dark:bg-emerald-950/30"
          : isRecommended
            ? "border-primary bg-primary/5 ring-1 ring-primary/30"
            : "border-border")
      }
      aria-label={isRecommended ? `${opcion.hospital}, hospital recomendado` : opcion.hospital}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex flex-wrap items-center gap-1.5 font-medium">
            {opcion.hospital}
            {isRecommended && (
              <Badge className="gap-1">
                <Award aria-hidden="true" />
                Recomendado
              </Badge>
            )}
            {isSelected && (
              <Badge className="gap-1 border-emerald-600 bg-emerald-600 text-white">
                <BadgeCheck aria-hidden="true" />
                Elegido
              </Badge>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            Tier {opcion.tier} · {opcion.zona}
          </p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold tabular-nums">{formatMoney(opcion.total_paciente)}</p>
          <p className="text-xs text-muted-foreground">pagas tú</p>
        </div>
      </div>

      <MarkBadges marcas={opcion.marcas} />
      {outOfNetwork && (
        <p className="mt-1.5 flex items-center gap-1 text-xs text-destructive">
          <AlertTriangle className="size-3.5" aria-hidden="true" />
          Fuera de la red: tu plan no la cubre. Pagarías el 100 % de la consulta (
          {formatMoney(opcion.total_paciente)}) de tu bolsillo.
        </p>
      )}

      <Separator className="my-2" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <BreakdownRow label="Precio de la consulta" value={formatMoney(opcion.precio)} />
        <BreakdownRow label="A deducible" value={formatMoney(effective.aDeducible)} />
        <BreakdownRow label="Coaseguro" value={formatMoney(effective.coaseguro)} />
        <BreakdownRow label="Copago fijo" value={formatMoney(effective.copagoFijo)} />
      </div>
      <Separator className="my-2" />
      <div className="grid grid-cols-2 gap-x-4">
        <BreakdownRow label="Total tú" value={formatMoney(opcion.total_paciente)} emphasis />
        <BreakdownRow label="Total aseguradora" value={formatMoney(opcion.total_aseguradora)} emphasis />
      </div>

      {onSelect && (
        <>
          <Separator className="my-2" />
          <Button
            type="button"
            size="sm"
            variant={isSelected ? "secondary" : "outline"}
            className="w-full"
            disabled={selecting || selectionLocked}
            onClick={() => onSelect(opcion.hospital)}
          >
            {selecting ? "Eligiendo…" : isSelected ? "Elegida" : "Elegir esta opción"}
          </Button>
        </>
      )}
    </div>
  );
}

const ERROR_TITLES: Record<string, string> = {
  POLIZA_INACTIVA: "Póliza inactiva",
  // Internal ordering-enforcement error (PRD Anexo A rule 3): the model is
  // expected to self-correct by calling buscar_especialidad and retrying
  // within the same turn, so this card should rarely render in practice —
  // it's still handled explicitly instead of falling back to the wrong
  // "Póliza inactiva" title if the model ever surfaces it as its final answer.
  FALTA_BUSCAR_ESPECIALIDAD: "Falta un paso previo",
  SIN_ESPECIALIDAD_CONFIRMADA: "Falta confirmar el síntoma",
};

export interface QuoteCardProps {
  quote: CotizarConsultaOutput;
  /** Hospital currently chosen for this quote, or `null`/`undefined` if none yet. `undefined` when this card isn't the session's interactive active quote (e.g. it's an older message). */
  seleccion?: string | null;
  /** Once "cerrada", selection can no longer be changed (see POST /api/quote/close). */
  estado?: "abierta" | "cerrada";
  /** Presence of this prop is what makes the card interactive (shows "Elegir" buttons) — omit it to render a read-only historical quote. */
  onSelect?: (hospital: string) => void;
  /** Hospital currently being selected (its button shows a loading label; all buttons disable). */
  selectingHospital?: string | null;
}

export function QuoteCard({ quote, seleccion, estado, onSelect, selectingHospital }: QuoteCardProps) {
  if ("error" in quote) {
    return (
      <Alert variant="destructive">
        <ShieldAlert />
        <AlertTitle>{ERROR_TITLES[quote.error] ?? "No se pudo cotizar"}</AlertTitle>
        <AlertDescription>{quote.mensaje}</AlertDescription>
      </Alert>
    );
  }

  const opciones = [...quote.opciones].sort((a, b) => a.total_paciente - b.total_paciente);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          Cotización — {especialidadLabel(quote.especialidad)}
          {estado === "cerrada" && <Badge variant="secondary">Cerrada</Badge>}
        </CardTitle>
        <CardDescription>{quote.plan}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {quote.carencia.enCarencia && (
          <Alert>
            <AlertTriangle />
            <AlertTitle>{carenciaLabel(quote.carencia.diasRestantes)}</AlertTitle>
            <AlertDescription>
              Durante la carencia pagas el 100 % de la consulta para esta especialidad.
            </AlertDescription>
          </Alert>
        )}

        {opciones.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No hay hospitales de la red que ofrezcan esta especialidad todavía.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {opciones.map((opcion) => (
              <OptionCard
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
      </CardContent>
    </Card>
  );
}
