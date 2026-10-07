import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowDown, ArrowLeft, ArrowUp, Check, CheckCircle2, ClipboardCheck, Eye, EyeOff, GraduationCap, LockKeyhole, Pencil, PlayCircle, Plus, Trash2, Video } from 'lucide-react'
import { createTrainingCourse, listTrainingCourses, listTrainingEmployees, listTrainingProgress, setTrainingVideoCompleted, submitTrainingAnswer, updateTrainingCourse } from './trainingService'

function employeeName(employee) {
  return employee.nombre_completo || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ') || employee.cedula
}
function emptyVideo() { return { key: crypto.randomUUID(), title: '', description: '', url: '', required: true, active: true } }
function emptyQuestion(type = 'opcion_multiple') {
  const options = type === 'verdadero_falso' ? [{ text: 'Verdadero', correct: true }, { text: 'Falso', correct: false }] : [{ text: '', correct: true }, { text: '', correct: false }]
  return { prompt: '', type, options }
}
function emptyQuiz(videoIndex) { return { videoIndex, title: 'Cuestionario', questions: [emptyQuestion()] } }
function courseSequence(course) {
  if (!course) return []
  const items = []
  course.videos.forEach((video, index) => {
    items.push({ type: 'video', id: video.id, key: `video:${video.id}`, video, index })
    const quiz = course.cuestionarios.find((item) => String(item.video_id) === String(video.id))
    if (quiz) items.push({ type: 'quiz', id: quiz.id, key: `quiz:${quiz.id}`, quiz, video })
  })
  course.cuestionarios.filter((quiz) => quiz.video_id === null).forEach((quiz) => items.push({ type: 'quiz', id: quiz.id, key: `quiz:${quiz.id}`, quiz, final: true }))
  return items
}
function contentItemComplete(item) {
  if (item.type === 'video') return Boolean(item.video.completado_en)
  return item.quiz.preguntas.length > 0 && item.quiz.preguntas.every((question) => question.progreso?.correcta)
}
function getTrainingDraft(userId) {
  try { return userId ? JSON.parse(window.sessionStorage.getItem(`sgsst:capacitacion:${userId}`) || 'null') : null } catch { return null }
}

function videoEmbedUrl(value) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, '').toLowerCase()
    let id = ''
    if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0] || ''
    else if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com'].includes(host)) {
      const parts = url.pathname.split('/').filter(Boolean)
      id = url.searchParams.get('v') || (['embed', 'shorts', 'live'].includes(parts[0]) ? parts[1] : '') || ''
    }
    if (id && /^[\w-]{6,20}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`
    if (['vimeo.com', 'player.vimeo.com'].includes(host)) { id = url.pathname.split('/').filter(Boolean).pop() || ''; if (/^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}` }
    if (host === 'drive.google.com') { id = url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] || url.searchParams.get('id') || ''; if (/^[\w-]{10,}$/.test(id)) return `https://drive.google.com/file/d/${id}/preview` }
  } catch { return '' }
  return ''
}

function TrainingVideoFrame({ lesson }) {
  const embed = videoEmbedUrl(lesson.enlace)
  return embed ? <div className="training-video-frame"><iframe src={embed} title={lesson.titulo} allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture; web-share" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" /></div>
    : <div className="training-embed-error"><Video size={21} /><strong>No se pudo incrustar este enlace</strong><span>Usa un enlace de YouTube, Vimeo o Google Drive.</span><a href={lesson.enlace} target="_blank" rel="noreferrer">Abrir video en otra pestaña</a></div>
}

function TrainingCenter({ userId, isAdmin, companies = [] }) {
  const [initialDraft] = useState(() => getTrainingDraft(userId))
  const [draftKey] = useState(() => userId ? `sgsst:capacitacion:${userId}` : null)
  const [courses, setCourses] = useState([])
  const [employees, setEmployees] = useState([])
  const [companyId, setCompanyId] = useState(initialDraft?.companyId || (companies[0]?.id ? String(companies[0].id) : ''))
  const [assignmentMode, setAssignmentMode] = useState(initialDraft?.assignmentMode || 'toda_empresa')
  const [selectedEmployees, setSelectedEmployees] = useState(initialDraft?.selectedEmployees || [])
  const [courseName, setCourseName] = useState(initialDraft?.courseName || '')
  const [courseDescription, setCourseDescription] = useState(initialDraft?.courseDescription || '')
  const [videos, setVideos] = useState(initialDraft?.videos?.length ? initialDraft.videos : [emptyVideo()])
  const [quizzes, setQuizzes] = useState(initialDraft?.quizzes || [])
  const [editingCourse, setEditingCourse] = useState(null)
  const [selectedCourseId, setSelectedCourseId] = useState(null)
  const [selectedContentKey, setSelectedContentKey] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(Boolean(initialDraft?.isModalOpen))
  const [isLoading, setIsLoading] = useState(true)
  const [isSaving, setIsSaving] = useState(false)
  const [busyVideoId, setBusyVideoId] = useState(null)
  const [busyQuestionId, setBusyQuestionId] = useState(null)
  const [chosenOptions, setChosenOptions] = useState({})
  const [progressRows, setProgressRows] = useState([])
  const [isLoadingProgress, setIsLoadingProgress] = useState(false)
  const [isProgressModalOpen, setIsProgressModalOpen] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [successMessage, setSuccessMessage] = useState('')
  const selectedCourse = courses.find((course) => course.id === selectedCourseId)
  const contentItems = useMemo(() => courseSequence(selectedCourse), [selectedCourse])
  const selectedContent = contentItems.find((item) => item.key === selectedContentKey) || contentItems[0]
  const selectedVideo = selectedContent?.type === 'video' ? selectedContent.video : null

  function contentItemUnlocked(index) {
    if (isAdmin || index === 0) return true
    return contentItemComplete(contentItems[index - 1])
  }
  const requiredCompleted = useMemo(() => selectedCourse?.videos.filter((video) => video.obligatorio && video.completado_en).length || 0, [selectedCourse])
  const requiredTotal = useMemo(() => selectedCourse?.videos.filter((video) => video.obligatorio).length || 0, [selectedCourse])
  const completedCount = useMemo(() => selectedCourse?.videos.filter((video) => video.completado_en).length || 0, [selectedCourse])

  const loadCourses = useCallback(async () => {
    setIsLoading(true); setErrorMessage('')
    try { setCourses(await listTrainingCourses(userId, isAdmin)) }
    catch (error) { setCourses([]); setErrorMessage(`No se pudieron cargar las capacitaciones. ${error.message} Ejecuta supabase/capacitaciones.sql en Supabase.`) }
    finally { setIsLoading(false) }
  }, [userId, isAdmin])
  useEffect(() => { loadCourses() }, [loadCourses])
  useEffect(() => {
    if (!isAdmin || !companyId) { setEmployees([]); return }
    let active = true
    listTrainingEmployees(companyId).then((rows) => { if (active) setEmployees(rows) }).catch((error) => { if (active) setErrorMessage(`No se pudieron cargar los empleados. ${error.message}`) })
    return () => { active = false }
  }, [isAdmin, companyId])

  useEffect(() => {
    if (!isAdmin || !selectedCourse) { setProgressRows([]); return }
    let active = true
    setIsLoadingProgress(true)
    listTrainingProgress(selectedCourse)
      .then((rows) => { if (active) setProgressRows(rows) })
      .catch((error) => { if (active) setProgressRows([]); setErrorMessage(`No se pudo cargar el avance. ${error.message}`) })
      .finally(() => { if (active) setIsLoadingProgress(false) })
    return () => { active = false }
  }, [isAdmin, selectedCourse])

  useEffect(() => {
    if (!draftKey || editingCourse) return
    try {
      window.sessionStorage.setItem(draftKey, JSON.stringify({
        companyId, assignmentMode, selectedEmployees, courseName, courseDescription, videos, quizzes,
        isModalOpen,
      }))
    } catch { /* Storage can be disabled by browser privacy settings. */ }
  }, [draftKey, editingCourse, companyId, assignmentMode, selectedEmployees, courseName, courseDescription, videos, quizzes, isModalOpen])

  function resetForm() {
    setEditingCourse(null); setCourseName(''); setCourseDescription(''); setCompanyId(companies[0]?.id ? String(companies[0].id) : '')
    setAssignmentMode('toda_empresa'); setSelectedEmployees([]); setVideos([emptyVideo()]); setQuizzes([])
  }
  function openCreate() { resetForm(); setErrorMessage(''); setIsModalOpen(true) }
  function openEdit(course) {
    try { if (draftKey) window.sessionStorage.removeItem(draftKey) } catch { /* Ignore blocked storage. */ }
    setEditingCourse(course); setCourseName(course.nombre); setCourseDescription(course.descripcion || '')
    setCompanyId(String(course.empresa_id)); setAssignmentMode(course.tipo_asignacion); setSelectedEmployees(course.asignados)
    const editVideos = course.videos.map((video) => ({ key: String(video.id), id: video.id, title: video.titulo, description: video.descripcion || '', url: video.enlace, required: video.obligatorio, active: video.activo }))
    setVideos(editVideos.length ? editVideos : [emptyVideo()])
    setQuizzes(course.cuestionarios.map((quiz) => ({
      title: quiz.titulo,
      videoIndex: quiz.video_id === null ? null : editVideos.findIndex((video) => String(video.id) === String(quiz.video_id)),
      questions: quiz.preguntas.map((question) => ({ prompt: question.enunciado, type: question.tipo, options: question.opciones.map((option) => ({ id: option.id, text: option.texto, correct: option.id === question.respuesta_correcta_id })) })),
    })))
    setErrorMessage(''); setIsModalOpen(true)
  }
  async function saveCourse(event) {
    event.preventDefault(); setErrorMessage(''); setSuccessMessage('')
    if (!companyId) return setErrorMessage('Selecciona una empresa.')
    if (assignmentMode === 'personas' && !selectedEmployees.length) return setErrorMessage('Selecciona al menos una persona.')
    if (!videos.length || videos.some((video) => !video.title.trim() || !videoEmbedUrl(video.url))) return setErrorMessage('Cada video debe tener título y enlace válido de YouTube, Vimeo o Google Drive.')
    if (quizzes.some((quiz) => !quiz.questions.length || quiz.questions.some((question) => !question.prompt.trim() || question.options.length < 2 || question.options.some((option) => !option.text.trim()) || question.options.filter((option) => option.correct).length !== 1))) return setErrorMessage('Cada cuestionario debe tener preguntas completas con opciones y exactamente una respuesta correcta.')
    if (editingCourse?.cuestionarios?.length && !window.confirm('Al guardar la edición se reemplazarán los cuestionarios y se reiniciarán los intentos anteriores. ¿Continuar?')) return
    setIsSaving(true)
    try {
      const payload = { name: courseName, description: courseDescription, companyId: Number(companyId), assignmentMode, employeeIds: selectedEmployees, videos, quizzes }
      if (editingCourse) await updateTrainingCourse({ ...payload, id: editingCourse.id })
      else await createTrainingCourse(payload)
      await loadCourses(); setIsModalOpen(false); resetForm()
      setSuccessMessage(editingCourse ? 'Capacitación actualizada.' : 'Capacitación publicada y asignada.')
    } catch (error) { setErrorMessage(`No se pudo guardar. ${error.message}`) }
    finally { setIsSaving(false) }
  }
  function moveVideo(index, direction) {
    const target = index + direction
    if (target < 0 || target >= videos.length) return
    const next = [...videos]; [next[index], next[target]] = [next[target], next[index]]; setVideos(next)
    setQuizzes((current) => current.map((quiz) => {
      if (quiz.videoIndex === index) return { ...quiz, videoIndex: target }
      if (direction < 0 && quiz.videoIndex >= target && quiz.videoIndex < index) return { ...quiz, videoIndex: quiz.videoIndex + 1 }
      if (direction > 0 && quiz.videoIndex > index && quiz.videoIndex <= target) return { ...quiz, videoIndex: quiz.videoIndex - 1 }
      return quiz
    }))
  }
  function addQuiz(videoIndex) {
    setQuizzes((current) => current.some((quiz) => quiz.videoIndex === videoIndex) ? current.map((quiz) => quiz.videoIndex === videoIndex ? { ...quiz, questions: [...quiz.questions, emptyQuestion()] } : quiz) : [...current, emptyQuiz(videoIndex)])
  }
  function patchQuestion(quizIndex, questionIndex, update) { setQuizzes((current) => current.map((quiz, qIndex) => qIndex !== quizIndex ? quiz : { ...quiz, questions: quiz.questions.map((question, pIndex) => pIndex === questionIndex ? { ...question, ...update } : question) })) }
  function patchOption(quizIndex, questionIndex, optionIndex, update) { setQuizzes((current) => current.map((quiz, qIndex) => qIndex !== quizIndex ? quiz : { ...quiz, questions: quiz.questions.map((question, pIndex) => pIndex !== questionIndex ? question : { ...question, options: question.options.map((option, oIndex) => oIndex === optionIndex ? { ...option, ...update } : option) }) })) }
  async function toggleCompletion(video) {
    if (isAdmin || !userId) return
    if (video.completado_en) return
    setBusyVideoId(video.id); setErrorMessage('')
    try {
      await setTrainingVideoCompleted(video.id, userId, true)
      setCourses((current) => current.map((course) => course.id === selectedCourse.id ? { ...course, videos: course.videos.map((item) => item.id === video.id ? { ...item, completado_en: new Date().toISOString() } : item) } : course))
    } catch (error) { setErrorMessage(`No se pudo guardar el progreso. ${error.message}`) }
    finally { setBusyVideoId(null) }
  }
  async function answerQuestion(question, optionId) {
    if (question.progreso?.correcta) return
    setBusyQuestionId(question.id); setErrorMessage('')
    try {
      const correct = await submitTrainingAnswer(question.id, optionId)
      setCourses((current) => current.map((course) => course.id !== selectedCourse.id ? course : { ...course, cuestionarios: course.cuestionarios.map((quiz) => ({ ...quiz, preguntas: quiz.preguntas.map((item) => item.id === question.id ? { ...item, progreso: { correcta: correct, opcion_actual_id: optionId, intentos: (item.progreso?.intentos || 0) + 1 } } : item) })) }))
    } catch (error) { setErrorMessage(`No se pudo validar la respuesta. ${error.message}`) }
    finally { setBusyQuestionId(null) }
  }

  function renderQuizQuestions(quiz) {
    if (!quiz?.preguntas.length) return null
    return <section className="training-quiz-panel"><h3>{quiz.titulo}</h3>{quiz.preguntas.map((question, index) => <article className="training-quiz-question" key={question.id}>
      <strong>{index + 1}. {question.enunciado}</strong>
      <div className="training-quiz-options">{question.opciones.map((option) => {
        const selected = Number(chosenOptions[question.id] ?? question.progreso?.opcion_actual_id) === option.id
        const optionClass = question.progreso?.correcta && selected ? 'training-option-correct' : question.progreso?.intentos > 0 && selected ? 'training-option-incorrect' : selected ? 'training-option-selected' : ''
        return <label className={optionClass} key={option.id}>
        <input type="radio" name={`question-${question.id}`} checked={selected} disabled={question.progreso?.correcta || busyQuestionId === question.id} onChange={() => { setChosenOptions((current) => ({ ...current, [question.id]: option.id })); answerQuestion(question, option.id) }} />{option.texto}
      </label>})}</div>
      {busyQuestionId === question.id && <small className="training-answer-retry">Validando respuesta…</small>}
      {question.progreso?.correcta ? <p className="training-answer-correct"><CheckCircle2 size={15} /> ¡Correcto! Se desbloqueó el siguiente módulo.</p> : question.progreso?.intentos > 0 && <small className="training-answer-retry">Esa opción no es correcta. Selecciona otra para volver a intentarlo.</small>}
    </article>)}</section>
  }

  return <section className="training-center">
    {selectedCourse ? <>
      <button type="button" className="secondary-button training-back-button" onClick={() => { setSelectedCourseId(null); setSelectedContentKey(null); setErrorMessage('') }}><ArrowLeft size={15} /> Todas las capacitaciones</button>
      <div className="training-course-heading" style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}><div><p className="eyebrow">CAPACITACIÓN · {selectedCourse.videos.length} VIDEOS</p><h1>{selectedCourse.nombre}<span>.</span></h1><p>{selectedCourse.descripcion}</p></div>{isAdmin && <button type="button" className="secondary-button" style={{ marginLeft: 'auto', flexShrink: 0 }} onClick={() => setIsProgressModalOpen(true)}><ClipboardCheck size={15} style={{ color: '#c2410c' }} /> Ver avance de participantes</button>}</div>
      {!isAdmin && <div className="training-progress-summary"><div><strong>{requiredCompleted} de {requiredTotal}</strong><span>videos obligatorios completados</span></div><div className="training-progress-track"><span style={{ width: `${requiredTotal ? Math.round(requiredCompleted / requiredTotal * 100) : 100}%` }} /></div><small>{completedCount} de {selectedCourse.videos.length} videos vistos</small></div>}
      {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}
      <div className="training-player-layout"><nav className="training-lesson-list" aria-label="Secuencia de la capacitación"><h2>Contenido de la capacitación</h2>{contentItems.map((item, index) => {
        const locked = !contentItemUnlocked(index)
        const done = contentItemComplete(item)
        const title = item.type === 'video' ? item.video.titulo : item.final ? item.quiz.titulo : `Preguntas: ${item.video.titulo}`
        return <button type="button" className={`training-lesson-link ${selectedContent?.key === item.key ? 'training-lesson-active' : ''} ${locked ? 'training-lesson-locked' : ''}`} key={item.key} disabled={locked} onClick={() => setSelectedContentKey(item.key)}><span className="training-lesson-number">{locked ? <LockKeyhole size={15} /> : done ? <CheckCircle2 size={17} /> : item.type === 'video' ? <Video size={15} /> : <ClipboardCheck size={15} />}</span><span><strong>{title}</strong><small>{item.type === 'video' ? `Video ${item.index + 1} · ${item.video.obligatorio ? 'Obligatorio' : 'Complementario'}` : item.final ? 'Evaluación final' : 'Cuestionario del video'}</small></span></button>
      })}</nav>
        <article className="training-player-panel">
          {selectedVideo ? <><TrainingVideoFrame lesson={selectedVideo} /><div className="training-current-video"><div><p className="eyebrow">VIDEO {selectedContent.index + 1} · {selectedVideo.obligatorio ? 'OBLIGATORIO' : 'COMPLEMENTARIO'}</p><h2>{selectedVideo.titulo}</h2>{selectedVideo.descripcion && <p>{selectedVideo.descripcion}</p>}</div>{!isAdmin && <button type="button" className={selectedVideo.completado_en ? 'secondary-button training-complete-button' : 'primary-button'} disabled={Boolean(selectedVideo.completado_en) || busyVideoId === selectedVideo.id} onClick={() => toggleCompletion(selectedVideo)}>{selectedVideo.completado_en ? <><CheckCircle2 size={15} /> Video completado</> : <><Check size={15} /> {busyVideoId === selectedVideo.id ? 'Guardando…' : 'Marcar video como visto'}</>}</button>}</div>{!isAdmin && !selectedVideo.completado_en && <p className="training-sequence-hint">Marca este video como visto para desbloquear su cuestionario y continuar.</p>}</>
            : selectedContent?.type === 'quiz' ? <><div className="training-quiz-module-heading"><span className="training-course-icon"><ClipboardCheck size={20} /></span><div><p className="eyebrow">{selectedContent.final ? 'EVALUACIÓN FINAL' : 'MÓDULO DE PREGUNTAS'}</p><h2>{selectedContent.quiz.titulo}</h2><p>{selectedContent.final ? 'Responde correctamente para terminar la capacitación.' : `Responde correctamente para desbloquear el siguiente video: ${selectedContent.video.titulo}.`}</p></div></div>{isAdmin ? <div className="empty-state">Vista previa del cuestionario. Las respuestas se muestran en la cuenta del participante.</div> : renderQuizQuestions(selectedContent.quiz)}</>
              : <div className="empty-state">Esta capacitación no tiene contenido activo.</div>}
        </article>
      </div>
    </> : <>
      <div className="training-page-heading"><div><p className="eyebrow">GESTIÓN DE FORMACIÓN</p><h1>{isAdmin ? 'Capacitaciones' : 'Mis capacitaciones'}<span>.</span></h1><p className="welcome-copy">{isAdmin ? 'Organiza los videos, define cuestionarios y asigna cursos a empresas o personas.' : 'Consulta tus cursos asignados y registra el avance de cada video.'}</p></div>{isAdmin && <button type="button" className="primary-button" onClick={openCreate}><Plus size={16} /> Crear capacitación</button>}</div>
      {errorMessage && <p className="database-alert" role="alert">{errorMessage}</p>}{successMessage && <p className="template-success" role="status">{successMessage}</p>}
      {isLoading ? <div className="empty-state">Cargando capacitaciones...</div> : courses.length ? <div className="training-course-list">{courses.map((course) => {
        const mandatory = course.videos.filter((video) => video.obligatorio).length; const done = course.videos.filter((video) => video.obligatorio && video.completado_en).length; const companyName = companies.find((company) => String(company.id) === String(course.empresa_id))?.name
        return <article className="training-course-card" key={course.id}><button type="button" className="training-course-open" onClick={() => { setSelectedCourseId(course.id); setSelectedContentKey(courseSequence(course)[0]?.key || null); setErrorMessage(''); setSuccessMessage('') }}><span className="training-course-icon"><GraduationCap size={20} /></span><span className="training-course-copy"><strong>{course.nombre}</strong><small>{companyName || `Empresa ${course.empresa_id}`} · {course.videos.length} videos</small><small>{course.tipo_asignacion === 'toda_empresa' ? 'Asignada a toda la empresa' : `Asignada a ${course.asignados.length} personas`}</small>{!isAdmin && <small>{done} / {mandatory} obligatorios completados</small>}</span><span className="training-course-arrow"><PlayCircle size={19} /></span></button>{isAdmin && <button type="button" className="secondary-button training-edit-button" onClick={() => openEdit(course)}><Pencil size={14} /> Editar</button>}</article>
      })}</div> : <div className="empty-state"><GraduationCap size={23} /><strong>{isAdmin ? 'Aún no hay capacitaciones' : 'No tienes capacitaciones asignadas'}</strong><span>{isAdmin ? 'Crea una capacitación para comenzar a compartir videos.' : 'Cuando tu administrador te asigne cursos, aparecerán aquí.'}</span></div>}
    </>}

    {isProgressModalOpen && selectedCourse && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setIsProgressModalOpen(false) }}><section className="document-modal training-modal" role="dialog" aria-modal="true" aria-label="Avance de participantes"><div className="modal-heading"><div><p className="eyebrow">SEGUIMIENTO</p><h2>Avance de participantes</h2></div><button type="button" className="icon-button" aria-label="Cerrar" onClick={() => setIsProgressModalOpen(false)}>×</button></div>
      {isLoadingProgress ? <p>Cargando avance…</p> : progressRows.length ? (
        <table className="document-preview-table">
          <thead><tr><th>Persona</th><th>Videos vistos</th><th>Avance videos</th><th>Preguntas correctas</th><th>Avance preguntas</th></tr></thead>
          <tbody>{progressRows.map((row) => (
            <tr key={row.cedula}>
              <td><strong>{row.nombre}</strong><br /><small>{row.cargo || row.correo || row.cedula}{row.tiene_cuenta ? '' : ' · sin cuenta'}</small><br /><small>{row.empresa}</small></td>
              <td>{row.videos_vistos} / {row.videos_total}</td>
              <td><div className="training-progress-track"><span style={{ width: `${row.videos_porcentaje}%` }} /></div> {row.videos_porcentaje}%</td>
              <td>{row.preguntas_correctas} / {row.preguntas_total}</td>
              <td>{row.preguntas_total ? `${row.preguntas_porcentaje}%` : 'Sin preguntas'}</td>
            </tr>
          ))}</tbody>
        </table>
      ) : <p>No hay personas asignadas a esta capacitación.</p>}
    </section></div>}

    {isModalOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !isSaving) setIsModalOpen(false) }}><section className="document-modal training-modal" role="dialog" aria-modal="true" aria-labelledby="new-training-title"><div className="modal-heading"><div><p className="eyebrow">{editingCourse ? 'EDITAR CURSO' : 'NUEVO CURSO'}</p><h2 id="new-training-title">{editingCourse ? 'Editar capacitación' : 'Crear capacitación'}</h2></div><button type="button" className="icon-button" disabled={isSaving} aria-label="Cerrar formulario" onClick={() => setIsModalOpen(false)}>×</button></div><p className="modal-copy">Administra los videos y agrega preguntas después de cada uno o al final de la capacitación.</p>
      <form className="document-modal-form training-form" onSubmit={saveCourse}>
        <label className="form-field">Nombre<input required maxLength={180} value={courseName} onChange={(event) => setCourseName(event.target.value)} /></label>
        <label className="form-field">Descripción<textarea rows={3} maxLength={3000} value={courseDescription} onChange={(event) => setCourseDescription(event.target.value)} /></label>
        <label className="form-field">Empresa<select required value={companyId} disabled={!!editingCourse} onChange={(event) => { setCompanyId(event.target.value); setSelectedEmployees([]) }}><option value="">Selecciona una empresa</option>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <fieldset className="training-assignment-field"><legend>Asignar a</legend><label><input type="radio" name="training-assignment" checked={assignmentMode === 'toda_empresa'} onChange={() => setAssignmentMode('toda_empresa')} /> Toda la empresa</label><label><input type="radio" name="training-assignment" checked={assignmentMode === 'personas'} onChange={() => setAssignmentMode('personas')} /> Personas seleccionadas</label>{assignmentMode === 'personas' && <div className="training-employee-list">{employees.map((employee) => <label key={employee.cedula}><input type="checkbox" checked={selectedEmployees.includes(employee.cedula)} onChange={() => setSelectedEmployees((current) => current.includes(employee.cedula) ? current.filter((id) => id !== employee.cedula) : [...current, employee.cedula])} /><span>{employeeName(employee)}</span><small>{employee.cargo || employee.correo || employee.cedula}</small></label>)}</div>}</fieldset>
        <fieldset className="training-videos-field"><legend>Videos en orden</legend>{videos.map((video, index) => <article className={`training-video-editor ${video.active === false ? 'training-video-hidden' : ''}`} key={video.key}><div className="training-video-editor-heading"><strong><Video size={15} /> Video {index + 1} {video.active === false && '(oculto)'}</strong><div><button type="button" className="icon-button" aria-label="Subir video" disabled={index === 0} onClick={() => moveVideo(index, -1)}><ArrowUp size={15} /></button><button type="button" className="icon-button" aria-label="Bajar video" disabled={index === videos.length - 1} onClick={() => moveVideo(index, 1)}><ArrowDown size={15} /></button><button type="button" className="icon-button" aria-label={video.active === false ? 'Mostrar video' : 'Ocultar video'} onClick={() => setVideos((current) => current.map((item, i) => i === index ? { ...item, active: item.active === false } : item))}>{video.active === false ? <Eye size={15} /> : <EyeOff size={15} />}</button>{videos.length > 1 && <button type="button" className="icon-button" aria-label="Quitar video" onClick={() => { setVideos((current) => current.filter((_, i) => i !== index)); setQuizzes((current) => current.filter((quiz) => quiz.videoIndex !== index).map((quiz) => quiz.videoIndex > index ? { ...quiz, videoIndex: quiz.videoIndex - 1 } : quiz)) }}><Trash2 size={15} /></button>}</div></div><label className="form-field">Título<input required value={video.title} onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, title: event.target.value } : item))} /></label><label className="form-field">Enlace<input required type="url" value={video.url} onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="YouTube, Vimeo o Google Drive" /></label>{video.url && !videoEmbedUrl(video.url) && <small className="training-link-warning">Enlace no compatible.</small>}<label className="form-field">Descripción<textarea rows={2} value={video.description} onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} /></label><label className="training-required-toggle"><input type="checkbox" checked={video.required} onChange={(event) => setVideos((current) => current.map((item, i) => i === index ? { ...item, required: event.target.checked } : item))} /> Obligatorio</label>
          {(() => { const qi = quizzes.findIndex((quiz) => quiz.videoIndex === index); return qi < 0 ? <button type="button" className="secondary-button" onClick={() => addQuiz(index)}><Plus size={14} /> Agregar cuestionario después del video</button> : <QuizEditor quiz={quizzes[qi]} quizIndex={qi} patchQuestion={patchQuestion} patchOption={patchOption} setQuizzes={setQuizzes} /> })()}
        </article>)}<button type="button" className="secondary-button" onClick={() => setVideos((current) => [...current, emptyVideo()])}><Plus size={14} /> Agregar video</button>
          {(() => { const qi = quizzes.findIndex((quiz) => quiz.videoIndex === null); return qi < 0 ? <button type="button" className="secondary-button" onClick={() => addQuiz(null)}><Plus size={14} /> Agregar cuestionario final</button> : <QuizEditor quiz={quizzes[qi]} quizIndex={qi} patchQuestion={patchQuestion} patchOption={patchOption} setQuizzes={setQuizzes} /> })()}
        </fieldset>
        {editingCourse?.cuestionarios?.length > 0 && <small className="training-link-warning">Al modificar cuestionarios se reiniciarán las respuestas y los intentos previos.</small>}
        {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}<div className="modal-actions"><button type="button" className="secondary-button" disabled={isSaving} onClick={() => setIsModalOpen(false)}>Cancelar</button><button className="primary-button" disabled={isSaving || !companies.length}><GraduationCap size={16} />{isSaving ? 'Guardando…' : editingCourse ? 'Guardar cambios' : 'Publicar capacitación'}</button></div>
      </form></section></div>}
  </section>
}

function QuizEditor({ quiz, quizIndex, patchQuestion, patchOption, setQuizzes }) {
  return <section className="training-quiz-editor"><div className="training-quiz-editor-heading"><strong>{quiz.videoIndex === null ? 'Cuestionario final' : 'Preguntas de este video'}</strong><label>Nombre<input value={quiz.title} onChange={(event) => setQuizzes((current) => current.map((item, index) => index === quizIndex ? { ...item, title: event.target.value } : item))} /></label></div>
    {quiz.questions.map((question, questionIndex) => <article className="training-quiz-question-editor" key={questionIndex}><div className="training-question-title"><strong>Pregunta {questionIndex + 1}</strong><button type="button" className="icon-button" aria-label="Eliminar pregunta" onClick={() => setQuizzes((current) => current.map((item, index) => index === quizIndex ? { ...item, questions: item.questions.filter((_, i) => i !== questionIndex) } : item))}><Trash2 size={14} /></button></div><label className="form-field">Pregunta<textarea required rows={2} value={question.prompt} onChange={(event) => patchQuestion(quizIndex, questionIndex, { prompt: event.target.value })} /></label><label className="form-field">Tipo<select value={question.type} onChange={(event) => patchQuestion(quizIndex, questionIndex, { ...emptyQuestion(event.target.value), prompt: question.prompt })}><option value="opcion_multiple">Opción múltiple</option><option value="verdadero_falso">Verdadero o falso</option></select></label>{question.options.map((option, optionIndex) => <div className={`training-option-editor ${option.correct ? 'training-option-editor-correct' : ''}`} key={optionIndex}><input aria-label={`Opción ${optionIndex + 1}`} required value={option.text} disabled={question.type === 'verdadero_falso'} onChange={(event) => patchOption(quizIndex, questionIndex, optionIndex, { text: event.target.value })} placeholder={`Opción ${optionIndex + 1}`} /><label><input type="radio" name={`correct-${quizIndex}-${questionIndex}`} checked={option.correct} onChange={() => patchQuestion(quizIndex, questionIndex, { options: question.options.map((item, index) => ({ ...item, correct: index === optionIndex })) })} /> Correcta</label>{question.type === 'opcion_multiple' && question.options.length > 2 && <button type="button" className="icon-button" aria-label="Quitar opción" onClick={() => setQuizzes((current) => current.map((quizItem, i) => i !== quizIndex ? quizItem : { ...quizItem, questions: quizItem.questions.map((q, j) => j !== questionIndex ? q : { ...q, options: q.options.filter((_, k) => k !== optionIndex) }) }))}><Trash2 size={13} /></button>}</div>)}{question.type === 'opcion_multiple' && <button type="button" className="secondary-button" onClick={() => setQuizzes((current) => current.map((item, index) => index === quizIndex ? { ...item, questions: item.questions.map((q, i) => i === questionIndex ? { ...q, options: [...q.options, { text: '', correct: false }] } : q) } : item))}><Plus size={13} /> Agregar opción</button>}</article>)}<button type="button" className="secondary-button" onClick={() => setQuizzes((current) => current.map((item, index) => index === quizIndex ? { ...item, questions: [...item.questions, emptyQuestion()] } : item))}><Plus size={13} /> Agregar pregunta</button>
  </section>
}

export default TrainingCenter
