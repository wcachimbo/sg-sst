import { useState } from 'react'
import { KeyRound, Pencil, Search, Trash2, Users, X } from 'lucide-react'
import { manageEmployee } from './employeeService'

const editableFields = [
  ['primer_nombre', 'Primer nombre'], ['segundo_nombre', 'Segundo nombre'],
  ['primer_apellido', 'Primer apellido'], ['segundo_apellido', 'Segundo apellido'],
  ['correo', 'Correo electrónico'], ['cargo', 'Cargo'], ['area', 'Área'],
  ['celular', 'Celular'], ['telefono', 'Teléfono'], ['extesion', 'Extensión'],
  ['tipo_vinculacion', 'Tipo de vinculación'],
]

export default function EmployeeDirectory({ employees, companies, onUpdated, onDeleted }) {
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busyId, setBusyId] = useState(null)
  const filtered = employees.filter((employee) => `${employee.nombre_completo} ${employee.cedula} ${employee.correo} ${employee.empresa}`.toLowerCase().includes(search.toLowerCase()))

  function startEditing(employee) {
    setError('')
    setNotice('')
    setEditing({ ...employee, id_empresa: String(employee.id_empresa || ''), rol: employee.rol || 'basico' })
  }

  async function save(event) {
    event.preventDefault()
    if (!editing) return
    setBusyId(editing.id)
    setError('')
    try {
      const result = await manageEmployee('update', editing.id, editing)
      onUpdated(result.employee)
      setEditing(null)
      setNotice(`Se actualizaron los datos de ${result.employee.nombre_completo}.`)
    } catch (saveError) {
      setError(saveError.message || 'No se pudieron guardar los cambios.')
    } finally {
      setBusyId(null)
    }
  }

  async function resend(employee) {
    setError('')
    setNotice('')
    setBusyId(employee.id)
    try {
      await manageEmployee('resend-password', employee.id)
      setNotice(`Enviamos un enlace para crear o restablecer la contraseña a ${employee.correo}.`)
    } catch (sendError) {
      setError(sendError.message || 'No se pudo enviar el correo.')
    } finally {
      setBusyId(null)
    }
  }

  async function remove(employee) {
    const confirmed = window.confirm(`¿Eliminar a ${employee.nombre_completo}? También se eliminarán sus datos de acceso y los registros vinculados, como asignaciones/progresos de capacitación, visitas y auditorías.`)
    if (!confirmed) return
    setError('')
    setNotice('')
    setBusyId(employee.id)
    try {
      await manageEmployee('delete', employee.id)
      onDeleted(employee.id)
      setNotice(`Se eliminó a ${employee.nombre_completo}.`)
    } catch (deleteError) {
      setError(deleteError.message || 'No se pudo eliminar al trabajador.')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <>
      {error && <p className="database-alert" role="alert">{error}</p>}
      {notice && <p className="employee-success" role="status">{notice}</p>}
      <div className="employee-directory-toolbar"><span>{employees.length} trabajadores</span><label className="list-search"><Search size={16} /><input aria-label="Buscar trabajador" placeholder="Buscar por nombre, cédula o correo" value={search} onChange={(event) => setSearch(event.target.value)} /></label></div>
      {!filtered.length ? <div className="empty-state"><Users size={20} /><strong>{employees.length ? 'No encontramos trabajadores' : 'Aún no hay trabajadores'}</strong><span>{employees.length ? 'Prueba con otro nombre, cédula o correo.' : 'Registra una persona con el botón Nuevo usuario.'}</span></div> : (
        <div className="employee-directory-list">
          {filtered.map((employee) => (
            <article className="employee-directory-row" key={`${employee.id}-${employee.cedula}`}>
              <span className="record-icon"><Users size={17} /></span>
              <div className="employee-directory-main"><strong>{employee.nombre_completo}</strong><span>Cédula {employee.cedula} · {employee.empresa || 'Sin empresa'}</span><small>{employee.correo || 'Sin correo'}</small></div>
              <span className="employee-directory-role">{employee.cargo || 'Sin cargo'}</span>
              <div className="employee-directory-actions">
                <button type="button" className="secondary-button" disabled={busyId === employee.id} onClick={() => resend(employee)}><KeyRound size={14} /><span>{busyId === employee.id ? 'Procesando…' : 'Reenviar enlace'}</span></button>
                <button type="button" className="row-action" aria-label={`Editar ${employee.nombre_completo}`} title="Editar trabajador" onClick={() => startEditing(employee)}><Pencil size={15} /></button>
                <button type="button" className="row-action row-action-danger" aria-label={`Eliminar ${employee.nombre_completo}`} title="Eliminar trabajador" disabled={busyId === employee.id} onClick={() => remove(employee)}><Trash2 size={15} /></button>
              </div>
            </article>
          ))}
        </div>
      )}
      {editing && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busyId) setEditing(null) }}>
        <section className="company-modal employee-edit-modal" role="dialog" aria-modal="true" aria-labelledby="employee-edit-title">
          <div className="modal-heading"><div><p className="eyebrow">GESTIÓN DE PERSONAL</p><h2 id="employee-edit-title">Editar trabajador</h2></div><button type="button" className="icon-button" aria-label="Cerrar formulario" onClick={() => setEditing(null)}><X size={19} /></button></div>
          <p className="modal-copy">La cédula se conserva como identificador para no romper sus registros relacionados.</p>
          <form onSubmit={save}>
            <label className="form-field">Cédula<input value={editing.cedula} disabled /></label>
            <label className="form-field">Empresa<select required value={editing.id_empresa} onChange={(event) => setEditing((current) => ({ ...current, id_empresa: event.target.value }))}>{companies.map((company) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
            {editableFields.map(([field, label]) => <label className="form-field" key={field}>{label}<input type={field === 'correo' ? 'email' : 'text'} required={field === 'primer_nombre' || field === 'primer_apellido' || field === 'correo'} value={editing[field] || ''} onChange={(event) => setEditing((current) => ({ ...current, [field]: event.target.value }))} /></label>)}
            <label className="form-field">Rol de acceso<select value={editing.rol} onChange={(event) => setEditing((current) => ({ ...current, rol: event.target.value }))}><option value="basico">Básico: capacitaciones</option><option value="intermedio">Intermedio: empresa y documentos</option></select></label>
            {error && <p className="login-error" role="alert">{error}</p>}
            <div className="modal-actions"><button type="button" className="secondary-button" disabled={busyId === editing.id} onClick={() => setEditing(null)}>Cancelar</button><button type="submit" className="primary-button" disabled={busyId === editing.id}><Pencil size={15} /> {busyId === editing.id ? 'Guardando…' : 'Guardar cambios'}</button></div>
          </form>
        </section>
      </div>}
    </>
  )
}
