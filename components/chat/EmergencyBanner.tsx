/**
 * Red 911 banner for the emergency bypass (PRD 6.3 / Anexo B). Driven by the
 * structured `data-emergency` part lib/agent/run.ts's `emergencyResponse`
 * emits — see lib/chat/ui-message.ts's `extractEmergencyData` — not by
 * matching the fixed Spanish copy against the streamed text.
 */
import { PhoneCall } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import type { EmergencyData } from "@/lib/chat/ui-message";

const CRISIS_LINE_ADDENDUM = "Línea de apoyo en crisis en Panamá: [Pendiente: verificar número oficial].";

export function EmergencyBanner({ data }: { data: EmergencyData }) {
  return (
    <Alert variant="destructive" className="border-destructive bg-destructive/10" role="alert">
      <PhoneCall />
      <AlertTitle className="text-base">Esto puede ser una emergencia — llama al 911</AlertTitle>
      <AlertDescription className="text-destructive">
        <p>
          Acude de inmediato a la sala de urgencias más cercana o llama al <strong>911</strong>. No esperes a
          cotizar.
        </p>
        {data.isSelfHarm && <p>{CRISIS_LINE_ADDENDUM}</p>}
      </AlertDescription>
    </Alert>
  );
}
