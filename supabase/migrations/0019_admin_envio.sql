-- JULEX · el panel del administrador ve dónde se envía

create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug, 'tipo', b.tipo,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now()),
           'estado_cobro', b.estado_cobro,
           'proximo_pago', b.proximo_pago,
           'nota_cobro', b.nota_cobro,
           'suspension_manual', b.suspension_manual,
           'material_pendiente', coalesce((
             select sum(c.importe) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0),
           'material_llaveros', coalesce((
             select count(*) from cargos_llavero c
              where c.barberia_id = b.id and c.cobrado_en is null), 0),
           'direccion_envio', b.direccion_envio,
           'cp_envio', b.cp_envio,
           'ciudad_envio', b.ciudad_envio,
           'provincia_envio', b.provincia_envio,
           'telefono_contacto', b.telefono_contacto
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

revoke all on function public.admin_locales() from public;
grant execute on function public.admin_locales() to authenticated;
