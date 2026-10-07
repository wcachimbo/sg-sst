import { supabase } from '../../lib/supabase'

function client() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

export async function getAnnualWorkPlan(companyId, year) {
  const { data: plan, error } = await client()
    .from('plan_trabajo_anual')
    .select('id, empresa_id, anio, nombre, fecha')
    .eq('empresa_id', companyId)
    .eq('anio', year)
    .maybeSingle()

  if (error) throw new Error(error.message)
  if (!plan) return null

  const { data: activities, error: activitiesError } = await client()
    .from('actividad_plan_trabajo_anual')
    .select('id, actividad, responsable, mes, prioridad, estado, evidencia, observaciones, orden, fecha')
    .eq('plan_id', plan.id)
    .order('orden', { ascending: true })
    .order('id', { ascending: true })

  if (activitiesError) throw new Error(activitiesError.message)
  return { ...plan, actividades: activities || [] }
}

export async function createAnnualWorkPlan({ companyId, year, name }) {
  const { data, error } = await client()
    .from('plan_trabajo_anual')
    .insert({ empresa_id: companyId, anio: year, nombre: name })
    .select('id, empresa_id, anio, nombre, fecha')
    .single()

  if (error) throw new Error(error.message)
  return data
}

export async function saveWorkPlanActivity({ planId, activity }) {
  const payload = {
    actividad: activity.actividad.trim(),
    responsable: activity.responsable.trim() || null,
    mes: Number(activity.mes),
    prioridad: activity.prioridad,
    estado: activity.estado,
    evidencia: activity.evidencia.trim() || null,
    observaciones: activity.observaciones.trim() || null,
  }
  const query = activity.id
    ? client().from('actividad_plan_trabajo_anual').update(payload).eq('id', activity.id)
    : client().from('actividad_plan_trabajo_anual').insert({ ...payload, plan_id: planId })
  const { error } = await query
  if (error) throw new Error(error.message)
}

export async function updateWorkPlanActivityStatus(activityId, status) {
  const { error } = await client()
    .from('actividad_plan_trabajo_anual')
    .update({ estado: status })
    .eq('id', activityId)

  if (error) throw new Error(error.message)
}

export async function deleteWorkPlanActivity(activityId) {
  const { error } = await client()
    .from('actividad_plan_trabajo_anual')
    .delete()
    .eq('id', activityId)

  if (error) throw new Error(error.message)
}
