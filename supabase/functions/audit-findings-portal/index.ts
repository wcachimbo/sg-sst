import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const bucket = 'evidencias-auditoria'
const allowedFindingTypes = ['No conformidad', 'Observación', 'Oportunidad de mejora', 'Conformidad']

function escapeHtml(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&#39;')
}

function respond(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

function encodeHex(bytes: Uint8Array) {
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

async function hashToken(token: string) {
  const bytes = new TextEncoder().encode(token)
  return encodeHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))
}

async function validAuditForToken(admin: any, token: string) {
  if (!token || token.length < 40) return null
  const tokenHash = await hashToken(token)
  const { data, error } = await admin.from('auditoria_empresa')
    .select('id, empresa_id, fecha_auditoria, tipo, entidad_auditora, auditor_nombre, objetivo, alcance, areas_auditadas, descripcion, responsable_empresa, estado, token_hallazgos_expira')
    .eq('token_hallazgos_hash', tokenHash)
    .gt('token_hallazgos_expira', new Date().toISOString())
    .maybeSingle()
  if (error || !data || data.estado !== 'Cerrada') return null
  return data
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return respond(405, { error: 'Método no permitido.' })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!supabaseUrl || !anonKey || !serviceKey) return respond(500, { error: 'La función no está configurada en Supabase.' })
  const admin = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } })

  let body: Record<string, any>
  try { body = await request.json() } catch { return respond(400, { error: 'El cuerpo de la solicitud no es válido.' }) }

  if (body.action === 'request-findings') {
    const bearer = request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    if (!bearer) return respond(401, { error: 'Inicia sesión para cerrar la auditoría.' })
    const authClient = createClient(supabaseUrl, anonKey, { auth: { autoRefreshToken: false, persistSession: false } })
    const { data: { user }, error: authError } = await authClient.auth.getUser(bearer)
    if (authError || !user) return respond(401, { error: 'La sesión ya no es válida. Inicia sesión de nuevo.' })

    const { data: audit, error: auditError } = await admin.from('auditoria_empresa')
      .select('id, empresa_id, estado, auditor_nombre, auditor_correo')
      .eq('id', body.auditId).maybeSingle()
    if (auditError || !audit) return respond(404, { error: 'No se encontró la auditoría.' })
    let authorized = user.email?.toLowerCase() === 'admin@gmail.com'
    if (!authorized) {
      const { data: profile } = await admin.from('usuario').select('rol, id_empresa').eq('auth_user_id', user.id).maybeSingle()
      authorized = profile?.rol === 'intermedio' && profile.id_empresa === audit.empresa_id
    }
    if (!authorized) return respond(403, { error: 'No tienes permiso para cerrar esta auditoría.' })
    if (audit.estado === 'Cancelada') return respond(409, { error: 'No se puede enviar un enlace para una auditoría cancelada.' })

    const email = String(body.email || audit.auditor_correo || '').trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return respond(400, { error: 'Escribe un correo válido para el auditor.' })
    const resendKey = Deno.env.get('RESEND_API_KEY')
    const sender = Deno.env.get('AUDIT_EMAIL_FROM')
    const appUrl = Deno.env.get('APP_PUBLIC_URL')
    if (!resendKey || !sender || !appUrl) return respond(500, { error: 'Configura RESEND_API_KEY, AUDIT_EMAIL_FROM y APP_PUBLIC_URL en los secretos de Supabase.' })

    const randomBytes = crypto.getRandomValues(new Uint8Array(32))
    const token = encodeHex(randomBytes)
    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
    const tokenHash = await hashToken(token)
    const { data: company } = await admin.from('empresa').select('razon_social').eq('id', audit.empresa_id).maybeSingle()
    const companyName = company?.razon_social || 'la empresa'
    const escapedCompanyName = escapeHtml(companyName)
    const portalUrl = `${appUrl.replace(/\/$/, '')}/?auditoria=${encodeURIComponent(token)}`
    const { error: tokenError } = await admin.from('auditoria_empresa').update({
      auditor_correo: email,
      token_hallazgos_hash: tokenHash,
      token_hallazgos_expira: expiresAt,
    }).eq('id', audit.id)
    if (tokenError) return respond(500, { error: tokenError.message })

    const emailResult = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${resendKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: sender,
        to: [email],
        subject: `Registro de hallazgos de auditoría · ${companyName}`,
        html: `<div style="font-family:Arial,sans-serif;color:#243b30;max-width:600px;margin:auto"><h2>Registro de hallazgos de auditoría</h2><p>La auditoría de <strong>${escapedCompanyName}</strong> fue cerrada. Usa el siguiente enlace para registrar los hallazgos, observaciones y evidencias correspondientes.</p><p><a href="${portalUrl}" style="display:inline-block;padding:12px 18px;background:#087b60;color:#fff;text-decoration:none;border-radius:6px">Abrir auditoría</a></p><p>El enlace permite consultar únicamente esta auditoría y vence en 30 días. No necesitas crear una cuenta.</p><p>Si no esperabas este mensaje, puedes ignorarlo.</p></div>`,
      }),
    })
    if (!emailResult.ok) {
      const details = await emailResult.text()
      await admin.from('auditoria_empresa').update({ token_hallazgos_hash: null, token_hallazgos_expira: null }).eq('id', audit.id)
      return respond(502, { error: `No se pudo enviar el correo. ${details.slice(0, 350)}` })
    }
    const now = new Date().toISOString()
    const { error: closeError } = await admin.from('auditoria_empresa').update({ estado: 'Cerrada', correo_hallazgos_enviado: now }).eq('id', audit.id)
    if (closeError) return respond(500, { error: `El correo se envió, pero no se pudo cerrar la auditoría: ${closeError.message}` })
    return respond(200, { ok: true, email, expiresAt })
  }

  if (body.action?.startsWith('portal-')) {
    const audit = await validAuditForToken(admin, String(body.token || ''))
    if (!audit) return respond(403, { error: 'El enlace no es válido o venció. Solicita a la empresa un nuevo enlace.' })

    if (body.action === 'portal-get') {
      const [{ data: findings, error: findingsError }, { data: evidence, error: evidenceError }] = await Promise.all([
        admin.from('hallazgo_auditoria').select('id, tipo, descripcion, accion_correctiva, responsable, fecha_compromiso, estado, fecha_creacion').eq('auditoria_id', audit.id).order('fecha_creacion', { ascending: false }),
        admin.from('evidencia_auditoria').select('id, nombre_archivo, ruta_storage, tipo_mime, tamano_bytes, fecha').eq('auditoria_id', audit.id).order('fecha', { ascending: false }),
      ])
      if (findingsError || evidenceError) return respond(500, { error: findingsError?.message || evidenceError?.message })
      const attachments = await Promise.all((evidence || []).map(async (item) => {
        const { data } = await admin.storage.from(bucket).createSignedUrl(item.ruta_storage, 600)
        return { ...item, url: data?.signedUrl || '' }
      }))
      const { data: company } = await admin.from('empresa').select('razon_social').eq('id', audit.empresa_id).maybeSingle()
      return respond(200, { audit: { ...audit, empresa: { razon_social: company?.razon_social || 'la empresa' } }, findings: findings || [], evidence: attachments })
    }

    if (body.action === 'portal-add-finding') {
      const finding = body.finding || {}
      if (!allowedFindingTypes.includes(finding.type) || !String(finding.description || '').trim()) return respond(400, { error: 'Selecciona el tipo y escribe la descripción del hallazgo.' })
      const { data, error } = await admin.from('hallazgo_auditoria').insert({
        auditoria_id: audit.id,
        tipo: finding.type,
        descripcion: String(finding.description).trim().slice(0, 10000),
        accion_correctiva: String(finding.correctiveAction || '').trim().slice(0, 10000) || null,
        responsable: String(finding.responsible || '').trim().slice(0, 180) || null,
        fecha_compromiso: finding.dueDate || null,
        estado: 'Abierto',
        registrado_por_auditor: true,
      }).select('id, tipo, descripcion, accion_correctiva, responsable, fecha_compromiso, estado, fecha_creacion').single()
      if (error) return respond(500, { error: error.message })
      return respond(200, { finding: data })
    }

    if (body.action === 'portal-create-upload') {
      const name = String(body.name || 'evidencia').replace(/[\\/:*?"<>|]/g, '-').slice(0, 150)
      const size = Number(body.size || 0)
      const extension = name.split('.').pop()?.toLowerCase() || 'bin'
      if (!name || size <= 0 || size > 10 * 1024 * 1024) return respond(400, { error: 'El archivo debe pesar entre 1 byte y 10 MB.' })
      if (!['pdf', 'doc', 'docx', 'xls', 'xlsx', 'png', 'jpg', 'jpeg', 'txt'].includes(extension)) return respond(400, { error: 'Ese tipo de archivo no está permitido.' })
      const path = `${audit.id}/${crypto.randomUUID()}.${extension}`
      const { data, error } = await admin.storage.from(bucket).createSignedUploadUrl(path)
      if (error) return respond(500, { error: error.message })
      return respond(200, { path, uploadToken: data.token })
    }

    if (body.action === 'portal-register-evidence') {
      const path = String(body.path || '')
      if (!path.startsWith(`${audit.id}/`)) return respond(400, { error: 'La ruta del archivo no corresponde a esta auditoría.' })
      const { data, error } = await admin.from('evidencia_auditoria').insert({
        auditoria_id: audit.id,
        nombre_archivo: String(body.name || 'evidencia').replace(/[\\/:*?"<>|]/g, '-').slice(0, 150),
        ruta_storage: path,
        tipo_mime: String(body.mimeType || 'application/octet-stream').slice(0, 180),
        tamano_bytes: Number(body.size || 0),
        origen: 'Auditor externo',
      }).select('id, nombre_archivo, ruta_storage, tipo_mime, tamano_bytes, fecha').single()
      if (error) {
        await admin.storage.from(bucket).remove([path])
        return respond(500, { error: error.message })
      }
      return respond(200, { evidence: data })
    }
  }

  return respond(400, { error: 'Acción no reconocida.' })
})
