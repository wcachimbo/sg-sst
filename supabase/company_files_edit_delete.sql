-- Habilita editar, reemplazar y borrar documentos desde la plataforma.
-- Ejecuta este script en SQL Editor de Supabase.

grant select, update, delete on public.archivo to authenticated;

drop policy if exists "admin can update company files" on public.archivo;
create policy "admin can update company files"
  on public.archivo for update to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com')
  with check ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "admin can delete company files" on public.archivo;
create policy "admin can delete company files"
  on public.archivo for delete to authenticated
  using ((select auth.jwt() ->> 'email') = 'admin@gmail.com');

drop policy if exists "admin can delete company document objects" on storage.objects;
create policy "admin can delete company document objects"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'documentos-empresa'
    and (select auth.jwt() ->> 'email') = 'admin@gmail.com'
  );
