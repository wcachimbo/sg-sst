import { supabase } from '../../lib/supabase'

const DOCUMENT_BUCKET = 'documentos-empresa'

function requireSupabase() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

export async function listTemplates() {
  const client = requireSupabase()
  const { data, error } = await client
    .from('plantillas')
    .select('id, fecha, nombre, formato')
    .order('fecha', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function saveTemplate({ name, schema }) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('plantillas')
    .insert({ nombre: name, formato: schema })
    .select('id, fecha, nombre, formato')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function listCompanyFiles(companyId) {
  const client = requireSupabase()
  const { data, error } = await client
    .from('archivo')
    .select('id, fecha, nombre, plantilla_id, storage_path, mime_type, datos, requiere_firma')
    .eq('empresa_id', companyId)
    .order('fecha', { ascending: false })

  if (error) throw new Error(error.message)
  return data || []
}

export async function saveCompanyFile({ companyId, templateId = null, name, blob, mimeType, values = null, requiresSignature = false }) {
  const client = requireSupabase()
  const safeName = name.replace(/[\\/:*?"<>|]/g, '-').slice(0, 150)
  const extension = safeName.split('.').pop() || 'bin'
  const storagePath = `${companyId}/${crypto.randomUUID()}.${extension}`
  const { error: uploadError } = await client.storage
    .from(DOCUMENT_BUCKET)
    .upload(storagePath, blob, { contentType: mimeType, upsert: false })

  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await client
    .from('archivo')
    .insert({
      nombre: safeName,
      empresa_id: companyId,
      plantilla_id: templateId,
      storage_path: storagePath,
      mime_type: mimeType,
      datos: values,
      requiere_firma: requiresSignature,
    })
    .select('id, fecha, nombre, plantilla_id, storage_path, mime_type, datos, requiere_firma')
    .single()

  if (error) {
    await client.storage.from(DOCUMENT_BUCKET).remove([storagePath])
    throw new Error(error.message)
  }

  return data
}

export async function getCompanyFileUrl(file) {
  const client = requireSupabase()
  const { data, error } = await client.storage
    .from(DOCUMENT_BUCKET)
    .createSignedUrl(file.storage_path, 600, { download: file.nombre })

  if (error) throw new Error(error.message)
  return data.signedUrl
}

export async function downloadCompanyFileBlob(file) {
  if (!file.storage_path) throw new Error('Este registro no tiene un archivo disponible en Storage.')
  const { data, error } = await requireSupabase().storage
    .from(DOCUMENT_BUCKET)
    .download(file.storage_path)

  if (error) throw new Error(error.message)
  return data
}

export async function updateCompanyFile({ companyId, file, name, replacement = null, values }) {
  const client = requireSupabase()
  const safeName = name.trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 150)
  if (!safeName) throw new Error('Escribe un nombre para el archivo.')
  let nextStoragePath = file.storage_path
  const previousStoragePath = file.storage_path

  if (replacement) {
    const extension = safeName.split('.').pop() || 'bin'
    nextStoragePath = `${companyId}/${crypto.randomUUID()}.${extension}`
    const { error: uploadError } = await client.storage.from(DOCUMENT_BUCKET).upload(nextStoragePath, replacement, {
      contentType: replacement.type || 'application/octet-stream',
      upsert: false,
    })
    if (uploadError) throw new Error(uploadError.message)
  }

  const changes = { nombre: safeName }
  if (values !== undefined) changes.datos = values
  else if (replacement) changes.datos = null
  if (replacement) {
    changes.storage_path = nextStoragePath
    changes.mime_type = replacement.type || 'application/octet-stream'
  }
  const { data, error } = await client.from('archivo')
    .update(changes)
    .eq('id', file.id)
    .select('id, fecha, nombre, plantilla_id, storage_path, mime_type, datos, requiere_firma')
    .single()

  if (error) {
    if (replacement) await client.storage.from(DOCUMENT_BUCKET).remove([nextStoragePath])
    throw new Error(error.message)
  }

  if (replacement && previousStoragePath) await client.storage.from(DOCUMENT_BUCKET).remove([previousStoragePath])
  return data
}

export async function deleteCompanyFile(file) {
  const client = requireSupabase()
  const { error } = await client.from('archivo').delete().eq('id', file.id)
  if (error) throw new Error(error.message)
  if (file.storage_path) {
    const { error: storageError } = await client.storage.from(DOCUMENT_BUCKET).remove([file.storage_path])
    if (storageError) return `El registro se borró, pero el archivo almacenado no se pudo limpiar: ${storageError.message}`
  }
  return ''
}
