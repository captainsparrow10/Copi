/**
 * Renders the closing summary POST /api/quote/close returns ("Cerrar
 * cotización"). Every field comes from the server response — purely
 * presentational, same pattern as components/QuoteCard.tsx.
 */
import { Check } from "lucide-react";
import type { ClosingSummary } from "@/lib/domain/quote-summary";
import { markLabel } from "@/lib/format/marks";
import { formatMoney } from "@/lib/format/money";

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <p className={"flex items-baseline justify-between gap-4 text-sm " + (strong ? "font-semibold" : "")}>
      <span className={strong ? "" : "text-muted-foreground"}>{label}</span>
      <span className="text-right tabular-nums">{value}</span>
    </p>
  );
}

function especialidadLabel(especialidad: string): string {
  const withSpaces = especialidad.replace(/_/g, " ");
  return withSpaces.charAt(0).toUpperCase() + withSpaces.slice(1);
}

export function ClosingSummaryCard({ summary }: { summary: ClosingSummary }) {
  const fecha = new Date(summary.fecha).toLocaleDateString("es-PA", { dateStyle: "medium" });
  const marcas = summary.marcas.map((mark) => markLabel(mark).label);

  return (
    <section aria-label="Cotización cerrada" className="flex flex-col gap-4 rounded-2xl bg-card p-6 shadow-soft">
      <div className="flex flex-col gap-1">
        <p className="flex items-center gap-1.5 text-[13px] font-medium text-brand">
          <Check className="size-3.5" strokeWidth={2.5} aria-hidden="true" />
          Cotización cerrada
        </p>
        <p className="text-xl font-semibold tracking-tight tabular-nums">
          Vas a pagar {formatMoney(summary.totalPaciente)} en {summary.hospital}
        </p>
        <p className="text-[13px] text-muted-foreground">
          {especialidadLabel(summary.especialidad)} · {summary.paciente.nombre}, {summary.paciente.plan} · Referencia{" "}
          {summary.referencia} · {fecha}
        </p>
        {marcas.length > 0 && <p className="text-[13px] text-muted-foreground">{marcas.join(" · ")}</p>}
      </div>

      <div className="grid gap-x-7 gap-y-2 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Row label="Precio de la consulta" value={formatMoney(summary.precio)} />
          {summary.aDeducible > 0 && <Row label="A tu deducible" value={formatMoney(summary.aDeducible)} />}
          {summary.coaseguro > 0 && <Row label="Coaseguro" value={formatMoney(summary.coaseguro)} />}
          {summary.copagoFijo > 0 && <Row label="Copago fijo" value={formatMoney(summary.copagoFijo)} />}
        </div>
        <div className="flex flex-col gap-2">
          <Row label="Pagas tú" value={formatMoney(summary.totalPaciente)} strong />
          <Row label="Pone tu seguro" value={formatMoney(summary.totalAseguradora)} />
          <Row label="Hospital" value={`${summary.zona} · Tier ${summary.tier}`} />
        </div>
      </div>

      <div className="flex flex-col gap-2.5 border-t border-border/70 pt-4">
        <p className="text-sm leading-relaxed">
          Para cerrar tu cotización, conocer los paquetes disponibles o recibir más información, comunícate con servicio
          al cliente.
        </p>
        <div className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
          <a href={`tel:${summary.contacto.phone.replace(/[^\d+]/g, "")}`} className="tabular-nums hover:underline">
            <span className="text-muted-foreground">Teléfono</span> {summary.contacto.phone}
          </a>
          <span className="tabular-nums">
            <span className="text-muted-foreground">WhatsApp</span> {summary.contacto.whatsapp}
          </span>
          <a href={`mailto:${summary.contacto.email}`} className="hover:underline">
            <span className="text-muted-foreground">Correo</span> {summary.contacto.email}
          </a>
        </div>
        <p className="text-[13px] text-muted-foreground">{summary.contacto.hours}</p>
      </div>
    </section>
  );
}
