CREATE TABLE "asegurados" (
	"poliza" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"plan_id" text,
	"fecha_inicio" date NOT NULL,
	"deducible_usado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"gasto_acumulado" numeric(10, 2) DEFAULT '0' NOT NULL,
	"activa" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "documentos" (
	"id" text PRIMARY KEY NOT NULL,
	"tipo" text NOT NULL,
	"plan_id" text,
	"titulo" text NOT NULL,
	CONSTRAINT "documentos_tipo_check" CHECK ("documentos"."tipo" IN ('guia', 'poliza'))
);
--> statement-breakpoint
CREATE TABLE "especialidades" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "fragmentos" (
	"id" text PRIMARY KEY NOT NULL,
	"documento_id" text,
	"especialidad_id" text,
	"contenido" text NOT NULL,
	"embedding" vector(768) NOT NULL,
	"embedding_model" text NOT NULL
);
--> statement-breakpoint
CREATE TABLE "hospitales" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"tier" char(1) NOT NULL,
	"zona" text NOT NULL,
	"en_red" boolean DEFAULT true NOT NULL,
	CONSTRAINT "hospitales_tier_check" CHECK ("hospitales"."tier" IN ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE "plan_tier_reglas" (
	"plan_id" text,
	"tier" char(1) NOT NULL,
	"coaseguro" numeric(4, 3) NOT NULL,
	"copago_fijo" numeric(10, 2) NOT NULL,
	CONSTRAINT "plan_tier_reglas_plan_id_tier_pk" PRIMARY KEY("plan_id","tier"),
	CONSTRAINT "plan_tier_reglas_tier_check" CHECK ("plan_tier_reglas"."tier" IN ('A', 'B', 'C'))
);
--> statement-breakpoint
CREATE TABLE "planes" (
	"id" text PRIMARY KEY NOT NULL,
	"nombre" text NOT NULL,
	"deducible_anual" numeric(10, 2) NOT NULL,
	"tope_anual_bolsillo" numeric(10, 2) NOT NULL,
	"carencia_especialidad_dias" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tarifario" (
	"hospital_id" text,
	"especialidad_id" text,
	"servicio" text DEFAULT 'consulta' NOT NULL,
	"precio" numeric(10, 2) NOT NULL,
	CONSTRAINT "tarifario_hospital_id_especialidad_id_servicio_pk" PRIMARY KEY("hospital_id","especialidad_id","servicio")
);
--> statement-breakpoint
CREATE TABLE "trazas" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sesion_id" text NOT NULL,
	"evento" text NOT NULL,
	"detalle" jsonb NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
ALTER TABLE "asegurados" ADD CONSTRAINT "asegurados_plan_id_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documentos" ADD CONSTRAINT "documentos_plan_id_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragmentos" ADD CONSTRAINT "fragmentos_documento_id_documentos_id_fk" FOREIGN KEY ("documento_id") REFERENCES "public"."documentos"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fragmentos" ADD CONSTRAINT "fragmentos_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_tier_reglas" ADD CONSTRAINT "plan_tier_reglas_plan_id_planes_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."planes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifario" ADD CONSTRAINT "tarifario_hospital_id_hospitales_id_fk" FOREIGN KEY ("hospital_id") REFERENCES "public"."hospitales"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tarifario" ADD CONSTRAINT "tarifario_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "fragmentos_embedding_hnsw_idx" ON "fragmentos" USING hnsw ("embedding" vector_cosine_ops);