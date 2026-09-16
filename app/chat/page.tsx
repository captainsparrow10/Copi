/**
 * Patient workspace: demo patients on the left, streaming chat in the middle
 * (`useChat` v7 against `/api/chat` through lib/chat/transport.ts), and the
 * active patient's insurance profile on the right. Switching patient or
 * starting a new consultation creates a fresh session (new `sid`), so each run
 * starts with an empty chat and no stored quote. Below `lg` the side panels
 * stack above and below the chat.
 */
"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowRight, LogOut, RotateCcw } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { QuoteCard } from "@/components/QuoteCard";
import { ClosingSummaryCard } from "@/components/ClosingSummaryCard";
import { EmergencyBanner } from "@/components/chat/EmergencyBanner";
import { TracePanel } from "@/components/TracePanel";
import { Logo } from "@/components/brand/Logo";
import { PatientList, type DemoPatient } from "@/components/workspace/PatientList";
import { ProfilePanel } from "@/components/workspace/ProfilePanel";
import { createChatTransport } from "@/lib/chat/transport";
import { extractEmergencyData, extractLatestQuote, extractToolTrace, getVisibleMessageText } from "@/lib/chat/ui-message";
import { parseChatError, type ChatApiError } from "@/lib/chat/errors";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { DISCLAIMER } from "@/lib/copy";
import { formatMoney } from "@/lib/format/money";
import type { QuoteResponse } from "@/lib/db/quotes";
import type { ClosingSummary } from "@/lib/domain/quote-summary";
import type { PatientProfile } from "@/lib/domain/profile";

type SessionState = "checking" | "active" | "none";

export default function ChatPage() {
  const router = useRouter();
  const [patients, setPatients] = useState<DemoPatient[] | null>(null);
  const [sessionState, setSessionState] = useState<SessionState>("checking");
  // Bumped on every new session (patient switch or "Nueva consulta") so the
  // profile and quote effects refetch for it.
  const [sessionVersion, setSessionVersion] = useState(0);
  const [switchingPoliza, setSwitchingPoliza] = useState<string | null>(null);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [profile, setProfile] = useState<PatientProfile | null>(null);
  const [apiError, setApiError] = useState<ChatApiError | null>(null);
  const [input, setInput] = useState("");
  const [transport] = useState(() => createChatTransport());
  const bottomRef = useRef<HTMLDivElement | null>(null);

  // The active quote lives server-side (lib/db/quotes.ts), never trusted from
  // chat message parts — GET /api/quote is the source of truth.
  const [activeQuote, setActiveQuote] = useState<QuoteResponse | null>(null);
  const [selectingHospital, setSelectingHospital] = useState<string | null>(null);
  const [selectError, setSelectError] = useState<string | null>(null);
  const [closing, setClosing] = useState(false);
  const [closingSummary, setClosingSummary] = useState<ClosingSummary | null>(null);
  const [closeError, setCloseError] = useState<string | null>(null);

  const { messages, sendMessage, setMessages, status, stop, clearError } = useChat({
    transport,
    onError: (err) => {
      const parsed = parseChatError(err);
      setApiError(parsed);
      if (parsed?.code === "NO_SESSION") {
        setSessionState("none");
      }
    },
  });

  useEffect(() => {
    let cancelled = false;
    fetch("/api/demo-policies")
      .then(async (res) => (res.ok ? ((await res.json()) as { polizas: DemoPatient[] }) : null))
      .then((data) => {
        if (!cancelled && data) setPatients(data.polizas);
      })
      .catch(() => {
        if (!cancelled) setPatients([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Profile doubles as the session check: 401 means no session yet.
  useEffect(() => {
    let cancelled = false;
    fetch("/api/profile")
      .then(async (res) => {
        if (res.status === 401) return null;
        if (!res.ok) throw new Error("profile failed");
        return ((await res.json()) as { profile: PatientProfile }).profile;
      })
      .then((data) => {
        if (cancelled) return;
        setProfile(data);
        setSessionState(data ? "active" : "none");
      })
      .catch(() => {
        if (!cancelled) setSessionState("none");
      });
    return () => {
      cancelled = true;
    };
  }, [sessionVersion]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, activeQuote, closingSummary]);

  const isBusy = status === "submitted" || status === "streaming";

  // Reload the active quote once the session is active and after every turn
  // (it may have called cotizar_consulta and replaced the quote).
  useEffect(() => {
    if (sessionState !== "active") return;
    let cancelled = false;
    fetch("/api/quote")
      .then(async (res) => (res.ok ? ((await res.json()) as { quote: QuoteResponse | null }) : null))
      .then((data) => {
        if (cancelled || !data) return;
        setActiveQuote(data.quote);
        // A new symptom creates a new active quote: drop the previous quote's closing summary.
        setClosingSummary((prev) => (prev && prev.quoteId !== data.quote?.id ? null : prev));
      })
      .catch(() => {
        // Best-effort: the chat itself still works without this panel.
      });
    return () => {
      cancelled = true;
    };
  }, [sessionState, status, sessionVersion]);

  /** Starts a fresh session for `poliza`: empty chat, no quote, new server-side sid. */
  async function startSession(poliza: string): Promise<void> {
    setSwitchingPoliza(poliza);
    setSwitchError(null);
    try {
      stop();
      const res = await fetch("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ poliza }),
      });
      if (!res.ok) {
        setSwitchError("No se pudo abrir ese paciente. Intenta de nuevo.");
        return;
      }
      setMessages([]);
      setInput("");
      setApiError(null);
      clearError();
      setActiveQuote(null);
      setSelectError(null);
      setClosingSummary(null);
      setCloseError(null);
      setProfile(null);
      setSessionState("checking");
      setSessionVersion((v) => v + 1);
    } catch {
      setSwitchError("No se pudo abrir ese paciente. Intenta de nuevo.");
    } finally {
      setSwitchingPoliza(null);
    }
  }

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
  // The interactive quote panel renders the active quote once (DB-backed);
  // the message's own inline quote card is hidden for that toolCallId.
  const latestQuoteToolCallId = extractLatestQuote(messages)?.toolCallId ?? null;
  const trimmedInput = input.trim();
  const hasSession = sessionState === "active";
  const canSend =
    hasSession && trimmedInput.length > 0 && trimmedInput.length <= MAX_MESSAGE_LENGTH && !isBusy && !rateLimited;
  const quoteClosed = activeQuote?.estado === "cerrada";

  function handleSubmit(event: FormEvent): void {
    event.preventDefault();
    if (!canSend) return;
    setApiError(null);
    clearError();
    void sendMessage({ text: trimmedInput });
    setInput("");
  }

  /** Ends the session and goes back to the landing page. */
  async function handleExit(): Promise<void> {
    stop();
    try {
      await fetch("/api/session", { method: "DELETE" });
    } finally {
      router.push("/");
    }
  }

  function handleNewConsultation(): void {
    if (profile) void startSession(profile.poliza);
  }

  return (
    <div className="mx-auto grid min-h-dvh w-full max-w-[1440px] grid-cols-1 gap-4 px-4 py-4 lg:h-dvh lg:grid-cols-[264px_minmax(0,1fr)_340px] lg:gap-5 lg:py-3.5">
      <div className="lg:overflow-y-auto">
        <div className="mb-7 flex flex-col gap-1.5 px-3.5 pt-3.5">
          <div className="flex items-center justify-between gap-2">
            <Link href="/" aria-label="Ir al inicio" className="w-fit rounded-lg focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
              <Logo size={30} />
            </Link>
            <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => void handleExit()}>
              <LogOut className="size-3.5" aria-hidden="true" />
              Salir
            </Button>
          </div>
          <p className="text-[13px] text-muted-foreground">Tu copago, antes de atenderte</p>
        </div>
        <PatientList
          patients={patients}
          activePoliza={profile?.poliza ?? null}
          switchingPoliza={switchingPoliza}
          onSelect={(poliza) => void startSession(poliza)}
        />
        {switchError && <p className="mt-2 text-xs text-destructive">{switchError}</p>}
      </div>

      <main className="flex min-h-[70dvh] flex-col overflow-hidden rounded-[20px] bg-card shadow-soft lg:min-h-0">
        <header className="flex items-center justify-between gap-3 border-b border-border/70 px-7 py-4">
          <div className="min-w-0">
            <p className="truncate text-[15px] font-semibold">{profile ? profile.nombre : "Nueva conversación"}</p>
            <p className="text-[13px] text-muted-foreground">
              {profile ? `${profile.poliza} · ${profile.plan.nombre}` : "Elige un paciente para empezar"}
            </p>
          </div>
          <Button
            variant={quoteClosed ? "default" : "outline"}
            size="lg"
            className="gap-1.5 rounded-xl"
            disabled={!hasSession || switchingPoliza !== null || (messages.length === 0 && !activeQuote)}
            onClick={handleNewConsultation}
          >
            <RotateCcw className="size-4" aria-hidden="true" />
            Nueva consulta
          </Button>
        </header>

        <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-7 py-6">
          {sessionState === "checking" && (
            <div className="flex flex-col gap-2" aria-busy="true">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-4 w-1/2" />
            </div>
          )}

          {sessionState === "none" && (
            <div className="mx-auto my-auto flex max-w-[520px] flex-col gap-3 py-8">
              <p className="text-3xl leading-tight font-semibold tracking-tight">Antes de ir al médico, sabe cuánto vas a pagar.</p>
              <p className="text-base leading-relaxed text-muted-foreground">
                Elige un paciente de prueba a la izquierda. Cada uno tiene un plan distinto, así puedes comparar resultados.
              </p>
            </div>
          )}

          {hasSession && messages.length === 0 && (
            <p className="mx-auto my-auto max-w-[460px] text-center text-[15px] leading-relaxed text-muted-foreground">
              Cuéntame qué síntoma tienes y te digo qué especialista te conviene y cuánto vas a pagar con tu plan.
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

              {!quoteClosed && (
                <div className="flex items-center justify-between gap-3 rounded-2xl bg-card py-2.5 pr-2.5 pl-4.5 shadow-soft">
                  {activeQuote.seleccion ? (
                    <span className="min-w-0 truncate text-sm">
                      {activeQuote.seleccion} ·{" "}
                      <span className="font-semibold tabular-nums">
                        {formatMoney(activeQuote.opciones.find((o) => o.hospital === activeQuote.seleccion)?.total_paciente ?? 0)}
                      </span>
                    </span>
                  ) : (
                    <span className="text-sm text-muted-foreground">Elige un hospital para cerrar tu cotización.</span>
                  )}
                  <Button
                    type="button"
                    size="lg"
                    className="h-10 rounded-xl px-4"
                    disabled={!activeQuote.seleccion || closing}
                    onClick={() => void handleClose()}
                  >
                    {closing ? "Cerrando…" : "Cerrar cotización"}
                  </Button>
                </div>
              )}
              {quoteClosed && !closingSummary && (
                <Button type="button" variant="outline" size="lg" className="self-start rounded-xl" onClick={() => void handleClose()}>
                  Ver resumen de cierre
                </Button>
              )}
              {closeError && <p className="text-xs text-destructive">{closeError}</p>}
            </div>
          )}

          {closingSummary && (
            <div className="flex flex-col gap-2">
              <ClosingSummaryCard summary={closingSummary} />
              <div className="flex items-center justify-between gap-3 rounded-2xl bg-card py-2.5 pr-2.5 pl-4.5 shadow-soft">
                <span className="text-sm text-muted-foreground">¿Otra duda o síntoma?</span>
                <Button type="button" size="lg" className="h-10 gap-1.5 rounded-xl px-4" onClick={handleNewConsultation}>
                  <RotateCcw className="size-4" aria-hidden="true" />
                  Empezar una nueva consulta
                </Button>
              </div>
            </div>
          )}

          <TracePanel entries={extractToolTrace(messages)} />

          <div ref={bottomRef} />
        </div>

        <div className="px-7 pt-3.5 pb-4">
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
              <AlertDescription>{apiError?.message} Puedes empezar una nueva consulta.</AlertDescription>
            </Alert>
          )}

          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-2 rounded-2xl bg-card py-1.5 pr-1.5 pl-4 ring-1 ring-border focus-within:ring-2 focus-within:ring-ring"
          >
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  handleSubmit(event);
                }
              }}
              placeholder={hasSession ? "Escribe tu síntoma o una pregunta…" : "Primero elige un paciente"}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={!hasSession || isBusy || rateLimited}
              aria-label="Mensaje para Copi"
              className="min-h-10 resize-none border-0 bg-transparent px-0 py-2 text-[15px] shadow-none focus-visible:ring-0 dark:bg-transparent"
            />
            <Button type="submit" size="icon" disabled={!canSend} aria-label="Enviar mensaje" className="size-10 rounded-xl">
              <ArrowRight className="size-4" />
            </Button>
          </form>

          <p className="pt-2.5 text-center text-xs text-muted-foreground">{DISCLAIMER}</p>
        </div>
      </main>

      <div className="lg:overflow-y-auto lg:py-3.5 lg:pr-4 lg:pl-1">
        <ProfilePanel profile={profile} loading={sessionState === "checking"} />
      </div>
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
  const text = getVisibleMessageText(message);
  const showQuote = quote && quote.toolCallId !== hideQuoteToolCallId;

  return (
    <div className={"flex flex-col gap-2 " + (isUser ? "items-end" : "items-start")}>
      {emergency && <EmergencyBanner data={emergency} />}

      {text.length > 0 && (
        <div
          className={
            isUser
              ? "max-w-[68%] rounded-[18px] rounded-br-md bg-secondary px-4 py-3 text-[15px] leading-relaxed whitespace-pre-wrap"
              : "flex max-w-[78%] flex-col gap-1.5"
          }
        >
          {isUser ? (
            text
          ) : (
            <>
              <span className="text-xs font-medium text-muted-foreground">Copi</span>
              <p className="text-[15px] leading-relaxed whitespace-pre-wrap">{text}</p>
            </>
          )}
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
