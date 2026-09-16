/**
 * The patient workspace (app/chat/page.tsx) lists the demo patients itself,
 * so the root just sends visitors there.
 */
import { redirect } from "next/navigation";

export default function Home(): never {
  redirect("/chat");
}
