/**
 * Demo policy selector (PRD P0-01 / FASE 4). Lists the demo policies from
 * `GET /api/demo-policies`, lets the evaluator pick one, and creates the
 * session (`POST /api/session`) before navigating to `/chat`.
 */
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { DISCLAIMER } from "@/lib/copy";

interface DemoPoliza {
  poliza: string;
  nombre: string;
  plan: string;
}

export default function Home() {
  const router = useRouter();
  const [policies, setPolicies] = useState<DemoPoliza[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo-policies")
      .then((res) => {
        if (!res.ok) throw new Error("request failed");
        return res.json() as Promise<{ polizas: DemoPoliza[] }>;
      })
      .then((data) => {
        if (!cancelled) setPolicies(data.polizas);
      })
      .catch(() => {
        if (!cancelled) setLoadError("No pudimos cargar las pólizas de prueba. Recarga la página para intentar de nuevo.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleContinue() {
    if (!selected) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poliza: selected }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: { message?: string } } | null;
        throw new Error(body?.error?.message ?? "No se pudo iniciar la sesión.");
      }
      router.push("/chat");
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "No se pudo iniciar la sesión.");
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-1 flex-col gap-6 px-4 py-10 sm:py-16">
      <header className="flex flex-col items-center gap-1 text-center">
        <h1 className="text-2xl font-semibold">Copi</h1>
        <p className="text-sm text-muted-foreground">
          Antes de atenderte, te decimos qué especialidad te conviene, cuánto vas a pagar y en qué hospital te
          sale más económico.
        </p>
      </header>

      <div className="flex flex-1 flex-col gap-3">
        <h2 className="text-sm font-medium text-muted-foreground">Elige una póliza de prueba</h2>

        {loadError && (
          <Alert variant="destructive">
            <AlertTitle>No pudimos cargar las pólizas</AlertTitle>
            <AlertDescription>{loadError}</AlertDescription>
          </Alert>
        )}

        {!policies && !loadError && (
          <div className="flex flex-col gap-2" aria-live="polite" aria-busy="true">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        )}

        {policies && (
          <div role="radiogroup" aria-label="Pólizas de prueba" className="flex flex-col gap-2">
            {policies.map((p) => {
              const isSelected = selected === p.poliza;
              return (
                <button
                  key={p.poliza}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setSelected(p.poliza)}
                  className={
                    "rounded-lg border p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring " +
                    (isSelected ? "border-primary bg-primary/5 ring-1 ring-primary/30" : "border-border hover:bg-muted")
                  }
                >
                  <p className="font-medium">{p.nombre}</p>
                  <p className="text-sm text-muted-foreground">
                    {p.poliza} · {p.plan}
                  </p>
                </button>
              );
            })}
          </div>
        )}

        {submitError && (
          <Alert variant="destructive">
            <AlertTitle>No se pudo continuar</AlertTitle>
            <AlertDescription>{submitError}</AlertDescription>
          </Alert>
        )}
      </div>

      <Button size="lg" onClick={handleContinue} disabled={!selected || submitting}>
        {submitting ? "Ingresando…" : "Continuar"}
      </Button>

      <p className="text-center text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}
