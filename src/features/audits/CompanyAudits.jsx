import { useCallback, useEffect, useState } from 'react'
import { ArrowLeft, CalendarDays, Check, ClipboardCheck, Paperclip, Plus, UserRound, Users, X } from 'lucide-react'
import { createAuditFinding, createCompanyAudit, listCompanyAudits, requestAuditFindingsLink, updateAuditStatus, updateFindingStatus } from './auditService'
import { listCompanyEmployees } from '../accidents/accidentService'

function employeeName(employee) {
  return employee.nombre_completo || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ') || employee.cedula
}

function localDateTime() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  date.setHours(9, 0, 0, 0)
  return date.toISOString().slice(0, 16)
}

function newAuditDraft() {
  return { date: localDateTime(), type: 'Interna', auditingEntity: '', auditor: '', auditorEmail: '', objective: '', scope: '', areas: [''], description: '', companyResponsible: '', employees: [] }
}

function formatAuditDate(value) {
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })
}

function CompanyAudits({ company, canManage = true }) {
  const [audits, setAudits] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedId, setSelectedId] = useState(null)
  const [draft, setDraft] = useState(newAuditDraft)
  const [findingDraft, setFindingDraft] = useState({ type: 'No conformidad', description: '', correctiveAction: '', responsible: '', dueDate: '' })
  const [isAuditModalOpen, setIsAuditModalOpen] = useState(false)
  const [isFindingModalOpen, setIsFindingModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const selectedAudit = audits.find((audit) => audit.id === selectedId)

  const loadAudits = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [auditList, employeeList] = await Promise.all([listCompanyAudits(company.id), listCompanyEmployees(company.id)])
      setAudits(auditList)
      setEmployees(employeeList)
    } catch (error) {
      setErrorMessage(`No se pudieron cargar las auditorías. ${error.message} Ejecuta supabase/auditorias_empresa.sql en Supabase si aún no has creado las tablas.`)
    } finally {
      setIsLoading(false)
    }
  }, [company.id])

  useEffect(() => { loadAudits() }, [loadAudits])

  function toggleEmployee(cedula) {
    setDraft((current) => ({ ...current, employees: current.employees.includes(cedula) ? current.employees.filter((value) => value !== cedula) : [...current.employees, cedula] }))
  }

  async function saveAudit(event) {
    event.preventDefault()
    const areas = draft.areas.map((area) => area.trim()).filter(Boolean)
    if (!areas.length) return setErrorMessage('Agrega al menos un área auditada.')
    setErrorMessage('')
    setIsSaving(true)
    try {
      const id = await createCompanyAudit({ companyId: company.id, ...draft, areas, employeeIds: draft.employees })
      await loadAudits()
      setSelectedId(id)
      setDraft(newAuditDraft())
      setIsAuditModalOpen(false)
      setSuccessMessage('Auditoría registrada. Puedes actualizar el estado y registrar los hallazgos.')
    } catch (error) {
      setErrorMessage(`No se pudo guardar la auditoría. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveFinding(event) {
    event.preventDefault()
    if (!selectedAudit) return
    setErrorMessage('')
    setIsSaving(true)
    try {
      const finding = await createAuditFinding({ auditId: selectedAudit.id, ...findingDraft })
      setAudits((current) => current.map((audit) => audit.id === selectedAudit.id ? { ...audit, hallazgos: [finding, ...audit.hallazgos] } : audit))
      setFindingDraft({ type: 'No conformidad', description: '', correctiveAction: '', responsible: '', dueDate: '' })
      setIsFindingModalOpen(false)
      setSuccessMessage('Hallazgo guardado para seguimiento.')
    } catch (error) {
      setErrorMessage(`No se pudo guardar el hallazgo. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function changeAuditStatus(audit, status) {
    setErrorMessage('')
    try {
      await updateAuditStatus(audit.id, status)
      setAudits((current) => current.map((item) => item.id === audit.id ? { ...item, estado: status } : item))
      setSuccessMessage(`Auditoría marcada como ${status.toLowerCase()}.`)
    } catch (error) {
      setErrorMessage(`No se pudo cambiar el estado de la auditoría. ${error.message}`)
    }
  }

  async function closeAuditAndInvite(audit) {
    setErrorMessage('')
    setSuccessMessage('')
    setIsSaving(true)
    try {
      const result = await requestAuditFindingsLink({ auditId: audit.id, email: audit.auditor_correo || '' })
      setAudits((current) => current.map((item) => item.id === audit.id ? { ...item, estado: 'Cerrada', auditor_correo: result.email, correo_hallazgos_enviado: new Date().toISOString(), token_hallazgos_expira: result.expiresAt } : item))
      setSuccessMessage(`${audit.estado === 'Cerrada' ? 'Se reenvió' : 'Auditoría cerrada y se envió'} al auditor un enlace privado a ${result.email}; vence el ${new Date(result.expiresAt).toLocaleDateString('es-CO')}.`)
    } catch (error) {
      setErrorMessage(`No se pudo cerrar ni enviar el enlace al auditor. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function changeFindingStatus(audit, finding, status) {
    setErrorMessage('')
    try {
      await updateFindingStatus(finding.id, status)
      setAudits((current) => current.map((item) => item.id === audit.id ? { ...item, hallazgos: item.hallazgos.map((row) => row.id === finding.id ? { ...row, estado: status } : row) } : item))
    } catch (error) {
      setErrorMessage(`No se pudo actualizar el hallazgo. ${error.message}`)
    }
  }

  return <section className="company-audits-page">
    {!selectedAudit ? <>
      <div className="audits-page-heading"><div><p className="eyebrow">SEGUIMIENTO DE EVALUACIONES · {company.name}</p><h1>Auditorías<span>.</span></h1><p className="welcome-copy">Programa auditorías y da seguimiento a sus hallazgos y acciones de mejora.</p></div>{canManage && <button type="button" className="primary-button" onClick={() => { setDraft(newAuditDraft()); setErrorMessage(''); setIsAuditModalOpen(true) }}><Plus size={16} /> Registrar auditoría</button>}</div>
      {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}{successMessage && <p className="template-success" role="status">{successMessage}</p>}
      {isLoading ? <div className="empty-state">Cargando auditorías...</div> : audits.length ? <div className="company-audit-list">{audits.map((audit) => <button type="button" key={audit.id} className="company-audit-card" onClick={() => { setSelectedId(audit.id); setErrorMessage(''); setSuccessMessage('') }}>
        <span className="audit-card-icon"><ClipboardCheck size={18} /></span><span className="audit-card-content"><strong>{audit.tipo} · {audit.auditor_nombre}</strong><small><CalendarDays size={13} />{formatAuditDate(audit.fecha_auditoria)} · {audit.entidad_auditora || 'Auditoría interna'}</small><small>{audit.objetivo}</small><small>{audit.hallazgos.length} hallazgos · {audit.areas_auditadas.join(', ')}</small></span><span className={`audit-status audit-status-${audit.estado.toLowerCase().replaceAll(' ', '-')}`}>{audit.estado}</span>
      </button>)}</div> : <div className="empty-state"><ClipboardCheck size={23} /><strong>Aún no hay auditorías registradas</strong><span>Registra la visita de un auditor y luego documenta sus hallazgos.</span></div>}
    </> : <>
      <button type="button" className="secondary-button audit-back-button" onClick={() => { setSelectedId(null); setSuccessMessage(''); setErrorMessage('') }}><ArrowLeft size={15} /> Todas las auditorías</button>
      {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}{successMessage && <p className="template-success" role="status">{successMessage}</p>}
      <article className="audit-detail-card">
        <div className="audit-detail-title"><span className="audit-card-icon"><ClipboardCheck size={20} /></span><div><p className="eyebrow">{selectedAudit.tipo} · {selectedAudit.entidad_auditora || 'Auditoría interna'}</p><h1>{selectedAudit.auditor_nombre}</h1><span>{formatAuditDate(selectedAudit.fecha_auditoria)}</span></div><span className={`audit-status audit-status-${selectedAudit.estado.toLowerCase().replaceAll(' ', '-')}`}>{selectedAudit.estado}</span></div>
        <div className="audit-detail-grid"><div><small>Objetivo</small><p>{selectedAudit.objetivo}</p></div><div><small>Alcance</small><p>{selectedAudit.alcance}</p></div><div><small>Responsable en la empresa</small><p>{selectedAudit.responsable_empresa}</p></div><div><small>Áreas auditadas</small><p>{selectedAudit.areas_auditadas.join(', ')}</p></div><div><small>Personas participantes</small><p>{selectedAudit.personas.map(employeeName).join(', ') || 'No se registraron participantes internos.'}</p></div></div>
        {selectedAudit.descripcion && <p className="audit-general-description">{selectedAudit.descripcion}</p>}
        {selectedAudit.evidencias?.length > 0 && <div className="audit-attached-evidence"><strong><Paperclip size={14} /> Evidencias enviadas por el auditor</strong>{selectedAudit.evidencias.map((item) => <a key={item.id} href={item.url || undefined} target="_blank" rel="noreferrer">{item.nombre_archivo}</a>)}</div>}
        <div className="audit-email-contact"><label className="form-field">Correo electrónico del auditor<input type="email" required disabled={!canManage || selectedAudit.estado === 'Cerrada' || selectedAudit.estado === 'Cancelada'} value={selectedAudit.auditor_correo || ''} onChange={(event) => setAudits((current) => current.map((audit) => audit.id === selectedAudit.id ? { ...audit, auditor_correo: event.target.value } : audit))} placeholder="auditor@organizacion.com" /></label>{selectedAudit.correo_hallazgos_enviado && <p>Enlace enviado el {new Date(selectedAudit.correo_hallazgos_enviado).toLocaleString('es-CO')} · vence {selectedAudit.token_hallazgos_expira ? new Date(selectedAudit.token_hallazgos_expira).toLocaleDateString('es-CO') : ''}</p>}</div>
        {canManage && selectedAudit.estado !== 'Cerrada' && selectedAudit.estado !== 'Cancelada' && <div className="company-visit-actions">{selectedAudit.estado === 'Programada' && <button type="button" className="secondary-button" disabled={isSaving} onClick={() => changeAuditStatus(selectedAudit, 'En curso')}>Iniciar auditoría</button>}<button type="button" className="primary-button" disabled={isSaving || !selectedAudit.auditor_correo} onClick={() => closeAuditAndInvite(selectedAudit)}><Check size={14} />{isSaving ? 'Enviando correo...' : 'Cerrar y solicitar hallazgos'}</button><button type="button" className="secondary-button" disabled={isSaving} onClick={() => changeAuditStatus(selectedAudit, 'Cancelada')}>Cancelar</button></div>}
        {canManage && selectedAudit.estado === 'Cerrada' && <div className="company-visit-actions"><button type="button" className="secondary-button" disabled={isSaving || !selectedAudit.auditor_correo} onClick={() => closeAuditAndInvite(selectedAudit)}><Check size={14} />{isSaving ? 'Enviando correo...' : 'Reenviar enlace al auditor'}</button></div>}
      </article>
      <section className="audit-findings-section"><div className="section-heading"><div><p className="eyebrow">RESULTADOS Y MEJORA</p><h2>Hallazgos y acciones</h2></div>{canManage && <button type="button" className="primary-button" onClick={() => { setFindingDraft({ type: 'No conformidad', description: '', correctiveAction: '', responsible: '', dueDate: '' }); setIsFindingModalOpen(true) }}><Plus size={15} /> Agregar hallazgo</button>}</div>
        {selectedAudit.hallazgos.length ? <div className="audit-findings-list">{selectedAudit.hallazgos.map((finding) => <article className="audit-finding-card" key={finding.id}><div className="audit-finding-heading"><strong>{finding.tipo}</strong><select aria-label="Estado del hallazgo" disabled={!canManage} value={finding.estado} onChange={(event) => changeFindingStatus(selectedAudit, finding, event.target.value)}><option>Abierto</option><option>En proceso</option><option>Cerrado</option></select></div><p>{finding.descripcion}</p>{finding.accion_correctiva && <div><small>Acción correctiva / mejora</small><p>{finding.accion_correctiva}</p></div>}<div className="audit-finding-meta"><span><UserRound size={13} />{finding.responsable || 'Sin responsable asignado'}</span><span><CalendarDays size={13} />Compromiso: {finding.fecha_compromiso ? new Date(`${finding.fecha_compromiso}T12:00:00`).toLocaleDateString('es-CO') : 'Sin fecha'}</span></div></article>)}</div> : <div className="empty-state"><Users size={20} /><strong>No hay hallazgos registrados</strong><span>Agrega las no conformidades, observaciones o mejoras que entregue el auditor.</span></div>}
      </section>
    </>}

    {isAuditModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsAuditModalOpen(false) }}><section className="document-modal company-audit-modal" role="dialog" aria-modal="true" aria-labelledby="new-audit-title"><div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="new-audit-title">Registrar auditoría</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={() => setIsAuditModalOpen(false)}><X size={18} /></button></div><p className="modal-copy">Registra quién auditará, cuándo, cuál es el alcance y quiénes participarán por parte de la empresa.</p>
      <form className="document-modal-form audit-form" onSubmit={saveAudit}>
        <div className="audit-form-two"><label className="form-field">Tipo de auditoría<select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option>Interna</option><option>Externa</option><option>Certificación</option><option>Cliente</option><option>Entidad de control</option></select></label><label className="form-field">Fecha y hora<input type="datetime-local" required value={draft.date} onChange={(event) => setDraft((current) => ({ ...current, date: event.target.value }))} /></label></div>
        <div className="audit-form-two"><label className="form-field">Entidad auditora<input value={draft.auditingEntity} onChange={(event) => setDraft((current) => ({ ...current, auditingEntity: event.target.value }))} placeholder="Ej.: ARL, certificadora o cliente" /></label><label className="form-field">Nombre del auditor<input required value={draft.auditor} onChange={(event) => setDraft((current) => ({ ...current, auditor: event.target.value }))} /></label></div>
        <label className="form-field">Correo electrónico del auditor<input type="email" required value={draft.auditorEmail} onChange={(event) => setDraft((current) => ({ ...current, auditorEmail: event.target.value }))} placeholder="auditor@organizacion.com" /></label>
        <label className="form-field">Objetivo<input required value={draft.objective} onChange={(event) => setDraft((current) => ({ ...current, objective: event.target.value }))} placeholder="¿Qué busca evaluar la auditoría?" /></label>
        <label className="form-field">Alcance<textarea required rows={2} value={draft.scope} onChange={(event) => setDraft((current) => ({ ...current, scope: event.target.value }))} placeholder="Procesos, sedes o periodo que serán evaluados" /></label>
        <fieldset className="audit-areas-field"><legend>Áreas que se auditarán</legend>{draft.areas.map((area, index) => <div className="visit-area-row" key={index}><input required aria-label={`Área auditada ${index + 1}`} value={area} onChange={(event) => setDraft((current) => ({ ...current, areas: current.areas.map((item, itemIndex) => itemIndex === index ? event.target.value : item) }))} placeholder={`Área ${index + 1}`} />{draft.areas.length > 1 && <button type="button" className="icon-button" onClick={() => setDraft((current) => ({ ...current, areas: current.areas.filter((_, itemIndex) => itemIndex !== index) }))}><X size={14} /></button>}</div>)}<button type="button" className="secondary-button" onClick={() => setDraft((current) => ({ ...current, areas: [...current.areas, ''] }))}><Plus size={14} /> Agregar área</button></fieldset>
        <fieldset className="audit-people-field"><legend>Personas de la empresa que participarán</legend><div className="audit-people-list">{employees.map((employee) => <label key={employee.cedula}><input type="checkbox" checked={draft.employees.includes(employee.cedula)} onChange={() => toggleEmployee(employee.cedula)} /><span>{employeeName(employee)}</span></label>)}</div></fieldset>
        <label className="form-field">Responsable de atender al auditor<input required value={draft.companyResponsible} onChange={(event) => setDraft((current) => ({ ...current, companyResponsible: event.target.value }))} /></label>
        <label className="form-field">Notas iniciales<textarea rows={3} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} /></label>
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsAuditModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving}><ClipboardCheck size={15} />{isSaving ? 'Guardando...' : 'Guardar auditoría'}</button></div>
      </form></section></div>}

    {isFindingModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsFindingModalOpen(false) }}><section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="new-finding-title"><div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="new-finding-title">Agregar hallazgo</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={() => setIsFindingModalOpen(false)}><X size={18} /></button></div><form className="document-modal-form" onSubmit={saveFinding}><label className="form-field">Tipo<select value={findingDraft.type} onChange={(event) => setFindingDraft((current) => ({ ...current, type: event.target.value }))}><option>No conformidad</option><option>Observación</option><option>Oportunidad de mejora</option><option>Conformidad</option></select></label><label className="form-field">Descripción del hallazgo<textarea required rows={3} value={findingDraft.description} onChange={(event) => setFindingDraft((current) => ({ ...current, description: event.target.value }))} /></label><label className="form-field">Acción correctiva o de mejora<textarea rows={3} value={findingDraft.correctiveAction} onChange={(event) => setFindingDraft((current) => ({ ...current, correctiveAction: event.target.value }))} /></label><div className="audit-form-two"><label className="form-field">Responsable<input value={findingDraft.responsible} onChange={(event) => setFindingDraft((current) => ({ ...current, responsible: event.target.value }))} /></label><label className="form-field">Fecha compromiso<input type="date" value={findingDraft.dueDate} onChange={(event) => setFindingDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label></div>{errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsFindingModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving}>{isSaving ? 'Guardando...' : 'Guardar hallazgo'}</button></div></form></section></div>}
  </section>
}

export default CompanyAudits
