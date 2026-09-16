/**
 * Landing page: what Copi does, why its amounts can be trusted, and a single
 * call to action into the chat. No login — the chat lists the demo patients.
 */
import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { buttonVariants } from "@/components/ui/button";
import { DISCLAIMER } from "@/lib/copy";
import { cn } from "@/lib/utils";

const STEPS = [
  { title: "Cuéntale qué te pasa", body: "Con tus palabras, por ejemplo: “me duele la rodilla al subir escaleras”." },
  { title: "Te dice a quién ver", body: "Copi busca en una guía médica qué especialista te conviene." },
  { title: "Compara y elige", body: "Ves cuánto pagas con tu plan en cada hospital de la red y cierras tu cotización." },
];

const TRUST = [
  {
    title: "Montos calculados, no inventados",
    body: "Cada precio sale de las tarifas y de las reglas de tu plan. El asistente conversa; las cuentas las hace el sistema.",
  },
  {
    title: "Tu plan, explicado en simple",
    body: "Deducible, coaseguro, tope anual y carencia, con lo que te falta y lo que te queda este año.",
  },
  {
    title: "Emergencias primero",
    body: "Si describes una señal de alarma, Copi no cotiza: te pide ir a urgencias o llamar al 911.",
  },
];

const PREVIEW = [
  { hospital: "Clínica San Rafael del Istmo", detail: "La opción más económica de tu red", pay: "$23.00", selected: true },
  { hospital: "Centro Médico Las Palmas", detail: "Tier A · Costa del Este", pay: "$34.00", selected: false },
  { hospital: "Hospital del Istmo Sur", detail: "Fuera de tu red · no lo cubre tu plan", pay: "$45.00", out: true },
];

export default function Home() {
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-6xl flex-col px-5 sm:px-8">
      <header className="flex items-center justify-between py-6">
        <Logo size={30} />
        <Link href="/chat" className={cn(buttonVariants({ variant: "outline", size: "lg" }), "rounded-xl")}>
          Ir a chatear
        </Link>
      </header>

      <main className="flex flex-1 flex-col gap-24 py-10 sm:py-16">
        <section className="grid items-center gap-12 lg:grid-cols-[minmax(0,1fr)_440px]">
          <div className="flex flex-col gap-6">
            <h1 className="max-w-xl text-4xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-5xl">
              Antes de ir al médico, sabe cuánto vas a pagar.
            </h1>
            <p className="max-w-lg text-lg leading-relaxed text-muted-foreground">
              Copi te dice qué especialista te conviene según tu síntoma, cuánto pagas con tu seguro en cada hospital y cuál
              te sale mejor.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/chat"
                className={cn(buttonVariants({ size: "lg" }), "h-12 w-fit gap-2 rounded-xl px-6 text-[15px] font-semibold")}
              >
                Ir a chatear
                <ArrowRight className="size-4" aria-hidden="true" />
              </Link>
              <p className="text-sm text-muted-foreground">Sin registro. Usa pacientes de prueba con planes distintos.</p>
            </div>
          </div>

          <div className="flex flex-col gap-3 rounded-[24px] bg-card p-5 shadow-soft" aria-label="Ejemplo de cotización">
            <p className="self-end rounded-[18px] rounded-br-md bg-secondary px-4 py-2.5 text-sm">
              Tengo palpitaciones, el corazón me late muy rápido
            </p>
            <div className="flex flex-col gap-0.5 px-0.5 pt-1">
              <p className="text-sm font-semibold">Consulta de cardiología</p>
              <p className="text-xs text-muted-foreground">Calculado con el Plan Estándar</p>
            </div>
            {PREVIEW.map((row) => (
              <div
                key={row.hospital}
                className={cn(
                  "flex items-start gap-3 rounded-2xl bg-card px-4 py-3",
                  row.selected ? "ring-[1.5px] ring-brand" : "ring-1 ring-border/70",
                )}
              >
                {row.selected ? (
                  <span className="mt-0.5 flex size-4.5 items-center justify-center rounded-full bg-brand" aria-hidden="true">
                    <Check className="size-2.5 text-primary-foreground" strokeWidth={3} />
                  </span>
                ) : (
                  <span className="mt-0.5 block size-4.5 rounded-full border-[1.5px] border-border" aria-hidden="true" />
                )}
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <span className="text-sm font-medium">{row.hospital}</span>
                  <span
                    className={cn(
                      "text-xs",
                      row.out ? "text-destructive" : row.selected ? "font-medium text-brand" : "text-muted-foreground",
                    )}
                  >
                    {row.detail}
                  </span>
                </span>
                <span className="flex flex-col items-end">
                  <span className={cn("text-lg font-semibold tabular-nums", row.out && "text-muted-foreground")}>{row.pay}</span>
                  <span className="text-[11px] text-muted-foreground">pagas tú</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-8" aria-labelledby="como-funciona">
          <h2 id="como-funciona" className="text-2xl font-semibold tracking-tight">
            Cómo funciona
          </h2>
          <ol className="grid gap-4 sm:grid-cols-3">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex flex-col gap-2 rounded-2xl bg-card p-6 shadow-soft">
                <span className="flex size-7 items-center justify-center rounded-full text-sm font-semibold text-brand ring-1 ring-border">
                  {i + 1}
                </span>
                <span className="text-base font-semibold">{step.title}</span>
                <span className="text-[15px] leading-relaxed text-muted-foreground">{step.body}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="grid gap-10 lg:grid-cols-[minmax(0,320px)_minmax(0,1fr)]" aria-labelledby="confianza">
          <h2 id="confianza" className="text-2xl font-semibold tracking-tight text-balance">
            Números en los que puedes confiar
          </h2>
          <div className="flex flex-col">
            {TRUST.map((item) => (
              <div key={item.title} className="flex flex-col gap-1.5 border-t border-border/70 py-5 first:border-t-0 first:pt-0">
                <p className="text-base font-semibold">{item.title}</p>
                <p className="text-[15px] leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col items-start gap-5 rounded-[24px] bg-card p-8 shadow-soft sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-1.5">
            <p className="text-xl font-semibold tracking-tight">Pruébalo con un paciente de prueba</p>
            <p className="text-[15px] text-muted-foreground">Cinco planes y situaciones distintas para comparar resultados.</p>
          </div>
          <Link
            href="/chat"
            className={cn(buttonVariants({ size: "lg" }), "h-12 gap-2 rounded-xl px-6 text-[15px] font-semibold")}
          >
            Ir a chatear
            <ArrowRight className="size-4" aria-hidden="true" />
          </Link>
        </section>
      </main>

      <footer className="flex flex-col gap-1 border-t border-border/70 py-6 text-[13px] text-muted-foreground sm:flex-row sm:justify-between">
        <p>{DISCLAIMER}</p>
        <p>Demo con datos ficticios.</p>
      </footer>
    </div>
  );
}
