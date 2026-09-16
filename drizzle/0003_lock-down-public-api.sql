-- Copi only reaches Postgres from the server through its own connection. Hosted
-- backends (InsForge/PostgREST) expose the public schema to the anon and
-- authenticated roles by default, which would let anyone read traces or edit the
-- tariff table through the REST API. Remove that access and enable RLS (with no
-- policies) as a second barrier. The table owner connection is unaffected.
DO $$
DECLARE
  app_table text;
  api_role text;
BEGIN
  FOREACH app_table IN ARRAY ARRAY[
    'planes', 'plan_tier_reglas', 'asegurados', 'hospitales', 'especialidades',
    'tarifario', 'documentos', 'fragmentos', 'trazas', 'cotizaciones'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', app_table);
    FOREACH api_role IN ARRAY ARRAY['anon', 'authenticated'] LOOP
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = api_role) THEN
        EXECUTE format('REVOKE ALL ON public.%I FROM %I', app_table, api_role);
      END IF;
    END LOOP;
  END LOOP;
END $$;
