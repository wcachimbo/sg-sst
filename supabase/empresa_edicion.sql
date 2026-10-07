-- Permite que el administrador de la plataforma edite y elimine empresas.
-- El cliente solo actualiza campos operativos/contacto; la UI deja fijos ID, NIT y razon social.

grant delete on table public.empresa to authenticated;
revoke update on table public.empresa from authenticated;
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
) on table public.empresa to authenticated;

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
