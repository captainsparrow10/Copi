/**
 * Shared constants with zero server-only dependencies (no `db`, no `ai`
 * provider setup), so app/chat/page.tsx (a Client Component) can import them
 * directly. Importing lib/agent/run.ts from client code would pull in
 * `postgres`/`drizzle` and break the client bundle (Node core modules like
 * `net`/`tls`/`fs` aren't polyfilled for the browser) — see the `npm run
 * build` failure this fixed.
 */

/** PRD 7.7 step 3. Mirrored by lib/agent/run.ts's own copy of this limit for the server-side check. */
export const MAX_MESSAGE_LENGTH = 500;
