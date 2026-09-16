# Copi — Guía de construcción (entorno local Mac + servidor Ubuntu)

Esta guía convierte el `prd.md` en pasos concretos. Tiene dos partes:
- **Parte 1:** preparar el entorno (lo haces tú, una sola vez).
- **Parte 2:** el prompt para que un agente de programación (Claude Code, Cursor) construya el proyecto por fases.

---

## Distribución de piezas

| Equipo | Qué corre | Por qué |
|---|---|---|
| **Servidor Ubuntu (RTX 3080 Ti)** | Ollama (`qwen2.5:14b`, `nomic-embed-text`) + Postgres/pgvector en Docker | La GPU hace el trabajo pesado; la Mac no gasta batería |
| **Mac M4 Pro** | Editor, Node.js, Next.js (`npm run dev`), tests y evals | Donde programas |
| **Nube (al final)** | Vercel + Gemini + Postgres gestionado | URL pública para la entrega |

```
Mac (Next.js :3000) ──LAN──► Servidor
                              ├─ Ollama      :11434
                              └─ Postgres    :5432 (pgvector)
```

## Stack

| Capa | Tecnología |
|---|---|
| Lenguaje | TypeScript (strict) |
| Framework | Next.js (App Router, versión estable actual) |
| Agente | Vercel AI SDK (`ai`, `@ai-sdk/react`) + Zod |
| Proveedor LLM local | `@ai-sdk/openai-compatible` → Ollama (`http://SERVIDOR:11434/v1`) |
| Proveedor LLM nube | `@ai-sdk/google` → Gemini Flash-Lite |
| Embeddings | Ollama `/api/embed` (`nomic-embed-text`, 768 dims) · Gemini en prod (768 dims) |
| Base de datos | PostgreSQL 16 + pgvector (imagen `pgvector/pgvector:pg16`) |
| ORM | Drizzle ORM + drizzle-kit + `postgres` (driver) |
| UI | Tailwind CSS + shadcn/ui + lucide-react |
| Sesión | `jose` (JWT HS256 en cookie httpOnly) |
| Tests | Vitest |
| Scripts | `tsx` |
| Hosting | Vercel (Hobby) |

---

## Parte 1 — Preparar el entorno

### 1.1 Servidor Ubuntu

Ollama ya instalado y escuchando en la red (`OLLAMA_HOST=0.0.0.0`). Verifica:

```bash
nvidia-smi
ollama list          # debe mostrar qwen2.5:14b y nomic-embed-text
```

Postgres con pgvector:

```bash
mkdir -p ~/copi-db && cd ~/copi-db
cat > docker-compose.yml <<'EOF'
services:
  db:
    image: pgvector/pgvector:pg16
    restart: unless-stopped
    environment:
      POSTGRES_USER: copi
      POSTGRES_PASSWORD: CAMBIA_ESTA_CLAVE
      POSTGRES_DB: copago
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
volumes:
  pgdata:
EOF
docker compose up -d
docker compose exec db psql -U copi -d copago -c "CREATE EXTENSION IF NOT EXISTS vector;"
```

Firewall (solo tu red local; ajusta el rango si no es `192.168.1.0/24`):

```bash
sudo ufw allow from 192.168.1.0/24 to any port 11434
sudo ufw allow from 192.168.1.0/24 to any port 5432
sudo ufw status
```

> Nunca abras 11434 ni 5432 en el router. Ollama no tiene autenticación.

### 1.2 Mac

```bash
brew install node git
node -v                                   # 20 o superior
npm i -g @anthropic-ai/claude-code        # si usarás Claude Code (opcional)
```

Prueba la conexión al servidor (reemplaza la IP):

```bash
curl http://192.168.1.50:11434/api/tags
nc -zv 192.168.1.50 5432
```

### 1.3 Crear el proyecto

```bash
npx create-next-app@latest copago-agente --ts --tailwind --eslint --app --src-dir=false --import-alias "@/*"
cd copago-agente
git init
mkdir -p docs && cp /ruta/a/prd.md docs/prd.md
```

`.env.local` (y una copia sin secretos como `.env.example`):

```env
LLM_PROVIDER=ollama
OLLAMA_URL=http://192.168.1.50:11434
CHAT_MODEL=qwen2.5:14b
EMBED_MODEL=nomic-embed-text
EMBED_DIM=768
GOOGLE_GENERATIVE_AI_API_KEY=
DATABASE_URL=postgres://copi:CAMBIA_ESTA_CLAVE@192.168.1.50:5432/copago
SESSION_SECRET=genera-uno-con-openssl-rand-base64-32
RAG_MIN_SCORE=0.70
MAX_MESSAGES_PER_SESSION=20
```

```bash
openssl rand -base64 32   # para SESSION_SECRET
```

---

## Parte 2 — Prompt para el agente de programación

Abre Claude Code (o Cursor) dentro de `copago-agente/` y pega lo siguiente. Pídele que avance **una fase a la vez** y que se detenga al terminar cada una.

```text
Vas a construir "Copi", el Estimador Agéntico de Copago descrito en docs/prd.md.
Lee docs/prd.md completo antes de escribir código. Es la fuente de verdad: respeta
nombres de tablas, herramientas, rutas, variables de entorno y estructura de carpetas.

CONTEXTO DEL ENTORNO
- Proyecto Next.js (App Router, TypeScript strict) ya creado con Tailwind.
- Ollama corre en otro equipo de la red: process.env.OLLAMA_URL. Modelo de chat en
  CHAT_MODEL, embeddings en EMBED_MODEL (768 dimensiones).
- Postgres 16 con pgvector ya corre en DATABASE_URL (extensión vector creada).
- No uses Docker en este equipo.
- Variables en .env.local. Nunca escribas secretos en el código.

STACK (no agregues otras dependencias sin justificarlo)
ai, @ai-sdk/react, @ai-sdk/openai-compatible, @ai-sdk/google, zod,
drizzle-orm, drizzle-kit, postgres, jose, shadcn/ui, lucide-react,
vitest, tsx, dotenv.
Antes de escribir código del AI SDK, revisa la versión instalada y usa su API vigente
(definición de tools, límite de pasos, streaming hacia useChat, render de partes de herramienta).

REGLAS NO NEGOCIABLES
1. lib/domain/copay.ts es una función pura (sin DB ni LLM) que implementa exactamente
   las reglas de la sección 7.4 del PRD, con tests por cada regla.
2. Ninguna herramienta recibe número de póliza: se obtiene de la sesión en el servidor.
3. El enum de especialidades se construye desde la base de datos.
4. La tarjeta de cotización se renderiza desde la salida de la herramienta, nunca
   parseando el texto del modelo.
5. Implementa las capas de la sección 7.8: filtro de emergencias antes del LLM,
   umbral de "no sé" en código, validador de montos y (P1) de citas.
6. lib/agent/provider.ts es el único archivo que conoce el proveedor:
   LLM_PROVIDER=ollama usa createOpenAICompatible con baseURL `${OLLAMA_URL}/v1`;
   LLM_PROVIDER=google usa @ai-sdk/google. Lo mismo para embeddings en lib/rag/embed.ts
   (Ollama: POST ${OLLAMA_URL}/api/embed).
7. temperature 0.2, máximo 5 pasos de herramientas por turno, historial de 12 mensajes.
8. Todos los datos son simulados y los hospitales tienen nombres ficticios.
9. Escribe código claro, con tipos explícitos y sin lógica duplicada.

FASES (detente al final de cada una, ejecuta las verificaciones y muéstrame el resultado)

FASE 1 — Base de datos y dominio
- lib/db/schema.ts con Drizzle según la sección 7.3 (vector(768) + índice HNSW coseno).
- drizzle.config.ts y scripts: db:generate, db:migrate.
- data/seeds/*.json con los datos de la tabla "Datos semilla" del PRD
  (3 planes, 9 reglas por tier, 5 asegurados que cubran todos los casos,
  6 hospitales con 1 fuera de red, 8 especialidades, ~40 filas de tarifario).
- scripts/seed.ts (idempotente).
- lib/domain/copay.ts + tests/copay.test.ts.
Verificación: npm run db:migrate && npm run db:seed && npm test

FASE 2 — RAG
- data/docs/guia-especialidades.md (~30 entradas síntoma → especialidad, con ids G-n).
- data/docs/poliza-basico.md, poliza-estandar.md, poliza-premium.md
  (cobertura, exclusiones, carencias, glosario; cláusulas con ids C-x.y).
- lib/rag/embed.ts, lib/rag/search.ts (top-k 4, similitud coseno, filtro RAG_MIN_SCORE,
  y filtro por plan para pólizas).
- scripts/ingest.ts: fragmenta, genera embeddings, guarda embedding_model; reejecutable.
Verificación: npm run ingest y un script que busque "me duele la rodilla"
y muestre traumatologia como primer resultado.

FASE 3 — Agente y API
- lib/session.ts (jose, cookie copi_session httpOnly, 2 h).
- lib/guards/emergency.ts (frases del Anexo B, texto normalizado sin tildes),
  amount-validator.ts, citation-validator.ts, rate-limit.ts (en memoria).
- lib/agent/system-prompt.ts (Anexo A, con nombre y plan inyectados),
  lib/agent/tools.ts (buscar_especialidad, cotizar_consulta, obtener_resumen_plan,
  buscar_en_poliza), lib/agent/run.ts (pipeline de la sección 7.7).
- Rutas: /api/demo-policies, /api/session (POST/DELETE), /api/chat, /api/health.
- Registro de trazas en la tabla trazas.
- tests para emergency, amount-validator y tools (con DB de pruebas o mocks).
Verificación: npm test y curl a /api/health.

FASE 4 — Interfaz
- app/page.tsx: selector de pólizas demo con su plan.
- app/chat/page.tsx: chat con streaming (useChat), mobile-first.
- components/QuoteCard.tsx: opciones ordenadas por costo, desglose, marcas de
  carencia / fuera de red / tope, hospital recomendado destacado.
- components/chat/EmergencyBanner.tsx y components/TracePanel.tsx.
- Disclaimer fijo: "Orientación informativa. No reemplaza una evaluación médica.
  En emergencia llama al 911."
- Estados: cargando, error de LLM, límite de mensajes.
Verificación: recorrer manualmente los flujos 6.1 a 6.6 del PRD.

FASE 5 — Evaluaciones
- evals/casos.jsonl con 40 casos según la tabla de la sección 7.9.
- evals/run.ts: ejecuta cada caso contra el pipeline real, verifica herramientas
  llamadas, argumentos, marcas y bloqueos; genera evals/reporte.md con las métricas
  de la sección 4 del PRD.
Verificación: npm run eval y mostrar el reporte.

FASE 6 — Preparación para producción
- Confirmar que LLM_PROVIDER=google funciona (chat y embeddings a 768 dims).
- README.md: qué es, diagrama de arquitectura, capas de grounding, pólizas demo,
  cómo correr en local, cómo desplegar, reporte de evals.
- .env.example completo.
Verificación: npm run build sin errores.

Al empezar, resume en 5 líneas lo que entendiste del PRD y lista las dudas que tengas.
Luego comienza la FASE 1.
```

---

## Scripts esperados en `package.json`

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:seed": "tsx scripts/seed.ts",
    "ingest": "tsx scripts/ingest.ts",
    "test": "vitest run",
    "eval": "tsx evals/run.ts"
  }
}
```

## Flujo diario

```bash
# Mac
cd copago-agente
npm run dev            # http://localhost:3000
npm test               # tras cambiar lógica
npm run eval           # tras cambiar prompt, herramientas o RAG
```

El servidor no necesita que hagas nada: Ollama y Postgres arrancan solos al encender.

## Paso a producción (resumen)

1. Crear base en la nube (InsForge Cloud o Supabase) y habilitar `vector`.
2. En Vercel: importar el repo y configurar variables con `LLM_PROVIDER=google`,
   la API key de Gemini, la nueva `DATABASE_URL` y `SESSION_SECRET`.
3. Desde la Mac, con esas variables: `npm run db:migrate && npm run db:seed && npm run ingest`.
4. Activar facturación en Gemini con tope de $10.
5. Ejecutar `npm run eval` contra producción y pegar el reporte en el README.
6. Enviar la URL de Vercel y el repo a hackiathon@viamatica.com.

## Si algo falla

| Síntoma | Revisa |
|---|---|
| `ECONNREFUSED ...:11434` | `systemctl status ollama` y `OLLAMA_HOST` en el servidor; regla de `ufw` |
| `ECONNREFUSED ...:5432` | `docker compose ps` en `~/copi-db`; regla de `ufw` |
| `type "vector" does not exist` | Ejecutar `CREATE EXTENSION vector;` |
| El modelo no llama herramientas | Probar `qwen2.5:14b`; revisar descripciones de tools; revisar la API del AI SDK instalado |
| Búsquedas RAG vacías | Ejecutar `npm run ingest`; bajar `RAG_MIN_SCORE` y recalibrar con evals |
| Dimensión de vector incorrecta | Mismo `EMBED_DIM` en esquema, ingesta y consulta; reingestar al cambiar de modelo |
