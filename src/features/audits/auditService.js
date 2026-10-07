import { supabase } from '../../lib/supabase'
import { listCompanyEmployees } from '../accidents/accidentService'

function client() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

async function publicPortalAction(body) {
  const { data, error } = await client().functions.invoke('audit-findings-portal', { body })
  if (error) {
    let details
    try { details = await error.context?.json() } catch { details = null }
    throw new Error(details?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}

export async function loadExternalAudit(token) {
  return publicPortalAction({ action: 'portal-get', token })
}

export async function submitExternalFinding({ token, finding }) {
  return publicPortalAction({ action: 'portal-add-finding', token, finding })
}

export async function uploadExternalAuditEvidence({ token, file }) {
  const db = client()
  const { path, uploadToken } = await publicPortalAction({ action: 'portal-create-upload', token, name: file.name, mimeType: file.type, size: file.size })
  const { error: uploadError } = await db.storage.from('evidencias-auditoria').uploadToSignedUrl(path, uploadToken, file, {
    contentType: file.type || 'application/octet-stream',
  })
  if (uploadError) throw new Error(uploadError.message)
  return publicPortalAction({ action: 'portal-register-evidence', token, path, name: file.name, mimeType: file.type || 'application/octet-stream', size: file.size })
}

export async function listCompanyAudits(companyId) {
  const db = client()
  const { data: audits, error } = await db.from('auditoria_empresa')
    .select('id, fecha_creacion, fecha_auditoria, tipo, entidad_auditora, auditor_nombre, auditor_correo, objetivo, alcance, areas_auditadas, descripcion, responsable_empresa, estado, correo_hallazgos_enviado, token_hallazgos_expira')
    .eq('empresa_id', companyId)
    .order('fecha_auditoria', { ascending: false })
  if (error) throw new Error(error.message)
  if (!audits?.length) return []

  const ids = audits.map((audit) => audit.id)
  const [{ data: participants, error: participantError }, { data: findings, error: findingError }, { data: evidence, error: evidenceError }, employees] = await Promise.all([
    db.from('persona_auditoria').select('auditoria_id, trabajador_cedula').in('auditoria_id', ids),
    db.from('hallazgo_auditoria').select('id, auditoria_id, tipo, descripcion, accion_correctiva, responsable, fecha_compromiso, estado, fecha_creacion').in('auditoria_id', ids).order('fecha_creacion', { ascending: false }),
    db.from('evidencia_auditoria').select('id, auditoria_id, nombre_archivo, ruta_storage, tipo_mime, tamano_bytes, fecha').in('auditoria_id', ids).order('fecha', { ascending: false }),
    listCompanyEmployees(companyId),
  ])
  if (participantError) throw new Error(participantError.message)
  if (findingError) throw new Error(findingError.message)
  if (evidenceError) throw new Error(evidenceError.message)
  const signedEvidence = await Promise.all((evidence || []).map(async (item) => {
    const { data, error: urlError } = await db.storage.from('evidencias-auditoria').createSignedUrl(item.ruta_storage, 600)
    return { ...item, url: urlError ? '' : data.signedUrl }
  }))
  const employeeMap = new Map(employees.map((employee) => [employee.cedula, employee]))
  return audits.map((audit) => ({
    ...audit,
    personas: (participants || []).filter((row) => row.auditoria_id === audit.id).map((row) => employeeMap.get(row.trabajador_cedula)).filter(Boolean),
    hallazgos: (findings || []).filter((finding) => finding.auditoria_id === audit.id),
    evidencias: signedEvidence.filter((item) => item.auditoria_id === audit.id),
  }))
}

export async function createCompanyAudit({ companyId, date, type, auditingEntity, auditor, auditorEmail, objective, scope, areas, description, companyResponsible, employeeIds }) {
  const db = client()
  const { data: authData } = await db.auth.getUser()
  const { data: audit, error } = await db.from('auditoria_empresa').insert({
    empresa_id: companyId,
    fecha_auditoria: new Date(date).toISOString(),
    tipo: type,
    entidad_auditora: auditingEntity.trim() || null,
    auditor_nombre: auditor.trim(),
    auditor_correo: auditorEmail.trim().toLowerCase(),
    objetivo: objective.trim(),
    alcance: scope.trim(),
    areas_auditadas: areas.map((area) => area.trim()).filter(Boolean),
    descripcion: description.trim() || null,
    responsable_empresa: companyResponsible.trim(),
    estado: 'Programada',
    creado_por: authData.user?.id || null,
  }).select('id').single()
  if (error) throw new Error(error.message)

  if (employeeIds.length) {
    const { error: peopleError } = await db.from('persona_auditoria').insert(employeeIds.map((cedula) => ({ auditoria_id: audit.id, trabajador_cedula: cedula })))
    if (peopleError) {
      await db.from('auditoria_empresa').delete().eq('id', audit.id)
      throw new Error(peopleError.message)
    }
  }
  return audit.id
}

export async function createAuditFinding({ auditId, type, description, correctiveAction, responsible, dueDate }) {
  const { data, error } = await client().from('hallazgo_auditoria').insert({
    auditoria_id: auditId,
    tipo: type,
    descripcion: description.trim(),
    accion_correctiva: correctiveAction.trim() || null,
    responsable: responsible.trim() || null,
    fecha_compromiso: dueDate || null,
    estado: 'Abierto',
  }).select('id, auditoria_id, tipo, descripcion, accion_correctiva, responsable, fecha_compromiso, estado, fecha_creacion').single()
  if (error) throw new Error(error.message)
  return data
}

export async function updateAuditStatus(auditId, status) {
  const { data, error } = await client().from('auditoria_empresa').update({ estado: status }).eq('id', auditId).select('id, estado').single()
  if (error) throw new Error(error.message)
  return data
}

export async function requestAuditFindingsLink({ auditId, email }) {
  return publicPortalAction({ action: 'request-findings', auditId, email: email.trim().toLowerCase() })
}

export async function updateFindingStatus(findingId, status) {
  const { data, error } = await client().from('hallazgo_auditoria').update({ estado: status }).eq('id', findingId).select('id, estado').single()
  if (error) throw new Error(error.message)
  return data
}
