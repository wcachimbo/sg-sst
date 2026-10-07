-- ==============================================================
-- SOLUCIÓN RECURSIÓN RLS (Error 42P17 / Schema invalid)
-- SG-SST: Corrección integral de políticas de firmas y archivos
-- Ejecutar completo en Supabase -> SQL Editor
-- ==============================================================

-- ---------- A) DIAGNÓSTICO PREVIO ----------
do $do$
declare
  r record;
begin
  raise notice '=== A1) POLÍTICAS EXISTENTES ===';
  for r in
    select tablename, policyname, cmd
    from pg_policies
    where (schemaname = 'public' and tablename in ('archivo', 'firma_documento'))
       or (schemaname = 'storage' and tablename = 'objects' and (coalesce(qual, '') ~ 'firma' or coalesce(with_check, '') ~ 'firma'))
    order by tablename, policyname
  loop
    raise notice 'Tabla: % | Política: % | Cmd: %', r.tablename, r.policyname, r.cmd;
  end loop;

  raise notice '=== A2) TABLAS RLS FORCE STATUS ===';
  for r in
    select relname, relrowsecurity as rls, relforcerowsecurity as force_rls, pg_get_userbyid(relowner) as owner
    from pg_class
    where relname in ('archivo', 'firma_documento', 'firma_usuario', 'usuario')
      and relnamespace = 'public'::regnamespace
  loop
    raise notice 'Tabla: % | RLS: % | FORCE: % | Dueño: %', r.relname, r.rls, r.force_rls, r.owner;
  end loop;
end $do$;

-- ---------- B) DESACTIVAR FORCE RLS ----------
-- Asegura que funciones SECURITY DEFINER puedan consultar sin evaluar RLS recursivo
alter table if exists public.archivo no force row level security;
alter table if exists public.firma_documento no force row level security;
alter table if exists public.usuario no force row level security;

-- ---------- C) LIMPIAR POLÍTICAS CONFLICTIVAS ----------
-- 1. Políticas de public.archivo
drop policy if exists "accounts can read company files" on public.archivo;
drop policy if exists "assigned signers can read requested files" on public.archivo;
drop policy if exists "firmantes asignados leen archivos" on public.archivo;

-- 2. Políticas de public.firma_documento
drop policy if exists "usuarios ven sus solicitudes de firma" on public.firma_documento;
drop policy if exists "admin solicita firmas" on public.firma_documento;

-- 3. Políticas de storage.objects
drop policy if exists "usuarios gestionan su imagen de firma" on storage.objects;
drop policy if exists "firmantes guardan su firma del archivo" on storage.objects;
drop policy if exists "usuarios autorizados consultan firmas de archivos" on storage.objects;
drop policy if exists "assigned signers can read requested document objects" on storage.objects;

-- ---------- D) FUNCIONES AUXILIARES SECURITY DEFINER ----------
-- Rompen cualquier ciclo recursivo aislando las consultas entre tablas

-- 1. Verifica si un usuario tiene solicitud de firma sobre un archivo
create or replace function public.firma_asignada_a_archivo(p_archivo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.firma_documento as signature_request
    where signature_request.archivo_id = p_archivo_id
      and signature_request.firmante_auth_user_id = (select auth.uid())
  );
$fn$;

revoke all on function public.firma_asignada_a_archivo(bigint) from public, anon;
grant execute on function public.firma_asignada_a_archivo(bigint) to authenticated;

-- 2. Verifica si un usuario con rol intermedio pertenece a la empresa del archivo
create or replace function public.puede_ver_solicitud_firma(p_archivo_id bigint)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.archivo as file
    join public.usuario as account on account.id_empresa = file.empresa_id
    where file.id = p_archivo_id
      and account.auth_user_id = (select auth.uid())
      and account.rol = 'intermedio'
  );
$fn$;

revoke all on function public.puede_ver_solicitud_firma(bigint) from public, anon;
grant execute on function public.puede_ver_solicitud_firma(bigint) to authenticated;

-- 3. Verifica si un firmante pertenece a la empresa del archivo al crear solicitud
create or replace function public.puede_crear_solicitud_firma(p_archivo_id bigint, p_firmante_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.archivo as file
    join public.usuario as signer_account on signer_account.id_empresa = file.empresa_id
    where file.id = p_archivo_id
      and signer_account.auth_user_id = p_firmante_id
  );
$fn$;

revoke all on function public.puede_crear_solicitud_firma(bigint, uuid) from public, anon;
grant execute on function public.puede_crear_solicitud_firma(bigint, uuid) to authenticated;

-- 4. Storage: Verifica permisos para ver firmas de archivos
create or replace function public.puede_ver_firma_documento_storage(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.firma_documento as signature_request
    join public.archivo as file on file.id = signature_request.archivo_id
    where signature_request.id::text = (storage.foldername(p_name))[1]
      and (
        signature_request.firmante_auth_user_id = (select auth.uid())
        or (select auth.jwt() ->> 'email') = 'admin@gmail.com'
        or exists (
          select 1 from public.usuario as admin_account
          where admin_account.auth_user_id = (select auth.uid()) and admin_account.rol = 'admin'
        )
        or exists (
          select 1 from public.usuario as account
          where account.auth_user_id = (select auth.uid())
            and account.rol = 'intermedio'
            and account.id_empresa = file.empresa_id
        )
      )
  );
$fn$;

revoke all on function public.puede_ver_firma_documento_storage(text) from public, anon;
grant execute on function public.puede_ver_firma_documento_storage(text) to authenticated;

-- 5. Storage: Verifica si el firmante puede subir su firma para el documento solicitado
create or replace function public.puede_subir_firma_documento(p_name text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1 from public.firma_documento as signature_request
    where signature_request.id::text = (storage.foldername(p_name))[1]
      and signature_request.firmante_auth_user_id = (select auth.uid())
      and signature_request.estado = 'pendiente'
      and split_part(p_name, '/', 2) = ((select auth.uid())::text || '.png')
  );
$fn$;

revoke all on function public.puede_subir_firma_documento(text) from public, anon;
grant execute on function public.puede_subir_firma_documento(text) to authenticated;

-- 6. Storage: Verifica si un firmante asignado puede ver el documento original
create or replace function public.puede_ver_documento_asignado(p_storage_path text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $fn$
  select exists (
    select 1
    from public.archivo as file
    join public.firma_documento as signature_request on signature_request.archivo_id = file.id
    where file.storage_path = p_storage_path
      and signature_request.firmante_auth_user_id = (select auth.uid())
  );
$fn$;

revoke all on function public.puede_ver_documento_asignado(text) from public, anon;
grant execute on function public.puede_ver_documento_asignado(text) to authenticated;


-- ---------- E) RECREACIÓN DE POLÍTICAS LIMPIAS ----------

-- E.1 Políticas en public.archivo
create policy "accounts can read company files"
  on public.archivo for select to authenticated
  using (
    (select auth.jwt() ->> 'email') = 'admin@gmail.com'
    or exists (
      select 1 from public.usuario as account
      where account.auth_user_id = (select auth.uid())
        and account.rol = 'intermedio'
        and account.id_empresa = public.archivo.empresa_id
    )
  );

create policy "assigned signers can read requested files"
  on public.archivo for select to authenticated
  using (public.firma_asignada_a_archivo(id));

-- E.2 Políticas en public.firma_documento
create policy "usuarios ven sus solicitudes de firma"
  on public.firma_documento for select to authenticated
  using (
    firmante_auth_user_id = (select auth.uid())
    or (select auth.jwt() ->> 'email') = 'admin@gmail.com'
    or exists (
      select 1 from public.usuario as admin_account
      where admin_account.auth_user_id = (select auth.uid()) and admin_account.rol = 'admin'
    )
    or public.puede_ver_solicitud_firma(archivo_id)
  );

create policy "admin solicita firmas"
  on public.firma_documento for insert to authenticated
  with check (
    creado_por = (select auth.uid())
    and (
      (select auth.jwt() ->> 'email') = 'admin@gmail.com'
      or exists (
        select 1 from public.usuario as admin_account
        where admin_account.auth_user_id = (select auth.uid()) and admin_account.rol = 'admin'
      )
    )
    and (
      firmante_auth_user_id = (select auth.uid())
      or public.puede_crear_solicitud_firma(archivo_id, firmante_auth_user_id)
    )
  );

-- E.3 Políticas en storage.objects
create policy "usuarios gestionan su imagen de firma"
  on storage.objects for all to authenticated
  using (
    bucket_id = 'firmas-usuarios'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'firmas-usuarios'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "firmantes guardan su firma del archivo"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'firmas-documentos'
    and public.puede_subir_firma_documento(name)
  );

create policy "usuarios autorizados consultan firmas de archivos"
  on storage.objects for select to authenticated
  using (
    (bucket_id = 'firmas-usuarios' and (storage.foldername(name))[1] = (select auth.uid())::text)
    or (
      bucket_id = 'firmas-documentos'
      and public.puede_ver_firma_documento_storage(name)
    )
  );

create policy "assigned signers can read requested document objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-empresa'
    and public.puede_ver_documento_asignado(storage.objects.name)
  );

-- ---------- F) NOTIFICACIÓN FINAL ----------
do $do$
begin
  raise notice '=== E) REPARACIÓN COMPLETADA CON ÉXITO ===';
  raise notice 'Todas las políticas y funciones SECURITY DEFINER fueron recreadas.';
end $do$;
