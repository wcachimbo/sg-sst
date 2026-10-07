import { useCallback, useEffect, useRef, useState } from 'react'
import { Download, FileText, PenLine, X } from 'lucide-react'
import { getCompanyFileUrl } from './documentService'
import { completeDocumentSignature, getUserSignature, listMyDocumentSignatures, signatureSetupHint } from './signatureService'
import { buildSignedFileForRow } from './embeddedSignatures'

function formatWhen(value) {
  return value ? new Date(value).toLocaleString('es-CO') : ''
}

function MySignatures({ userId, isSignatureDialogOpen, onManageSignature }) {
  const [requests, setRequests] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [hasSavedSignature, setHasSavedSignature] = useState(null)
  const [signingRequest, setSigningRequest] = useState(null)
  const [confirmSignature, setConfirmSignature] = useState(false)
  const [isSigning, setIsSigning] = useState(false)
  const [busySignedId, setBusySignedId] = useState(null)
  const wasDialogOpen = useRef(false)

  const load = useCallback(async () => {
    if (!userId) return
    setIsLoading(true)
    try {
      const rows = await listMyDocumentSignatures(userId)
      setRequests(rows)
      setErrorMessage('')
    } catch (error) {
      setRequests([])
      setErrorMessage(`No se pudieron cargar tus solicitudes de firma. ${error.message}${signatureSetupHint(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [userId])

  const checkSavedSignature = useCallback(async () => {
    if (!userId) { setHasSavedSignature(false); return }
    try {
      setHasSavedSignature(Boolean(await getUserSignature(userId)))
    } catch {
      setHasSavedSignature(false)
    }
  }, [userId])

  useEffect(() => { void load() }, [load])
  useEffect(() => { void checkSavedSignature() }, [checkSavedSignature])

  useEffect(() => {
    if (wasDialogOpen.current && !isSignatureDialogOpen) void checkSavedSignature()
    wasDialogOpen.current = isSignatureDialogOpen
  }, [isSignatureDialogOpen, checkSavedSignature])

  const pendingRequests = requests.filter((request) => request.estado === 'pendiente')
  const signedRequests = requests.filter((request) => request.estado === 'firmado')

  async function openDocument(file) {
    setErrorMessage('')
    setSuccessMessage('')
    try {
      window.open(await getCompanyFileUrl(file), '_blank', 'noopener')
    } catch (error) {
      setErrorMessage(`No se pudo abrir el documento. ${error.message}${signatureSetupHint(error)}`)
    }
  }

  async function signSelectedDocument() {
    if (!signingRequest || !confirmSignature || isSigning) return
    const file = signingRequest.archivo
    if (!file?.storage_path) {
      setSigningRequest(null)
      setErrorMessage('Este documento ya no está disponible para firma.')
      return
    }
    setIsSigning(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      await completeDocumentSignature(signingRequest, file)
      setSigningRequest(null)
      setConfirmSignature(false)
      setSuccessMessage('Firma registrada con fecha y huella digital del documento.')
      await Promise.all([load(), checkSavedSignature()])
    } catch (error) {
      setErrorMessage(`No se pudo registrar la firma. ${error.message}${signatureSetupHint(error)}`)
    } finally {
      setIsSigning(false)
    }
  }

  async function downloadSignedCopy(request) {
    const file = request.archivo
    setErrorMessage(''); setBusySignedId(request.id)
    try {
      const { blob, extension } = await buildSignedFileForRow(file)
      const baseName = (file.nombre || 'documento').replace(/\.[^.]+$/, '')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${baseName}-firmado.${extension || 'bin'}`
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      URL.revokeObjectURL(url)
    } catch (error) { setErrorMessage(`No se pudo generar la copia firmada. ${error.message}`) } finally { setBusySignedId(null) }
  }

  function renderRow(request) {
    const file = request.archivo
    const isPending = request.estado === 'pendiente'
    return (
      <article className="template-list-row" key={request.id}>
        <span className="record-icon"><FileText size={17} /></span>
        <div className="record-main">
          <strong>{file?.nombre || 'Documento no disponible'}</strong>
          <span>
            {file?.nombre
              ? `Solicitada el ${formatWhen(request.solicitada_en)}${isPending ? '' : ` · Firmada el ${formatWhen(request.firmada_en)}`}`
              : 'El documento fue retirado o no está visible para tu cuenta.'}
          </span>
        </div>
        <div className="document-file-actions">
          {file?.storage_path && <button type="button" className="secondary-button" onClick={() => openDocument(file)}><Download size={15} /> Abrir</button>}
          {request.estado === 'firmado' && file?.storage_path && <button type="button" className="secondary-button" disabled={busySignedId === request.id} onClick={() => downloadSignedCopy(request)}><Download size={14} /> {busySignedId === request.id ? 'Generando...' : 'Copia con firmas'}</button>}
          <span className={`signature-status signature-status-${request.estado}`}>{isPending ? 'Pendiente' : 'Firmado'}</span>
          {isPending && <button type="button" className="primary-button" onClick={() => { setSigningRequest(request); setConfirmSignature(false) }}><PenLine size={14} /> Firmar</button>}
        </div>
      </article>
    )
  }

  return (
    <>
      <div className="welcome-row">
        <div>
          <p className="eyebrow">FIRMA ELECTRÓNICA INTERNA</p>
          <h1>Firmas pendientes<span>.</span></h1>
          <p className="welcome-copy">Documentos asignados a tu cuenta que debes revisar y firmar.</p>
        </div>
        <button type="button" className="secondary-button" onClick={onManageSignature}><PenLine size={15} /> Mi firma</button>
      </div>

      {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
      {successMessage && <p className="template-success" role="status">{successMessage}</p>}

      {hasSavedSignature === false && (
        <p className="document-template-note signature-missing-note">
          Todavía no tienes una firma guardada. Dibújala o súbela una vez y quedarás lista para firmar cualquier documento.
          <button type="button" className="secondary-button" onClick={onManageSignature}><PenLine size={14} /> Crear mi firma</button>
        </p>
      )}

      <section className="section-block">
        <div className="section-heading"><div><p className="eyebrow">POR FIRMAR</p><h2>Documentos pendientes</h2></div></div>
        {isLoading
          ? <div className="empty-state">Cargando documentos...</div>
          : pendingRequests.length
            ? <div className="template-list">{pendingRequests.map(renderRow)}</div>
            : <div className="empty-state"><FileText size={20} /><strong>No tienes firmas pendientes</strong><span>Cuando te asignen un documento aparecerá aquí.</span></div>}
      </section>

      {!isLoading && signedRequests.length > 0 && (
        <section className="section-block">
          <div className="section-heading"><div><p className="eyebrow">HISTORIAL</p><h2>Documentos firmados</h2></div></div>
          <div className="template-list">{signedRequests.map(renderRow)}</div>
        </section>
      )}

      {signingRequest && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSigning) setSigningRequest(null) }}>
          <section className="document-modal signature-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="my-signature-title">
            <div className="modal-heading">
              <div><p className="eyebrow">FIRMA ELECTRÓNICA INTERNA</p><h2 id="my-signature-title">Confirmar firma</h2></div>
              <button type="button" className="icon-button" aria-label="Cerrar" disabled={isSigning} onClick={() => setSigningRequest(null)}><X size={19} /></button>
            </div>
            <p className="modal-copy">Vas a firmar <strong>{signingRequest.archivo?.nombre || 'este documento'}</strong> con la firma guardada en tu cuenta. Al confirmar se registrarán la fecha y una huella del archivo; después no se podrá editar ni borrar.</p>
            {hasSavedSignature === false && (
              <p className="document-template-note signature-missing-note">
                Primero crea tu firma personal.
                <button type="button" className="secondary-button" onClick={() => { setSigningRequest(null); onManageSignature() }}><PenLine size={14} /> Crear mi firma</button>
              </p>
            )}
            <label className="document-signature-toggle">
              <input type="checkbox" checked={confirmSignature} onChange={(event) => setConfirmSignature(event.target.checked)} />
              <span><strong>Leí y confirmo que firmo este documento.</strong><small>La firma quedará asociada a mi cuenta de usuario.</small></span>
            </label>
            <div className="modal-actions">
              <button type="button" className="secondary-button" disabled={isSigning} onClick={() => setSigningRequest(null)}>Cancelar</button>
              <button type="button" className="primary-button" disabled={!confirmSignature || isSigning || hasSavedSignature === false} onClick={signSelectedDocument}>
                <PenLine size={15} /> {isSigning ? 'Registrando...' : 'Confirmar firma'}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  )
}

export default MySignatures
