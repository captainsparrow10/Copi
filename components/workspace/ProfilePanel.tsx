/**
 * Right panel: the active patient's insurance profile, so they understand their
 * benefit before quoting. Presentational — data comes from GET /api/profile
 * (lib/domain/profile.ts), never computed in the browser.
 */
import { CalendarClock, Info, ShieldCheck, ShieldOff } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format/money";
import type { PatientProfile } from "@/lib/domain/profile";

const GLOSSARY: { term: string; definition: string }[] = [
  { term: "Deducible", definition: "Monto que pagas completo cada año antes de que el seguro empiece a cubrir." },
  { term: "Coaseguro", definition: "Porcentaje de la consulta que pagas tú después de cubrir el deducible." },
  { term: "Copago fijo", definition: "Monto fijo que pagas por consulta, según el nivel (tier) del hospital." },
  { term: "Tope anual de bolsillo", definition: "Lo máximo que pagas en el año; al alcanzarlo, la aseguradora cubre el resto." },
  { term: "Carencia", definition: "Días desde el inicio de la póliza en los que aún no se cubren especialistas." },
  { term: "Red y tier", definition: "Hospitales con convenio. Tier A es el más caro y C el más económico; fuera de red no hay cobertura." },
];

const HOW_IT_WORKS = [
  "Primero pagas la consulta hasta cubrir tu deducible del año.",
  "Después pagas el coaseguro (un % del resto) más el copago fijo del tier del hospital.",
  "Nunca pagas más que el precio de la consulta ni más que lo que te queda de tope anual.",
  "En hospitales fuera de red pagas el 100%.",
];

interface ProfilePanelProps {
  profile: PatientProfile | null;
  loading: boolean;
}

export function ProfilePanel({ profile, loading }: ProfilePanelProps) {
  if (loading || !profile) {
    return (
      <aside aria-label="Perfil del paciente" className="flex flex-col gap-3" aria-busy={loading}>
        {loading ? (
          <>
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-24 w-full" />
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Elige un paciente para ver su seguro.</p>
        )}
      </aside>
    );
  }

  const { deducible, tope, carencia } = profile;

  return (
    <aside aria-label="Perfil del paciente" className="flex flex-col gap-4 text-sm">
      <section className="flex flex-col gap-1">
        <div className="flex items-center justify-between gap-2">
          <p className="text-base font-semibold">{profile.nombre}</p>
          {profile.activa ? (
            <Badge variant="secondary" className="gap-1">
              <ShieldCheck className="size-3" aria-hidden="true" />
              Activa
            </Badge>
          ) : (
            <Badge variant="destructive" className="gap-1">
              <ShieldOff className="size-3" aria-hidden="true" />
              Inactiva
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {profile.poliza} · {profile.plan.nombre} · desde {profile.fechaInicio}
        </p>
      </section>

      {profile.enTuCaso.length > 0 && (
        <section className="rounded-lg border border-border bg-muted/50 p-3">
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <Info className="size-3.5" aria-hidden="true" />
            En tu caso
          </p>
          <ul className="flex list-disc flex-col gap-1 pl-4 text-xs">
            {profile.enTuCaso.map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="flex flex-col gap-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tu plan este año</p>
        {deducible.anual > 0 ? (
          <Meter
            label="Deducible"
            detail={`${formatMoney(deducible.usado)} de ${formatMoney(deducible.anual)} · faltan ${formatMoney(deducible.restante)}`}
            percent={deducible.porcentajeUsado}
          />
        ) : (
          <p className="text-xs">
            <span className="font-medium">Deducible:</span> tu plan no tiene.
          </p>
        )}
        <Meter
          label="Tope anual de bolsillo"
          detail={`${formatMoney(tope.gastado)} de ${formatMoney(tope.anual)} · quedan ${formatMoney(tope.restante)}`}
          percent={tope.porcentajeUsado}
        />
        <p className="flex items-start gap-1.5 text-xs">
          <CalendarClock className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          <span>
            <span className="font-medium">Carencia para especialistas:</span>{" "}
            {carencia.dias === 0
              ? "tu plan no tiene."
              : carencia.enCarencia
                ? `${carencia.dias} días; te faltan ${carencia.diasRestantes}.`
                : `${carencia.dias} días, ya cumplida.`}
          </span>
        </p>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Qué pagas por consulta</p>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-left text-muted-foreground">
              <th scope="col" className="py-1 font-medium">Tier</th>
              <th scope="col" className="py-1 font-medium">Coaseguro</th>
              <th scope="col" className="py-1 font-medium">Copago fijo</th>
            </tr>
          </thead>
          <tbody>
            {profile.tiers.map((t) => (
              <tr key={t.tier} className="border-t border-border">
                <td className="py-1">{t.tier}</td>
                <td className="py-1">{t.coaseguroPorcentaje}%</td>
                <td className="py-1">{formatMoney(t.copagoFijo)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">Tier A: hospitales más caros · Tier C: más económicos.</p>
      </section>

      <Separator />

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cómo se calcula tu copago</p>
        <ol className="flex list-decimal flex-col gap-1 pl-4 text-xs">
          {HOW_IT_WORKS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <section className="flex flex-col gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Glosario</p>
        <dl className="flex flex-col gap-1.5 text-xs">
          {GLOSSARY.map((entry) => (
            <div key={entry.term}>
              <dt className="font-medium">{entry.term}</dt>
              <dd className="text-muted-foreground">{entry.definition}</dd>
            </div>
          ))}
        </dl>
      </section>
    </aside>
  );
}

function Meter({ label, detail, percent }: { label: string; detail: string; percent: number }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-baseline justify-between gap-2 text-xs">
        <span className="font-medium">{label}</span>
        <span className="text-muted-foreground">{percent}% usado</span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div className="h-full rounded-full bg-primary" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">{detail}</p>
    </div>
  );
}
