# SG-SST Platform

Panel web para organizar la gestión de seguridad y salud en el trabajo. Está construido con React, JavaScript y Vite, y se adapta a escritorio y móvil.

## Requisitos

- Node.js 20.19+ o 22.12+
- npm

## Iniciar en desarrollo

```sh
npm install
npm run dev
```

Vite mostrará en la terminal la dirección local para abrir en el navegador.

## Conectar Supabase

1. En **Project Settings > API Keys**, copia la Project URL y la clave publishable (`sb_publishable_`).
2. Pega los valores en `.env.local` como `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY`. Ese archivo está excluido de Git. Nunca pongas la clave `service_role` en el frontend ni la compartas.
3. En **Authentication > Users**, crea y confirma `admin@gmail.com` con una contraseña fuerte y única.
4. En **SQL Editor**, ejecuta en orden `supabase/alter-empresa-contact-fields.sql` y las migraciones `20261002000100`, `20261002000200`, `20261002000300` y `20261004000100` de `supabase/migrations`.
5. Ejecuta `supabase/policies.sql` para activar RLS y aplicar las políticas de lectura, y después `supabase/firmas_documentos.sql` para habilitar la firma electrónica de documentos (tablas `firma_usuario` y `firma_documento`, columnas `archivo.requiere_firma`, buckets `firmas-usuarios` y `firmas-documentos`, RPC `registrar_firma_documento` y sus políticas).
6. Desde la raíz del proyecto, inicia sesión en Supabase CLI, enlaza el proyecto y despliega la función:

   ```sh
   npx supabase login
   npx supabase link --project-ref TU_PROJECT_ID
   npx supabase functions deploy create-employee
   ```

7. En **Authentication > URL Configuration**, agrega la URL local de Vite (`http://localhost:5173`) y la URL de producción a **Redirect URLs**. Configura la URL base que recibirá las invitaciones como secreto de la función; para desarrollo local:

   ```sh
   npx supabase secrets set INVITE_REDIRECT_URL=http://localhost:5173
   ```

   Para producción, reemplaza el valor por la URL HTTPS publicada y vuelve a desplegar la función si Supabase lo solicita. La URL debe estar incluida en **Redirect URLs**.

8. Configura el envío de correo en **Authentication > SMTP Settings**: habilita SMTP y completa host, puerto, usuario, contraseña SMTP, correo remitente y nombre del remitente que te entrega tu proveedor. Verifica el dominio/correo remitente con ese proveedor y usa sus credenciales SMTP, no la contraseña de tu cuenta personal. El SMTP de prueba de Supabase tiene límites de envío y no es adecuado para invitar usuarios de producción.
9. En Authentication, revisa la plantilla **Invite user** y conserva el enlace de invitación de Supabase (`{{ .ConfirmationURL }}`). Reinicia Vite e inicia sesión como administrador para crear una persona de prueba.

## Alta de empleados y contraseñas

El formulario solicita los datos personales, la empresa y el rol. La función `create-employee` valida que la sesión pertenezca a `admin@gmail.com`, crea el empleado y el perfil de usuario con el rol asignado, invita el correo y relaciona el usuario de Supabase Auth mediante `auth_user_id`. Si la invitación falla, elimina los registros creados para no dejar un alta incompleta.

La persona abre el enlace enviado por correo y define una contraseña de al menos 10 caracteres en la pantalla de primer acceso. La contraseña vive en Supabase Auth; `public.usuario.clave` permanece `NULL` y no debe usarse para guardar contraseñas.

`basico` solo ve capacitaciones; `intermedio` ve su empresa asociada en modo lectura, capacitaciones y puede consultar/descargar los documentos privados de esa empresa; `admin@gmail.com` conserva el panel administrativo y crea plantillas y documentos.

## Plantillas y documentos por empresa

Después de aplicar la migración `20261004000100`, el administrador puede abrir **Plantillas** y crear formatos Word o Excel. Una plantilla Word define campos de texto, párrafo, fecha, número, listas y tablas. Una plantilla Excel define una o más hojas, sus columnas y la cantidad inicial de filas; la primera fila de cada hoja contiene los encabezados. Al diligenciar el archivo se pueden agregar más filas. En **Gestión documental**, selecciona una empresa para generar un archivo desde una plantilla o adjuntar un documento existente. El resultado y sus respuestas quedan asociados a esa empresa.

Los archivos se guardan en el bucket privado `documentos-empresa`; `public.archivo` conserva metadatos y la ruta, no el contenido Base64. La tabla `public.plantillas` conserva la estructura de cada formato en `formato` como JSON. El administrador puede crear y cargar archivos; las cuentas `intermedio` solo pueden consultar y descargar los de su empresa.

## Firma electrónica de documentos

Al crear o adjuntar un archivo, el administrador marca **Este archivo requiere firma** y elige los firmantes entre las personas de esa empresa con una cuenta activa. Cada persona guarda una vez su firma personal desde el menú de cuenta **Mi firma**; queda de forma privada en el bucket `firmas-usuarios` y solo su dueño puede consultarla.

El trabajador con rol `basico` abre **Firmas pendientes** en la barra de secciones, revisa o descarga el documento y lo firma con la confirmación explícita. El registro guarda firmante, fecha, huella SHA-256 del archivo y la copia de la firma en `firmas-documentos`. Cuando existen solicitudes de firma, el archivo deja de poder editarse ni borrarse.

Si algún mensaje indica que falta una tabla, columna o función de firmas, vuelve a ejecutar `supabase/firmas_documentos.sql` en el SQL Editor.

## Comprobaciones

```sh
npm run build
npm run lint
```

## Estado actual

El login usa Supabase Auth. Las empresas se guardan en `public.empresa`; las personas se crean en `public.empleado` y `public.usuario` y reciben una invitación por correo. Las capacitaciones aún necesitan su tabla y políticas RLS por empresa.
