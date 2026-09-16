/**
 * Right panel: the active patient's insurance explained in plain language.
 * Presentational — data comes from GET /api/profile (lib/domain/profile.ts),
 * never computed in the browser.
 */
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { formatMoney } from "@/lib/format/money";
import type { PatientProfile } from "@/lib/domain/profile";

const TIER_LABEL: Record<string, string> = {
  A: "Hospitales de mayor costo",
  B: "Costo medio",
  C: "Más económicos",
};

const GLOSSARY: { term: string; definition: string }[] = [
  { term: "Deducible", definition: "Lo que pagas de tu bolsillo cada año antes de que el seguro empiece a cubrir." },
  { term: "Coaseguro", definition: "El porcentaje de la consulta que pagas tú después de cubrir el deducible." },
  { term: "Copago fijo", definition: "Un monto fijo por consulta. Cambia según el tier del hospital." },
  { term: "Tope anual de bolsillo", definition: "Lo máximo que pagas en el año. Al llegar, el seguro cubre el resto." },
  { term: "Carencia", definition: "Los primeros días de una póliza nueva, en los que aún no se cubren especialistas." },
  { term: "Red y tier", definition: "Los hospitales con convenio. Tier A es el de mayor costo; C, el más económico." },
];

interface ProfilePanelProps {
  profile: PatientProfile | null;
  loading: boolean;
}

export function ProfilePanel({ profile, loading }: ProfilePanelProps) {
  if (loading) {
    return (
      <aside aria-label="Mi seguro" className="flex flex-col gap-3" aria-busy="true">
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-28 w-full rounded-2xl" />
        <Skeleton className="h-20 w-full rounded-2xl" />
      </aside>
    );
  }

  if (!profile) {
    return (
      <aside aria-label="Mi seguro" className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">Mi seguro</p>
        <p className="text-[15px] leading-relaxed text-muted-foreground">
          Cuando elijas un paciente, aquí vas a ver su seguro explicado en simple: cuánto le falta de deducible, cuánto le
          queda de tope y cuánto paga en cada tipo de hospital.
        </p>
      </aside>
    );
  }

  const { deducible, tope, carencia, ejemplo } = profile;

  return (
    <aside aria-label="Mi seguro" className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          Mi seguro · {profile.plan.nombre} · desde {profile.fechaInicio}
        </p>
        <div className="flex flex-col gap-2 rounded-2xl bg-card px-5 py-4 shadow-soft">
          {profile.enTuCaso.map((note) => (
            <p key={note} className="text-[15px] leading-relaxed">
              {note}
            </p>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-4">
        {carencia.enCarencia && (
          <Fact
            label="Carencia"
            value={`${carencia.diasRestantes} días restantes`}
            detail={`${carencia.dias - (carencia.diasRestantes ?? 0)} de ${carencia.dias} días cumplidos`}
            percent={Math.floor(((carencia.dias - (carencia.diasRestantes ?? 0)) / carencia.dias) * 100)}
            tone="warning"
          />
        )}
        {deducible.anual > 0 && (
          <Fact
            label="Deducible"
            value={deducible.restante > 0 ? `Te faltan ${formatMoney(deducible.restante)}` : "Cubierto"}
            detail={`Llevas ${formatMoney(deducible.usado)} de ${formatMoney(deducible.anual)}`}
            percent={deducible.porcentajeUsado}
          />
        )}
        <Fact
          label="Tope anual"
          value={`Te quedan ${formatMoney(tope.restante)}`}
          detail={`Llevas ${formatMoney(tope.gastado)} de ${formatMoney(tope.anual)}`}
          percent={tope.porcentajeUsado}
        />
        {!carencia.enCarencia && (
          <p className="flex justify-between text-sm">
            <span className="text-muted-foreground">Carencia</span>
            <span>{carencia.dias === 0 ? "Sin carencia" : "Cumplida"}</span>
          </p>
        )}
        {deducible.anual === 0 && (
          <p className="flex justify-between text-sm">
            <span className="text-muted-foreground">Deducible</span>
            <span>Tu plan no tiene</span>
          </p>
        )}
      </div>

      <div className="flex flex-col">
        <p className="mb-1.5 text-sm text-muted-foreground">Lo que pagas por consulta, después del deducible</p>
        {profile.tiers.map((t) => (
          <p key={t.tier} className="flex items-baseline justify-between gap-3 border-t border-border/70 py-2 text-sm">
            <span>
              <span className="font-semibold">Tier {t.tier}</span>{" "}
              <span className="text-[13px] text-muted-foreground">· {TIER_LABEL[t.tier] ?? ""}</span>
            </span>
            <span className="tabular-nums">
              {t.coaseguroPorcentaje}% + {formatMoney(t.copagoFijo)}
            </span>
          </p>
        ))}
      </div>

      <div className="flex flex-col">
        <Disclosure title="¿Cómo se calcula lo que pago?">
          <ol className="flex flex-col gap-3.5">
            <Step n={1} title="Primero, el deducible">
              Cada año pagas completas tus consultas hasta cubrir el deducible de tu plan.
            </Step>
            <Step n={2} title="Después, el coaseguro">
              De lo que queda, pagas un porcentaje según el tier del hospital.
            </Step>
            <Step n={3} title="Más el copago fijo">
              Un monto fijo por consulta, también según el tier.
            </Step>
            <Step n={4} title="Con un límite">
              Nunca pagas más que el precio de la consulta ni más de lo que te queda de tope anual.
            </Step>
          </ol>
          {ejemplo && (
            <p className="mt-3.5 rounded-xl bg-accent px-3.5 py-3 text-[13px] leading-relaxed tabular-nums">
              <span className="text-muted-foreground">
                Ejemplo con tu plan, ya cubierto el deducible: consulta de {formatMoney(ejemplo.precio)} en tier{" "}
                {ejemplo.tier}.
              </span>{" "}
              {formatMoney(ejemplo.coaseguro)} de coaseguro + {formatMoney(ejemplo.copagoFijo)} de copago ={" "}
              <strong className="font-semibold">{formatMoney(ejemplo.total)} pagas tú</strong>.
            </p>
          )}
          <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">
            En hospitales fuera de tu red el plan no cubre nada: pagas el 100%. En carencia, las consultas con especialistas
            también las pagas completas.
          </p>
        </Disclosure>
        <Disclosure title="¿Qué significa cada término?">
          <dl className="flex flex-col gap-3">
            {GLOSSARY.map((entry) => (
              <div key={entry.term} className="flex flex-col gap-0.5">
                <dt className="text-sm font-semibold">{entry.term}</dt>
                <dd className="text-[13px] leading-relaxed text-muted-foreground">{entry.definition}</dd>
              </div>
            ))}
          </dl>
        </Disclosure>
      </div>
    </aside>
  );
}

function Fact({
  label,
  value,
  detail,
  percent,
  tone = "brand",
}: {
  label: string;
  value: string;
  detail: string;
  percent: number;
  tone?: "brand" | "warning";
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="flex items-baseline justify-between gap-2">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className="text-[15px] font-semibold tabular-nums">{value}</span>
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1 w-full overflow-hidden rounded-full bg-border/70"
      >
        <div
          className={"h-full rounded-full " + (tone === "warning" ? "bg-warning" : "bg-linear-to-r from-brand to-mint")}
          style={{ width: `${percent}%` }}
        />
      </div>
      <p className="text-xs text-muted-foreground tabular-nums">{detail}</p>
    </div>
  );
}

function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border/70">
      <summary className="flex cursor-pointer list-none items-center justify-between py-3.5 text-sm group-open:font-semibold focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown className="size-4 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="pb-4">{children}</div>
    </details>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex size-5.5 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-brand ring-1 ring-border">
        {n}
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-semibold">{title}</span>
        <span className="text-[13px] leading-relaxed text-muted-foreground">{children}</span>
      </span>
    </li>
  );
}
