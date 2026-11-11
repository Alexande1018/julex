-- ============================================================
-- JULEX · cuentas de barbero
-- El administrador puede cambiar la contraseña, corregir el correo
-- y cortar el acceso sin borrar el local ni sus datos.
-- ============================================================

-- Lectura de administración sobre el equipo (sin exponer auth.users a nadie más).
drop policy if exists "admin: lectura total" on barberos;
create policy "admin: lectura total" on barberos
  for select to authenticated using (public.soy_admin());

-- Locales con los datos de su cuenta, para pintar el panel.
create or replace function public.admin_locales()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(json_agg(json_build_object(
           'id', b.id, 'nombre', b.nombre, 'slug', b.slug,
           'barbero_id', ba.id, 'email', u.email,
           'activo', (u.banned_until is null or u.banned_until < now())
         ) order by b.creado_en), '[]'::json)
    from barberias b
    left join barberos ba on ba.barberia_id = b.id and ba.rol = 'dueno'
    left join auth.users u on u.id = ba.id
   where public.soy_admin();
$$;

create or replace function public.admin_cambiar_password(p_usuario uuid, p_password text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if length(trim(p_password)) < 6 then raise exception 'password_corta'; end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_password, extensions.gen_salt('bf')),
         updated_at = now()
   where id = p_usuario;
end;
$$;

create or replace function public.admin_cambiar_email(p_usuario uuid, p_email text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare v_email text := lower(trim(p_email));
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[a-z]{2,}$' then raise exception 'email_invalido'; end if;
  if exists (select 1 from auth.users where email = v_email and id <> p_usuario) then
    raise exception 'email_en_uso';
  end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;

  update auth.users set email = v_email, email_confirmed_at = coalesce(email_confirmed_at, now()), updated_at = now()
   where id = p_usuario;

  update auth.identities
     set identity_data = jsonb_set(identity_data, '{email}', to_jsonb(v_email)),
         updated_at = now()
   where user_id = p_usuario;
end;
$$;

create or replace function public.admin_activar(p_usuario uuid, p_activo boolean)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  if not public.soy_admin() then raise exception 'solo_admin'; end if;
  if not exists (select 1 from barberos where id = p_usuario) then
    raise exception 'usuario_no_valido';
  end if;
  update auth.users
     set banned_until = case when p_activo then null else now() + interval '100 years' end,
         updated_at = now()
   where id = p_usuario;
end;
$$;

revoke all on function public.admin_locales() from public;
revoke all on function public.admin_cambiar_password(uuid, text) from public;
revoke all on function public.admin_cambiar_email(uuid, text) from public;
revoke all on function public.admin_activar(uuid, boolean) from public;
grant execute on function public.admin_locales() to authenticated;
grant execute on function public.admin_cambiar_password(uuid, text) to authenticated;
grant execute on function public.admin_cambiar_email(uuid, text) to authenticated;
grant execute on function public.admin_activar(uuid, boolean) to authenticated;
