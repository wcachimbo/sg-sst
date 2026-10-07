import { supabase } from '../../lib/supabase'

const EVIDENCE_BUCKET = 'evidencias-accidentes'

function client() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

export async function listCompanyAccidents(companyId) {
  const { data, error } = await client()
    .from('reporte_accidente')
    .select('id, fecha_reporte, fecha_ocurrencia, lugar, descripcion, trabajador_cedula, trabajador_nombre, estado, responsable_seguimiento, creado_en, actualizado_en')
    .eq('empresa_id', companyId)
    .order('fecha_ocurrencia', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function listCompanyEmployees(companyId) {
  const { data, error } = await client()
    .from('empleado')
    .select('cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo')
    .eq('id_empresa', companyId)
    .order('primer_nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createAccident({ companyId, occurrenceDate, location, description, employeeId, employeeName }) {
  const { data, error } = await client()
    .from('reporte_accidente')
    .insert({
      empresa_id: companyId,
      fecha_ocurrencia: new Date(occurrenceDate).toISOString(),
      lugar: location.trim(),
      descripcion: description.trim(),
      trabajador_cedula: employeeId || null,
      trabajador_nombre: employeeName.trim(),
      estado: 'Reportado',
      reportado_por: (await client().auth.getUser()).data.user?.id,
    })
    .select('id, fecha_reporte, fecha_ocurrencia, lugar, descripcion, trabajador_cedula, trabajador_nombre, estado, responsable_seguimiento, creado_en, actualizado_en')
    .single()
  if (error) throw new Error(error.message)
  return data
}

export async function uploadAccidentEvidence({ companyId, reportId, file }) {
  const safeName = file.name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 140)
  const path = `${companyId}/${reportId}/${crypto.randomUUID()}-${safeName}`
  const { error: uploadError } = await client().storage.from(EVIDENCE_BUCKET).upload(path, file, {
    contentType: file.type || 'application/octet-stream',
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { error } = await client().from('evidencia_accidente').insert({
    reporte_accidente_id: reportId,
    nombre_archivo: safeName,
    ruta_storage: path,
    tipo_mime: file.type || 'application/octet-stream',
    tamano_bytes: file.size,
    subido_por: (await client().auth.getUser()).data.user?.id,
  })
  if (error) {
    await client().storage.from(EVIDENCE_BUCKET).remove([path])
    throw new Error(error.message)
  }
}

export async function listAccidentEvidence(reportId) {
  const { data, error } = await client().from('evidencia_accidente')
    .select('id, nombre_archivo, ruta_storage, tipo_mime, tamano_bytes, fecha')
    .eq('reporte_accidente_id', reportId)
    .order('fecha', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

export async function getAccidentEvidenceUrl(path) {
  const { data, error } = await client().storage.from(EVIDENCE_BUCKET).createSignedUrl(path, 600)
  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function listAccidentFollowups(reportId) {
  const { data, error } = await client().from('seguimiento_accidente')
    .select('id, fecha, comentario, estado, responsable, creado_por')
    .eq('reporte_accidente_id', reportId)
    .order('fecha', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function addAccidentFollowup({ reportId, comment, status, responsible }) {
  const user = await client().auth.getUser()
  const userId = user.data.user?.id
  const { error: followupError } = await client().from('seguimiento_accidente').insert({
    reporte_accidente_id: reportId,
    comentario: comment.trim(),
    estado: status,
    responsable: responsible.trim() || null,
    creado_por: userId,
  })
  if (followupError) throw new Error(followupError.message)

  const { error } = await client().from('reporte_accidente').update({
    estado: status,
    responsable_seguimiento: responsible.trim() || null,
    actualizado_en: new Date().toISOString(),
  }).eq('id', reportId)
  if (error) throw new Error(error.message)
}
