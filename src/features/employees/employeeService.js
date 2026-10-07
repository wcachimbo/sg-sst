import { supabase } from '../../lib/supabase'

export async function createEmployee(employee) {
  if (!supabase) {
    throw new Error('La conexión a Supabase no está configurada.')
  }

  const { data, error } = await supabase.functions.invoke('create-employee', {
    body: employee,
  })

  if (error) {
    if (error.message === 'Failed to send a request to the Edge Function') {
      throw new Error('No se pudo conectar con create-employee. Despliega la Edge Function en este proyecto Supabase.')
    }

    let details
    try {
      details = await error.context?.json()
    } catch {
      details = null
    }
    throw new Error(details?.error || error.message)
  }

  if (data?.error) throw new Error(data.error)

  return data
}

export async function listEmployees() {
  if (!supabase) {
    throw new Error('La conexión a Supabase no está configurada.')
  }

  const { data, error } = await supabase
    .from('empleado')
    .select('id, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, nombre_completo, cedula, empresa, cargo, area, correo, celular, telefono, extesion, tipo_vinculacion, id_empresa')
    .order('fecha', { ascending: false })

  if (error) throw new Error(error.message)
  if (!data?.length) return []
  const { data: profiles, error: profileError } = await supabase.from('usuario').select('cedula, rol').in('cedula', data.map((employee) => employee.cedula))
  if (profileError) throw new Error(profileError.message)
  const roles = new Map((profiles || []).map((profile) => [profile.cedula, profile.rol]))
  return data.map((employee) => ({ ...employee, rol: roles.get(employee.cedula) || 'basico' }))
}

export async function manageEmployee(action, employeeId, employee) {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  const { data, error } = await supabase.functions.invoke('manage-employee', {
    body: { action, employee_id: employeeId, employee },
  })
  if (error) {
    let details
    try { details = await error.context?.json() } catch { details = null }
    if (error.message === 'Failed to send a request to the Edge Function') {
      throw new Error('No se pudo conectar con manage-employee. Despliega la Edge Function en este proyecto Supabase.')
    }
    throw new Error(details?.error || error.message)
  }
  if (data?.error) throw new Error(data.error)
  return data
}
