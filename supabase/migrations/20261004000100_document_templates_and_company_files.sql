-- Plantillas configurables y documentos privados generados o adjuntados por empresa.
alter table public.plantillas
  add column if not exists creado_por uuid references auth.users (id) on delete set null;

alter table public.archivo
  add column if not exists empresa_id bigint,
  add column if not exists plantilla_id bigint,
  add column if not exists storage_path text,
  add column if not exists mime_type text,
  add column if not exists datos jsonb,
  add column if not exists creado_por uuid references auth.users (id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'archivo_empresa_id_fkey'
      and conrelid = 'public.archivo'::regclass
  ) then
    alter table public.archivo
      add constraint archivo_empresa_id_fkey
      foreign key (empresa_id) references public.empresa (id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'archivo_plantilla_id_fkey'
      and conrelid = 'public.archivo'::regclass
  ) then
    alter table public.archivo
      add constraint archivo_plantilla_id_fkey
      foreign key (plantilla_id) references public.plantillas (id) on delete set null;
  end if;
end $$;

create index if not exists archivo_empresa_fecha_idx
  on public.archivo (empresa_id, fecha desc);
create index if not exists archivo_plantilla_idx
  on public.archivo (plantilla_id);

alter table public.plantillas enable row level security;
alter table public.archivo enable row level security;

grant usage on schema public to authenticated;
grant select on public.empresa, public.empleado, public.usuario to authenticated;
grant select, insert, update, delete on public.plantillas to authenticated;
grant select, insert on public.archivo to authenticated;
revoke all on public.plantillas, public.archivo from anon;

do $$
declare
  table_name text;
  table_sequence regclass;
begin
  foreach table_name in array array['plantillas', 'archivo'] loop
    table_sequence := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    if table_sequence is not null then
      execute format('grant usage, select on sequence %s to authenticated', table_sequence);
    end if;
  end loop;
end $$;

drop policy if exists "authenticated can read templates" on public.plantillas;
create policy "authenticated can read templates"
  on public.plantillas for select to authenticated
  using (true);

drop policy if exists "admin can manage templates" on public.plantillas;
create policy "admin can manage templates"
  on public.plantillas for all to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "accounts can read company files" on public.archivo;
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

drop policy if exists "admin can add company files" on public.archivo;
create policy "admin can add company files"
  on public.archivo for insert to authenticated
  with check ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

insert into storage.buckets (id, name, public)
values ('documentos-empresa', 'documentos-empresa', false)
on conflict (id) do update set public = false;

drop policy if exists "accounts can read company document objects" on storage.objects;
create policy "accounts can read company document objects"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'documentos-empresa'
    and (
      (select auth.jwt() ->> 'email') = 'admin@gmail.com'
      or exists (
        select 1 from public.usuario as account
        where account.auth_user_id = (select auth.uid())
          and account.rol = 'intermedio'
          and account.id_empresa::text = (storage.foldername(name))[1]
      )
    )
  );

drop policy if exists "admin can upload company document objects" on storage.objects;
create policy "admin can upload company document objects"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'documentos-empresa'
    and (select auth.jwt() ->> 'email') = 'admin@gmail.com'
  );

drop policy if exists "admin can delete company document objects" on storage.objects;
create policy "admin can delete company document objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos-empresa'
    and (select auth.jwt() ->> 'email') = 'admin@gmail.com'
  );
