/**
 * "Cómo llegué a esto" panel (PRD P1-03): shows every tool call, its
 * arguments and its result for the current chat, so an evaluator can audit
 * the agent's grounding. Collapsible and closed by default — it's for the
 * curious/evaluator, not the everyday patient flow. Purely presentational:
 * `entries` comes from lib/chat/ui-message.ts's `extractToolTrace`, which
 * reads the same `UIMessage[]` parts the rest of the UI does.
 */
"use client";

import { ChevronDown, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import type { ToolTraceEntry } from "@/lib/chat/ui-message";

const TOOL_LABELS: Record<string, string> = {
  buscar_especialidad: "Buscar especialidad",
  cotizar_consulta: "Cotizar consulta",
  obtener_resumen_plan: "Obtener resumen del plan",
  buscar_en_poliza: "Buscar en la póliza",
};

function TraceEntry({ entry }: { entry: ToolTraceEntry }) {
  return (
    <li className="rounded-md border border-border p-2">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{TOOL_LABELS[entry.toolName] ?? entry.toolName}</span>
        <Badge variant="secondary">{entry.state}</Badge>
      </div>
      <div className="mt-1.5 grid gap-1 text-xs">
        <div>
          <p className="text-muted-foreground">Argumentos</p>
          <pre className="overflow-x-auto rounded bg-muted p-1.5">{JSON.stringify(entry.input ?? {}, null, 2)}</pre>
        </div>
        {entry.output !== undefined && (
          <div>
            <p className="text-muted-foreground">Resultado</p>
            <pre className="overflow-x-auto rounded bg-muted p-1.5">{JSON.stringify(entry.output, null, 2)}</pre>
          </div>
        )}
      </div>
    </li>
  );
}

export function TracePanel({ entries }: { entries: ToolTraceEntry[] }) {
  if (entries.length === 0) return null;

  return (
    <Collapsible className="rounded-lg border border-border">
      <CollapsibleTrigger className="group flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm font-medium">
        <span className="flex items-center gap-1.5">
          <Wrench className="size-4" aria-hidden="true" />
          Cómo llegué a esto ({entries.length} {entries.length === 1 ? "llamada" : "llamadas"})
        </span>
        <ChevronDown className="size-4 transition-transform group-data-[panel-open]:rotate-180" aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="flex flex-col gap-2 border-t border-border p-2">
          {entries.map((entry, index) => (
            <TraceEntry key={`${entry.toolCallId}-${index}`} entry={entry} />
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
}
