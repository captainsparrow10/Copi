/**
 * Left panel: demo patients, each with a one-line highlight of their situation.
 * Presentational — the chat page owns the session switch (POST /api/session).
 */
import { Skeleton } from "@/components/ui/skeleton";
import type { HighlightTone } from "@/lib/domain/profile";

export interface DemoPatient {
  poliza: string;
  nombre: string;
  plan: string;
  destacado: { texto: string; tono: HighlightTone };
}

const TONE_DOT: Record<HighlightTone, string> = {
  ok: "bg-brand",
  warning: "bg-warning",
  danger: "bg-destructive",
  neutral: "bg-muted-foreground/50",
};

interface PatientListProps {
  patients: DemoPatient[] | null;
  activePoliza: string | null;
  switchingPoliza: string | null;
  onSelect: (poliza: string) => void;
}

export function PatientList({ patients, activePoliza, switchingPoliza, onSelect }: PatientListProps) {
  return (
    <nav aria-label="Pacientes de prueba" className="flex flex-col gap-2.5">
      <p className="px-3.5 text-sm leading-relaxed text-muted-foreground">
        Pacientes de prueba. Cada uno tiene un plan distinto.
      </p>

      {!patients && (
        <div className="flex flex-col gap-1" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-16 w-full rounded-xl" />
          ))}
        </div>
      )}

      {patients && (
        <ul className="flex flex-col gap-0.5">
          {patients.map((patient) => {
            const isActive = patient.poliza === activePoliza;
            const isSwitching = patient.poliza === switchingPoliza;
            return (
              <li key={patient.poliza}>
                <button
                  type="button"
                  aria-current={isActive ? "true" : undefined}
                  disabled={switchingPoliza !== null}
                  onClick={() => onSelect(patient.poliza)}
                  className={
                    "flex min-h-16 w-full flex-col gap-1 rounded-xl px-3.5 py-3 text-left transition-colors " +
                    "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none disabled:cursor-wait " +
                    (isActive ? "bg-card shadow-soft" : "hover:bg-card/60")
                  }
                >
                  <span className="flex items-baseline justify-between gap-2">
                    <span className={"text-sm " + (isActive ? "font-semibold" : "font-medium")}>{patient.nombre}</span>
                    <span className="text-xs text-muted-foreground">
                      {isSwitching ? "Abriendo…" : patient.plan.replace(/^Plan /, "")}
                    </span>
                  </span>
                  <span className="inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                    <span className={"size-1.5 shrink-0 rounded-full " + TONE_DOT[patient.destacado.tono]} />
                    {patient.destacado.texto}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
