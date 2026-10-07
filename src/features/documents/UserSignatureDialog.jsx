import { useEffect, useRef, useState } from 'react'
import { Check, Eraser, Trash2, Upload, X } from 'lucide-react'
import { deleteUserSignature, getUserSignature, saveUserSignature, signatureSetupHint } from './signatureService'

export default function UserSignatureDialog({ userId, onClose }) {
  const canvasRef = useRef(null)
  const drawingRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)
  const [hasSavedSignature, setHasSavedSignature] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    let active = true
    getUserSignature(userId).then((saved) => {
      if (!active || !saved) return
      setHasSavedSignature(true)
      const image = new Image()
      const imageUrl = URL.createObjectURL(saved.blob)
      image.onload = () => {
        if (!active || !canvasRef.current) { URL.revokeObjectURL(imageUrl); return }
        const context = canvasRef.current.getContext('2d')
        context.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height)
        const scale = Math.min((canvasRef.current.width - 40) / image.width, (canvasRef.current.height - 30) / image.height)
        const width = image.width * scale
        const height = image.height * scale
        context.drawImage(image, (canvasRef.current.width - width) / 2, (canvasRef.current.height - height) / 2, width, height)
        setHasInk(true)
        URL.revokeObjectURL(imageUrl)
      }
      image.src = imageUrl
    }).catch((loadError) => { if (active) setError(`No se pudo cargar tu firma. ${loadError.message}${signatureSetupHint(loadError)}`) })
    return () => { active = false }
  }, [userId])

  function point(event) {
    const canvas = canvasRef.current
    const bounds = canvas.getBoundingClientRect()
    return { x: (event.clientX - bounds.left) * canvas.width / bounds.width, y: (event.clientY - bounds.top) * canvas.height / bounds.height }
  }

  function startDrawing(event) {
    event.preventDefault()
    const canvas = canvasRef.current
    canvas.setPointerCapture(event.pointerId)
    const context = canvas.getContext('2d')
    const { x, y } = point(event)
    context.beginPath()
    context.moveTo(x, y)
    context.strokeStyle = '#173c31'
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    drawingRef.current = true
  }

  function draw(event) {
    if (!drawingRef.current) return
    const { x, y } = point(event)
    const context = canvasRef.current.getContext('2d')
    context.lineTo(x, y)
    context.stroke()
    setHasInk(true)
  }

  function stopDrawing() { drawingRef.current = false }

  function clearCanvas() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    setError('')
    setMessage('')
  }

  async function importImage(event) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg'].includes(file.type)) { setError('Elige una imagen PNG o JPG.'); return }
    const image = new Image()
    image.onload = () => {
      clearCanvas()
      const canvas = canvasRef.current
      const scale = Math.min((canvas.width - 40) / image.width, (canvas.height - 30) / image.height)
      const width = image.width * scale
      const height = image.height * scale
      canvas.getContext('2d').drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height)
      setHasInk(true)
      URL.revokeObjectURL(image.src)
    }
    image.src = URL.createObjectURL(file)
    event.target.value = ''
  }

  async function save(event) {
    event.preventDefault()
    if (!hasInk) { setError('Dibuja o adjunta tu firma antes de guardarla.'); return }
    setBusy(true); setError(''); setMessage('')
    try {
      const blob = await new Promise((resolve) => canvasRef.current.toBlob(resolve, 'image/png'))
      if (!blob) throw new Error('No se pudo preparar la imagen de firma.')
      await saveUserSignature(userId, blob)
      setHasSavedSignature(true)
      setMessage('Tu firma quedó guardada de forma privada.')
    } catch (saveError) { setError(`No se pudo guardar la firma. ${saveError.message}${signatureSetupHint(saveError)}`) }
    finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm('¿Eliminar la firma guardada en tu cuenta?')) return
    setBusy(true); setError(''); setMessage('')
    try { await deleteUserSignature(userId); setHasSavedSignature(false); clearCanvas(); setMessage('Firma eliminada.') }
    catch (deleteError) { setError(`No se pudo eliminar la firma. ${deleteError.message}${signatureSetupHint(deleteError)}`) }
    finally { setBusy(false) }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="document-modal user-signature-modal" role="dialog" aria-modal="true" aria-labelledby="user-signature-title">
      <div className="modal-heading"><div><p className="eyebrow">CUENTA PERSONAL</p><h2 id="user-signature-title">Mi firma</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={onClose}><X size={19} /></button></div>
      <p className="modal-copy">Dibuja tu firma o adjunta una imagen PNG/JPG. Solo tú puedes consultar y actualizar la firma guardada.</p>
      <form className="document-modal-form" onSubmit={save}>
        <div className="user-signature-canvas-wrap"><canvas ref={canvasRef} width="900" height="260" aria-label="Área para dibujar firma" onPointerDown={startDrawing} onPointerMove={draw} onPointerUp={stopDrawing} onPointerCancel={stopDrawing} /></div>
        <div className="document-page-actions"><button type="button" className="secondary-button" onClick={clearCanvas}><Eraser size={15} /> Limpiar</button><label className="secondary-button signature-upload-button"><Upload size={15} /> Adjuntar imagen<input type="file" accept="image/png,image/jpeg" onChange={importImage} /></label>{hasSavedSignature && <button type="button" className="secondary-button company-file-delete-button" onClick={remove} disabled={busy}><Trash2 size={15} /> Eliminar firma</button>}</div>
        {error && <p className="database-alert" role="alert">{error}</p>}{message && <p className="template-success" role="status">{message}</p>}
        <div className="modal-actions"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>Cerrar</button><button className="primary-button" disabled={busy || !hasInk}><Check size={15} />{busy ? 'Guardando...' : hasSavedSignature ? 'Actualizar firma' : 'Guardar firma'}</button></div>
      </form>
    </section>
  </div>
}
