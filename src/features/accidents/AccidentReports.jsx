import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarDays, Check, FileText, MapPin, Paperclip, Plus, UserRound, X } from 'lucide-react'
import { addAccidentFollowup, createAccident, getAccidentEvidenceUrl, listAccidentEvidence, listAccidentFollowups, listCompanyAccidents, listCompanyEmployees, uploadAccidentEvidence } from './accidentService'

function employeeLabel(employee) {
  return employee.nombre_completo || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ') || employee.cedula
}

function localDateTime() {
  const date = new Date()
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset())
  return date.toISOString().slice(0, 16)
}

function formatDate(value) {
  return new Date(value).toLocaleString('es-CO', { dateStyle: 'medium', timeStyle: 'short' })
}

const emptyReport = () => ({ fecha_ocurrencia: localDateTime(), lugar: '', descripcion: '', trabajador_cedula: '', otro_trabajador: '' })

function AccidentReports({ company }) {
  const [reports, setReports] = useState([])
  const [employees, setEmployees] = useState([])
  const [selectedReport, setSelectedReport] = useState(null)
  const [evidence, setEvidence] = useState([])
  const [followups, setFollowups] = useState([])
  const [evidenceUrls, setEvidenceUrls] = useState({})
  const [reportDraft, setReportDraft] = useState(emptyReport)
  const [evidenceFiles, setEvidenceFiles] = useState([])
  const [followupComment, setFollowupComment] = useState('')
  const [followupStatus, setFollowupStatus] = useState('En seguimiento')
  const [followupResponsible, setFollowupResponsible] = useState('')
  const [isReportModalOpen, setIsReportModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadReports = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    try {
      const [companyReports, companyEmployees] = await Promise.all([
        listCompanyAccidents(company.id),
        listCompanyEmployees(company.id),
      ])
      setReports(companyReports)
      setEmployees(companyEmployees)
    } catch (error) {
      setErrorMessage(`No se pudieron cargar los reportes. ${error.message} Si las tablas aún no existen, ejecuta supabase/reportes_accidentes.sql en Supabase.`)
      setReports([])
    } finally {
      setIsLoading(false)
    }
  }, [company.id])

  useEffect(() => { loadReports() }, [loadReports])

  const loadReportDetail = useCallback(async (report) => {
    try {
      const [reportEvidence, reportFollowups] = await Promise.all([
        listAccidentEvidence(report.id),
        listAccidentFollowups(report.id),
      ])
      const signedEvidence = await Promise.all(reportEvidence.map(async (item) => {
        try { return [item.id, await getAccidentEvidenceUrl(item.ruta_storage)] } catch { return [item.id, ''] }
      }))
      setEvidence(reportEvidence)
      setEvidenceUrls(Object.fromEntries(signedEvidence))
      setFollowups(reportFollowups)
      setFollowupStatus(report.estado === 'Reportado' ? 'En seguimiento' : report.estado)
      setFollowupResponsible(report.responsable_seguimiento || '')
    } catch (error) {
      setErrorMessage(`No se pudo cargar el seguimiento. ${error.message}`)
    }
  }, [])

  useEffect(() => {
    if (selectedReport) loadReportDetail(selectedReport)
  }, [selectedReport, loadReportDetail])

  const activeReports = useMemo(() => reports.filter((report) => report.estado !== 'Cerrado').length, [reports])

  async function saveReport(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    if (!reportDraft.trabajador_cedula && !reportDraft.otro_trabajador.trim()) {
      setErrorMessage('Selecciona o escribe el trabajador involucrado.')
      return
    }
    if (evidenceFiles.some((file) => file.size > 10 * 1024 * 1024)) {
      setErrorMessage('Cada evidencia debe pesar máximo 10 MB.')
      return
    }

    const employee = employees.find((item) => item.cedula === reportDraft.trabajador_cedula)
    const workerName = employee ? employeeLabel(employee) : reportDraft.otro_trabajador.trim()
    setIsSaving(true)
    try {
      const report = await createAccident({
        companyId: company.id,
        occurrenceDate: reportDraft.fecha_ocurrencia,
        location: reportDraft.lugar,
        description: reportDraft.descripcion,
        employeeId: employee?.cedula || null,
        employeeName: workerName,
      })
      let evidenceError = ''
      for (const file of evidenceFiles) {
        try {
          await uploadAccidentEvidence({ companyId: company.id, reportId: report.id, file })
        } catch (error) {
          evidenceError = error.message
          break
        }
      }
      setSelectedReport(report)
      setReportDraft(emptyReport())
      setEvidenceFiles([])
      setIsReportModalOpen(false)
      await loadReports()
      setSuccessMessage(evidenceError
        ? `El reporte se guardó, pero no se pudieron guardar todas las evidencias: ${evidenceError}`
        : 'Accidente reportado correctamente.')
    } catch (error) {
      setErrorMessage(`No se pudo guardar el reporte. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  async function saveFollowup(event) {
    event.preventDefault()
    if (!selectedReport || !followupComment.trim()) return
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await addAccidentFollowup({ reportId: selectedReport.id, comment: followupComment, status: followupStatus, responsible: followupResponsible })
      const updatedReport = { ...selectedReport, estado: followupStatus, responsable_seguimiento: followupResponsible }
      setSelectedReport(updatedReport)
      setFollowupComment('')
      setSuccessMessage('Seguimiento agregado.')
      await loadReports()
      await loadReportDetail(updatedReport)
    } catch (error) {
      setErrorMessage(`No se pudo guardar el seguimiento. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  return <section className="accident-reports-page">
    <div className="accident-page-heading">
      <div><p className="eyebrow">GESTIÓN DE INCIDENTES</p><h1>Reporte de accidentes<span>.</span></h1><p className="welcome-copy">Registra lo ocurrido, adjunta evidencias y lleva el seguimiento de {company.name}.</p></div>
      <button className="primary-button" onClick={() => { setReportDraft(emptyReport()); setEvidenceFiles([]); setErrorMessage(''); setIsReportModalOpen(true) }}><Plus size={16} /> Reportar accidente</button>
    </div>

    {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
    {successMessage && <p className="template-success" role="status">{successMessage}</p>}

    {!selectedReport && <>
      <div className="accident-metrics"><article><span>Total de reportes</span><strong>{isLoading ? '—' : reports.length}</strong></article><article><span>En seguimiento</span><strong>{isLoading ? '—' : activeReports}</strong></article><article><span>Cerrados</span><strong>{isLoading ? '—' : reports.length - activeReports}</strong></article></div>
      {isLoading ? <div className="empty-state">Cargando reportes...</div> : reports.length ? <div className="accident-report-list">{reports.map((report) => <button type="button" className="accident-report-card" key={report.id} onClick={() => { setSelectedReport(report); setErrorMessage('') }}>
        <span className="accident-report-icon"><AlertTriangle size={18} /></span><span className="accident-report-copy"><strong>{report.trabajador_nombre}</strong><small>{formatDate(report.fecha_ocurrencia)} · {report.lugar}</small><small>{report.descripcion}</small></span><span className={`accident-status accident-status-${report.estado.toLowerCase().replace(' ', '-')}`}>{report.estado}</span>
      </button>)}</div> : <div className="accident-empty"><AlertTriangle size={24} /><strong>Aún no hay accidentes reportados</strong><span>Usa “Reportar accidente” para registrar el primero.</span></div>}
    </>}

    {selectedReport && <div className="accident-detail">
      <button type="button" className="secondary-button accident-back-button" onClick={() => { setSelectedReport(null); setEvidence([]); setFollowups([]) }}><ArrowLeft size={15} /> Todos los reportes</button>
      <section className="accident-detail-card">
        <div className="accident-detail-heading"><span className="accident-report-icon"><AlertTriangle size={19} /></span><div><p className="eyebrow">REPORTE #{selectedReport.id}</p><h2>{selectedReport.trabajador_nombre}</h2></div><span className={`accident-status accident-status-${selectedReport.estado.toLowerCase().replace(' ', '-')}`}>{selectedReport.estado}</span></div>
        <div className="accident-facts"><span><CalendarDays size={15} />{formatDate(selectedReport.fecha_ocurrencia)}</span><span><MapPin size={15} />{selectedReport.lugar}</span>{selectedReport.trabajador_cedula && <span><UserRound size={15} />CC {selectedReport.trabajador_cedula}</span>}</div>
        <p className="accident-description">{selectedReport.descripcion}</p>
        {selectedReport.responsable_seguimiento && <p className="accident-responsible">Responsable del seguimiento: <strong>{selectedReport.responsable_seguimiento}</strong></p>}
      </section>

      <section className="accident-detail-card"><div className="section-heading"><div><p className="eyebrow">SOPORTES</p><h2>Evidencias adjuntas</h2></div></div>
        {evidence.length ? <div className="accident-evidence-list">{evidence.map((item) => <a key={item.id} className="accident-evidence-item" href={evidenceUrls[item.id] || undefined} target="_blank" rel="noreferrer"><Paperclip size={16} /><span>{item.nombre_archivo}</span><small>{item.tamano_bytes ? `${(item.tamano_bytes / 1024 / 1024).toFixed(2)} MB` : 'Archivo'}</small></a>)}</div> : <p className="accident-muted">Este reporte no tiene evidencias adjuntas.</p>}
      </section>

      <section className="accident-detail-card"><div className="section-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h2>Historial de acciones</h2></div></div>
        {followups.length ? <div className="accident-timeline">{followups.map((item) => <article className="accident-timeline-item" key={item.id}><span className="accident-timeline-dot" /><div><div className="accident-timeline-meta"><strong>{item.responsable || 'Seguimiento'}</strong><time>{formatDate(item.fecha)}</time></div><p>{item.comentario}</p><span className={`accident-status accident-status-${item.estado.toLowerCase().replace(' ', '-')}`}>{item.estado}</span></div></article>)}</div> : <p className="accident-muted">Aún no se han agregado acciones de seguimiento.</p>}
        {selectedReport.estado !== 'Cerrado' && <form className="accident-followup-form" onSubmit={saveFollowup}><label className="form-field">Nueva acción de seguimiento<textarea rows={3} required value={followupComment} onChange={(event) => setFollowupComment(event.target.value)} placeholder="Describe la investigación, acción correctiva o avance..." /></label><div className="accident-followup-fields"><label className="form-field">Responsable<input value={followupResponsible} onChange={(event) => setFollowupResponsible(event.target.value)} /></label><label className="form-field">Estado<select value={followupStatus} onChange={(event) => setFollowupStatus(event.target.value)}><option>En seguimiento</option><option>Cerrado</option></select></label><button className="primary-button" disabled={isSaving}><Check size={15} /> Guardar seguimiento</button></div></form>}
      </section>
    </div>}

    {isReportModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsReportModalOpen(false) }}><section className="document-modal accident-modal" role="dialog" aria-modal="true" aria-labelledby="new-accident-title">
      <div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="new-accident-title">Reportar accidente</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" disabled={isSaving} onClick={() => setIsReportModalOpen(false)}><X size={19} /></button></div>
      <p className="modal-copy">Registra los datos del evento. Puedes adjuntar hasta cinco fotos o documentos de máximo 10 MB cada uno.</p>
      <form className="document-modal-form accident-report-form" onSubmit={saveReport}>
        <label className="form-field">Fecha y hora del accidente<input type="datetime-local" required value={reportDraft.fecha_ocurrencia} onChange={(event) => setReportDraft((current) => ({ ...current, fecha_ocurrencia: event.target.value }))} /></label>
        <label className="form-field">Lugar<input required maxLength={180} value={reportDraft.lugar} onChange={(event) => setReportDraft((current) => ({ ...current, lugar: event.target.value }))} placeholder="Sede, área o lugar donde ocurrió" /></label>
        <label className="form-field">Trabajador involucrado<select value={reportDraft.trabajador_cedula} onChange={(event) => setReportDraft((current) => ({ ...current, trabajador_cedula: event.target.value, otro_trabajador: '' }))}><option value="">No está en la lista / escribir nombre</option>{employees.map((employee) => <option key={employee.cedula} value={employee.cedula}>{employeeLabel(employee)} · CC {employee.cedula}</option>)}</select></label>
        {!reportDraft.trabajador_cedula && <label className="form-field">Nombre del trabajador<input required value={reportDraft.otro_trabajador} onChange={(event) => setReportDraft((current) => ({ ...current, otro_trabajador: event.target.value }))} /></label>}
        <label className="form-field">Descripción de lo ocurrido<textarea required rows={4} maxLength={5000} value={reportDraft.descripcion} onChange={(event) => setReportDraft((current) => ({ ...current, descripcion: event.target.value }))} placeholder="Describe cómo ocurrió el accidente y qué sucedió..." /></label>
        <label className="form-field">Fotos o archivos de evidencia<input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => { const selected = Array.from(event.target.files || []); if (selected.length > 5) { setErrorMessage('Puedes adjuntar máximo cinco evidencias por reporte.'); setEvidenceFiles([]) } else { setErrorMessage(''); setEvidenceFiles(selected) } }} /></label>
        {evidenceFiles.length > 0 && <div className="accident-selected-files">{evidenceFiles.map((file) => <span key={`${file.name}-${file.size}`}><FileText size={14} />{file.name}</span>)}</div>}
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsReportModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving}><AlertTriangle size={15} />{isSaving ? 'Guardando reporte...' : 'Guardar reporte'}</button></div>
      </form>
    </section></div>}
  </section>
}

export default AccidentReports
