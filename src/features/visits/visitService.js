import { supabase } from '../../lib/supabase'
import { listCompanyEmployees } from '../accidents/accidentService'

function client() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

export async function listCompanyVisits(companyId) {
  const db = client()
  const { data: visits, error } = await db.from('visita_empresa')
    .select('id, fecha_creacion, fecha_visita, descripcion, areas_revision, encargado, estado')
    .eq('empresa_id', companyId)
    .order('fecha_visita', { ascending: true })
  if (error) throw new Error(error.message)
  if (!visits?.length) return []

  const visitIds = visits.map((visit) => visit.id)
  const [{ data: people, error: peopleError }, employees] = await Promise.all([
    db.from('persona_visita').select('visita_id, trabajador_cedula').in('visita_id', visitIds),
    listCompanyEmployees(companyId),
  ])
  if (peopleError) throw new Error(peopleError.message)
  const employeeMap = new Map(employees.map((employee) => [employee.cedula, employee]))
  return visits.map((visit) => ({
    ...visit,
    personas: (people || []).filter((person) => person.visita_id === visit.id)
      .map((person) => employeeMap.get(person.trabajador_cedula))
      .filter(Boolean),
  }))
}

export async function listVisitEmployees(companyId) {
  return listCompanyEmployees(companyId)
}

export async function createCompanyVisit({ companyId, date, description, areas, responsible, employeeIds }) {
  const db = client()
  const { data: userData } = await db.auth.getUser()
  const { data: visit, error } = await db.from('visita_empresa').insert({
    empresa_id: companyId,
    fecha_visita: new Date(date).toISOString(),
    descripcion: description.trim(),
    areas_revision: areas.map((area) => area.trim()).filter(Boolean),
    encargado: responsible.trim(),
    estado: 'Programada',
    creado_por: userData.user?.id || null,
  }).select('id, fecha_creacion, fecha_visita, descripcion, areas_revision, encargado, estado').single()
  if (error) throw new Error(error.message)

  const links = employeeIds.map((cedula) => ({ visita_id: visit.id, trabajador_cedula: cedula }))
  const { error: peopleError } = await db.from('persona_visita').insert(links)
  if (peopleError) {
    await db.from('visita_empresa').delete().eq('id', visit.id)
    throw new Error(peopleError.message)
  }
  const employees = await listCompanyEmployees(companyId)
  const employeeMap = new Map(employees.map((employee) => [employee.cedula, employee]))
  return { ...visit, personas: employeeIds.map((cedula) => employeeMap.get(cedula)).filter(Boolean) }
}

export async function updateCompanyVisitStatus(visitId, status) {
  const { data, error } = await client().from('visita_empresa')
    .update({ estado: status })
    .eq('id', visitId)
    .select('id, estado')
    .single()
  if (error) throw new Error(error.message)
  return data
}
