alter table public.usuario
  add column if not exists rol text not null default 'basico';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'usuario_rol_check'
      and conrelid = 'public.usuario'::regclass
  ) then
    alter table public.usuario
      add constraint usuario_rol_check
      check (rol in ('admin', 'basico', 'intermedio'));
  end if;
end $$;

drop function if exists public.create_employee_user(
  text, text, text, text, text, text, text, text, text, text, text, text, bigint
);

create or replace function public.create_employee_user(
  p_primer_nombre text,
  p_segundo_nombre text,
  p_primer_apellido text,
  p_segundo_apellido text,
  p_cedula text,
  p_cargo text,
  p_area text,
  p_correo text,
  p_celular text,
  p_telefono text,
  p_extesion text,
  p_tipo_vinculacion text,
  p_id_empresa bigint,
  p_rol text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_company public.empresa%rowtype;
  v_employee public.empleado%rowtype;
  v_full_name text;
  v_user_id bigint;
begin
  if coalesce((select auth.role()), '') <> 'service_role' then
    raise exception using errcode = '42501', message = 'Esta operación solo se permite desde el servidor.';
  end if;

  if coalesce(p_rol, '') not in ('basico', 'intermedio') then
    raise exception using errcode = '22023', message = 'El rol seleccionado no es válido.';
  end if;

  if nullif(btrim(p_primer_nombre), '') is null
    or nullif(btrim(p_primer_apellido), '') is null
    or nullif(btrim(p_cedula), '') is null
    or nullif(btrim(p_correo), '') is null
    or p_id_empresa is null then
    raise exception using errcode = '22023', message = 'Completa nombre, apellido, cédula, correo y empresa.';
  end if;

  select * into v_company
  from public.empresa
  where id = p_id_empresa;

  if not found then
    raise exception using errcode = '22023', message = 'La empresa seleccionada no existe.';
  end if;

  v_full_name := concat_ws(' ',
    nullif(btrim(p_primer_nombre), ''),
    nullif(btrim(p_segundo_nombre), ''),
    nullif(btrim(p_primer_apellido), ''),
    nullif(btrim(p_segundo_apellido), '')
  );

  insert into public.empleado (
    primer_nombre, segundo_nombre, primer_apellido, segundo_apellido,
    nombre_completo, cedula, empresa, cargo, area, correo, celular,
    telefono, extesion, tipo_vinculacion, id_empresa
  ) values (
    btrim(p_primer_nombre), nullif(btrim(p_segundo_nombre), ''),
    btrim(p_primer_apellido), nullif(btrim(p_segundo_apellido), ''),
    v_full_name, btrim(p_cedula), v_company.razon_social,
    nullif(btrim(p_cargo), ''), nullif(btrim(p_area), ''),
    lower(btrim(p_correo)), nullif(btrim(p_celular), ''),
    nullif(btrim(p_telefono), ''), nullif(btrim(p_extesion), ''),
    nullif(btrim(p_tipo_vinculacion), ''), v_company.id
  ) returning * into v_employee;

  insert into public.usuario (cedula, apodo, clave, id_empresa, auth_user_id, rol)
  values (btrim(p_cedula), v_full_name, null, v_company.id, null, p_rol)
  returning id into v_user_id;

  return jsonb_build_object(
    'employee', to_jsonb(v_employee),
    'employee_id', v_employee.id,
    'user_id', v_user_id,
    'full_name', v_full_name,
    'company_name', v_company.razon_social,
    'role', p_rol
  );
end;
$function$;

revoke all on function public.create_employee_user(
  text, text, text, text, text, text, text, text, text, text, text, text, bigint, text
) from public, anon, authenticated;

grant execute on function public.create_employee_user(
  text, text, text, text, text, text, text, text, text, text, text, text, bigint, text
) to service_role;
