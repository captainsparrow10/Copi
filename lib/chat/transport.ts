/**
 * `/api/chat`'s Phase 3 contract is the deliberately simple
 * `{ messages: { role, content }[] }` (lib/agent/run.ts's `ChatMessage`),
 * not the richer `UIMessage[]` that `@ai-sdk/react`'s `useChat` (v7, `ai`
 * package v7) sends by default via `DefaultChatTransport`. Rather than
 * loosen the route's validation to accept full `UIMessage[]`, this adapts
 * the client: `prepareSendMessagesRequest` re-maps the request body with
 * `toChatMessages` right before it's sent, so the server contract (and its
 * strict `isValidMessages` check in app/api/chat/route.ts) doesn't change.
 */
import { DefaultChatTransport, type UIMessage } from "ai";
import { toChatMessages } from "./ui-message";

export function createChatTransport() {
  return new DefaultChatTransport<UIMessage>({
    api: "/api/chat",
    prepareSendMessagesRequest: ({ messages }) => ({
      body: { messages: toChatMessages(messages) },
    }),
  });
}
