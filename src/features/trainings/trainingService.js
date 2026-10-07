import { supabase } from '../../lib/supabase'

function db() {
  if (!supabase) throw new Error('La conexión a Supabase no está configurada.')
  return supabase
}

export async function listTrainingCourses(userId, isAdmin = false) {
  const client = db()
  const { data: courses, error } = await client.from('capacitacion')
    .select('id, fecha_creacion, nombre, descripcion, empresa_id, tipo_asignacion, estado')
    .order('fecha_creacion', { ascending: false })
  if (error) throw new Error(error.message)
  if (!courses?.length) return []
  const ids = courses.map((course) => course.id)
  const [{ data: videos, error: videoError }, { data: assignments, error: assignmentError }, { data: progress, error: progressError }, { data: quizzes, error: quizError }] = await Promise.all([
    client.from('video_capacitacion').select('id, capacitacion_id, titulo, descripcion, enlace, orden, obligatorio, activo').in('capacitacion_id', ids).order('orden', { ascending: true }),
    client.from('asignacion_capacitacion').select('capacitacion_id, trabajador_cedula').in('capacitacion_id', ids),
    userId ? client.from('progreso_video_capacitacion').select('video_id, completado_en').eq('usuario_id', userId) : Promise.resolve({ data: [], error: null }),
    client.from('cuestionario_capacitacion').select('id, capacitacion_id, video_id, titulo').in('capacitacion_id', ids),
  ])
  for (const issue of [videoError, assignmentError, progressError, quizError]) if (issue) throw new Error(issue.message)
  const quizIds = (quizzes || []).map((quiz) => quiz.id)
  let questions = []; let options = []; let questionProgress = []; let answerKeys = []
  if (quizIds.length) {
    const questionResult = await client.from('pregunta_capacitacion').select('id, cuestionario_id, enunciado, tipo, orden').in('cuestionario_id', quizIds).order('orden')
    if (questionResult.error) throw new Error(questionResult.error.message)
    questions = questionResult.data || []
    const questionIds = questions.map((question) => question.id)
    if (questionIds.length) {
      const [{ data: optionRows, error: optionError }, progressResult, keyResult] = await Promise.all([
        client.from('opcion_pregunta_capacitacion').select('id, pregunta_id, texto, orden').in('pregunta_id', questionIds).order('orden'),
        userId ? client.from('progreso_pregunta_capacitacion').select('pregunta_id, opcion_actual_id, intentos, correcta').eq('usuario_id', userId) : Promise.resolve({ data: [], error: null }),
        isAdmin ? client.from('clave_pregunta_capacitacion').select('pregunta_id, opcion_id').in('pregunta_id', questionIds) : Promise.resolve({ data: [], error: null }),
      ])
      if (optionError) throw new Error(optionError.message)
      if (progressResult.error) throw new Error(progressResult.error.message)
      if (keyResult.error) throw new Error(keyResult.error.message)
      options = optionRows || []; questionProgress = progressResult.data || []; answerKeys = keyResult.data || []
    }
  }
  const completed = new Map((progress || []).map((row) => [row.video_id, row.completado_en]))
  const answers = new Map(questionProgress.map((row) => [row.pregunta_id, row]))
  return courses.map((course) => ({
    ...course,
    videos: (videos || []).filter((video) => video.capacitacion_id === course.id && (isAdmin || video.activo)).map((video) => ({ ...video, completado_en: completed.get(video.id) || null })),
    asignados: (assignments || []).filter((row) => row.capacitacion_id === course.id).map((row) => row.trabajador_cedula),
    cuestionarios: (quizzes || []).filter((quiz) => quiz.capacitacion_id === course.id && (isAdmin || quiz.video_id === null || (videos || []).some((video) => String(video.id) === String(quiz.video_id) && video.activo))).map((quiz) => ({
      ...quiz,
      preguntas: questions.filter((question) => question.cuestionario_id === quiz.id).map((question) => ({
        ...question,
        opciones: options.filter((option) => option.pregunta_id === question.id),
        progreso: answers.get(question.id) || null,
        respuesta_correcta_id: answerKeys.find((key) => key.pregunta_id === question.id)?.opcion_id || null,
      })),
    })),
  }))
}

export async function listTrainingEmployees(companyId) {
  const { data, error } = await db().from('empleado')
    .select('cedula, nombre_completo, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, correo, cargo')
    .eq('id_empresa', companyId).order('primer_nombre', { ascending: true })
  if (error) throw new Error(error.message)
  return data || []
}

function videoPayload(video, courseId, index) {
  return { ...(video.id ? { id: video.id } : {}), capacitacion_id: courseId, titulo: video.title.trim(), descripcion: video.description.trim() || null, enlace: video.url.trim(), orden: index + 1, obligatorio: video.required, activo: video.active !== false }
}

async function addCourseContent(client, courseId, videos, quizzes) {
  const inserted = await client.from('video_capacitacion').insert(videos.map((video, index) => videoPayload(video, courseId, index))).select('id')
  if (inserted.error) throw new Error(inserted.error.message)
  const videoIds = inserted.data.map((row) => row.id)
  await saveQuizzes(client, courseId, quizzes, videoIds, videos)
}

async function saveQuizzes(client, courseId, quizzes, videoIds, videos) {
  for (const quiz of quizzes || []) {
    const videoId = quiz.videoIndex === null ? null : (videos[quiz.videoIndex]?.id || videoIds[quiz.videoIndex])
    const { data: savedQuiz, error: quizError } = await client.from('cuestionario_capacitacion').insert({ capacitacion_id: courseId, video_id: videoId, titulo: quiz.title || 'Cuestionario' }).select('id').single()
    if (quizError) throw new Error(quizError.message)
    for (const [questionIndex, question] of quiz.questions.entries()) {
      const { data: savedQuestion, error: questionError } = await client.from('pregunta_capacitacion').insert({ cuestionario_id: savedQuiz.id, enunciado: question.prompt.trim(), tipo: question.type, orden: questionIndex + 1 }).select('id').single()
      if (questionError) throw new Error(questionError.message)
      const choices = await client.from('opcion_pregunta_capacitacion').insert(question.options.map((option, optionIndex) => ({ pregunta_id: savedQuestion.id, texto: option.text.trim(), orden: optionIndex + 1 }))).select('id')
      if (choices.error) throw new Error(choices.error.message)
      const correctIndex = question.options.findIndex((option) => option.correct)
      const { error: keyError } = await client.from('clave_pregunta_capacitacion').insert({ pregunta_id: savedQuestion.id, opcion_id: choices.data[correctIndex].id })
      if (keyError) throw new Error(keyError.message)
    }
  }
}

export async function createTrainingCourse({ name, description, companyId, assignmentMode, employeeIds, videos, quizzes = [] }) {
  const client = db()
  const { data: authData } = await client.auth.getUser()
  const { data: course, error } = await client.from('capacitacion').insert({ nombre: name.trim(), descripcion: description.trim(), empresa_id: companyId, tipo_asignacion: assignmentMode, estado: 'Publicada', creado_por: authData.user?.id }).select('id').single()
  if (error) throw new Error(error.message)
  try {
    if (assignmentMode === 'personas') {
      const { error: assignmentError } = await client.from('asignacion_capacitacion').insert(employeeIds.map((cedula) => ({ capacitacion_id: course.id, trabajador_cedula: cedula })))
      if (assignmentError) throw new Error(assignmentError.message)
    }
    await addCourseContent(client, course.id, videos, quizzes)
  } catch (error) {
    await client.from('capacitacion').delete().eq('id', course.id)
    throw error
  }
  return course.id
}

export async function updateTrainingCourse({ id, name, description, assignmentMode, employeeIds, videos, quizzes = [] }) {
  const client = db()
  const { error: courseError } = await client.from('capacitacion').update({ nombre: name.trim(), descripcion: description.trim(), tipo_asignacion: assignmentMode }).eq('id', id)
  if (courseError) throw new Error(courseError.message)
  const { error: deleteAssignmentsError } = await client.from('asignacion_capacitacion').delete().eq('capacitacion_id', id)
  if (deleteAssignmentsError) throw new Error(deleteAssignmentsError.message)
  if (assignmentMode === 'personas' && employeeIds.length) {
    const { error } = await client.from('asignacion_capacitacion').insert(employeeIds.map((cedula) => ({ capacitacion_id: id, trabajador_cedula: cedula })))
    if (error) throw new Error(error.message)
  }
  // Se apartan los órdenes para evitar choques con la restricción única al reordenar.
  const existingIds = videos.filter((video) => video.id).map((video) => video.id)
  for (const [index, videoId] of existingIds.entries()) {
    const { error } = await client.from('video_capacitacion').update({ orden: 1000000 + index }).eq('id', videoId)
    if (error) throw new Error(error.message)
  }
  for (const [index, video] of videos.entries()) {
    const payload = videoPayload(video, id, index)
    const result = video.id
      ? await client.from('video_capacitacion').update(payload).eq('id', video.id)
      : await client.from('video_capacitacion').insert(payload).select('id').single()
    if (result.error) throw new Error(result.error.message)
    video.id ||= result.data?.id
  }
  const { error: hideError } = await client.from('video_capacitacion').update({ activo: false }).eq('capacitacion_id', id).not('id', 'in', `(${videos.filter((video) => video.id).map((video) => video.id).join(',') || '0'})`)
  if (hideError) throw new Error(hideError.message)
  // Reemplazar el cuestionario borra sus intentos anteriores: se informa antes desde la interfaz.
  const { error: deleteQuizError } = await client.from('cuestionario_capacitacion').delete().eq('capacitacion_id', id)
  if (deleteQuizError) throw new Error(deleteQuizError.message)
  await saveQuizzes(client, id, quizzes, videos.map((video) => video.id), videos)
}

export async function listTrainingProgress(course) {
  const client = db()
  const [{ data: users, error: usersError }, { data: employees, error: employeesError }] = await Promise.all([
    client.from('usuario').select('cedula, auth_user_id').eq('id_empresa', course.empresa_id),
    client.from('empleado').select('cedula, nombre_completo, primer_nombre, segundo_nombre, primer_apellido, segundo_apellido, correo, cargo, empresa').eq('id_empresa', course.empresa_id),
  ])
  if (usersError) throw new Error(usersError.message)
  if (employeesError) throw new Error(employeesError.message)

  const assignedCedula = course.tipo_asignacion === 'personas' ? new Set(course.asignados) : null
  const rows = (employees || []).filter((employee) => !assignedCedula || assignedCedula.has(employee.cedula))
  const userByCedula = new Map((users || []).map((user) => [user.cedula, user]))
  const activeVideos = course.videos.filter((video) => video.activo !== false)
  const videoIds = activeVideos.map((video) => video.id)
  const questionIds = course.cuestionarios.flatMap((quiz) => quiz.preguntas.map((question) => question.id))
  const userIds = rows.map((employee) => userByCedula.get(employee.cedula)?.auth_user_id).filter(Boolean)

  let videoProgress = []
  let questionProgress = []
  if (userIds.length && videoIds.length) {
    const { data, error } = await client.from('progreso_video_capacitacion').select('video_id, usuario_id, completado_en').in('usuario_id', userIds).in('video_id', videoIds)
    if (error) throw new Error(error.message)
    videoProgress = data || []
  }
  if (userIds.length && questionIds.length) {
    const { data, error } = await client.from('progreso_pregunta_capacitacion').select('pregunta_id, usuario_id, correcta').in('usuario_id', userIds).in('pregunta_id', questionIds)
    if (error) throw new Error(error.message)
    questionProgress = data || []
  }

  return rows.map((employee) => {
    const authUserId = userByCedula.get(employee.cedula)?.auth_user_id || null
    const watched = videoIds.length && authUserId
      ? videoProgress.filter((row) => row.usuario_id === authUserId && row.completado_en).length
      : 0
    const correct = questionIds.length && authUserId
      ? questionProgress.filter((row) => row.usuario_id === authUserId && row.correcta).length
      : 0
    return {
      cedula: employee.cedula,
      nombre: employeeNameLocal(employee),
      correo: employee.correo || '',
      cargo: employee.cargo || '',
      empresa: employee.empresa || '',
      tiene_cuenta: Boolean(authUserId),
      videos_vistos: watched,
      videos_total: activeVideos.length,
      videos_porcentaje: activeVideos.length ? Math.round((watched / activeVideos.length) * 100) : 0,
      preguntas_correctas: correct,
      preguntas_total: questionIds.length,
      preguntas_porcentaje: questionIds.length ? Math.round((correct / questionIds.length) * 100) : 0,
    }
  })
}

function employeeNameLocal(employee) {
  return employee.nombre_completo || [employee.primer_nombre, employee.segundo_nombre, employee.primer_apellido, employee.segundo_apellido].filter(Boolean).join(' ') || employee.cedula
}

export async function submitTrainingAnswer(questionId, optionId) {
  const { data, error } = await db().rpc('responder_pregunta_capacitacion', { p_pregunta_id: questionId, p_opcion_id: optionId })
  if (error) throw new Error(error.message)
  return data === true
}

export async function setTrainingVideoCompleted(videoId, userId, completed) {
  const client = db()
  if (completed) {
    const { error } = await client.from('progreso_video_capacitacion').upsert({ video_id: videoId, usuario_id: userId }, { onConflict: 'video_id,usuario_id' })
    if (error) throw new Error(error.message)
  } else {
    const { error } = await client.from('progreso_video_capacitacion').delete().eq('video_id', videoId).eq('usuario_id', userId)
    if (error) throw new Error(error.message)
  }
}
