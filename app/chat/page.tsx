/**
 * Streaming chat (PRD FASE 4): `useChat` (v7, `@ai-sdk/react`) against
 * `/api/chat` through lib/chat/transport.ts's adapter. Mobile-first.
 * States: checking session (redirect to `/` if there isn't one), loading
 * (streaming reply), LLM error, message-limit reached — see PRD 6.6 and
 * FASE 4's "Estados" requirement.
 */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { AlertTriangle, LogOut, Send } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { QuoteCard } from "@/components/QuoteCard";
import { ClosingSummaryCard } from "@/components/ClosingSummaryCard";
import { EmergencyBanner } from "@/components/chat/EmergencyBanner";
import { TracePanel } from "@/components/TracePanel";
import { createChatTransport } from "@/lib/chat/transport";
import { extractEmergencyData, extractLatestQuote, extractToolTrace, getMessageText } from "@/lib/chat/ui-message";
import { parseChatError, type ChatApiError } from "@/lib/chat/errors";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { DISCLAIMER } from "@/lib/copy";
import type { QuoteResponse } from "@/lib/db/quotes";
import type { ClosingSummary } from "@/lib/domain/quote-summary";

interface SessionInfo {
  nombre: string;
  plan: string;
}

type SessionState = "checking" | "ready" | "redirecting";

export default function ChatPage() {
  const router = useRouter();
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  const [sessionInfo, setSessionInfo] = useState<SessionInfo | null>(null);
  const [apiError, setApiError] = useState<ChatApiError | null>(null);
  const [input, setInput] = useState("");
  const [transport] = useState(() => createChatTransport());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // "Select an option" / "Close the quote" (feature spec items 1 and 3): the
  // active quote lives server-side (lib/db/quotes.ts), never trusted from
  // chat message parts — GET /api/quote is the source of truth, including
  // across a page reload (useChat's message list isn't persisted).
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);
  const [selectingHospital, setSelectingHospital] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closingSummary, setClosingSummary] = useState<ClosingSummary | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const { messages, sendMessage, status, clearError } = useChat({
    transport,
    onError: (err) => {
      const parsed = parseChatError(err);
      setApiError(parsed);
      if (parsed?.code === "NO_SESSION") {
        setSessionState("redirecting");
        router.replace("/");
      }
    },
  });

  // Session check (Phase 4 addition: GET /api/session) — no valid session -> redirect to "/".
  useEffect(() => {
    let cancelled = false;
    fetch("/api/session")
      .then(async (res) => {
        if (res.status === 401) {
          if (!cancelled) {
            setSessionState("redirecting");
            router.replace("/");
          }
          return null;
        }
        if (!res.ok) throw new Error("session check failed");
        return (await res.json()) as { nombre: string; plan: string };
      })
      .then((data) => {
        if (cancelled || !data) return;
        setSessionInfo({ nombre: data.nombre, plan: data.plan });
        setSessionState("ready");
      })
      .catch(() => {
        // A flaky health check shouldn't block the chat — the first real
        // /api/chat call will surface NO_SESSION if there truly isn't one.
        if (!cancelled) setSessionState("ready");
      });
    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const isBusy = status === "submitted" || status === "streaming";

  // Loads the session's active quote (lib/db/quotes.ts, via GET /api/quote):
  // once the session is ready (covers a page reload — useChat's own message
  // list isn't persisted), and again every time a turn finishes (`status`
  // back to "ready"), since it may have called cotizar_consulta and
  // created/replaced the active quote. Same inline fetch-chain style as the
  // session-check effect above, to avoid a `set-state-in-effect` lint error
  // from calling an extracted async helper directly in the effect body.
  useEffect(() => {
    if (sessionState !== "ready") return;
    let cancelled = false;
    fetch("/api/quote")
      .then(async (res) => (res.ok ? ((await res.json()) as { quote: QuoteResponse | null }) : null))
      .then((data) => {
        if (!cancelled && data) setActiveQuote(data.quote);
      })
      .catch(() => {
        // Best-effort: the chat itself still works without this panel.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionState, status]);

  async function handleSelect(hospital: string): Promise<void> {
    setSelectingHospital(hospital);
    setSelectError(null);
    try {
      const res = await fetch("/api/quote/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ hospital }),
      });
      const data = (await res.json()) as { quote?: QuoteResponse; error?: { message?: string } };
      if (!res.ok || !data.quote) {
        setSelectError(data.error?.message ?? "No se pudo elegir ese hospital. Intenta de nuevo.");
        return;
      }
      setActiveQuote(data.quote);
    } catch {
      setSelectError("No se pudo elegir ese hospital. Intenta de nuevo.");
    } finally {
      setSelectingHospital(null);
    }
  }

  async function handleClose(): Promise<void> {
    setClosing(true);
    setCloseError(null);
    try {
      const res = await fetch("/api/quote/close", { method: "POST" });
      const data = (await res.json()) as { summary?: ClosingSummary; error?: { message?: string } };
      if (!res.ok || !data.summary) {
        setCloseError(data.error?.message ?? "No se pudo cerrar la cotización. Intenta de nuevo.");
        return;
      }
      setClosingSummary(data.summary);
      setActiveQuote((prev) => (prev ? { ...prev, estado: "cerrada" } : prev));
    } catch {
      setCloseError("No se pudo cerrar la cotización. Intenta de nuevo.");
    } finally {
      setClosing(false);
    }
  }

  const rateLimited = apiError?.code === "RATE_LIMITED";
  const llmDown = apiError?.code === "LLM_UNAVAILABLE";
  // The interactive quote panel below renders the active quote once
  // (DB-backed); this message's own inline quote card is hidden for that
  // one toolCallId to avoid showing the exact same quote twice.
  const latestQuoteToolCallId = extractLatestQuote(messages)?.toolCallId ?? null;
  const trimmedInput = input.trim();
  const canSend = trimmedInput.length > 0 && trimmedInput.length <= MAX_MESSAGE_LENGTH && !isBusy && !rateLimited;

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSend) return;
    setApiError(null);
    clearError();
    void sendMessage({ text: trimmedInput });
    setInput("");
  }

  async function handleChangePolicy(): Promise<void> {
    await fetch("/api/session", { method: "DELETE" });
    router.push("/");
  }

  if (sessionState !== "ready") {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-1 flex-col gap-3 px-4 py-10" aria-busy="true">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-3/4" />
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-2xl flex-1 flex-col px-4 py-4 sm:py-6">
      <header className="flex items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <p className="font-semibold">Copi</p>
          {sessionInfo && (
            <p className="text-xs text-muted-foreground">
              {sessionInfo.nombre} · {sessionInfo.plan}
            </p>
          )}
        </div>
        <Button variant="ghost" size="sm" onClick={() => void handleChangePolicy()} className="gap-1.5">
          <LogOut className="size-4" aria-hidden="true" />
          Cambiar póliza
        </Button>
      </header>

      <div className="flex flex-1 flex-col gap-4 overflow-y-auto py-4">
        {messages.length === 0 && (
          <p className="mt-8 text-center text-sm text-muted-foreground">
            Contame qué síntoma tenés y te ayudo a saber qué especialidad te conviene y cuánto vas a pagar.
          </p>
        )}

        {messages.map((message) => (
          <ChatMessageBubble key={message.id} message={message} hideQuoteToolCallId={activeQuote ? latestQuoteToolCallId : null} />
        ))}

        {isBusy && (
          <div className="flex flex-col gap-2" aria-live="polite" aria-label="Copi está escribiendo">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

        {activeQuote && (
          <div className="flex w-full flex-col gap-2">
            <QuoteCard
              quote={activeQuote}
              seleccion={activeQuote.seleccion}
              estado={activeQuote.estado}
              onSelect={(hospital) => void handleSelect(hospital)}
              selectingHospital={selectingHospital}
            />
            {selectError && <p className="text-xs text-destructive">{selectError}</p>}

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!activeQuote.seleccion || closing}
                onClick={() => void handleClose()}
              >
                {closing
                  ? "Cerrando…"
                  : activeQuote.estado === "cerrada"
                    ? "Ver resumen de cierre"
                    : "Cerrar cotización"}
              </Button>
              {!activeQuote.seleccion && (
                <p className="text-xs text-muted-foreground">Elige un hospital para poder cerrar la cotización.</p>
              )}
            </div>
            {closeError && <p className="text-xs text-destructive">{closeError}</p>}
          </div>
        )}

        {closingSummary && <ClosingSummaryCard summary={closingSummary} />}

        <TracePanel entries={extractToolTrace(messages)} />

        <div ref={bottomRef} />
      </div>

      {apiError && !rateLimited && (
        <Alert variant="destructive" className="mb-3">
          <AlertTriangle />
          <AlertTitle>{llmDown ? "El asistente no está disponible" : "Algo salió mal"}</AlertTitle>
          <AlertDescription>{apiError.message}</AlertDescription>
        </Alert>
      )}

      {rateLimited && (
        <Alert className="mb-3">
          <AlertTriangle />
          <AlertTitle>Llegaste al límite de mensajes</AlertTitle>
          <AlertDescription>{apiError?.message}</AlertDescription>
        </Alert>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 border-t border-border pt-3">
        <Textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              handleSubmit(event);
            }
          }}
          placeholder="Describe tu síntoma..."
          maxLength={MAX_MESSAGE_LENGTH}
          disabled={isBusy || rateLimited}
          aria-label="Mensaje para Copi"
          className="min-h-10"
        />
        <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar mensaje">
          <Send className="size-4" />
        </Button>
      </form>

      <p className="pt-2 text-center text-xs text-muted-foreground">{DISCLAIMER}</p>
    </div>
  );
}

function ChatMessageBubble({
  message,
  hideQuoteToolCallId,
}: {
  message: UIMessage;
  /** toolCallId to skip rendering inline — the interactive active-quote panel (app/chat/page.tsx) already shows it. */
  hideQuoteToolCallId: string | null;
}) {
  const isUser = message.role === "user";
  const emergency = !isUser ? extractEmergencyData(message) : null;
  const quote = !isUser ? extractLatestQuote([message]) : null;
  const text = getMessageText(message);
  const showQuote = quote && quote.toolCallId !== hideQuoteToolCallId;

  return (
    <div className={"flex flex-col gap-2 " + (isUser ? "items-end" : "items-start")}>
      {emergency && <EmergencyBanner data={emergency} />}

      {text.length > 0 && (
        <div
          className={
            "max-w-[85%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap " +
            (isUser ? "bg-primary text-primary-foreground" : "bg-muted text-foreground")
          }
        >
          {text}
        </div>
      )}

      {showQuote && quote && (
        <div className="w-full">
          <QuoteCard quote={quote.output} />
        </div>
      )}
    </div>
  );
}
