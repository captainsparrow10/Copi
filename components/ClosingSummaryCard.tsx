/**
 * Renders the closing summary POST /api/quote/close returns (feature spec
 * item 3, "Cerrar cotización"). Every field comes from the server response
 * — purely presentational, same pattern as components/QuoteCard.tsx.
 */
import { CheckCircle2, Mail, MessageCircle, Phone } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import type { ClosingSummary } from "@/lib/domain/quote-summary";
import { markLabel } from "@/lib/format/marks";
import { formatMoney } from "@/lib/format/money";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className="text-right font-medium tabular-nums">{value}</span>
    </div>
  );
}

function especialidadLabel(especialidad: string): string {
  const withSpaces = especialidad.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function ClosingSummaryCard({ summary }: { summary: ClosingSummary }) {
  const fecha = new Date(summary.fecha).toLocaleString("es-PA", {
    dateStyle: "medium",
    timeStyle: "short",
  });

  return (
    <Card className="border-emerald-300 dark:border-emerald-800">
      <CardHeader>
        <CardTitle className="flex items-center gap-1.5">
          <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
          Cotización cerrada
        </CardTitle>
        <CardDescription>Referencia {summary.referencia} · {fecha}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <Row label="Paciente" value={summary.paciente.nombre} />
          <Row label="Plan" value={summary.paciente.plan} />
          <Row label="Especialidad" value={especialidadLabel(summary.especialidad)} />
          <Row label="Hospital" value={summary.hospital} />
          <Row label="Zona" value={summary.zona} />
          <Row label="Tier" value={summary.tier} />
        </div>

        {summary.marcas.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {summary.marcas.map((mark) => {
              const { label, tone } = markLabel(mark);
              return (
                <Badge key={mark} variant={tone === "destructive" ? "destructive" : "outline"}>
                  {label}
                </Badge>
              );
            })}
          </div>
        )}

        <Separator />

        <div className="flex flex-col gap-1">
          <Row label="Precio de la consulta" value={formatMoney(summary.precio)} />
          <Row label="A deducible" value={formatMoney(summary.aDeducible)} />
          <Row label="Coaseguro" value={formatMoney(summary.coaseguro)} />
          <Row label="Copago fijo" value={formatMoney(summary.copagoFijo)} />
        </div>

        <Separator />

        <div className="flex flex-col gap-1">
          <Row label="Total tú" value={formatMoney(summary.totalPaciente)} />
          <Row label="Total aseguradora" value={formatMoney(summary.totalAseguradora)} />
        </div>

        <Separator />

        <div className="flex flex-col gap-1.5 rounded-lg bg-muted p-3 text-sm">
          <p className="font-medium">
            Para cerrar tu cotización, conocer paquetes disponibles o recibir más información,
            comunícate con servicio al cliente:
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Phone className="size-3.5" aria-hidden="true" /> {summary.contacto.phone}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <MessageCircle className="size-3.5" aria-hidden="true" /> WhatsApp {summary.contacto.whatsapp}
          </p>
          <p className="flex items-center gap-1.5 text-muted-foreground">
            <Mail className="size-3.5" aria-hidden="true" /> {summary.contacto.email}
          </p>
          <p className="text-xs text-muted-foreground">{summary.contacto.hours}</p>
        </div>
      </CardContent>
    </Card>
  );
}
