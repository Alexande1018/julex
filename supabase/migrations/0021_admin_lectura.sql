-- JULEX · el administrador puede leer el historial de un local
--
-- Hacía falta para poder exportar los datos de un local desde su ficha:
-- visitas, recompensas y movimientos no estaban en la lista de lectura
-- del administrador. Solo lectura; para escribir están las funciones.

do $$
declare t text;
begin
  foreach t in array array['visitas', 'recompensas', 'movimientos_fidelizacion']
  loop
    execute format(
      'drop policy if exists "admin: lectura total" on %I;
       create policy "admin: lectura total" on %I
         for select to authenticated using (public.soy_admin());', t, t);
  end loop;
end $$;
