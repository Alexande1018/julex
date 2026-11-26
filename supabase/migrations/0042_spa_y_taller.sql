-- ============================================================
-- JULEX · spa y taller mecánico
--
-- «Centro de bienestar» pasa a llamarse «Spa», que es como se
-- vende, y entra el taller mecánico. El enum queda en once.
--
-- El valor `masaje` se renombra, no se borra: si algún local lo
-- tuviera, sigue apuntando a lo mismo. La función se sustituye
-- para que nazca con los nombres nuevos.
-- ============================================================

do $$
begin
  if exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
              where t.typname = 'tipo_negocio' and e.enumlabel = 'masaje')
     and not exists (select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
                      where t.typname = 'tipo_negocio' and e.enumlabel = 'spa')
  then
    execute 'alter type tipo_negocio rename value ''masaje'' to ''spa''';
  end if;
end $$;

alter type tipo_negocio add value if not exists 'taller';

-- ------------------------------------------------------------
-- Cómo nace un local de cada oficio
-- ------------------------------------------------------------

/*
 * Primer puesto y tres servicios de partida, según el oficio. Son valores
 * iniciales: el local los cambia en Ajustes sin ninguna restricción.
 *
 * Los servicios son una sola lista con el oficio en la primera columna, no
 * un bloque por oficio: añadir uno nuevo son tres filas más aquí, su bloque
 * de vocabulario y un valor en el enum.
 *
 * Se compara `p_tipo::text` a propósito: así este archivo se puede pegar
 * entero en el SQL Editor aunque acabe de añadir un valor al enum.
 */
create or replace function public.sembrar_local(
  p_barberia uuid,
  p_tipo     tipo_negocio
) returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  insert into sillas (barberia_id, nombre, orden)
  values (p_barberia,
          (case p_tipo::text
             when 'peluqueria' then 'Puesto 1'
             when 'unas'       then 'Mesa 1'
             when 'tatuaje'    then 'Estación 1'
             when 'estetica'   then 'Cabina 1'
             when 'depilacion' then 'Cabina 1'
             when 'canina'     then 'Mesa 1'
             when 'spa'        then 'Camilla 1'
             when 'auto'       then 'Bahía 1'
             when 'taller'     then 'Box 1'
             when 'otro'       then 'Puesto 1'
             else 'Silla 1'
           end), 1);

  insert into servicios (barberia_id, nombre, precio, minutos, orden)
  select p_barberia, x.nombre, x.precio, x.minutos, x.orden
    from (values
      -- barbería
      ('barberia',   'Corte',             15,  30, 1),
      ('barberia',   'Corte + barba',     22,  45, 2),
      ('barberia',   'Niño',              10,  20, 3),
      -- peluquería
      ('peluqueria', 'Corte',             18,  40, 1),
      ('peluqueria', 'Color',             45,  90, 2),
      ('peluqueria', 'Peinado',           15,  30, 3),
      -- salón de uñas
      ('unas',       'Manicura',          20,  45, 1),
      ('unas',       'Pedicura',          25,  50, 2),
      ('unas',       'Semipermanente',    25,  60, 3),
      -- estudio de tatuaje
      ('tatuaje',    'Sesión pequeña',    60,  60, 1),
      ('tatuaje',    'Sesión media',     120, 120, 2),
      ('tatuaje',    'Retoque',           30,  30, 3),
      -- centro de estética
      ('estetica',   'Limpieza facial',   35,  45, 1),
      ('estetica',   'Cejas',             12,  20, 2),
      ('estetica',   'Cera',              15,  30, 3),
      -- centro de depilación
      ('depilacion', 'Zona pequeña',      15,  15, 1),
      ('depilacion', 'Zona media',        30,  30, 2),
      ('depilacion', 'Zona completa',     55,  60, 3),
      -- peluquería canina
      ('canina',     'Baño',              20,  45, 1),
      ('canina',     'Corte',             30,  60, 2),
      ('canina',     'Baño y corte',      45,  90, 3),
      -- spa
      ('spa',        'Masaje relajante',  40,  50, 1),
      ('spa',        'Descontracturante', 50,  50, 2),
      ('spa',        'Piedras calientes', 55,  60, 3),
      -- lavado y estética del auto
      ('auto',       'Lavado',            12,  20, 1),
      ('auto',       'Lavado + aspirado', 18,  30, 2),
      ('auto',       'Detailing',         90, 180, 3),
      -- taller mecánico
      ('taller',     'Cambio de aceite',  45,  45, 1),
      ('taller',     'Revisión',          60,  90, 2),
      ('taller',     'Frenos',           120, 120, 3),
      -- otros servicios
      ('otro',       'Servicio básico',   20,  30, 1),
      ('otro',       'Servicio completo', 40,  60, 2),
      ('otro',       'Extra',             10,  15, 3)
    ) as x(tipo, nombre, precio, minutos, orden)
   where x.tipo = p_tipo::text;
end;
$$;

revoke all on function public.sembrar_local(uuid, tipo_negocio) from public;
revoke all on function public.sembrar_local(uuid, tipo_negocio) from anon, authenticated;
