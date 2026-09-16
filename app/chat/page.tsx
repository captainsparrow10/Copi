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
import { EmergencyBanner } from "@/components/chat/EmergencyBanner";
import { TracePanel } from "@/components/TracePanel";
import { createChatTransport } from "@/lib/chat/transport";
import { extractEmergencyData, extractLatestQuote, extractToolTrace, getMessageText } from "@/lib/chat/ui-message";
import { parseChatError, type ChatApiError } from "@/lib/chat/errors";
import { MAX_MESSAGE_LENGTH } from "@/lib/chat/constants";
import { DISCLAIMER } from "@/lib/copy";

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
  const rateLimited = apiError?.code === "RATE_LIMITED";
  const llmDown = apiError?.code === "LLM_UNAVAILABLE";
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
          <ChatMessageBubble key={message.id} message={message} />
        ))}

        {isBusy && (
          <div className="flex flex-col gap-2" aria-live="polite" aria-label="Copi está escribiendo">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        )}

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

function ChatMessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const emergency = !isUser ? extractEmergencyData(message) : null;
  const quote = !isUser ? extractLatestQuote([message]) : null;
  const text = getMessageText(message);

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

      {quote && (
        <div className="w-full">
          <QuoteCard quote={quote.output} />
        </div>
      )}
    </div>
  );
}
