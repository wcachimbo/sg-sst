create unique index if not exists empresa_id_unique_idx
  on public.empresa (id);

alter table public.empleado
  alter column id_empresa type bigint using id_empresa::bigint;

alter table public.usuario
  alter column id_empresa type bigint using id_empresa::bigint,
  add column if not exists auth_user_id uuid;

create unique index if not exists empleado_cedula_unique_idx
  on public.empleado (cedula);

create unique index if not exists usuario_cedula_unique_idx
  on public.usuario (cedula);

create unique index if not exists usuario_auth_user_id_unique_idx
  on public.usuario (auth_user_id)
  where auth_user_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empleado_empresa_id_fkey'
      and conrelid = 'public.empleado'::regclass
  ) then
    alter table public.empleado
      add constraint empleado_empresa_id_fkey
      foreign key (id_empresa) references public.empresa (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usuario_empresa_id_fkey'
      and conrelid = 'public.usuario'::regclass
  ) then
    alter table public.usuario
      add constraint usuario_empresa_id_fkey
      foreign key (id_empresa) references public.empresa (id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'usuario_auth_user_id_fkey'
      and conrelid = 'public.usuario'::regclass
  ) then
    alter table public.usuario
      add constraint usuario_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users (id) on delete set null;
  end if;
end $$;

alter table public.empleado enable row level security;
alter table public.usuario enable row level security;

revoke all on public.empleado, public.usuario from anon, authenticated;
grant all on public.empleado, public.usuario to service_role;

do $$
declare
  table_name text;
  table_sequence regclass;
begin
  foreach table_name in array array['empleado', 'usuario'] loop
    table_sequence := pg_get_serial_sequence(format('public.%I', table_name), 'id');
    if table_sequence is not null then
      execute format('grant usage, select on sequence %s to service_role', table_sequence);
    end if;
  end loop;
end $$;
