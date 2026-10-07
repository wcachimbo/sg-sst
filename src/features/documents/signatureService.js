import { supabase } from '../../lib/supabase'
import { downloadCompanyFileBlob } from './documentService'

const USER_SIGNATURE_BUCKET = 'firmas-usuarios'
const DOCUMENT_SIGNATURE_BUCKET = 'firmas-documentos'

function db() {
  if (!supabase) throw new Error('No hay conexión con Supabase.')
  return supabase
}

export function signatureSetupHint(error) {
  const details = `${error?.message || ''} ${error?.details || ''} ${error?.hint || ''}`
  const schemaOrRecursion = /database schema is invalid or incompatible|infinite recursion|42P17/i
  if (schemaOrRecursion.test(details)) return ' Ejecuta supabase/firmas_rls_fix.sql en el SQL Editor de Supabase para reparar la recursión de políticas RLS.'
  const missingObjects = /firma_usuario|firma_documento|registrar_firma_documento|requiere_firma|firmas-usuarios|firmas-documentos/i
  const blockedObjects = /row-level security|permission denied|permission denied for/i
  if (missingObjects.test(details)) return ' Revisa que se haya ejecutado supabase/firmas_documentos.sql en el SQL Editor de Supabase.'
  if (blockedObjects.test(details) && /firma/i.test(details)) return ' Revisa que se haya ejecutado supabase/firmas_documentos.sql en el SQL Editor de Supabase.'
  return ''
}

export async function getUserSignature(userId) {
  const client = db()
  const { data, error } = await client.from('firma_usuario')
    .select('auth_user_id, storage_path, mime_type, actualizada_en')
    .eq('auth_user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return null
  const { data: blob, error: downloadError } = await client.storage.from(USER_SIGNATURE_BUCKET).download(data.storage_path)
  if (downloadError) throw new Error(downloadError.message)
  return { ...data, blob }
}

export async function saveUserSignature(userId, blob) {
  const client = db()
  const existing = await client.from('firma_usuario').select('storage_path').eq('auth_user_id', userId).maybeSingle()
  if (existing.error) throw new Error(existing.error.message)

  const storagePath = `${userId}/${crypto.randomUUID()}.png`
  const { error: uploadError } = await client.storage.from(USER_SIGNATURE_BUCKET).upload(storagePath, blob, {
    contentType: 'image/png',
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { error } = await client.from('firma_usuario').upsert({
    auth_user_id: userId,
    storage_path: storagePath,
    mime_type: 'image/png',
    actualizada_en: new Date().toISOString(),
  })
  if (error) {
    await client.storage.from(USER_SIGNATURE_BUCKET).remove([storagePath])
    throw new Error(error.message)
  }
  if (existing.data?.storage_path) await client.storage.from(USER_SIGNATURE_BUCKET).remove([existing.data.storage_path])
}

export async function deleteUserSignature(userId) {
  const client = db()
  const { data, error } = await client.from('firma_usuario').select('storage_path').eq('auth_user_id', userId).maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) return
  const { error: deleteError } = await client.from('firma_usuario').delete().eq('auth_user_id', userId)
  if (deleteError) throw new Error(deleteError.message)
  await client.storage.from(USER_SIGNATURE_BUCKET).remove([data.storage_path])
}

export async function listCompanySigners(companyId) {
  const client = db()
  const { data: employees, error: employeeError } = await client.from('empleado')
    .select('cedula, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, correo')
    .eq('id_empresa', companyId)
    .order('primer_nombre')
  if (employeeError) throw new Error(employeeError.message)
  const identityNumbers = (employees || []).map((employee) => employee.cedula).filter(Boolean)
  if (!identityNumbers.length) return []

  const { data: accounts, error: accountError } = await client.from('usuario')
    .select('cedula, auth_user_id, apodo')
    .eq('id_empresa', companyId)
    .not('auth_user_id', 'is', null)
    .in('cedula', identityNumbers)
  if (accountError) throw new Error(accountError.message)
  const accountsById = new Map((accounts || []).map((account) => [account.cedula, account]))

  return (employees || []).flatMap((employee) => {
    const account = accountsById.get(employee.cedula)
    if (!account?.auth_user_id) return []
    const name = employee.nombre_completo
      || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ')
      || account.apodo
      || employee.correo
    return [{ id: account.auth_user_id, name, email: employee.correo || '', cedula: employee.cedula }]
  })
}

export async function listDocumentSignatures(fileIds) {
  if (!fileIds.length) return []
  const { data, error } = await db().from('firma_documento')
    .select('id, archivo_id, firmante_auth_user_id, firmante_nombre, firmante_correo, estado, solicitada_en, firmada_en, firma_path, sha256_documento')
    .in('archivo_id', fileIds)
    .order('solicitada_en')
  if (error) throw new Error(error.message)
  return data || []
}

export async function listMyDocumentSignatures(userId) {
  const { data, error } = await db().from('firma_documento')
    .select('id, archivo_id, firmante_auth_user_id, firmante_nombre, firmante_correo, estado, solicitada_en, firmada_en, firma_path, sha256_documento, archivo:archivo!firma_documento_archivo_id_fkey(id, fecha, nombre, storage_path, mime_type, requiere_firma)')
    .eq('firmante_auth_user_id', userId)
    .order('solicitada_en', { ascending: false })
  if (error) throw new Error(error.message)
  return data || []
}

export async function createDocumentSignatureRequests(file, signers, creatorId) {
  if (!file.requiere_firma) return []
  if (!signers.length) throw new Error('Selecciona al menos una persona que deba firmar.')
  const client = db()
  const rows = signers.map((signer) => ({
    archivo_id: file.id,
    firmante_auth_user_id: signer.id,
    firmante_nombre: signer.name,
    firmante_correo: signer.email || null,
    creado_por: creatorId,
  }))
  const { data, error } = await client.from('firma_documento').insert(rows).select('*')
  if (error) {
    await client.from('archivo').delete().eq('id', file.id)
    if (file.storage_path) await client.storage.from('documentos-empresa').remove([file.storage_path])
    throw new Error(error.message)
  }
  return data || []
}

export async function completeDocumentSignature(request, file) {
  const client = db()
  const savedSignature = await getUserSignature(request.firmante_auth_user_id)
  if (!savedSignature?.blob) throw new Error('Primero guarda tu firma desde el menú de tu cuenta.')
  const documentBlob = await downloadCompanyFileBlob(file)
  const digest = await crypto.subtle.digest('SHA-256', await documentBlob.arrayBuffer())
  const sha256 = Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
  const signaturePath = `${request.id}/${request.firmante_auth_user_id}.png`

  const { error: uploadError } = await client.storage.from(DOCUMENT_SIGNATURE_BUCKET).upload(signaturePath, savedSignature.blob, {
    contentType: 'image/png',
    upsert: false,
  })
  if (uploadError) throw new Error(uploadError.message)

  const { data, error } = await client.rpc('registrar_firma_documento', {
    p_firma_documento_id: request.id,
    p_firma_path: signaturePath,
    p_sha256_documento: sha256,
  })
  if (error) {
    await client.storage.from(DOCUMENT_SIGNATURE_BUCKET).remove([signaturePath])
    throw new Error(error.message)
  }
  return data
}
