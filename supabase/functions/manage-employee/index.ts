import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as Record<string, string>)[char])

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond(405, { error: 'Método no permitido.' })

  const authorization = request.headers.get('Authorization')
  const url = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization || !url || !anonKey || !serviceRoleKey) return respond(500, { error: 'La función no tiene la configuración necesaria.' })

  const authClient = createClient(url, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: { user: caller }, error: authError } = await authClient.auth.getUser(authorization.replace(/^Bearer\s+/i, ''))
  if (authError || !caller) return respond(401, { error: 'La sesión no es válida.' })
  if (caller.email?.toLowerCase() !== 'admin@gmail.com') return respond(403, { error: 'Solo el administrador puede gestionar trabajadores.' })

  let input: Record<string, unknown>
  try { input = await request.json() } catch { return respond(400, { error: 'La solicitud no es válida.' }) }
  const employeeId = Number(input.employee_id)
  if (!Number.isSafeInteger(employeeId) || employeeId < 1) return respond(400, { error: 'El trabajador indicado no es válido.' })

  const admin = createClient(url, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } })
  const { data: employee, error: employeeLookupError } = await admin.from('empleado')
    .select('id, cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, empresa, cargo, area, correo, celular, telefono, extesion, tipo_vinculacion, id_empresa')
    .eq('id', employeeId).maybeSingle()
  if (employeeLookupError) return respond(500, { error: employeeLookupError.message })
  if (!employee) return respond(404, { error: 'No se encontró el trabajador.' })

  const { data: profile, error: profileError } = await admin.from('usuario')
    .select('id, cedula, auth_user_id, rol, id_empresa').eq('cedula', employee.cedula).maybeSingle()
  if (profileError) return respond(500, { error: profileError.message })

  if (input.action === 'resend-password') {
    if (!profile?.auth_user_id) return respond(400, { error: 'Este trabajador no tiene una cuenta de acceso vinculada. Revisa primero su registro de usuario.' })
    const email = text(employee.correo).toLowerCase()
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const sender = Deno.env.get('EMPLOYEE_EMAIL_FROM') || Deno.env.get('AUDIT_EMAIL_FROM')
    const redirectTo = Deno.env.get('INVITE_REDIRECT_URL') || Deno.env.get('APP_PUBLIC_URL')
    if (!email || !resendKey || !sender || !redirectTo) return respond(500, { error: 'Configura RESEND_API_KEY, EMPLOYEE_EMAIL_FROM (o AUDIT_EMAIL_FROM), APP_PUBLIC_URL e INVITE_REDIRECT_URL en Supabase.' })
    const { data: link, error: linkError } = await admin.auth.admin.generateLink({ type: 'recovery', email, options: { redirectTo } })
    if (linkError || !link.properties?.action_link) return respond(400, { error: linkError?.message || 'No se pudo crear el enlace para restablecer la contraseña.' })
    const fullName = escapeHtml(employee.nombre_completo || email)
    const actionLink = escapeHtml(link.properties.action_link)
    const mail = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: 'Crea o restablece tu contraseña · SG-SST',
        html: `<div style="font-family:Arial,sans-serif;color:#243b30;max-width:600px;margin:auto"><h2>Acceso a SG-SST</h2><p>Hola ${fullName}. Usa este enlace para crear una contraseña por primera vez o restablecerla si la olvidaste.</p><p><a href="${actionLink}" style="display:inline-block;padding:12px 18px;background:#087b60;color:#fff;text-decoration:none;border-radius:6px">Definir contraseña</a></p><p>Si no solicitaste este mensaje, puedes ignorarlo.</p></div>`,
      }),
    })
    if (!mail.ok) return respond(502, { error: `No se pudo enviar el correo. ${(await mail.text()).slice(0, 300)}` })
    return respond(200, { ok: true, email })
  }

  if (input.action === 'delete') {
    const { error: employeeDeleteError } = await admin.from('empleado').delete().eq('id', employee.id).eq('cedula', employee.cedula)
    if (employeeDeleteError) return respond(400, { error: employeeDeleteError.code === '23503' ? 'No se puede eliminar el trabajador porque hay registros relacionados que lo bloquean.' : employeeDeleteError.message })
    if (profile) {
      const { error: profileDeleteError } = await admin.from('usuario').delete().eq('id', profile.id).eq('cedula', profile.cedula)
      if (profileDeleteError) return respond(500, { error: `Se quitó al trabajador, pero no se pudo borrar su perfil de acceso: ${profileDeleteError.message}` })
    }
    if (profile?.auth_user_id) {
      const { error } = await admin.auth.admin.deleteUser(profile.auth_user_id)
      if (error) return respond(500, { error: `Se quitaron los datos del trabajador, pero no se pudo cerrar su cuenta de acceso: ${error.message}` })
    }
    return respond(200, { ok: true })
  }

  if (input.action === 'update') {
    const values = input.employee && typeof input.employee === 'object' ? input.employee as Record<string, unknown> : {}
    const firstName = text(values.primer_nombre)
    const firstLastName = text(values.primer_apellido)
    const email = text(values.correo).toLowerCase()
    const companyId = Number(values.id_empresa)
    const role = text(values.rol)
    if (!firstName || !firstLastName || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isSafeInteger(companyId) || !['basico', 'intermedio'].includes(role)) {
      return respond(400, { error: 'Completa nombre, apellido, un correo válido, empresa y rol.' })
    }
    const { data: company, error: companyError } = await admin.from('empresa').select('id, razon_social').eq('id', companyId).maybeSingle()
    if (companyError || !company) return respond(400, { error: companyError?.message || 'La empresa seleccionada no existe.' })
    const secondName = text(values.segundo_nombre)
    const secondLastName = text(values.segundo_apellido)
    const fullName = [firstName, secondName, firstLastName, secondLastName].filter(Boolean).join(' ')
    const metadata = {
      ...(profile?.auth_user_id ? (await admin.auth.admin.getUserById(profile.auth_user_id)).data.user?.user_metadata : {}),
      full_name: fullName, cedula: employee.cedula, id_empresa: company.id, rol: role,
    }
    if (profile?.auth_user_id && email !== text(employee.correo).toLowerCase()) {
      const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, { email, email_confirm: true, user_metadata: metadata })
      if (error) return respond(400, { error: `No se pudo actualizar el correo de acceso. ${error.message}` })
    } else if (profile?.auth_user_id) {
      const { error } = await admin.auth.admin.updateUserById(profile.auth_user_id, { user_metadata: metadata })
      if (error) return respond(400, { error: `No se pudieron actualizar los datos de acceso. ${error.message}` })
    }
    const employeeChanges = {
      primer_nombre: firstName, segundo_nombre: secondName || null,
      primer_apellido: firstLastName, segundo_apellido: secondLastName || null,
      nombre_completo: fullName, empresa: company.razon_social, id_empresa: company.id,
      correo: email, cargo: text(values.cargo) || null, area: text(values.area) || null,
      celular: text(values.celular) || null, telefono: text(values.telefono) || null,
      extesion: text(values.extesion) || null, tipo_vinculacion: text(values.tipo_vinculacion) || null,
    }
    const { data: updatedEmployee, error: updateError } = await admin.from('empleado').update(employeeChanges)
      .eq('id', employee.id).eq('cedula', employee.cedula)
      .select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, cedula, empresa, cargo, area, correo, celular, telefono, extesion, tipo_vinculacion, id_empresa').single()
    if (updateError) return respond(400, { error: updateError.message })
    if (profile) {
      const { error: profileUpdateError } = await admin.from('usuario').update({ apodo: fullName, rol, id_empresa: company.id })
        .eq('id', profile.id).eq('cedula', profile.cedula)
      if (profileUpdateError) return respond(400, { error: `Los datos del trabajador se actualizaron, pero falló su perfil de acceso. ${profileUpdateError.message}` })
    }
    return respond(200, { employee: { ...updatedEmployee, rol: role } })
  }

  return respond(400, { error: 'La acción solicitada no es válida.' })
})
