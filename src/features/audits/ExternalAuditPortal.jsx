import { useCallback, useEffect, useState } from 'react'
import { CalendarDays, Check, ClipboardCheck, FileText, Paperclip, Plus, Upload } from 'lucide-react'
import { loadExternalAudit, submitExternalFinding, uploadExternalAuditEvidence } from './auditService'

function ExternalAuditPortal({ token }) {
  const [portal, setPortal] = useState(null)
  const [draft, setDraft] = useState({ type: 'No conformidad', description: '', correctiveAction: '', responsible: '', dueDate: '' })
  const [files, setFiles] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const loadPortal = useCallback(async () => {
    setIsLoading(true)
    setErrorMessage('')
    try { setPortal(await loadExternalAudit(token)) }
    catch (error) { setErrorMessage(error.message) }
    finally { setIsLoading(false) }
  }, [token])

  useEffect(() => { loadPortal() }, [loadPortal])

  async function saveFinding(event) {
    event.preventDefault()
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const result = await submitExternalFinding({ token, finding: draft })
      setPortal((current) => ({ ...current, findings: [result.finding, ...current.findings] }))
      setDraft({ type: 'No conformidad', description: '', correctiveAction: '', responsible: '', dueDate: '' })
      setSuccessMessage('Hallazgo registrado en la auditoría.')
    } catch (error) { setErrorMessage(error.message) }
    finally { setIsSaving(false) }
  }

  async function uploadFiles() {
    if (!files.length) return
    setIsSaving(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const uploaded = []
      for (const file of files) uploaded.push(await uploadExternalAuditEvidence({ token, file }))
      setFiles([])
      setSuccessMessage('Evidencias cargadas correctamente.')
      await loadPortal()
    } catch (error) { setErrorMessage(`No se pudieron cargar todas las evidencias. ${error.message}`) }
    finally { setIsSaving(false) }
  }

  if (isLoading) return <main className="external-audit-shell"><div className="empty-state">Abriendo auditoría segura...</div></main>
  if (errorMessage && !portal) return <main className="external-audit-shell"><section className="external-audit-card external-audit-error"><ClipboardCheck size={30} /><h1>No se pudo abrir el enlace</h1><p>{errorMessage}</p><span>Solicita a la empresa que te envíe un nuevo enlace si este venció.</span></section></main>

  const audit = portal.audit
  return <main className="external-audit-shell">
    <header className="external-audit-brand"><span className="login-brand-mark"><ClipboardCheck size={22} /></span><div><strong>SG-SST</strong><small>PORTAL DEL AUDITOR</small></div></header>
    <section className="external-audit-card">
      <p className="eyebrow">{audit.entidad_auditora || 'Auditoría'} · {audit.tipo}</p>
      <h1>Registro de hallazgos</h1>
      <p className="welcome-copy">Completa los resultados de la auditoría de <strong>{audit.empresa?.razon_social || 'la empresa'}</strong>. Este enlace está limitado a esta auditoría y no requiere crear una cuenta.</p>
      <div className="external-audit-facts"><span><CalendarDays size={15} />{new Date(audit.fecha_auditoria).toLocaleString('es-CO', { dateStyle: 'long', timeStyle: 'short' })}</span><span><FileText size={15} /><strong>Auditor:</strong> {audit.auditor_nombre}</span><span><strong>Objetivo:</strong> {audit.objetivo}</span><span><strong>Alcance:</strong> {audit.alcance}</span><span><strong>Áreas:</strong> {(audit.areas_auditadas || []).join(', ')}</span></div>
    </section>

    {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}{successMessage && <p className="template-success" role="status">{successMessage}</p>}

    <section className="external-audit-card"><div className="section-heading"><div><p className="eyebrow">RESULTADOS</p><h2>Hallazgos registrados</h2></div><span>{portal.findings.length}</span></div>
      {portal.findings.length ? <div className="audit-findings-list">{portal.findings.map((finding) => <article className="audit-finding-card" key={finding.id}><div className="audit-finding-heading"><strong>{finding.tipo}</strong><span className="audit-status">{finding.estado}</span></div><p>{finding.descripcion}</p>{finding.accion_correctiva && <div><small>Acción propuesta</small><p>{finding.accion_correctiva}</p></div>}<div className="audit-finding-meta"><span>Responsable: {finding.responsable || 'Pendiente'}</span><span>Fecha compromiso: {finding.fecha_compromiso || 'Pendiente'}</span></div></article>)}</div> : <p className="accident-muted">Aún no se han registrado hallazgos.</p>}
    </section>

    <section className="external-audit-card"><div className="section-heading"><div><p className="eyebrow">SOPORTES</p><h2>Evidencias adjuntas</h2></div></div>
      {portal.evidence.length ? <div className="accident-evidence-list">{portal.evidence.map((item) => <a key={item.id} className="accident-evidence-item" href={item.url || undefined} target="_blank" rel="noreferrer"><Paperclip size={16} /><span>{item.nombre_archivo}</span><small>{(item.tamano_bytes / 1024 / 1024).toFixed(2)} MB</small></a>)}</div> : <p className="accident-muted">Todavía no hay evidencias adjuntas.</p>}
      <label className="form-field external-audit-upload">Adjuntar fotos o documentos<input type="file" multiple accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.txt" onChange={(event) => { const selected = Array.from(event.target.files || []); if (selected.length > 5 || selected.some((file) => file.size > 10 * 1024 * 1024)) { setErrorMessage('Selecciona máximo cinco archivos de hasta 10 MB cada uno.'); setFiles([]) } else { setErrorMessage(''); setFiles(selected) } }} /></label>
      {files.length > 0 && <><div className="accident-selected-files">{files.map((file) => <span key={`${file.name}-${file.size}`}><Paperclip size={14} />{file.name}</span>)}</div><button type="button" className="secondary-button" disabled={isSaving} onClick={uploadFiles}><Upload size={15} />{isSaving ? 'Subiendo evidencias...' : 'Subir evidencias'}</button></>}
    </section>

    <section className="external-audit-card"><div className="section-heading"><div><p className="eyebrow">NUEVO RESULTADO</p><h2>Registrar un hallazgo</h2></div></div><form className="document-modal-form" onSubmit={saveFinding}>
      <label className="form-field">Clasificación<select value={draft.type} onChange={(event) => setDraft((current) => ({ ...current, type: event.target.value }))}><option>No conformidad</option><option>Observación</option><option>Oportunidad de mejora</option><option>Conformidad</option></select></label>
      <label className="form-field">Descripción<textarea required rows={4} maxLength={10000} value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="Describe el hallazgo, el requisito relacionado y la evidencia objetiva" /></label>
      <label className="form-field">Acción recomendada<textarea rows={3} maxLength={10000} value={draft.correctiveAction} onChange={(event) => setDraft((current) => ({ ...current, correctiveAction: event.target.value }))} /></label>
      <div className="audit-form-two"><label className="form-field">Responsable sugerido<input value={draft.responsible} onChange={(event) => setDraft((current) => ({ ...current, responsible: event.target.value }))} /></label><label className="form-field">Fecha compromiso sugerida<input type="date" value={draft.dueDate} onChange={(event) => setDraft((current) => ({ ...current, dueDate: event.target.value }))} /></label></div>
      <button className="primary-button" disabled={isSaving}><Plus size={15} />{isSaving ? 'Guardando...' : 'Guardar hallazgo'}</button>
    </form></section>
    <footer className="external-audit-footer"><Check size={14} /> Acceso privado para esta auditoría. El enlace vence el {new Date(audit.token_hallazgos_expira).toLocaleDateString('es-CO')}.</footer>
  </main>
}

export default ExternalAuditPortal
