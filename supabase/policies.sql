alter table public.empresa enable row level security;
alter table public.empleado enable row level security;
alter table public.usuario enable row level security;

grant select, insert, delete on public.empresa to authenticated;
revoke update on public.empresa from authenticated;
grant update (
  sector_economico,
  numero_trabajadores,
  paquete_servicios,
  nombre_responsable,
  cargo_responsable,
  correo,
  telefono,
  extension,
  celular
) on public.empresa to authenticated;
grant select on public.empleado to authenticated;
grant select on public.usuario to authenticated;
revoke all on public.empleado, public.usuario from anon, authenticated;
grant select on public.empleado to authenticated;
grant select on public.usuario to authenticated;

do $$
declare
  empresa_id_sequence regclass;
begin
  empresa_id_sequence := pg_get_serial_sequence('public.empresa', 'id');
  if empresa_id_sequence is not null then
    execute format('grant usage, select on sequence %s to authenticated', empresa_id_sequence);
  end if;
end $$;

drop policy if exists "admin can read companies" on public.empresa;
drop policy if exists "account can read permitted companies" on public.empresa;
create policy "account can read permitted companies"
  on public.empresa
  for select
  to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'admin@gmail.com'
    or exists (
      select 1
      from public.usuario as account
      where account.auth_user_id = (select auth.uid())
        and account.rol = 'intermedio'
        and account.id_empresa = public.empresa.id
    )
  );

drop policy if exists "admin can create companies" on public.empresa;
create policy "admin can create companies"
  on public.empresa
  for insert
  to authenticated
  with check ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "admin can update companies" on public.empresa;
create policy "admin can update companies"
  on public.empresa
  for update
  to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "admin can delete companies" on public.empresa;
create policy "admin can delete companies"
  on public.empresa
  for delete
  to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "admin can read employees" on public.empleado;
create policy "admin can read employees"
  on public.empleado
  for select
  to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "accounts can read own profile" on public.usuario;
create policy "accounts can read own profile"
  on public.usuario
  for select
  to authenticated
  using (
    auth_user_id = (select auth.uid())
    or (select auth.jwt() ->> 'email') = 'admin@gmail.com'
  );
