import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createEmployee } from './employeeService'

const initialEmployee = {
  primer_nombre: '',
  segundo_nombre: '',
  primer_apellido: '',
  segundo_apellido: '',
  cedula: '',
  cargo: '',
  area: '',
  correo: '',
  celular: '',
  telefono: '',
  extesion: '',
  tipo_vinculacion: '',
  rol: 'basico',
  companyId: '',
}

const vinculationTypes = [
  'Término indefinido',
  'Término fijo',
  'Obra o labor',
  'Prestación de servicios',
  'Aprendizaje',
  'Otro',
]

function getFullName(employee) {
  return [
    employee.primer_nombre,
    employee.segundo_nombre,
    employee.primer_apellido,
    employee.segundo_apellido,
  ].map((part) => part.trim()).filter(Boolean).join(' ')
}

function EmployeeForm({ companies, onCancel, onCreated }) {
  const [employee, setEmployee] = useState(initialEmployee)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const fullName = getFullName(employee)

  function updateField(field, value) {
    setEmployee((currentEmployee) => ({ ...currentEmployee, [field]: value }))
    setErrorMessage('')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    const selectedCompany = companies.find((company) => String(company.id) === employee.companyId)

    if (!selectedCompany) {
      setErrorMessage('Selecciona una empresa que ya esté registrada en el sistema.')
      return
    }

    setIsSubmitting(true)
    setErrorMessage('')
    try {
      const result = await createEmployee({
        primer_nombre: employee.primer_nombre.trim(),
        segundo_nombre: employee.segundo_nombre.trim() || null,
        primer_apellido: employee.primer_apellido.trim(),
        segundo_apellido: employee.segundo_apellido.trim() || null,
        nombre_completo: fullName,
        cedula: employee.cedula.trim(),
        empresa: selectedCompany.name,
        cargo: employee.cargo.trim() || null,
        area: employee.area.trim() || null,
        correo: employee.correo.trim().toLowerCase(),
        celular: employee.celular.trim() || null,
        telefono: employee.telefono.trim() || null,
        extesion: employee.extesion.trim() || null,
        tipo_vinculacion: employee.tipo_vinculacion || null,
        rol: employee.rol,
        id_empresa: selectedCompany.id,
      })
      onCreated(result)
      setEmployee(initialEmployee)
    } catch (error) {
      setErrorMessage(error.message || 'No se pudo crear la persona. Inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="employee-name-grid">
        <label className="form-field">Primer nombre
          <input autoFocus required value={employee.primer_nombre} onChange={(event) => updateField('primer_nombre', event.target.value)} />
        </label>
        <label className="form-field">Segundo nombre
          <input value={employee.segundo_nombre} onChange={(event) => updateField('segundo_nombre', event.target.value)} />
        </label>
        <label className="form-field">Primer apellido
          <input required value={employee.primer_apellido} onChange={(event) => updateField('primer_apellido', event.target.value)} />
        </label>
        <label className="form-field">Segundo apellido
          <input value={employee.segundo_apellido} onChange={(event) => updateField('segundo_apellido', event.target.value)} />
        </label>
      </div>
      <label className="form-field">Nombre completo
        <input value={fullName} readOnly aria-readonly="true" />
      </label>
      <label className="form-field">Cédula
        <input required maxLength={20} value={employee.cedula} onChange={(event) => updateField('cedula', event.target.value)} />
      </label>
      <label className="form-field">Empresa
        <select required value={employee.companyId} onChange={(event) => updateField('companyId', event.target.value)}>
          <option value="">Selecciona una empresa</option>
          {companies.map((company) => (
            <option key={company.id} value={company.id}>{company.name}</option>
          ))}
        </select>
      </label>
      {companies.length === 0 && <p className="employee-form-error">No hay empresas cargadas. Revisa permisos RLS o registra una empresa primero.</p>}
      <label className="form-field">Cargo
        <input value={employee.cargo} onChange={(event) => updateField('cargo', event.target.value)} />
      </label>
      <label className="form-field">Área
        <input value={employee.area} onChange={(event) => updateField('area', event.target.value)} />
      </label>
      <label className="form-field">Correo electrónico
        <input type="email" required value={employee.correo} onChange={(event) => updateField('correo', event.target.value)} />
      </label>
      <label className="form-field">Tipo de vinculación
        <select value={employee.tipo_vinculacion} onChange={(event) => updateField('tipo_vinculacion', event.target.value)}>
          <option value="">Selecciona un tipo</option>
          {vinculationTypes.map((type) => <option key={type} value={type}>{type}</option>)}
        </select>
      </label>
      <label className="form-field">Rol de acceso
        <select required value={employee.rol} onChange={(event) => updateField('rol', event.target.value)}>
          <option value="basico">Básico: capacitaciones</option>
          <option value="intermedio">Intermedio: capacitaciones, empresa y documentos</option>
        </select>
      </label>
      <label className="form-field">Celular
        <input type="tel" value={employee.celular} onChange={(event) => updateField('celular', event.target.value)} />
      </label>
      <div className="form-field-row">
        <label className="form-field">Teléfono
          <input type="tel" value={employee.telefono} onChange={(event) => updateField('telefono', event.target.value)} />
        </label>
        <label className="form-field extension-field">Ext.
          <input inputMode="numeric" maxLength={5} value={employee.extesion} onChange={(event) => updateField('extesion', event.target.value.replace(/\D/g, '').slice(0, 5))} />
        </label>
      </div>
      <p className="employee-invite-note">Se guardará el perfil en empleados y usuarios. La persona recibirá un correo de invitación para definir su contraseña; nunca se guarda en la tabla usuario.</p>
      {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
      <div className="modal-actions">
        <button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="primary-button" disabled={isSubmitting || companies.length === 0}>
          <Plus size={16} /> {isSubmitting ? 'Creando persona...' : 'Crear persona'}
        </button>
      </div>
    </form>
  )
}

export default EmployeeForm
