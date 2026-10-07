import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, Clock3, MapPin, Plus, UserRound, Users, X } from 'lucide-react'
import { createCompanyVisit, listVisitEmployees, listCompanyVisits, updateCompanyVisitStatus } from './visitService'

function personName(employee) {
  return employee.nombre_completo || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ') || employee.cedula
}

function newVisitDraft() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  date.setHours(9, 0, 0, 0)
  return { date: date.toISOString().slice(0, 16), description: '', responsible: '', employees: [], areas: [''] }
}

function formatVisitDate(date) {
  return new Date(date).toLocaleString('es-CO', { dateStyle: 'full', timeStyle: 'short' })
}

function CompanyVisits({ company, canManage = true }) {
  const [visits, setVisits] = useState([])
  const [employees, setEmployees] = useState([])
  const [draft, setDraft] = useState(newVisitDraft)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadVisits = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [scheduledVisits, companyEmployees] = await Promise.all([
        listCompanyVisits(company.id),
        listVisitEmployees(company.id),
      ])
      setVisits(scheduledVisits)
      setEmployees(companyEmployees)
    } catch (error) {
      setErrorMessage(`No se pudieron cargar las visitas. ${error.message} Ejecuta supabase/visitas_empresa.sql en Supabase si aún no has creado las tablas.`)
    } finally {
      setIsLoading(false)
    }
  }, [company.id])

  useEffect(() => { loadVisits() }, [loadVisits])

  function toggleEmployee(cedula) {
    setDraft((current) => ({ ...current, employees: current.employees.includes(cedula)
      ? current.employees.filter((item) => item !== cedula)
      : [...current.employees, cedula] }))
  }

  async function saveVisit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    const areas = draft.areas.map((area) => area.trim()).filter(Boolean)
    if (!draft.employees.length) return setErrorMessage('Selecciona al menos una persona involucrada en la visita.')
    if (!areas.length) return setErrorMessage('Agrega al menos un área para revisar.')
    setIsSaving(true)
    try {
      const visit = await createCompanyVisit({
        companyId: company.id,
        date: draft.date,
        description: draft.description,
        areas,
        responsible: draft.responsible,
        employeeIds: draft.employees,
      })
      setVisits((current) => [...current, visit].sort((a, b) => new Date(a.fecha_visita) - new Date(b.fecha_visita)))
      setDraft(newVisitDraft())
      setIsModalOpen(false)
      setSuccessMessage('Visita programada correctamente.')
    } catch (error) {
      setErrorMessage(`No se pudo programar la visita. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function changeStatus(visit, status) {
    setErrorMessage('')
    try {
      await updateCompanyVisitStatus(visit.id, status)
      setVisits((current) => current.map((item) => item.id === visit.id ? { ...item, estado: status } : item))
      setSuccessMessage(`Visita marcada como ${status.toLowerCase()}.`)
    } catch (error) {
      setErrorMessage(`No se pudo actualizar la visita. ${error.message}`)
    }
  }

  return <section className="company-visits-page">
    <div className="visits-page-heading">
      <div><p className="eyebrow">GESTIÓN DE CAMPO · {company.name}</p><h1>Visitas a la empresa<span>.</span></h1><p className="welcome-copy">Programa recorridos, define las áreas que se revisarán y registra a las personas que participarán.</p></div>
      {canManage && <button className="primary-button" type="button" onClick={() => { setDraft(newVisitDraft()); setErrorMessage(''); setIsModalOpen(true) }}><Plus size={16} /> Agendar visita</button>}
    </div>
    {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
    {successMessage && <p className="template-success" role="status">{successMessage}</p>}
    {isLoading ? <div className="empty-state">Cargando agenda de visitas...</div> : visits.length ? <div className="company-visit-list">{visits.map((visit) => <article className="company-visit-card" key={visit.id}>
      <div className="company-visit-date"><CalendarDays size={18} /><span>{formatVisitDate(visit.fecha_visita)}</span><strong className={`company-visit-status company-visit-status-${visit.estado.toLowerCase()}`}>{visit.estado}</strong></div>
      <p className="company-visit-description">{visit.descripcion}</p>
      <div className="company-visit-details"><span><MapPin size={15} /><strong>Áreas:</strong> {visit.areas_revision.join(', ')}</span><span><UserRound size={15} /><strong>Encargado:</strong> {visit.encargado}</span><span><Users size={15} /><strong>Participantes:</strong> {visit.personas.map(personName).join(', ') || 'Sin personas asociadas'}</span></div>
      {canManage && visit.estado === 'Programada' && <div className="company-visit-actions"><button type="button" className="secondary-button" onClick={() => changeStatus(visit, 'Realizada')}><Check size={14} /> Marcar realizada</button><button type="button" className="secondary-button" onClick={() => changeStatus(visit, 'Cancelada')}>Cancelar visita</button></div>}
    </article>)}</div> : <div className="empty-state"><CalendarDays size={22} /><strong>No hay visitas programadas</strong><span>Agenda una visita para comenzar el seguimiento en esta empresa.</span></div>}

    {isModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsModalOpen(false) }}><section className="document-modal company-visit-modal" role="dialog" aria-modal="true" aria-labelledby="schedule-visit-title">
      <div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="schedule-visit-title">Agendar visita</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" disabled={isSaving} onClick={() => setIsModalOpen(false)}><X size={19} /></button></div>
      <p className="modal-copy">Indica cuándo será el recorrido, quiénes participarán y qué áreas se revisarán.</p>
      <form className="document-modal-form company-visit-form" onSubmit={saveVisit}>
        <label className="form-field">Fecha y hora de la visita<input type="datetime-local" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label>
        <label className="form-field">Encargado de la visita<input required maxLength={160} value={draft.responsible} onChange={(event) => setDraft((current) => ({ ...current, responsible: event.target.value }))} placeholder="Nombre de quien liderará el recorrido" /></label>
        <fieldset className="visit-people-field"><legend>Personas involucradas</legend>{employees.length ? <div className="visit-people-list">{employees.map((employee) => <label key={employee.cedula}><input type="checkbox" checked={draft.employees.includes(employee.cedula)} onChange={() => toggleEmployee(employee.cedula)} /><span>{personName(employee)}</span><small>CC {employee.cedula}</small></label>)}</div> : <p className="document-template-note">No hay empleados registrados para esta empresa.</p>}</fieldset>
        <fieldset className="visit-areas-field"><legend>Áreas a revisar</legend>{draft.areas.map((area, index) => <div className="visit-area-row" key={index}><input aria-label={`Área a revisar ${index + 1}`} required value={area} onChange={(event) => setDraft((current) => ({ ...current, areas: current.areas.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`Área ${index + 1}`} />{draft.areas.length > 1 && <button type="button" className="icon-button" aria-label={`Quitar área ${index + 1}`} onClick={() => setDraft((current) => ({ ...current, areas: current.areas.filter((_, itemIndex) => itemIndex !== index) }))}><X size={15} /></button>}</div>)}<button type="button" className="secondary-button" onClick={() => setDraft((current) => ({ ...current, areas: [...current.areas, ''] }))}><Plus size={14} /> Agregar área</button></fieldset>
        <label className="form-field">Descripción de la visita<textarea required maxLength={5000} rows={4} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Objetivo, temas o actividades que se realizarán durante la visita" /></label>
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving || !employees.length}><Clock3 size={15} />{isSaving ? 'Agendando...' : 'Confirmar visita'}</button></div>
      </form>
    </section></div>}
  </section>
}

export default CompanyVisits
