import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { FilePlus2, Plus, X } from 'lucide-react'
import { listTemplates, saveTemplate } from './documentService'

const UniverSheetEditor = lazy(() => import('./UniverSheetEditor'))
const UniverDocEditor = lazy(() => import('./UniverDocEditor'))
const MAX_TEMPLATE_ROWS = 200

function TemplateLibrary() {
  const [templates, setTemplates] = useState([])
  const [name, setName] = useState('')
  const [fileType, setFileType] = useState('docx')
  const [rowsToFill, setRowsToFill] = useState(5)
  const [univerStatus, setUniverStatus] = useState('loading')
  const sheetEditorRef = useRef(null)
  const docEditorRef = useRef(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')

  const handleUniverReady = useCallback((api) => {
    sheetEditorRef.current = api
    setUniverStatus(api?.error ? 'error' : api ? 'ready' : 'loading')
  }, [])

  const handleUniverDocReady = useCallback((api) => {
    docEditorRef.current = api
    setUniverStatus(api?.error ? 'error' : api ? 'ready' : 'loading')
  }, [])

  const loadTemplates = useCallback(async () => {
    setIsLoading(true)
    try {
      setTemplates(await listTemplates())
      setErrorMessage('')
    } catch (error) {
      setErrorMessage(`No se pudieron cargar las plantillas. ${error.message}`)
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => { loadTemplates() }, [loadTemplates])


  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')
    setSuccessMessage('')
    const cleanName = name.trim()
    if (!cleanName) {
      setErrorMessage('Escribe el nombre de la plantilla.')
      return
    }

    let schema
    if (fileType === 'xlsx') {
      if (!Number.isInteger(rowsToFill) || rowsToFill < 1 || rowsToFill > MAX_TEMPLATE_ROWS) {
        setErrorMessage(`Indica entre 1 y ${MAX_TEMPLATE_ROWS} filas para diligenciar.`)
        return
      }
      const workbook = sheetEditorRef.current?.save?.()
      if (!workbook) {
        setErrorMessage(sheetEditorRef.current?.error || 'Espera a que la hoja de cálculo termine de cargar.')
        return
      }
      const sheets = (workbook.sheetOrder || []).map((sheetId) => workbook.sheets?.[sheetId]).filter(Boolean).map((sheet) => {
        const header = sheet.cellData?.[0] || {}
        const indices = Object.keys(header).map(Number).filter(Number.isInteger)
        const lastColumn = indices.length ? Math.max(...indices) : -1
        const columns = Array.from({ length: lastColumn + 1 }, (_, index) => ({ id: `column_${index + 1}`, label: String(header[index]?.v ?? '').trim() }))
        return { id: sheet.id, name: String(sheet.name || 'Hoja').trim(), rowCount: rowsToFill, columns }
      })
      if (!sheets.length || sheets.some((sheet) => !sheet.name || !sheet.columns.length || sheet.columns.some((column) => !column.label))) {
        setErrorMessage('Escribe un título en la primera fila de cada columna que vayas a usar.')
        return
      }
      schema = { version: 2, fileType, editor: 'univer', workbook, sheets }
    } else {
      const document = docEditorRef.current?.save?.()
      const content = document?.body?.dataStream?.replace(/\0/g, '').trim()
      if (!document || !content) {
        setErrorMessage(docEditorRef.current?.error || 'Escribe el contenido de la plantilla Word antes de guardarla.')
        return
      }
      const placeholders = [...new Set([...content.matchAll(/\{\{\s*([^{}]+?)\s*\}\}/g)].map((match) => match[1].trim()).filter(Boolean))]
      const schemaFields = placeholders
        .filter((label) => !['empresa', 'fecha'].includes(label.toLocaleLowerCase('es-CO')))
        .map((label, index) => ({ id: `document_field_${index + 1}`, label, type: 'textarea', required: false }))
      schema = { version: 2, fileType, editor: 'univer', document, fields: schemaFields }
    }

    setIsSaving(true)
    try {
      await saveTemplate({ name: cleanName, schema })
      setName('')
      setFileType('docx')
      setRowsToFill(5)
      setSuccessMessage('Plantilla guardada. Ya puedes usarla desde los archivos de una empresa.')
      await loadTemplates()
      setIsModalOpen(false)
    } catch (error) {
      setErrorMessage(`No se pudo guardar la plantilla. ${error.message}`)
    } finally {
      setIsSaving(false)
    }
  }

  function closeModal() {
    if (isSaving) return
    setIsModalOpen(false)
    setErrorMessage('')
  }

  return (
    <section className="detail-view">
      <div className="welcome-row">
        <div><p className="eyebrow">BIBLIOTECA DE DOCUMENTOS</p><h1>Plantillas<span>.</span></h1><p className="welcome-copy">Define una sola vez los campos de tus formatos Word y Excel.</p></div>
        <button className="primary-button" onClick={() => { setErrorMessage(''); setSuccessMessage(''); setIsModalOpen(true) }}><Plus size={16} /> Crear plantilla</button>
      </div>
      {errorMessage && !isModalOpen && <p className="database-alert" role="alert">{errorMessage}</p>}
      {successMessage && <p className="template-success" role="status">{successMessage}</p>}

      <section className="template-library-panel">
        <div className="section-heading"><div><p className="eyebrow">DISPONIBLES PARA LAS EMPRESAS</p><h2>Plantillas creadas</h2></div></div>
        {isLoading ? <div className="empty-state">Cargando plantillas...</div> : templates.length ? (
          <div className="template-list">
            {templates.map((template) => {
              const schema = template.formato || {}
              const summary = schema.fileType === 'xlsx'
                ? `${(schema.sheets || []).length} hojas · ${(schema.sheets || []).reduce((total, sheet) => total + (sheet.columns || []).length, 0)} columnas · ${(schema.sheets || []).reduce((total, sheet) => total + (Number(sheet.rowCount) || 0), 0)} filas iniciales`
                : schema.document ? `Documento con ${(schema.fields || []).length} campos para completar` : `${(schema.fields || []).length} campos`
              return <article className="template-list-row" key={template.id}>
                <span className="record-icon"><FilePlus2 size={17} /></span>
                <div className="record-main"><strong>{template.nombre}</strong><span>{(schema.fileType || 'docx').toUpperCase()} · {summary}</span></div>
                <span className="record-badge">Disponible</span>
              </article>
            })}
          </div>
        ) : <div className="empty-state"><FilePlus2 size={20} /><strong>Aún no hay plantillas</strong><span>Usa «Crear plantilla» para agregar la primera.</span></div>}
      </section>

      {isModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
        <section className="template-modal" role="dialog" aria-modal="true" aria-labelledby="template-modal-title">
          <div className="modal-heading"><div><p className="eyebrow">NUEVA ESTRUCTURA</p><h2 id="template-modal-title">Crear plantilla</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" disabled={isSaving} onClick={closeModal}><X size={19} /></button></div>
          <p className="modal-copy">Diseña el contenido directamente con el editor Univer para Excel o Word.</p>
          <form className="template-builder" onSubmit={handleSubmit}>
            <label className="form-field">Nombre de la plantilla
              <input required value={name} onChange={(event) => setName(event.target.value)} placeholder="Ej. Plan de emergencias" />
            </label>
            <label className="form-field">Tipo de archivo que se generará
              <select value={fileType} onChange={(event) => setFileType(event.target.value)}>
                <option value="docx">Documento Word (.docx)</option>
                <option value="xlsx">Libro Excel (.xlsx)</option>
              </select>
            </label>

            {fileType === 'xlsx' ? <>
              <p className="univer-intro">Edita la hoja directamente: escribe los nombres de las columnas en la primera fila y agrega o quita filas, columnas y hojas desde el editor.</p>
              <label className="form-field univer-row-count">Filas vacías que recibirá cada empresa<input type="number" min="1" max={MAX_TEMPLATE_ROWS} value={rowsToFill} onChange={(event) => setRowsToFill(Number(event.target.value))} /></label>
              {univerStatus === 'error' && <p className="login-error" role="alert">No se pudo iniciar el editor de Excel. Cierra y vuelve a abrir la plantilla.</p>}
              <Suspense fallback={<div className="empty-state">Cargando editor de hojas de cálculo...</div>}>
                <UniverSheetEditor onReady={handleUniverReady} />
              </Suspense>
            </> : <>
              <p className="univer-intro">Redacta y da formato al documento. Para solicitar datos al crear el archivo de una empresa, escribe marcadores como <code>{'{{Nombre del responsable}}'}</code>. <code>{'{{Empresa}}'}</code> y <code>{'{{Fecha}}'}</code> se completan automáticamente.</p>
              {univerStatus === 'error' && <p className="login-error" role="alert">No se pudo iniciar el editor Word. Cierra y vuelve a abrir la plantilla.</p>}
              <Suspense fallback={<div className="empty-state">Cargando editor de documentos...</div>}>
                <UniverDocEditor onReady={handleUniverDocReady} />
              </Suspense>
            </>}

            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={closeModal}>Cancelar</button><button className="primary-button" type="submit" disabled={isSaving || univerStatus !== 'ready'}><FilePlus2 size={16} /> {isSaving ? 'Guardando plantilla...' : 'Guardar plantilla'}</button></div>
          </form>
        </section>
      </div>}
    </section>
  )
}

export default TemplateLibrary
