import { useCallback, useEffect, useMemo, useState } from 'react'
import { CalendarDays, Check, Download, FilePlus2, Pencil, Plus, Trash2, X } from 'lucide-react'
import { createAnnualWorkPlan, deleteWorkPlanActivity, getAnnualWorkPlan, saveWorkPlanActivity, updateWorkPlanActivityStatus } from './workPlanService'

const months = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre']
const emptyActivity = () => ({ actividad: '', responsable: '', mes: String(new Date().getMonth() + 1), prioridad: 'Media', estado: 'Pendiente', evidencia: '', observaciones: '' })

function AnnualWorkPlan({ company, canEdit }) {
  const thisYear = new Date().getFullYear()
  const [year, setYear] = useState(thisYear)
  const [plan, setPlan] = useState(null)
  const [activities, setActivities] = useState([])
  const [activityDraft, setActivityDraft] = useState(emptyActivity)
  const [isPlanModalOpen, setIsPlanModalOpen] = useState(false)
  const [isActivityModalOpen, setIsActivityModalOpen] = useState(false)
  const [planName, setPlanName] = useState(`Plan anual de trabajo ${thisYear}`)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadPlan = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const result = await getAnnualWorkPlan(company.id, year)
      setPlan(result)
      setActivities(result?.actividades || [])
    } catch (error) {
      setPlan(null)
      setActivities([])
      setErrorMessage(`No se pudo cargar el plan. ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [company.id, year])

  useEffect(() => { loadPlan() }, [loadPlan])

  const completedCount = activities.filter((activity) => activity.estado === 'Completado').length
  const progress = activities.length ? Math.round((completedCount / activities.length) * 100) : 0
  const years = useMemo(() => Array.from({ length: 7 }, (_, index) => thisYear - 2 + index), [thisYear])

  async function createPlan(event) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    try {
      const newPlan = await createAnnualWorkPlan({ companyId: company.id, year, name: planName.trim() || `Plan anual de trabajo ${year}` })
      setPlan({ ...newPlan, actividades: [] })
      setActivities([])
      setIsPlanModalOpen(false)
      setSuccessMessage('Plan anual creado. Ya puedes agregar sus actividades.')
    } catch (error) {
      setErrorMessage(`No se pudo crear el plan. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveActivity(event) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await saveWorkPlanActivity({ planId: plan.id, activity: activityDraft })
      setIsActivityModalOpen(false)
      setActivityDraft(emptyActivity())
      setSuccessMessage(activityDraft.id ? 'Actividad actualizada.' : 'Actividad agregada al plan.')
      await loadPlan()
    } catch (error) {
      setErrorMessage(`No se pudo guardar la actividad. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function changeStatus(activity, status) {
    setErrorMessage('')
    try {
      await updateWorkPlanActivityStatus(activity.id, status)
      setActivities((current) => current.map((item) => item.id === activity.id ? { ...item, estado: status } : item))
    } catch (error) {
      setErrorMessage(`No se pudo actualizar el estado. ${error.message}`)
    }
  }

  async function removeActivity(activity) {
    if (!window.confirm(`¿Eliminar la actividad “${activity.actividad}”?`)) return
    setErrorMessage('')
    try {
      await deleteWorkPlanActivity(activity.id)
      setActivities((current) => current.filter((item) => item.id !== activity.id))
      setSuccessMessage('Actividad eliminada.')
    } catch (error) {
      setErrorMessage(`No se pudo eliminar la actividad. ${error.message}`)
    }
  }

  function downloadSchedule() {
    const header = ['Actividad SST', 'Responsable', 'Mes', 'Prioridad', 'Estado', 'Evidencia', 'Observaciones']
    const rows = activities.map((activity) => [activity.actividad, activity.responsable || '', months[activity.mes - 1], activity.prioridad, activity.estado, activity.evidencia || '', activity.observaciones || ''])
    const csv = [header, ...rows].map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(';')).join('\r\n')
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `plan-anual-${company.name.replace(/[^\p{L}\p{N}-]+/gu, '-')}-${year}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  function editActivity(activity) {
    setActivityDraft({ ...activity, mes: String(activity.mes) })
    setIsActivityModalOpen(true)
  }

  return <section className="annual-plan-page">
    <div className="annual-plan-heading">
      <div className="annual-plan-title"><span className="annual-plan-icon"><CalendarDays size={20} /></span><div><h1>Plan Anual de Trabajo</h1><p>Cronograma, asignación de responsables, evidencias y seguimiento.</p></div></div>
      <label className="annual-plan-year">Año<select value={year} onChange={(event) => { setYear(Number(event.target.value)); setPlanName(`Plan anual de trabajo ${event.target.value}`); setSuccessMessage('') }}>{years.map((option) => <option key={option} value={option}>{option}</option>)}</select></label>
    </div>

    {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
    {successMessage && <p className="template-success" role="status">{successMessage}</p>}

    {isLoading ? <div className="empty-state">Cargando plan de trabajo...</div> : !plan ? <div className="annual-plan-empty">
      <CalendarDays size={25} /><h2>Aún no hay un plan para {year}</h2><p>Crea el plan anual de {company.name} y agrega las actividades que quieres programar.</p>
      {canEdit && <button className="primary-button" onClick={() => { setPlanName(`Plan anual de trabajo ${year}`); setIsPlanModalOpen(true) }}><Plus size={16} /> Crear nuevo plan de trabajo</button>}
    </div> : <>
      <div className="annual-plan-summary">
        <div className="annual-plan-progress"><div><strong>{plan.nombre}</strong><span>{completedCount} de {activities.length} actividades completadas</span></div><strong>{progress}% ejecutado</strong></div>
        <div className="annual-plan-progress-track"><span style={{ width: `${progress}%` }} /></div>
        <div className="annual-plan-actions">{canEdit && <button className="primary-button" onClick={() => { setActivityDraft(emptyActivity()); setIsActivityModalOpen(true) }}><Plus size={16} /> Agregar actividad</button>}<button className="secondary-button" onClick={downloadSchedule} disabled={!activities.length}><Download size={15} /> Descargar cronograma</button></div>
      </div>

      {activities.length ? <div className="annual-plan-table-wrap"><table className="annual-plan-table">
        <thead><tr><th>Actividad SST</th><th>Responsable</th><th>Mes</th><th>Prioridad</th><th>Estado</th>{canEdit && <th>Acciones</th>}</tr></thead>
        <tbody>{activities.map((activity) => <tr key={activity.id}>
          <td><strong>{activity.actividad}</strong>{(activity.evidencia || activity.observaciones) && <small>{activity.evidencia || activity.observaciones}</small>}</td>
          <td>{activity.responsable || 'Sin asignar'}</td>
          <td>{months[activity.mes - 1]}</td>
          <td><span className={`plan-priority plan-priority-${activity.prioridad.toLowerCase()}`}>{activity.prioridad}</span></td>
          <td>{canEdit ? <select className={`plan-status plan-status-${activity.estado.toLowerCase().replace(' ', '-')}`} value={activity.estado} onChange={(event) => changeStatus(activity, event.target.value)}><option>Pendiente</option><option>En proceso</option><option>Completado</option></select> : <span className={`plan-status-label plan-status-${activity.estado.toLowerCase().replace(' ', '-')}`}>{activity.estado}</span>}</td>
          {canEdit && <td><div className="plan-row-actions"><button type="button" className="icon-button" aria-label={`Editar ${activity.actividad}`} onClick={() => editActivity(activity)}><Pencil size={15} /></button><button type="button" className="icon-button plan-delete-action" aria-label={`Eliminar ${activity.actividad}`} onClick={() => removeActivity(activity)}><Trash2 size={15} /></button></div></td>}
        </tr>)}</tbody>
      </table></div> : <div className="empty-state annual-plan-no-activities"><p>Aún no hay actividades en este plan.</p>{canEdit && <button className="secondary-button" onClick={() => { setActivityDraft(emptyActivity()); setIsActivityModalOpen(true) }}><Plus size={15} /> Agregar primera actividad</button>}</div>}
    </>}

    {isPlanModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsPlanModalOpen(false) }}><section className="document-modal annual-plan-modal" role="dialog" aria-modal="true" aria-labelledby="new-plan-title">
      <div className="modal-heading"><div><p className="eyebrow">{company.name} · {year}</p><h2 id="new-plan-title">Crear plan anual</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setIsPlanModalOpen(false)}><X size={19} /></button></div>
      <form className="document-modal-form" onSubmit={createPlan}><label className="form-field">Nombre del plan<input required value={planName} onChange={(event) => setPlanName(event.target.value)} /></label>{errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsPlanModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving}><FilePlus2 size={16} />{isSaving ? 'Creando...' : 'Crear plan'}</button></div></form>
    </section></div>}

    {isActivityModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsActivityModalOpen(false) }}><section className="document-modal annual-plan-modal" role="dialog" aria-modal="true" aria-labelledby="activity-title">
      <div className="modal-heading"><div><p className="eyebrow">PLAN {year} · {company.name}</p><h2 id="activity-title">{activityDraft.id ? 'Editar actividad' : 'Agregar actividad'}</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setIsActivityModalOpen(false)}><X size={19} /></button></div>
      <form className="document-modal-form annual-activity-form" onSubmit={saveActivity}>
        <label className="form-field">Actividad SST<input required maxLength={250} value={activityDraft.actividad} onChange={(event) => setActivityDraft((current) => ({ ...current, actividad: event.target.value }))} placeholder="Ej. Actualizar matriz de peligros" /></label>
        <label className="form-field">Responsable<input value={activityDraft.responsable} onChange={(event) => setActivityDraft((current) => ({ ...current, responsable: event.target.value }))} placeholder="Nombre o cargo responsable" /></label>
        <div className="annual-activity-grid"><label className="form-field">Mes<select value={activityDraft.mes} onChange={(event) => setActivityDraft((current) => ({ ...current, mes: event.target.value }))}>{months.map((month, index) => <option key={month} value={index + 1}>{month}</option>)}</select></label><label className="form-field">Prioridad<select value={activityDraft.prioridad} onChange={(event) => setActivityDraft((current) => ({ ...current, prioridad: event.target.value }))}><option>Alta</option><option>Media</option><option>Baja</option></select></label><label className="form-field">Estado<select value={activityDraft.estado} onChange={(event) => setActivityDraft((current) => ({ ...current, estado: event.target.value }))}><option>Pendiente</option><option>En proceso</option><option>Completado</option></select></label></div>
        <label className="form-field">Evidencia o enlace<input value={activityDraft.evidencia || ''} onChange={(event) => setActivityDraft((current) => ({ ...current, evidencia: event.target.value }))} placeholder="URL del soporte o referencia" /></label>
        <label className="form-field">Observaciones<textarea rows={3} value={activityDraft.observaciones || ''} onChange={(event) => setActivityDraft((current) => ({ ...current, observaciones: event.target.value }))} /></label>
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setIsActivityModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving}><Check size={16} />{isSaving ? 'Guardando...' : 'Guardar actividad'}</button></div>
      </form>
    </section></div>}
  </section>
}

export default AnnualWorkPlan
