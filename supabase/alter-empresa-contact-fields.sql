do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa' and column_name = 'nombre_contacto'
  ) and not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa' and column_name = 'nombre_responsable'
  ) then
    alter table public.empresa rename column nombre_contacto to nombre_responsable;
  elsif exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa' and column_name = 'nombre_contacto'
  ) and exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'empresa' and column_name = 'nombre_responsable'
  ) then
    update public.empresa
      set nombre_responsable = coalesce(nombre_responsable, nombre_contacto);
  else
    alter table public.empresa add column if not exists nombre_responsable character varying;
  end if;
end $$;

alter table public.empresa
  add column if not exists digito_verificacion smallint,
  add column if not exists cargo_responsable character varying,
  add column if not exists extension character varying(5),
  add column if not exists celular character varying;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'empresa_digito_verificacion_check'
      and conrelid = 'public.empresa'::regclass
  ) then
    alter table public.empresa
      add constraint empresa_digito_verificacion_check
      check (digito_verificacion is null or digito_verificacion between 0 and 9);
  end if;
end $$;
