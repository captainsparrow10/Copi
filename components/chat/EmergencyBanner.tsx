/**
 * 911 banner for the emergency bypass (PRD 6.3 / Anexo B). Driven by the
 * structured `data-emergency` part lib/agent/run.ts's `emergencyResponse`
 * emits — see lib/chat/ui-message.ts's `extractEmergencyData` — not by
 * matching the fixed Spanish copy against the streamed text.
 */
import { Phone } from "lucide-react";
import type { EmergencyData } from "@/lib/chat/ui-message";

const CRISIS_LINE_ADDENDUM = "Línea de apoyo en crisis en Panamá: [Pendiente: verificar número oficial].";

export function EmergencyBanner({ data }: { data: EmergencyData }) {
  return (
    <div
      role="alert"
      className="flex w-full flex-col gap-4 rounded-2xl border-[1.5px] border-destructive bg-card p-5 shadow-soft sm:flex-row sm:items-center"
    >
      <div className="flex flex-1 flex-col gap-1.5">
        <p className="text-lg font-semibold text-destructive">Esto puede ser una emergencia</p>
        <p className="text-[15px] leading-relaxed">
          Ve de inmediato a la sala de urgencias más cercana o llama al 911. No esperes a cotizar.
        </p>
        {data.isSelfHarm && <p className="text-[15px] leading-relaxed">{CRISIS_LINE_ADDENDUM}</p>}
      </div>
      <a
        href="tel:911"
        className="inline-flex h-12 shrink-0 items-center justify-center gap-2 rounded-xl bg-destructive px-5 text-[15px] font-semibold text-primary-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <Phone className="size-4" aria-hidden="true" />
        Llamar al 911
      </a>
    </div>
  );
}
