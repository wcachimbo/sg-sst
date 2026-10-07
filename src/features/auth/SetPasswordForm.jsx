import { useState } from 'react'
import { Eye, EyeOff, LockKeyhole } from 'lucide-react'
import { supabase } from '../../lib/supabase'

function SetPasswordForm() {
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isComplete, setIsComplete] = useState(false)
  const [showPassword, setShowPassword] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    if (password.length < 10) {
      setErrorMessage('La contraseña debe tener al menos 10 caracteres.')
      return
    }
    if (password !== confirmation) {
      setErrorMessage('Las contraseñas no coinciden.')
      return
    }
    if (!supabase) {
      setErrorMessage('No se pudo conectar con Supabase.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data: { user }, error: userError } = await supabase.auth.getUser()
      if (userError || !user) {
        throw new Error('El enlace de invitación venció o ya no es válido. Solicita una nueva invitación al administrador.')
      }

      const { error } = await supabase.auth.updateUser({
        password,
        data: { ...user.user_metadata, needs_password_setup: false },
      })
      if (error) throw error

      setIsComplete(true)
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo guardar la contraseña. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="password-setup">
      <form className="login-form" onSubmit={handleSubmit}>
        <div className="login-heading">
          <p className="eyebrow">PRIMER ACCESO</p>
          <h1>Define tu contraseña</h1>
          <p>Elige una contraseña segura de al menos 10 caracteres para acceder al sistema.</p>
        </div>
        {isComplete ? (
          <p className="password-setup-success" role="status">Contraseña creada. Ya puedes usar tu cuenta.</p>
        ) : (
          <>
            <label className="login-field" htmlFor="new-password">Nueva contraseña
              <span className="password-input-wrap">
                <input id="new-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} required value={password} onChange={(event) => setPassword(event.target.value)} />
                <button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((visible) => !visible)}>
                  {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </span>
            </label>
            <label className="login-field" htmlFor="confirm-password">Confirmar contraseña
              <input id="confirm-password" type={showPassword ? 'text' : 'password'} autoComplete="new-password" minLength={10} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
            </label>
            {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
            <button className="login-submit" type="submit" disabled={isSubmitting}><LockKeyhole size={17} /> {isSubmitting ? 'Guardando...' : 'Guardar contraseña'}</button>
          </>
        )}
      </form>
    </main>
  )
}

export default SetPasswordForm
