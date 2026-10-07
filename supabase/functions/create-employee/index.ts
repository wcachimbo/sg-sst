import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return jsonResponse(405, { error: 'Método no permitido.' })

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!authorization || !supabaseUrl || !anonKey || !serviceRoleKey) {
    return jsonResponse(500, { error: 'La función no tiene la configuración necesaria.' })
  }

  const token = authorization.replace(/^Bearer\s+/i, '')
  const authClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: { user: caller }, error: authError } = await authClient.auth.getUser(token)

  if (authError || !caller) return jsonResponse(401, { error: 'La sesión no es válida.' })
  if (caller.email?.toLowerCase() !== 'admin@gmail.com') {
    return jsonResponse(403, { error: 'Solo el administrador puede crear personas.' })
  }

  let input: Record<string, unknown>
  try {
    input = await request.json()
  } catch {
    return jsonResponse(400, { error: 'El formulario enviado no es válido.' })
  }

  const text = (value: unknown) => typeof value === 'string' ? value.trim() : ''
  const correo = text(input.correo).toLowerCase()
  const cedula = text(input.cedula)
  const role = text(input.rol)
  const redirectTo = Deno.env.get('INVITE_REDIRECT_URL')

  if (!correo || !cedula || !['basico', 'intermedio'].includes(role)) {
    return jsonResponse(400, { error: 'Correo, cédula y rol son obligatorios.' })
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
  const { data: registration, error: registrationError } = await adminClient.rpc('create_employee_user', {
    p_primer_nombre: input.primer_nombre,
    p_segundo_nombre: input.segundo_nombre,
    p_primer_apellido: input.primer_apellido,
    p_segundo_apellido: input.segundo_apellido,
    p_cedula: cedula,
    p_cargo: input.cargo,
    p_area: input.area,
    p_correo: correo,
    p_celular: input.celular,
    p_telefono: input.telefono,
    p_extesion: input.extesion,
    p_tipo_vinculacion: input.tipo_vinculacion,
    p_id_empresa: input.id_empresa,
    p_rol: role,
  })

  if (registrationError) return jsonResponse(400, { error: registrationError.message })

  const inviteOptions = {
    data: {
      full_name: registration.full_name,
      cedula,
      id_empresa: input.id_empresa,
      rol: role,
      needs_password_setup: true,
    },
    ...(redirectTo ? { redirectTo } : {}),
  }
  const { data: invitation, error: invitationError } = await adminClient.auth.admin.inviteUserByEmail(correo, inviteOptions)

  if (invitationError || !invitation.user) {
    await adminClient.from('usuario').delete().eq('id', registration.user_id).eq('cedula', cedula)
    await adminClient.from('empleado').delete().eq('id', registration.employee_id).eq('cedula', cedula)
    return jsonResponse(400, { error: invitationError?.message || 'No se pudo enviar la invitación.' })
  }

  const { error: linkError } = await adminClient
    .from('usuario')
    .update({ auth_user_id: invitation.user.id })
    .eq('id', registration.user_id)
    .eq('cedula', cedula)

  if (linkError) {
    await adminClient.auth.admin.deleteUser(invitation.user.id)
    await adminClient.from('usuario').delete().eq('id', registration.user_id).eq('cedula', cedula)
    await adminClient.from('empleado').delete().eq('id', registration.employee_id).eq('cedula', cedula)
    return jsonResponse(400, { error: linkError.message })
  }

  return jsonResponse(201, {
    employee: registration.employee,
    employee_id: registration.employee_id,
    user_id: registration.user_id,
    full_name: registration.full_name,
    company_name: registration.company_name,
    role,
    invitation_sent: true,
  })
})
