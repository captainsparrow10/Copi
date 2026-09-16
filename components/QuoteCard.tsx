/**
 * Renders straight from `cotizar_consulta`'s tool output (PRD Anexo C rule
 * 4 / guia-construccion.md Parte 2 rule 4: "La tarjeta de cotización se
 * renderiza desde la salida de la herramienta, nunca parseando el texto del
 * modelo"). Purely presentational — no fetching, no state — so it's easy to
 * unit-test by hand and to drop into app/chat/page.tsx wherever
 * `extractLatestQuote` finds a result.
 */
import { AlertTriangle, Award, ShieldAlert } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { CotizarConsultaOutput, OpcionCotizacion } from "@/lib/agent/tools";
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

function OptionCard({ opcion, isRecommended }: { opcion: OpcionCotizacion; isRecommended: boolean }) {
  const outOfNetwork = opcion.marcas.includes("fuera_de_red");
  return (
    <div
      className={
        "rounded-lg border p-3 " +
        (isRecommended
          ? "border-primary bg-primary/5 ring-1 ring-primary/30"
          : "border-border")
      }
      aria-label={isRecommended ? `${opcion.hospital}, hospital recomendado` : opcion.hospital}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="flex items-center gap-1.5 font-medium">
            {opcion.hospital}
            {isRecommended && (
              <Badge className="gap-1">
                <Award aria-hidden="true" />
                Recomendado
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
          Fuera de la red: no puede ser el hospital recomendado.
        </p>
      )}

      <Separator className="my-2" />

      <div className="grid grid-cols-2 gap-x-4 gap-y-1">
        <BreakdownRow label="Precio de la consulta" value={formatMoney(opcion.precio)} />
        <BreakdownRow label="A deducible" value={formatMoney(opcion.a_deducible)} />
        <BreakdownRow label="Coaseguro" value={formatMoney(opcion.coaseguro)} />
        <BreakdownRow label="Copago fijo" value={formatMoney(opcion.copago_fijo)} />
      </div>
      <Separator className="my-2" />
      <div className="grid grid-cols-2 gap-x-4">
        <BreakdownRow label="Total tú" value={formatMoney(opcion.total_paciente)} emphasis />
        <BreakdownRow label="Total aseguradora" value={formatMoney(opcion.total_aseguradora)} emphasis />
      </div>
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

export function QuoteCard({ quote }: { quote: CotizarConsultaOutput }) {
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
        <CardTitle>Cotización — {especialidadLabel(quote.especialidad)}</CardTitle>
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
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
