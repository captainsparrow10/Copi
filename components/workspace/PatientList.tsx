/**
 * Left panel: demo patients. Presentational — the chat page owns the session
 * switch (POST /api/session) and passes the active policy down.
 */
import { UserRound } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

export interface DemoPatient {
  poliza: string;
  nombre: string;
  plan: string;
}

interface PatientListProps {
  patients: DemoPatient[] | null;
  activePoliza: string | null;
  switchingPoliza: string | null;
  onSelect: (poliza: string) => void;
}

export function PatientList({ patients, activePoliza, switchingPoliza, onSelect }: PatientListProps) {
  return (
    <nav aria-label="Pacientes de prueba" className="flex flex-col gap-3">
      <div>
        <p className="text-sm font-semibold">Pacientes</p>
        <p className="text-xs text-muted-foreground">Cada uno tiene un plan y una situación distinta.</p>
      </div>

      {!patients && (
        <div className="flex flex-col gap-2" aria-busy="true">
          {Array.from({ length: 5 }, (_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      )}

      {patients && (
        <ul className="flex flex-col gap-1.5">
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
                    "flex w-full items-center gap-3 rounded-lg border px-3 py-2 text-left transition-colors " +
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60 " +
                    (isActive ? "border-primary bg-primary/5" : "border-border hover:bg-muted")
                  }
                >
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-muted">
                    <UserRound className="size-4 text-muted-foreground" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{patient.nombre}</span>
                    <span className="block text-xs text-muted-foreground">
                      {patient.poliza} · {patient.plan}
                    </span>
                  </span>
                  {isSwitching && <span className="text-xs text-muted-foreground">Cargando…</span>}
                  {isActive && !isSwitching && <Badge variant="secondary">Activo</Badge>}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </nav>
  );
}
