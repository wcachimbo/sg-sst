import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { AlertTriangle, ArrowLeft, CalendarDays, Check, ClipboardCheck, Clock3, Download, Eye, FilePlus2, Paperclip, Pencil, PenLine, Plus, Trash2, Upload, X } from 'lucide-react'
import ExcelJS from 'exceljs'
import mammoth from 'mammoth'
import { generateBlankExcelFile, generateTemplateFile } from './fileGenerators'
import { deleteCompanyFile, downloadCompanyFileBlob, getCompanyFileUrl, listCompanyFiles, listTemplates, saveCompanyFile, updateCompanyFile } from './documentService'
import AnnualWorkPlan from '../work-plan/AnnualWorkPlan'
import AccidentReports from '../accidents/AccidentReports'
import CompanyVisits from '../visits/CompanyVisits'
import CompanyAudits from '../audits/CompanyAudits'
import { completeDocumentSignature, createDocumentSignatureRequests, listCompanySigners, listDocumentSignatures, signatureSetupHint } from './signatureService'
import { buildSignedFileForRow } from './embeddedSignatures'

const UniverSheetEditor = lazy(() => import('./UniverSheetEditor'))
const UniverDocEditor = lazy(() => import('./UniverDocEditor'))

function safeFileBase(value) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9-_]+/g, '-').replace(/^-|-$/g, '') || 'documento'
}

function TemplateField({ field, value, onChange }) {
  if (field.type === 'table') {
    const rows = value || []
    function updateCell(rowIndex, columnId, cellValue) {
      onChange(rows.map((row, index) => index === rowIndex ? { ...row, [columnId]: cellValue } : row))
    }

    return <div className="form-field">
      <span>{field.label}</span>
      <div className="document-table-wrap">
        <table className="document-entry-table">
          <thead><tr>{(field.columns || []).map((column) => <th key={column.id}>{column.label}</th>)}<th aria-label="Acciones" /></tr></thead>
          <tbody>
            {rows.map((row, rowIndex) => <tr key={rowIndex}>
              {(field.columns || []).map((column) => <td key={column.id}><input aria-label={`${column.label}, fila ${rowIndex + 1}`} value={row[column.id] || ''} onChange={(event) => updateCell(rowIndex, column.id, event.target.value)} /></td>)}
              <td><button type="button" className="icon-button" aria-label={`Eliminar fila ${rowIndex + 1}`} onClick={() => onChange(rows.filter((_, index) => index !== rowIndex))}><Trash2 size={15} /></button></td>
            </tr>)}
          </tbody>
        </table>
      </div>
      <button type="button" className="secondary-button document-add-row" onClick={() => onChange([...rows, {}])}><Plus size={14} /> Agregar fila</button>
    </div>
  }

  if (field.type === 'textarea') {
    return <label className="form-field">{field.label}
      <textarea required={field.required} rows={4} value={value || ''} onChange={(event) => onChange(event.target.value)} />
    </label>
  }
  if (field.type === 'select') {
    return <label className="form-field">{field.label}
      <select required={field.required} value={value || ''} onChange={(event) => onChange(event.target.value)}>
        <option value="">Selecciona una opción</option>
        {(field.options || []).map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  }
  return <label className="form-field">{field.label}
    <input required={field.required} type={field.type === 'date' ? 'date' : field.type === 'number' ? 'number' : 'text'} value={value || ''} onChange={(event) => onChange(event.target.value)} />
  </label>
}

function SpreadsheetSheetForm({ sheet, rows = [], onChange }) {
  const rowCount = Math.max(Number(sheet.rowCount) || 0, rows.length)
  const visibleRows = Array.from({ length: rowCount }, (_, index) => rows[index] || {})

  function updateCell(rowIndex, columnId, cellValue) {
    const nextRows = [...visibleRows]
    nextRows[rowIndex] = { ...nextRows[rowIndex], [columnId]: cellValue }
    onChange(nextRows)
  }

  return <div className="form-field spreadsheet-company-sheet">
    <div className="spreadsheet-preview-heading"><strong>{sheet.name}</strong><span>{rowCount} filas · primera fila reservada para encabezados</span></div>
    <div className="spreadsheet-grid-wrap">
      <table className="spreadsheet-grid spreadsheet-data-grid">
        <thead><tr><th className="spreadsheet-row-number">#</th>{sheet.columns.map((column) => <th key={column.id}>{column.label}</th>)}</tr></thead>
        <tbody>{visibleRows.map((row, rowIndex) => <tr key={rowIndex}>
          <td className="spreadsheet-row-number">{rowIndex + 1}</td>
          {sheet.columns.map((column) => <td key={column.id}><input aria-label={`${sheet.name}, ${column.label}, fila ${rowIndex + 1}`} value={row[column.id] || ''} onChange={(event) => updateCell(rowIndex, column.id, event.target.value)} /></td>)}
        </tr>)}</tbody>
      </table>
    </div>
    <button type="button" className="secondary-button document-add-row" onClick={() => onChange([...visibleRows, {}])}><Plus size={14} /> Agregar fila</button>
  </div>
}

async function readEditableContent(file, extension) {
  if (extension === 'docx' && file.datos?.__univerDocument) return { document: file.datos.__univerDocument }
  if (extension === 'xlsx' && file.datos?.__univerWorkbook) return { workbook: file.datos.__univerWorkbook }
  const blob = await downloadCompanyFileBlob(file)
  if (extension === 'docx') {
    const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })
    return { text: result.value }
  }
  if (extension === 'xlsx') {
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(await blob.arrayBuffer())
    return { sheets: workbook.worksheets.map((sheet) => ({
      name: sheet.name,
      rows: sheet.getSheetValues().slice(1).map((row) => Array.isArray(row)
        ? row.slice(1).map((cell) => {
          if (cell === null || cell === undefined) return ''
          if (typeof cell === 'object') return cell.text || cell.result || cell.hyperlink || JSON.stringify(cell)
          return String(cell)
        })
        : []),
    })) }
  }
  return null
}

function FilePreviewContent({ file }) {
  const [content, setContent] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const extension = file.nombre?.split('.').pop()?.toLowerCase() || ''

  useEffect(() => {
    let active = true
    let objectUrl = ''

    async function loadPreview() {
      setLoading(true)
      setError('')
      setContent(null)
      try {
        if (!['pdf', 'png', 'jpg', 'jpeg', 'docx', 'xlsx'].includes(extension)) {
          setLoading(false)
          return
        }
        const blob = await downloadCompanyFileBlob(file)
        if (!active) return
        if (['pdf', 'png', 'jpg', 'jpeg'].includes(extension)) {
          objectUrl = URL.createObjectURL(blob)
          setContent(objectUrl)
        } else if (extension === 'docx') {
          const result = await mammoth.extractRawText({ arrayBuffer: await blob.arrayBuffer() })
          if (active) setContent(result.value)
        } else {
          const workbook = new ExcelJS.Workbook()
          await workbook.xlsx.load(await blob.arrayBuffer())
          if (!active) return
          const sheets = workbook.worksheets.map((sheet) => ({
            name: sheet.name,
            rows: sheet.getSheetValues().slice(1).map((row) => Array.isArray(row)
              ? row.slice(1).map((cell) => {
                if (cell === null || cell === undefined) return ''
                if (typeof cell === 'object') return cell.text || cell.result || cell.hyperlink || JSON.stringify(cell)
                return String(cell)
              })
              : []),
          }))
          setContent(sheets)
        }
      } catch (previewError) {
        if (active) setError(`No se pudo abrir la vista previa. ${previewError.message}`)
      } finally {
        if (active) setLoading(false)
      }
    }

    loadPreview()
    return () => {
      active = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [file, extension])

  return <div className="document-inline-preview">
    {loading ? <div className="empty-state">Cargando vista previa...</div>
      : error ? <p className="database-alert" role="alert">{error}</p>
        : extension === 'pdf' && content ? <iframe className="document-preview-frame" src={content} title={`Vista previa de ${file.nombre}`} />
          : ['png', 'jpg', 'jpeg'].includes(extension) && content ? <img className="document-preview-image" src={content} alt={`Vista previa de ${file.nombre}`} />
            : extension === 'docx' && content !== null ? <div className="document-preview-text">{content || 'El documento no contiene texto para mostrar.'}</div>
              : extension === 'xlsx' && Array.isArray(content) ? <div className="document-preview-sheets">{content.map((sheet) => <section className="document-preview-sheet" key={sheet.name}><h3>{sheet.name}</h3>{sheet.rows.length ? <div className="spreadsheet-grid-wrap"><table className="spreadsheet-grid document-preview-table"><tbody>{sheet.rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}</tr>)}</tbody></table></div> : <p>Esta hoja está vacía.</p>}</section>)}</div>
                : <div className="empty-state"><Eye size={20} /><strong>Vista previa no disponible</strong><span>Este formato se puede descargar, reemplazar o borrar.</span></div>}
  </div>
}

function CompanyDocuments({ company, canCreate, onBack, userId, userEmail, userName }) {
  const [templates, setTemplates] = useState([])
  const [files, setFiles] = useState([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [creationSource, setCreationSource] = useState('template')
  const [blankFileType, setBlankFileType] = useState('docx')
  const [blankFileName, setBlankFileName] = useState('')
  const [blankEditorStatus, setBlankEditorStatus] = useState('loading')
  const blankEditorRef = useRef(null)
  const [values, setValues] = useState({})
  const [selectedFile, setSelectedFile] = useState(null)
  const [previewFile, setPreviewFile] = useState(null)
  const [isEditingSavedFile, setIsEditingSavedFile] = useState(false)
  const [editedFileName, setEditedFileName] = useState('')
  const [replacementFile, setReplacementFile] = useState(null)
  const [editableContent, setEditableContent] = useState(null)
  const savedFileEditorRef = useRef(null)
  const [savedFileEditorStatus, setSavedFileEditorStatus] = useState('loading')
  const [isPreparingEditor, setIsPreparingEditor] = useState(false)
  const [isSavingSavedFile, setIsSavingSavedFile] = useState(false)
  const [companySection, setCompanySection] = useState('plan')
  const [downloadLinks, setDownloadLinks] = useState({})
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false)
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [isGenerating, setIsGenerating] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const [companySigners, setCompanySigners] = useState([])
  const [documentSignatures, setDocumentSignatures] = useState([])
  const [requiresSignature, setRequiresSignature] = useState(false)
  const [busySignedFileId, setBusySignedFileId] = useState(null)
  const [selectedSignerIds, setSelectedSignerIds] = useState([])
  const [signingRequest, setSigningRequest] = useState(null)
  const [confirmSignature, setConfirmSignature] = useState(false)
  const [isSigningDocument, setIsSigningDocument] = useState(false)

  const handleSavedFileEditorReady = useCallback((api) => {
    savedFileEditorRef.current = api
    setSavedFileEditorStatus(api?.error ? 'error' : api ? 'ready' : 'loading')
  }, [])

  const handleBlankEditorReady = useCallback((api) => {
    blankEditorRef.current = api
    setBlankEditorStatus(api?.error ? 'error' : api ? 'ready' : 'loading')
  }, [])

  const loadData = useCallback(async () => {
    setIsLoading(true)
    try {
      const [companyFiles, availableTemplates, availableSigners] = await Promise.all([
        listCompanyFiles(company.id),
        listTemplates(),
        canCreate ? listCompanySigners(company.id) : Promise.resolve([]),
      ])
      setFiles(companyFiles)
      setTemplates(availableTemplates)
      const signers = [...availableSigners]
      if (canCreate && userId && !signers.some((signer) => signer.id === userId)) signers.unshift({ id: userId, name: userName || userEmail || 'Administrador', email: userEmail || '' })
      setCompanySigners(signers)
      setDocumentSignatures(await listDocumentSignatures(companyFiles.map((file) => file.id)))
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(`No se pudieron cargar los documentos. ${error.message}${signatureSetupHint(error)}`)
    } finally {
      setIsLoading(false)
    }
  }, [company.id, canCreate, userId, userName, userEmail])

  useEffect(() => { loadData() }, [loadData])

  const selectedTemplate = templates.find((template) => String(template.id) === selectedTemplateId)
  const usableTemplates = templates.filter((template) => Array.isArray(template.formato?.fields) || Array.isArray(template.formato?.sheets))
  const sidebarFiles = [...files].sort((first, second) => {
    const firstIsPlan = /plan.*(anual|trabajo)|(anual|trabajo).*plan/i.test(first.nombre || '')
    const secondIsPlan = /plan.*(anual|trabajo)|(anual|trabajo).*plan/i.test(second.nombre || '')
    return Number(secondIsPlan) - Number(firstIsPlan)
  })

  function openCreateModal() {
    setSelectedTemplateId('')
    setValues({})
    setCreationSource('template')
    setBlankFileType('docx')
    setBlankFileName('')
    blankEditorRef.current = null
    setBlankEditorStatus('loading')
    setErrorMessage('')
    setSuccessMessage('')
    setRequiresSignature(false)
    setSelectedSignerIds([])
    setIsCreateModalOpen(true)
  }

  function openUploadModal() {
    setSelectedFile(null)
    setErrorMessage('')
    setSuccessMessage('')
    setRequiresSignature(false)
    setSelectedSignerIds([])
    setIsUploadModalOpen(true)
  }

  function openCompanyFileLibrary() {
    setCompanySection('files')
    setPreviewFile(null)
    setIsEditingSavedFile(false)
  }

  function chooseTemplate(templateId) {
    setSelectedTemplateId(templateId)
    const template = templates.find((item) => String(item.id) === templateId)
    const initialSheetRows = Object.fromEntries((template?.formato?.sheets || []).map((sheet) => [
      sheet.id,
      Array.from({ length: Number(sheet.rowCount) || 1 }, () => ({})),
    ]))
    const initialDocumentFields = Object.fromEntries((template?.formato?.document ? template.formato.fields || [] : []).map((field) => [field.id, '']))
    setValues({ ...initialSheetRows, ...initialDocumentFields })
    setErrorMessage('')
  }

  async function handleGenerate(event) {
    event.preventDefault()
    const isBlank = creationSource === 'blank'
    if (!isBlank && !selectedTemplate) return
    if (requiresSignature && !selectedSignerIds.length) { setErrorMessage('Selecciona al menos una persona que deba firmar el archivo.'); return }
    setErrorMessage('')
    setSuccessMessage('')
    setIsGenerating(true)
    try {
      const extension = isBlank ? blankFileType : selectedTemplate.formato?.fileType === 'xlsx' ? 'xlsx' : 'docx'
      let blob
      let displayName
      let templateId = selectedTemplate?.id || null
      let savedValues = values
      if (isBlank) {
        const editorSnapshot = blankEditorRef.current?.save?.()
        if (!editorSnapshot) throw new Error(blankEditorRef.current?.error || 'Espera a que el editor termine de cargar.')
        displayName = blankFileName.trim()
        if (!displayName) throw new Error('Escribe un nombre para el archivo.')
        if (extension === 'xlsx') {
          blob = await generateBlankExcelFile(editorSnapshot)
          savedValues = { __univerWorkbook: editorSnapshot }
        } else {
          blob = await generateTemplateFile({
            template: { nombre: displayName, formato: { fileType: 'docx', document: editorSnapshot, fields: [] } },
            company,
            values: {},
          })
          savedValues = { __univerDocument: editorSnapshot }
        }
      } else {
        displayName = `${selectedTemplate.nombre}-${company.name}`
        blob = await generateTemplateFile({ template: selectedTemplate, company, values })
      }
      const nameBase = displayName.replace(/\.(docx|xlsx)$/i, '')
      const name = `${safeFileBase(nameBase)}.${extension}`
      const savedFile = await saveCompanyFile({
        companyId: company.id,
        templateId,
        name,
        blob,
        mimeType: blob.type,
        values: savedValues,
        requiresSignature,
      })
      if (requiresSignature) await createDocumentSignatureRequests(savedFile, companySigners.filter((signer) => selectedSignerIds.includes(signer.id)), userId)
      setSuccessMessage('Documento generado y guardado para esta empresa.')
      setIsCreateModalOpen(false)
      setSelectedTemplateId('')
      setValues({})
      await loadData()
    } catch (error) {
      setErrorMessage(`No se pudo generar el documento. ${error.message}${signatureSetupHint(error)}`)
    } finally {
      setIsGenerating(false)
    }
  }

  async function handleUpload(event) {
    event.preventDefault()
    if (requiresSignature && !selectedSignerIds.length) {
      setErrorMessage('Selecciona al menos una persona que deba firmar el archivo.')
      return
    }
    if (!selectedFile) {
      setErrorMessage('Selecciona el archivo que quieres adjuntar.')
      return
    }
    setErrorMessage('')
    setSuccessMessage('')
    setIsUploading(true)
    try {
      const savedFile = await saveCompanyFile({
        companyId: company.id,
        name: selectedFile.name,
        blob: selectedFile,
        mimeType: selectedFile.type || 'application/octet-stream',
        requiresSignature,
      })
      if (requiresSignature) await createDocumentSignatureRequests(savedFile, companySigners.filter((signer) => selectedSignerIds.includes(signer.id)), userId)
      setSuccessMessage('Archivo adjuntado a la empresa.')
      setIsUploadModalOpen(false)
      setSelectedFile(null)
      await loadData()
    } catch (error) {
      setErrorMessage(`No se pudo adjuntar el archivo. ${error.message}${signatureSetupHint(error)}`)
    } finally {
      setIsUploading(false)
    }
  }

  function signaturesFor(fileId) { return documentSignatures.filter((request) => request.archivo_id === fileId) }

  async function downloadSignedCopy(file) {
    setErrorMessage(''); setSuccessMessage(''); setBusySignedFileId(file.id)
    try {
      const { blob, extension } = await buildSignedFileForRow(file)
      const baseName = (file.nombre || 'documento').replace(/\.[^.]+$/, '')
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url; anchor.download = `${baseName}-firmado.${extension || 'bin'}`
      document.body.appendChild(anchor); anchor.click(); anchor.remove()
      URL.revokeObjectURL(url)
      setSuccessMessage('Copia con firmas descargada.')
    } catch (error) { setErrorMessage(`No se pudo generar la copia firmada. ${error.message}`) } finally { setBusySignedFileId(null) }
  }

  function hasSignedRows(file) { return signaturesFor(file.id).some((request) => request.estado === 'firmado') }

  function signatureAssignmentFields() {
    return <div className="document-signature-options">
      <label className="document-signature-toggle"><input type="checkbox" checked={requiresSignature} onChange={(event) => { setRequiresSignature(event.target.checked); setSelectedSignerIds([]) }} /><span><strong>Este archivo requiere firma</strong><small>Cuando se solicite una firma, el archivo quedará protegido contra edición o eliminación.</small></span></label>
      {requiresSignature && <fieldset className="document-signers-fieldset"><legend>Personas que deben firmar</legend>{companySigners.length ? <div className="document-signers-list">{companySigners.map((signer) => <label key={signer.id}><input type="checkbox" checked={selectedSignerIds.includes(signer.id)} onChange={(event) => setSelectedSignerIds((ids) => event.target.checked ? [...ids, signer.id] : ids.filter((id) => id !== signer.id))} /><span><strong>{signer.name}</strong><small>{signer.email || 'Sin correo registrado'}</small></span></label>)}</div> : <p className="document-template-note">No hay personas con una cuenta activa en esta empresa para asignar como firmantes.</p>}</fieldset>}
    </div>
  }

  async function signSelectedDocument() {
    if (!signingRequest || !previewFile || !confirmSignature) return
    setIsSigningDocument(true); setErrorMessage('')
    try {
      await completeDocumentSignature(signingRequest, previewFile)
      setSigningRequest(null); setConfirmSignature(false)
      setSuccessMessage('Firma registrada con fecha y huella digital del archivo.')
      await loadData()
    } catch (error) { setErrorMessage(`No se pudo registrar la firma. ${error.message}${signatureSetupHint(error)}`) }
    finally { setIsSigningDocument(false) }
  }

  async function prepareDownload(file) {
    setErrorMessage('')
    try {
      const url = await getCompanyFileUrl(file)
      setDownloadLinks((current) => ({ ...current, [file.id]: url }))
    } catch (error) {
      setErrorMessage(`No se pudo preparar la descarga. ${error.message}`)
    }
  }

  function openFile(file, edit = false) {
    setCompanySection('files')
    setPreviewFile(file)
    setIsEditingSavedFile(false)
    setEditedFileName(file.nombre)
    setReplacementFile(null)
    setEditableContent(null)
    savedFileEditorRef.current = null
    setSavedFileEditorStatus('loading')
    setErrorMessage('')
    setSuccessMessage('')
    if (edit) void beginSavedFileEdit(file)
  }

  async function beginSavedFileEdit(file = previewFile) {
    if (!file?.nombre) return
    if (isEditingSavedFile) {
      setIsEditingSavedFile(false)
      setReplacementFile(null)
      setEditableContent(null)
      savedFileEditorRef.current = null
      setSavedFileEditorStatus('loading')
      return
    }
    setIsEditingSavedFile(true)
    setEditedFileName(file.nombre)
    setReplacementFile(null)
    setEditableContent(null)
    savedFileEditorRef.current = null
    setSavedFileEditorStatus('loading')
    setErrorMessage('')
    const extension = file.nombre?.split('.').pop()?.toLowerCase()
    if (!['docx', 'xlsx'].includes(extension)) return
    setIsPreparingEditor(true)
    try {
      setEditableContent(await readEditableContent(file, extension))
    } catch (error) {
      setErrorMessage(`No se pudo cargar el contenido para editar. ${error.message}`)
    } finally {
      setIsPreparingEditor(false)
    }
  }

  async function saveSavedFile(event) {
    event.preventDefault()
    if (!previewFile) return
    setIsSavingSavedFile(true)
    setErrorMessage('')
    setSuccessMessage('')
    try {
      if (editableContent !== null) {
        const originalExtension = previewFile.nombre?.split('.').pop()?.toLowerCase()
        const editedExtension = editedFileName.split('.').pop()?.toLowerCase()
        if (editedExtension !== originalExtension) throw new Error(`Conserva la extensión .${originalExtension} para editar el contenido.`)
      }
      let contentFile = replacementFile
      let editorData
      if (!replacementFile && editableContent !== null) {
        const extension = previewFile.nombre.split('.').pop()?.toLowerCase()
        const snapshot = savedFileEditorRef.current?.save?.()
        if (!snapshot) throw new Error(savedFileEditorRef.current?.error || 'No se pudo guardar el contenido del editor.')
        const mimeType = extension === 'docx'
          ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
          : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
        const blob = extension === 'docx'
          ? await generateTemplateFile({ template: { nombre: editedFileName, formato: { fileType: 'docx', document: snapshot, fields: [] } }, company, values: {} })
          : await generateBlankExcelFile(snapshot)
        contentFile = new File([blob], editedFileName, { type: mimeType })
        editorData = extension === 'docx' ? { __univerDocument: snapshot } : { __univerWorkbook: snapshot }
      }
      const updated = await updateCompanyFile({ companyId: company.id, file: previewFile, name: editedFileName, replacement: contentFile, values: editorData })
      setFiles((current) => current.map((file) => file.id === updated.id ? updated : file))
      setPreviewFile(updated)
      setIsEditingSavedFile(false)
      setReplacementFile(null)
      setEditableContent(null)
      savedFileEditorRef.current = null
      setDownloadLinks((current) => { const next = { ...current }; delete next[updated.id]; return next })
      setSuccessMessage('Archivo actualizado.')
    } catch (error) {
      setErrorMessage(`No se pudo actualizar el archivo. ${error.message}`)
    } finally {
      setIsSavingSavedFile(false)
    }
  }

  async function removeSavedFile(file) {
    if (!window.confirm(`¿Borrar el archivo «${file.nombre}» de ${company.name}?`)) return
    setErrorMessage('')
    setSuccessMessage('')
    try {
      const warning = await deleteCompanyFile(file)
      setFiles((current) => current.filter((item) => item.id !== file.id))
      setDownloadLinks((current) => { const next = { ...current }; delete next[file.id]; return next })
      if (previewFile?.id === file.id) setPreviewFile(null)
      setSuccessMessage(warning || 'Archivo eliminado.')
    } catch (error) {
      setErrorMessage(`No se pudo borrar el archivo. ${error.message}`)
    }
  }

  return (
    <section className="detail-view document-page">
      <div className="company-document-browser">
      <nav className="company-file-sidebar" aria-label={`Archivos de ${company.name}`}>
        <p className="company-file-sidebar-heading">MENÚ DE EMPRESA</p>
        <button type="button" className="company-file-link company-home-menu-link" onClick={onBack}><ArrowLeft size={15} /><span>Volver al inicio</span></button>
        <button type="button" className={`company-file-link company-plan-menu-link ${companySection === 'plan' ? 'company-file-link-active' : ''}`} onClick={() => { setCompanySection('plan'); setPreviewFile(null) }}><CalendarDays size={15} /><span>Plan anual de trabajo</span></button>
        <button type="button" className={`company-file-link company-plan-menu-link ${companySection === 'visits' ? 'company-file-link-active' : ''}`} onClick={() => { setCompanySection('visits'); setPreviewFile(null) }}><Clock3 size={15} /><span>Agendar visitas</span></button>
        <button type="button" className={`company-file-link company-plan-menu-link ${companySection === 'audits' ? 'company-file-link-active' : ''}`} onClick={() => { setCompanySection('audits'); setPreviewFile(null) }}><ClipboardCheck size={15} /><span>Auditorías</span></button>
        <button type="button" className={`company-file-link company-plan-menu-link ${companySection === 'accidents' ? 'company-file-link-active' : ''}`} onClick={() => { setCompanySection('accidents'); setPreviewFile(null) }}><AlertTriangle size={15} /><span>Reporte de accidentes</span></button>
        <div className="company-file-sidebar-files-header">
          <button type="button" className="company-file-sidebar-heading company-files-heading" onClick={openCompanyFileLibrary}>ARCHIVOS</button>
          {canCreate && <div className="company-file-sidebar-file-actions">
            <button type="button" className="company-file-sidebar-icon-action" aria-label="Crear archivo nuevo" title="Crear desde una plantilla o en blanco" onClick={openCreateModal}><FilePlus2 size={15} /></button>
            <button type="button" className="company-file-sidebar-icon-action" aria-label="Adjuntar archivo" title="Adjuntar archivo" onClick={openUploadModal}><Upload size={15} /></button>
          </div>}
        </div>
        {isLoading ? <span className="company-file-sidebar-empty">Cargando archivos...</span> : sidebarFiles.length ? sidebarFiles.map((file) => (
          <button type="button" className={`company-file-link ${companySection === 'files' && previewFile?.id === file.id ? 'company-file-link-active' : ''}`} key={file.id} title={file.nombre} disabled={!file.storage_path} onClick={() => openFile(file)}>
            <Paperclip size={15} /><span>{file.nombre}</span>
          </button>
        )) : <div className="company-file-sidebar-empty-wrap">
          <span className="company-file-sidebar-empty">Aún no hay archivos.</span>
        </div>}
      </nav>

      <div className="company-document-main">
      {companySection === 'plan' ? <AnnualWorkPlan company={company} canEdit={canCreate} /> : companySection === 'visits' ? <CompanyVisits company={company} canManage={canCreate} /> : companySection === 'audits' ? <CompanyAudits company={company} canManage={canCreate} /> : companySection === 'accidents' ? <AccidentReports company={company} /> : <>
      {previewFile ? <section className="company-file-detail">
        <div className="document-page-toolbar company-file-detail-toolbar">
          <button type="button" className="secondary-button" onClick={() => { setPreviewFile(null); setIsEditingSavedFile(false); setErrorMessage(''); setSuccessMessage('') }}><ArrowLeft size={15} /> Archivos</button>
          <div className="document-page-actions">
            {downloadLinks[previewFile.id] ? <a className="secondary-button" href={downloadLinks[previewFile.id]} target="_blank" rel="noreferrer" download={previewFile.nombre}><Download size={15} /> Descargar</a> : <button type="button" className="secondary-button" onClick={() => prepareDownload(previewFile)}><Download size={15} /> Descargar</button>}
            {previewFile.requiere_firma && hasSignedRows(previewFile) && <button type="button" className="secondary-button" disabled={busySignedFileId === previewFile.id} onClick={() => downloadSignedCopy(previewFile)}><Download size={15} /> {busySignedFileId === previewFile.id ? 'Generando...' : 'Copia con firmas'}</button>}
            {canCreate && !signaturesFor(previewFile.id).length && <><button type="button" className="secondary-button" onClick={() => beginSavedFileEdit()}><Pencil size={15} /> {isEditingSavedFile ? 'Cancelar edición' : 'Editar archivo'}</button><button type="button" className="secondary-button company-file-delete-button" onClick={() => removeSavedFile(previewFile)}><Trash2 size={15} /> Borrar</button></>}
          </div>
        </div>
        {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
        {successMessage && <p className="template-success" role="status">{successMessage}</p>}
        <div className="company-file-detail-heading"><div><p className="eyebrow">ARCHIVO DE {company.name}</p><h1>{previewFile.nombre}</h1><span>{new Date(previewFile.fecha).toLocaleString('es-CO')}</span></div></div>
        {previewFile.requiere_firma && <section className="document-signature-panel"><div className="document-signature-panel-heading"><strong><PenLine size={16} /> Documento con firma requerida</strong><span>Se guarda fecha, firmante y huella digital del archivo.</span></div>{signaturesFor(previewFile.id).map((request) => <div className="document-signature-row" key={request.id}><span><b>{request.firmante_nombre}</b><small>{request.firmante_correo || 'Firmante'}</small></span><span className={`signature-status signature-status-${request.estado}`}>{request.estado === 'firmado' ? `Firmado · ${new Date(request.firmada_en).toLocaleString('es-CO')}` : 'Pendiente'}</span>{request.estado === 'pendiente' && request.firmante_auth_user_id === userId && <button type="button" className="primary-button" onClick={() => { setSigningRequest(request); setConfirmSignature(false) }}><PenLine size={14} /> Firmar documento</button>}</div>)}</section>}
        {isEditingSavedFile && <form className="company-file-edit-form" onSubmit={saveSavedFile}>
          <label className="form-field">Nombre del archivo<input required value={editedFileName} onChange={(event) => setEditedFileName(event.target.value)} /></label>
          {isPreparingEditor ? <div className="empty-state">Cargando contenido editable...</div> : editableContent !== null ? <Suspense fallback={<div className="empty-state">Iniciando Univer...</div>}>{editedFileName.toLowerCase().endsWith('.docx') ? <UniverDocEditor key={`${previewFile.id}-${previewFile.fecha}`} onReady={handleSavedFileEditorReady} initialDocument={editableContent.document} initialText={editableContent.text} /> : <UniverSheetEditor key={`${previewFile.id}-${previewFile.fecha}`} onReady={handleSavedFileEditorReady} initialHeaders={false} initialWorkbook={editableContent.workbook} initialSheets={editableContent.sheets} />}</Suspense> : !['docx', 'xlsx'].includes(editedFileName.split('.').pop()?.toLowerCase()) && <p className="document-template-note">Este formato no permite editar texto aquí. Puedes reemplazarlo por un archivo actualizado.</p>}
          <label className="form-field">Reemplazar por otro archivo (opcional)<input type="file" accept=".doc,.docx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { const file = event.target.files?.[0] || null; setReplacementFile(file); if (file) setEditedFileName(file.name) }} /></label>
          {replacementFile && <p className="document-template-note">Nuevo contenido: {replacementFile.name}</p>}
          <div className="modal-actions"><button type="button" className="secondary-button" disabled={isSavingSavedFile} onClick={() => { setIsEditingSavedFile(false); setReplacementFile(null); setEditableContent(null); savedFileEditorRef.current = null; setSavedFileEditorStatus('loading'); setEditedFileName(previewFile.nombre) }}>Cancelar</button><button className="primary-button" disabled={isSavingSavedFile || isPreparingEditor || (!replacementFile && editableContent !== null && savedFileEditorStatus !== 'ready')}><Check size={15} />{isSavingSavedFile ? 'Guardando...' : 'Guardar cambios'}</button></div>
        </form>}
        <FilePreviewContent file={previewFile} />
      </section> : <>
      <div className="document-page-toolbar">
        <div className="document-page-actions">
          {canCreate && <>
            <button className="primary-button" onClick={openCreateModal}><Plus size={16} /> Crear archivo</button>
            <button className="secondary-button" onClick={openUploadModal}><Paperclip size={15} /> Adjuntar archivo</button>
          </>}
          <button className="secondary-button" onClick={onBack}><ArrowLeft size={16} /> Volver al inicio</button>
        </div>
      </div>

      {!isCreateModalOpen && !isUploadModalOpen && errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
      {successMessage && <p className="template-success" role="status">{successMessage}</p>}

      <section className="section-block document-files-section">
        <div className="section-heading"><div><p className="eyebrow">ARCHIVO DE LA EMPRESA</p><h2>Archivos guardados</h2></div></div>
        {isLoading ? <div className="empty-state">Cargando archivos...</div> : files.length ? (
          <div className="template-list">
            {files.map((file) => <article className="template-list-row" key={file.id}>
              <span className="record-icon"><Paperclip size={17} /></span>
              <div className="record-main"><strong>{file.nombre}</strong><span>{new Date(file.fecha).toLocaleString('es-CO')} · {file.plantilla_id ? 'Generado desde plantilla' : 'Archivo adjunto'}{file.requiere_firma ? ` · ${signaturesFor(file.id).filter((request) => request.estado === 'firmado').length}/${signaturesFor(file.id).length} firmas` : ''}</span></div>
              <div className="document-file-actions">
                {file.storage_path && <button type="button" className="secondary-button" onClick={() => openFile(file)}><Eye size={15} /> Abrir</button>}
                {downloadLinks[file.id]
                  ? <a className="secondary-button" href={downloadLinks[file.id]} target="_blank" rel="noreferrer" download={file.nombre}><Download size={15} /> Descargar</a>
                  : file.storage_path && <button type="button" className="secondary-button" onClick={() => prepareDownload(file)}><Download size={15} /> Descargar</button>}
                {file.requiere_firma && <span className="signature-required-badge"><PenLine size={13} /> Firma requerida</span>}
                {file.requiere_firma && hasSignedRows(file) && <button type="button" className="secondary-button" disabled={busySignedFileId === file.id} onClick={() => downloadSignedCopy(file)}><Download size={14} /> {busySignedFileId === file.id ? 'Generando...' : 'Copia con firmas'}</button>}
                {canCreate && !signaturesFor(file.id).length && <><button type="button" className="secondary-button" onClick={() => openFile(file, true)}><Pencil size={14} /> Editar</button><button type="button" className="secondary-button company-file-delete-button" onClick={() => removeSavedFile(file)}><Trash2 size={14} /> Borrar</button></>}
              </div>
            </article>)}
          </div>
        ) : <div className="empty-state"><Paperclip size={20} /><strong>No hay archivos para esta empresa</strong><span>Los archivos generados o adjuntados aparecerán aquí.</span></div>}
      </section>
      </>}
      </>}
      </div>
      </div>

      {isCreateModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isGenerating) setIsCreateModalOpen(false) }}>
        <section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="create-document-title">
          <div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="create-document-title">Crear archivo</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" disabled={isGenerating} onClick={() => setIsCreateModalOpen(false)}><X size={19} /></button></div>
          <p className="modal-copy">Crea el archivo desde una plantilla o empieza con un documento en blanco.</p>
          <form className="document-modal-form" onSubmit={handleGenerate}>
            <label className="form-field">Cómo quieres crear el archivo
              <select value={creationSource} onChange={(event) => { setCreationSource(event.target.value); setErrorMessage(''); setBlankEditorStatus('loading'); blankEditorRef.current = null }}>
                <option value="template">Usar una plantilla</option>
                <option value="blank">Crear en blanco</option>
              </select>
            </label>

            {creationSource === 'template' ? usableTemplates.length ? <>
              <label className="form-field">Plantilla
                <select required value={selectedTemplateId} onChange={(event) => chooseTemplate(event.target.value)}>
                  <option value="">Selecciona una plantilla</option>
                  {usableTemplates.map((template) => <option key={template.id} value={template.id}>{template.nombre} · {(template.formato?.fileType || 'docx').toUpperCase()}</option>)}
                </select>
              </label>
              {selectedTemplate && <>
                <p className="document-template-note">Completa los datos para generar un archivo {selectedTemplate.formato?.fileType === 'xlsx' ? 'Excel' : 'Word'}.</p>
                {Array.isArray(selectedTemplate.formato?.sheets)
                  ? selectedTemplate.formato.sheets.map((sheet) => <SpreadsheetSheetForm key={sheet.id} sheet={sheet} rows={values[sheet.id]} onChange={(rows) => setValues((current) => ({ ...current, [sheet.id]: rows }))} />)
                  : (selectedTemplate.formato?.fields || []).map((field) => <TemplateField key={field.id} field={field} value={values[field.id]} onChange={(value) => setValues((current) => ({ ...current, [field.id]: value }))} />)}
              </>}
            </> : <div className="empty-state"><FilePlus2 size={20} /><strong>No hay plantillas disponibles</strong><span>Puedes crear un archivo en blanco o agregar una plantilla desde la sección Plantillas.</span></div> : <>
              <label className="form-field">Nombre del archivo
                <input required maxLength={120} value={blankFileName} onChange={(event) => setBlankFileName(event.target.value)} placeholder="Ej. Informe de inspección" />
              </label>
              <label className="form-field">Formato
                <select value={blankFileType} onChange={(event) => { setBlankFileType(event.target.value); setBlankEditorStatus('loading'); blankEditorRef.current = null }}>
                  <option value="docx">Documento Word (.docx)</option>
                  <option value="xlsx">Libro Excel (.xlsx)</option>
                </select>
              </label>
              <p className="document-template-note">Escribe el contenido aquí. El archivo se guardará directamente en la biblioteca de esta empresa.</p>
              {blankEditorStatus === 'error' && <p className="login-error" role="alert">No se pudo iniciar el editor. Cierra y vuelve a abrir el formulario.</p>}
              <Suspense fallback={<div className="empty-state">Cargando editor...</div>}>
                {blankFileType === 'xlsx'
                  ? <UniverSheetEditor onReady={handleBlankEditorReady} initialHeaders={false} />
                  : <UniverDocEditor onReady={handleBlankEditorReady} />}
              </Suspense>
            </>}
            {canCreate && signatureAssignmentFields()}
            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" disabled={isGenerating} onClick={() => setIsCreateModalOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={isGenerating || (creationSource === 'template' ? !selectedTemplate : blankEditorStatus !== 'ready' || !blankFileName.trim())}><FilePlus2 size={16} /> {isGenerating ? 'Guardando...' : 'Crear archivo'}</button></div>
          </form>
        </section>
      </div>}

      {isUploadModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isUploading) setIsUploadModalOpen(false) }}>
        <section className="document-modal" role="dialog" aria-modal="true" aria-labelledby="upload-document-title">
          <div className="modal-heading"><div><p className="eyebrow">{company.name}</p><h2 id="upload-document-title">Adjuntar archivo</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" disabled={isUploading} onClick={() => setIsUploadModalOpen(false)}><X size={19} /></button></div>
          <p className="modal-copy">Selecciona un Word, Excel, PDF o imagen para guardarlo en la biblioteca privada de esta empresa.</p>
          <form className="document-modal-form" onSubmit={handleUpload}>
            <label className="form-field">Archivo
              <input type="file" required accept=".doc,.docx,.xls,.xlsx,.pdf,.png,.jpg,.jpeg" onChange={(event) => { setSelectedFile(event.target.files?.[0] || null); setErrorMessage('') }} />
            </label>
            {selectedFile && <p className="document-template-note">Seleccionado: {selectedFile.name}</p>}
            {canCreate && signatureAssignmentFields()}
            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" disabled={isUploading} onClick={() => setIsUploadModalOpen(false)}>Cancelar</button><button className="primary-button" type="submit" disabled={isUploading}><Upload size={15} /> {isUploading ? 'Adjuntando...' : 'Guardar archivo'}</button></div>
          </form>
        </section>
      </div>}

      {signingRequest && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSigningDocument) setSigningRequest(null) }}><section className="document-modal signature-confirm-modal" role="dialog" aria-modal="true" aria-labelledby="confirm-signature-title"><div className="modal-heading"><div><p className="eyebrow">FIRMA ELECTRÓNICA INTERNA</p><h2 id="confirm-signature-title">Confirmar firma</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setSigningRequest(null)}><X size={19} /></button></div><p className="modal-copy">Vas a firmar <strong>{previewFile?.nombre}</strong> con la firma guardada en tu cuenta. Al confirmar se registrará la fecha y una huella del archivo; después no se podrá editar ni borrar.</p><label className="document-signature-toggle"><input type="checkbox" checked={confirmSignature} onChange={(event) => setConfirmSignature(event.target.checked)} /><span><strong>Leí y confirmo que firmo este archivo.</strong><small>La firma se registrará con mi cuenta de usuario.</small></span></label><div className="modal-actions"><button type="button" className="secondary-button" disabled={isSigningDocument} onClick={() => setSigningRequest(null)}>Cancelar</button><button type="button" className="primary-button" disabled={!confirmSignature || isSigningDocument} onClick={signSelectedDocument}><PenLine size={15} />{isSigningDocument ? 'Registrando...' : 'Confirmar firma'}</button></div></section></div>}

    </section>
  )
}

export default CompanyDocuments
