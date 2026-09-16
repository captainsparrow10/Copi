CREATE TABLE "cotizaciones" (
	"id" text PRIMARY KEY NOT NULL,
	"poliza" text NOT NULL,
	"especialidad_id" text NOT NULL,
	"payload" jsonb NOT NULL,
	"seleccion" text,
	"estado" text DEFAULT 'abierta' NOT NULL,
	"creado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"actualizado_en" timestamp with time zone DEFAULT now() NOT NULL,
	"cerrado_en" timestamp with time zone,
	CONSTRAINT "cotizaciones_estado_check" CHECK ("cotizaciones"."estado" IN ('abierta', 'cerrada'))
);
--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_poliza_asegurados_poliza_fk" FOREIGN KEY ("poliza") REFERENCES "public"."asegurados"("poliza") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cotizaciones" ADD CONSTRAINT "cotizaciones_especialidad_id_especialidades_id_fk" FOREIGN KEY ("especialidad_id") REFERENCES "public"."especialidades"("id") ON DELETE no action ON UPDATE no action;