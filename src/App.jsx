import { useEffect, useRef, useState } from 'react'
import {
  Activity,
  AlertTriangle,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  CalendarDays,
  Check,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  Building2,
  Bot,
  Eye,
  EyeOff,
  FileText,
  Gauge,
  GraduationCap,
  HeartPulse,
  LogOut,
  LockKeyhole,
  Menu,
  Plus,
  Pencil,
  PenLine,
  Search,
  Scale,
  ShieldCheck,
  Siren,
  Stethoscope,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import './App.css'
import { supabase } from './lib/supabase'
import EmployeeForm from './features/employees/EmployeeForm'
import EmployeeDirectory from './features/employees/EmployeeDirectory'
import { listEmployees } from './features/employees/employeeService'
import SetPasswordForm from './features/auth/SetPasswordForm'
import TemplateLibrary from './features/documents/TemplateLibrary'
import CompanyDocuments from './features/documents/CompanyDocuments'
import UserSignatureDialog from './features/documents/UserSignatureDialog'
import ExternalAuditPortal from './features/audits/ExternalAuditPortal'
import TrainingCenter from './features/trainings/TrainingCenter'
import MySignatures from './features/documents/MySignatures'
import { listMyDocumentSignatures } from './features/documents/signatureService'

const navigation = [
  { section: 'General', items: [{ label: 'Plan anual de trabajo', icon: CalendarDays }, { label: 'Inicio', icon: Gauge }] },
  {
    section: 'Cumplimiento normativo',
    items: [
      { label: 'Diagnóstico SG-SST', icon: ClipboardCheck },
      { label: 'Matriz legal', icon: Scale },
      { label: 'Auditorías', icon: BookOpen },
      { label: 'Motor normativo', icon: FileText },
    ],
  },
  {
    section: 'Gestión operativa',
    items: [
      { label: 'Empresas', icon: BriefcaseBusiness },
      { label: 'Gestión documental', icon: FileText },
      { label: 'Plantillas', icon: ClipboardCheck },
      { label: 'Riesgos', icon: AlertTriangle },
      { label: 'Capacitación', icon: GraduationCap },
      { label: 'Medicina laboral', icon: Stethoscope },
      { label: 'Ausentismo', icon: HeartPulse },
      { label: 'Accidentes e incidentes', icon: Siren },
      { label: 'Inspecciones', icon: Check },
    ],
  },
]

const modules = [
  {
    name: 'Diagnóstico SG-SST',
    code: 'M2',
    description: 'Autoevaluación, diagnóstico inicial y plan de mejoramiento.',
    progress: '78%',
    count: '14 tareas',
    icon: ClipboardCheck,
    tone: 'blue',
  },
  {
    name: 'Matriz legal',
    code: 'M3',
    description: 'Requisitos, evaluaciones de cumplimiento y alertas.',
    progress: '91%',
    count: '24 normas',
    icon: Scale,
    tone: 'green',
  },
  {
    name: 'Auditorías',
    code: 'M16',
    description: 'Auditorías internas, hallazgos y acciones correctivas.',
    progress: '2 / 2',
    count: '11 hallazgos',
    icon: BookOpen,
    tone: 'orange',
  },
  {
    name: 'Motor normativo',
    code: 'M18',
    description: 'Seguimiento de cambios normativos y alertas del sistema.',
    progress: '3',
    count: '2 alertas',
    icon: Activity,
    tone: 'teal',
  },
]

const startingPendingItems = [
  { id: 'pending-1', title: 'Revisar plan anual de trabajo', detail: 'Constructora Andina Ltda.', category: 'Plan anual', dueDate: '04 oct', priority: 'Urgente' },
  { id: 'pending-2', title: 'Completar soportes de auditoría', detail: 'Industrias Colombo S.A.S.', category: 'Auditoría', dueDate: '06 oct', priority: 'Alta' },
  { id: 'pending-3', title: 'Programar capacitación de inducción', detail: 'Clínica Santa Clara', category: 'Capacitación', dueDate: '08 oct', priority: 'Normal' },
]

const economicSectors = [
  'Agricultura, ganadería, caza, silvicultura y pesca',
  'Explotación de minas y canteras',
  'Industrias manufactureras',
  'Suministro de electricidad, gas, vapor y aire acondicionado',
  'Distribución de agua y gestión de residuos',
  'Construcción',
  'Comercio y reparación de vehículos',
  'Transporte y almacenamiento',
  'Alojamiento y servicios de comida',
  'Información y comunicaciones',
  'Actividades financieras y de seguros',
  'Actividades inmobiliarias',
  'Actividades profesionales, científicas y técnicas',
  'Servicios administrativos y de apoyo',
  'Administración pública y defensa',
  'Educación',
  'Atención de la salud humana y asistencia social',
  'Actividades artísticas, entretenimiento y recreación',
  'Otras actividades de servicios',
  'Actividades de los hogares como empleadores',
]

const servicePackages = ['Básico', 'Estándar', 'Completo']

function readAppRoute() {
  const hash = window.location.hash.replace(/^#\/?/, '')
  const companyMatch = hash.match(/^empresa\/(\d+)\/archivos$/)
  if (companyMatch) return { view: 'Archivos de empresa', companyId: companyMatch[1] }
  const viewMatch = hash.match(/^view\/(.+)$/)
  if (!viewMatch) return null
  try { return { view: decodeURIComponent(viewMatch[1]), companyId: null } } catch { return null }
}

function routeForView(view) {
  return `#/view/${encodeURIComponent(view)}`
}

function routeIsAllowed(role, route) {
  if (!route) return false
  if (role === 'admin') return true
  if (route.companyId) return false
  if (role === 'basico') return ['Consultar capacitaciones', 'Firmas pendientes'].includes(route.view)
  if (role === 'intermedio') return ['Mi empresa', 'Consultar capacitaciones', 'Documentos de mi empresa', 'Firmas pendientes'].includes(route.view)
  return false
}

function readSessionDraft(key) {
  try { return JSON.parse(window.sessionStorage.getItem(key) || 'null') } catch { return null }
}

const startingTrainings = [
  { name: 'Inducción en seguridad y salud', company: 'Clínica Santa Clara', date: '08 oct 2026', attendees: 24, status: 'Programada' },
  { name: 'Uso seguro de herramientas', company: 'Constructora Andina Ltda.', date: '12 oct 2026', attendees: 18, status: 'En preparación' },
  { name: 'Pausas activas y ergonomía', company: 'Industrias Colombo S.A.S.', date: '15 oct 2026', attendees: 42, status: 'Programada' },
]

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [errorMessage, setErrorMessage] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(event) {
    event.preventDefault()
    setErrorMessage('')

    if (!supabase) {
      setErrorMessage('Falta configurar la URL y la clave publishable de Supabase en .env.local.')
      return
    }

    setIsSubmitting(true)
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      })

      if (error) {
        setErrorMessage('No se pudo iniciar sesión. Verifica el usuario creado en Supabase Authentication.')
        return
      }

      onLogin(data.session)
    } catch {
      setErrorMessage('No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <main className="login-screen">
      <section className="login-brand-panel">
        <div className="login-brand-lockup">
          <span className="login-brand-mark"><ShieldCheck size={22} strokeWidth={2.3} /></span>
          <div><strong>SG-SST Platform</strong><span>Sistema integral de gestión de seguridad y salud en el trabajo</span></div>
        </div>
        <div className="login-benefits">
          <div className="login-benefit"><span><ShieldCheck size={20} /></span><div><strong>20 módulos especializados</strong><small>Cumplimiento normativo, gestión operativa e IA</small></div></div>
          <div className="login-benefit"><span><Building2 size={20} /></span><div><strong>Gestión multiempresa</strong><small>Administra múltiples empresas desde un solo panel</small></div></div>
          <div className="login-benefit"><span><Bot size={20} /></span><div><strong>Herramientas inteligentes</strong><small>Organiza documentos, informes y actividades</small></div></div>
        </div>
        <p className="login-copyright">© 2026 SG-SST Platform · Todos los derechos reservados</p>
      </section>

      <section className="login-form-panel">
        <form className="login-form" onSubmit={handleSubmit}>
          <div className="login-heading"><p className="eyebrow">ACCESO A LA PLATAFORMA</p><h1>Bienvenida</h1><p>Ingresa tus credenciales para continuar</p></div>
          <label className="login-field" htmlFor="login-email">Correo electrónico
            <input id="login-email" type="email" autoComplete="username" required value={email} onChange={(event) => { setEmail(event.target.value); setErrorMessage('') }} placeholder="nombre@empresa.com" />
          </label>
          <label className="login-field" htmlFor="login-password">Contraseña
            <span className="password-input-wrap">
              <input id="login-password" type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={(event) => { setPassword(event.target.value); setErrorMessage('') }} placeholder="Escribe tu contraseña" />
              <button className="password-toggle" type="button" aria-label={showPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'} onClick={() => setShowPassword((visible) => !visible)}>{showPassword ? <EyeOff size={18} /> : <Eye size={18} />}</button>
            </span>
          </label>
          {errorMessage && <p className="login-error" role="alert">{errorMessage}</p>}
          <button className="login-submit" type="submit" disabled={isSubmitting}><LockKeyhole size={17} /> {isSubmitting ? 'Ingresando...' : 'Ingresar'}</button>
          <p className="login-help">Ingresa con la cuenta creada en Supabase Authentication.</p>
        </form>
      </section>
    </main>
  )
}

function getNavigationForRole(role) {
  if (role === 'admin') return navigation
  if (role === 'basico') {
    return [
      { section: 'Formación', items: [{ label: 'Consultar capacitaciones', icon: GraduationCap }] },
      { section: 'Firmas', items: [{ label: 'Firmas pendientes', icon: PenLine }] },
    ]
  }
  if (role === 'intermedio') {
    return [
      {
        section: 'Mi empresa',
        items: [
          { label: 'Mi empresa', icon: BriefcaseBusiness },
          { label: 'Documentos de mi empresa', icon: FileText },
        ],
      },
      { section: 'Formación', items: [{ label: 'Consultar capacitaciones', icon: GraduationCap }] },
      { section: 'Firmas', items: [{ label: 'Firmas pendientes', icon: PenLine }] },
    ]
  }
  return []
}

function AuthenticatedApp() {
  const [session, setSession] = useState(null)
  const [isPasswordRecovery, setIsPasswordRecovery] = useState(false)
  const [isAuthReady, setIsAuthReady] = useState(!supabase)
  const [userProfile, setUserProfile] = useState(null)
  const [isProfileReady, setIsProfileReady] = useState(false)
  const [profileError, setProfileError] = useState('')
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [signOutError, setSignOutError] = useState('')
  const [isSignatureDialogOpen, setIsSignatureDialogOpen] = useState(false)
  const accountMenuRef = useRef(null)
  const [activeView, setActiveView] = useState(() => readAppRoute()?.view || 'Inicio')
  const [searchTerm, setSearchTerm] = useState('')
  const [companies, setCompanies] = useState([])
  const [employees, setEmployees] = useState([])
  const [scheduledVisitsCount, setScheduledVisitsCount] = useState(null)
  const [isLoadingVisitsCount, setIsLoadingVisitsCount] = useState(false)
  const [visitsCountError, setVisitsCountError] = useState('')
  const [isLoadingCompanies, setIsLoadingCompanies] = useState(false)
  const [isLoadingEmployees, setIsLoadingEmployees] = useState(false)
  const [companyError, setCompanyError] = useState('')
  const [employeeError, setEmployeeError] = useState('')
  const [pendingSignatureRequests, setPendingSignatureRequests] = useState([])
  const [companyFormError, setCompanyFormError] = useState('')
  const [isSavingCompany, setIsSavingCompany] = useState(false)
  const [isDeletingCompanyId, setIsDeletingCompanyId] = useState(null)
  const [editingCompany, setEditingCompany] = useState(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [modalType, setModalType] = useState('company')
  const [newCompanyName, setNewCompanyName] = useState('')
  const [newCompanyNit, setNewCompanyNit] = useState('')
  const [newCompanyNitDv, setNewCompanyNitDv] = useState('')
  const [newCompanySector, setNewCompanySector] = useState('')
  const [newCompanyWorkers, setNewCompanyWorkers] = useState('')
  const [newCompanyPackage, setNewCompanyPackage] = useState('')
  const [newCompanyContact, setNewCompanyContact] = useState('')
  const [newCompanyRole, setNewCompanyRole] = useState('')
  const [newCompanyEmail, setNewCompanyEmail] = useState('')
  const [newCompanyPhone, setNewCompanyPhone] = useState('')
  const [newCompanyExtension, setNewCompanyExtension] = useState('')
  const [newCompanyCell, setNewCompanyCell] = useState('')
  const [isCompanyDraftReady, setIsCompanyDraftReady] = useState(false)
  const [newTrainingName, setNewTrainingName] = useState('')
  const [newTrainingDate, setNewTrainingDate] = useState('')
  const [newTrainingCompany, setNewTrainingCompany] = useState('')
  const [selectedCompany, setSelectedCompany] = useState(null)
  const [pendingCompanyRouteId, setPendingCompanyRouteId] = useState(() => readAppRoute()?.companyId || null)
  const [pendingItems, setPendingItems] = useState(startingPendingItems)
  const currentRole = session?.user?.email?.toLowerCase() === 'admin@gmail.com'
    ? 'admin'
    : userProfile?.rol || ''

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId) { setIsCompanyDraftReady(false); return }
    const draft = readSessionDraft(`sgsst:empresa:${userId}`)
    if (draft) {
      setNewCompanyName(draft.name || '')
      setNewCompanyNit(draft.nit || '')
      setNewCompanyNitDv(draft.nitDv || '')
      setNewCompanySector(draft.sector || '')
      setNewCompanyWorkers(draft.workers || '')
      setNewCompanyPackage(draft.packageName || '')
      setNewCompanyContact(draft.contact || '')
      setNewCompanyRole(draft.role || '')
      setNewCompanyEmail(draft.email || '')
      setNewCompanyPhone(draft.phone || '')
      setNewCompanyExtension(draft.extension || '')
      setNewCompanyCell(draft.cell || '')
      setModalType('company')
      setIsModalOpen(Boolean(draft.isModalOpen))
    } else {
      setNewCompanyName(''); setNewCompanyNit(''); setNewCompanyNitDv(''); setNewCompanySector('')
      setNewCompanyWorkers(''); setNewCompanyPackage(''); setNewCompanyContact(''); setNewCompanyRole('')
      setNewCompanyEmail(''); setNewCompanyPhone(''); setNewCompanyExtension(''); setNewCompanyCell('')
      setModalType('company'); setIsModalOpen(false)
    }
    setIsCompanyDraftReady(true)
  }, [session?.user?.id])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || !isCompanyDraftReady) return
    const draft = {
      name: newCompanyName, nit: newCompanyNit, nitDv: newCompanyNitDv, sector: newCompanySector,
      workers: newCompanyWorkers, packageName: newCompanyPackage, contact: newCompanyContact,
      role: newCompanyRole, email: newCompanyEmail, phone: newCompanyPhone,
      extension: newCompanyExtension, cell: newCompanyCell, modalType,
      isModalOpen: isModalOpen && modalType === 'company',
    }
    try { window.sessionStorage.setItem(`sgsst:empresa:${userId}`, JSON.stringify(draft)) } catch { /* Storage may be disabled by the browser. */ }
  }, [session?.user?.id, isCompanyDraftReady, newCompanyName, newCompanyNit, newCompanyNitDv, newCompanySector, newCompanyWorkers, newCompanyPackage, newCompanyContact, newCompanyRole, newCompanyEmail, newCompanyPhone, newCompanyExtension, newCompanyCell, modalType, isModalOpen])

  useEffect(() => {
    if (!supabase || !session || currentRole !== 'admin') {
      setScheduledVisitsCount(null)
      setIsLoadingVisitsCount(false)
      setVisitsCountError('')
      return undefined
    }

    let isMounted = true
    setIsLoadingVisitsCount(true)
    setVisitsCountError('')
    supabase.from('visita_empresa')
      .select('id', { count: 'exact', head: true })
      .eq('estado', 'Programada')
      .then(({ count, error }) => {
        if (!isMounted) return
        if (error) {
          setScheduledVisitsCount(null)
          setVisitsCountError(error.message)
        } else {
          setScheduledVisitsCount(count || 0)
        }
      })
      .finally(() => { if (isMounted) setIsLoadingVisitsCount(false) })

    return () => { isMounted = false }
  }, [session, currentRole])

  useEffect(() => {
    if (!supabase) return undefined

    let isMounted = true
    let receivedAuthEvent = false
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (isMounted) {
        receivedAuthEvent = true
        if (event === 'PASSWORD_RECOVERY') setIsPasswordRecovery(true)
        if (event === 'SIGNED_OUT') setIsPasswordRecovery(false)
        setSession(nextSession)
        setIsAuthReady(true)
      }
    })

    supabase.auth.getSession().then(({ data }) => {
      if (isMounted && !receivedAuthEvent) {
        setSession(data.session)
        setIsAuthReady(true)
      }
    })

    return () => {
      isMounted = false
      subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    function syncRouteFromLocation() {
      const route = readAppRoute()
      if (!route) {
        setPendingCompanyRouteId(null)
        setSelectedCompany(null)
        setActiveView('Inicio')
        return
      }
      setActiveView(route.view)
      setPendingCompanyRouteId(route.companyId)
      if (!route.companyId) setSelectedCompany(null)
    }
    window.addEventListener('hashchange', syncRouteFromLocation)
    window.addEventListener('popstate', syncRouteFromLocation)
    return () => {
      window.removeEventListener('hashchange', syncRouteFromLocation)
      window.removeEventListener('popstate', syncRouteFromLocation)
    }
  }, [])

  useEffect(() => {
    if (!pendingCompanyRouteId || !companies.length) return
    const company = companies.find((item) => String(item.id) === String(pendingCompanyRouteId))
    if (company) setSelectedCompany(company)
  }, [companies, pendingCompanyRouteId])

  useEffect(() => {
    if (!supabase || !session) {
      setUserProfile(null)
      setProfileError('')
      setIsProfileReady(true)
      return undefined
    }

    if (session.user.email?.toLowerCase() === 'admin@gmail.com') {
      setUserProfile({ rol: 'admin', id_empresa: null })
      setProfileError('')
      const route = readAppRoute()
      setActiveView(routeIsAllowed('admin', route) ? route.view : 'Inicio')
      setPendingCompanyRouteId(routeIsAllowed('admin', route) ? route.companyId : null)
      setIsProfileReady(true)
      return undefined
    }

    let isMounted = true
    setIsProfileReady(false)
    supabase
      .from('usuario')
      .select('cedula, apodo, rol, id_empresa')
      .eq('auth_user_id', session.user.id)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!isMounted) return
        if (error || !data || !['basico', 'intermedio'].includes(data.rol)) {
          setUserProfile(null)
          setProfileError(error?.message || 'Tu cuenta no tiene un rol válido asignado. Contacta al administrador.')
        } else {
          setUserProfile(data)
          setProfileError('')
          const route = readAppRoute()
          const defaultView = data.rol === 'basico' ? 'Consultar capacitaciones' : 'Mi empresa'
          setActiveView(routeIsAllowed(data.rol, route) ? route.view : defaultView)
          setPendingCompanyRouteId(null)
        }
        setIsProfileReady(true)
      })

    return () => {
      isMounted = false
    }
  }, [session])

  useEffect(() => {
    const userId = session?.user?.id
    if (!userId || currentRole === 'admin') {
      setPendingSignatureRequests([])
      return undefined
    }
    let active = true
    listMyDocumentSignatures(userId)
      .then((rows) => { if (active) setPendingSignatureRequests(rows.filter((request) => request.estado === 'pendiente')) })
      .catch(() => { if (active) setPendingSignatureRequests([]) })
    return () => { active = false }
  }, [session?.user?.id, currentRole, activeView])

  useEffect(() => {
    if (!supabase || !session || !['admin', 'intermedio'].includes(currentRole)) {
      setCompanies([])
      setEmployees([])
      return undefined
    }

    let isMounted = true
    async function loadCompanies() {
      setIsLoadingCompanies(true)
      setCompanyError('')
      const { data, error } = await supabase
        .from('empresa')
        .select('id, fecha, razon_social, nit, digito_verificacion, sector_economico, numero_trabajadores, paquete_servicios, nombre_responsable, cargo_responsable, correo, telefono, extension, celular')
        .order('fecha', { ascending: false })

      if (!isMounted) return

      if (error) {
        setCompanyError(`No se pudieron cargar las empresas. ${error.message}`)
        setCompanies([])
      } else {
        setCompanies(data.map((company) => ({
          id: company.id,
          name: company.razon_social,
          nit: String(company.nit),
          nitVerification: company.digito_verificacion,
          sector: company.sector_economico || 'Sin sector',
          employees: company.numero_trabajadores || '0',
          status: 'Al día',
          level: company.paquete_servicios || 'Sin paquete',
          contact: company.nombre_responsable || '',
          contactRole: company.cargo_responsable || '',
          email: company.correo || '',
          phone: company.telefono || '',
          extension: company.extension || '',
          cell: company.celular || '',
        })))
      }

      setIsLoadingCompanies(false)
    }

    loadCompanies()
    return () => {
      isMounted = false
    }
  }, [session, currentRole])

  useEffect(() => {
    if (!supabase || !session || currentRole !== 'admin') {
      setEmployees([])
      return undefined
    }

    let isMounted = true
    setIsLoadingEmployees(true)
    setEmployeeError('')
    listEmployees()
      .then((data) => {
        if (isMounted) setEmployees(data)
      })
      .catch((error) => {
        if (isMounted) setEmployeeError(`No se pudieron cargar los trabajadores. ${error.message}`)
      })
      .finally(() => {
        if (isMounted) setIsLoadingEmployees(false)
      })

    return () => {
      isMounted = false
    }
  }, [session, currentRole])

  const filteredCompanies = companies.filter((company) =>
    `${company.name} ${company.sector}`.toLowerCase().includes(searchTerm.toLowerCase()),
  )
  const selectedModule = modules.find((module) => module.name === activeView)
  const accountEmail = session?.user?.email || ''
  const accountName = session?.user?.user_metadata?.full_name || session?.user?.user_metadata?.name || userProfile?.apodo || accountEmail.split('@')[0] || 'Usuario'
  const accountInitials = accountName.split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase()
  const accountRole = ({ admin: 'Administrador', intermedio: 'Responsable de empresa', basico: 'Trabajador' })[currentRole] || 'Usuario'
  const accountCompany = companies.find((company) => String(company.id) === String(userProfile?.id_empresa))

  useEffect(() => {
    if (!isAccountMenuOpen) return undefined
    function closeOnOutsideClick(event) {
      if (!accountMenuRef.current?.contains(event.target)) setIsAccountMenuOpen(false)
    }
    function closeOnEscape(event) {
      if (event.key === 'Escape') setIsAccountMenuOpen(false)
    }
    document.addEventListener('pointerdown', closeOnOutsideClick)
    document.addEventListener('keydown', closeOnEscape)
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsideClick)
      document.removeEventListener('keydown', closeOnEscape)
    }
  }, [isAccountMenuOpen])

  async function signOut() {
    setIsSigningOut(true)
    setSignOutError('')
    try {
      if (supabase) {
        const { error } = await supabase.auth.signOut({ scope: 'local' })
        if (error) throw error
      }
      setIsAccountMenuOpen(false)
      setUserProfile(null)
      setSession(null)
      setActiveView('Inicio')
      setPendingCompanyRouteId(null)
      setSelectedCompany(null)
      window.history.replaceState({}, '', `${window.location.pathname}${window.location.search}`)
    } catch (error) {
      setSignOutError(`No se pudo cerrar la sesión: ${error.message}`)
    } finally {
      setIsSigningOut(false)
    }
  }

  function selectView(label) {
    const nextRoute = routeForView(label)
    if (window.location.hash !== nextRoute) window.history.pushState({}, '', nextRoute)
    setPendingCompanyRouteId(null)
    setSelectedCompany(null)
    setActiveView(label)
  }

  function openCompanyFiles(company) {
    const nextRoute = `#/empresa/${encodeURIComponent(company.id)}/archivos`
    if (window.location.hash !== nextRoute) window.history.pushState({}, '', nextRoute)
    setSelectedCompany(company)
    setPendingCompanyRouteId(String(company.id))
    setActiveView('Archivos de empresa')
  }

  function openModal(type) {
    setEditingCompany(null)
    setModalType(type)
    setCompanyFormError('')
    setIsModalOpen(true)
  }

  function closeModal() {
    setCompanyFormError('')
    setIsModalOpen(false)
    setEditingCompany(null)
  }

  function editCompany(company) {
    setCompanyFormError('')
    setEditingCompany({
      ...company,
      sector: company.sector === 'Sin sector' ? '' : company.sector,
      employees: String(company.employees ?? ''),
      level: company.level === 'Sin paquete' ? '' : company.level,
      contact: company.contact || '',
      contactRole: company.contactRole || '',
      email: company.email || '',
      phone: company.phone || '',
      extension: company.extension || '',
      cell: company.cell || '',
    })
    setModalType('company')
    setIsModalOpen(true)
  }

  async function updateCompany(event) {
    event.preventDefault()
    if (!editingCompany || !supabase) return
    setCompanyFormError('')
    setIsSavingCompany(true)
    let result
    try {
      result = await supabase.from('empresa').update({
        sector_economico: editingCompany.sector.trim() || null,
        numero_trabajadores: editingCompany.employees.trim() || null,
        paquete_servicios: editingCompany.level.trim() || null,
        nombre_responsable: editingCompany.contact.trim() || null,
        cargo_responsable: editingCompany.contactRole.trim() || null,
        correo: editingCompany.email.trim() || null,
        telefono: editingCompany.phone.trim() || null,
        extension: editingCompany.extension.trim() || null,
        celular: editingCompany.cell.trim() || null,
      }).eq('id', editingCompany.id)
        .select('id, fecha, razon_social, nit, digito_verificacion, sector_economico, numero_trabajadores, paquete_servicios, nombre_responsable, cargo_responsable, correo, telefono, extension, celular')
        .single()
    } catch {
      setCompanyFormError('No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.')
      setIsSavingCompany(false)
      return
    }
    setIsSavingCompany(false)
    if (result.error) {
      setCompanyFormError(`No se pudo actualizar la empresa. ${result.error.message}`)
      return
    }
    const record = result.data
    setCompanies((items) => items.map((company) => String(company.id) === String(record.id) ? {
      ...company,
      sector: record.sector_economico || 'Sin sector',
      employees: record.numero_trabajadores || '0',
      level: record.paquete_servicios || 'Sin paquete',
      contact: record.nombre_responsable || '',
      contactRole: record.cargo_responsable || '',
      email: record.correo || '',
      phone: record.telefono || '',
      extension: record.extension || '',
      cell: record.celular || '',
    } : company))
    if (String(selectedCompany?.id) === String(record.id)) {
      setSelectedCompany((company) => ({ ...company, sector: record.sector_economico || 'Sin sector' }))
    }
    closeModal()
  }

  async function deleteCompany(company) {
    const confirmed = window.confirm(`¿Eliminar la empresa ${company.name}? Esta acción no se puede deshacer. Si tiene trabajadores, usuarios, archivos u otros registros relacionados, la base de datos impedirá eliminarla.`)
    if (!confirmed || !supabase) return
    setCompanyError('')
    setIsDeletingCompanyId(company.id)
    const { error } = await supabase.from('empresa').delete().eq('id', company.id)
    setIsDeletingCompanyId(null)
    if (error) {
      setCompanyError(error.code === '23503'
        ? `No se puede eliminar ${company.name} porque tiene registros relacionados. Primero debes retirar o reasignar esos registros.`
        : `No se pudo eliminar la empresa. ${error.message}`)
      return
    }
    setCompanies((items) => items.filter((item) => String(item.id) !== String(company.id)))
    if (String(selectedCompany?.id) === String(company.id)) {
      setSelectedCompany(null)
      selectView('Empresas')
    }
  }

  function addPendingItem(item) {
    setPendingItems((currentItems) => [{ id: Date.now(), ...item }, ...currentItems])
  }

  async function addCompany(event) {
    event.preventDefault()
    const cleanName = newCompanyName.trim()
    const cleanNit = newCompanyNit.trim()
    const cleanNitDv = newCompanyNitDv.trim()
    if (!cleanName || !/^\d{1,18}$/.test(cleanNit) || !/^\d$/.test(cleanNitDv)) {
      setCompanyFormError('Escribe la razón social, el NIT y su dígito de verificación.')
      return
    }
    if (!supabase) {
      setCompanyFormError('Configura primero la conexión a Supabase en .env.local.')
      return
    }

    setCompanyFormError('')
    setIsSavingCompany(true)
    let data
    let error
    try {
      ({ data, error } = await supabase
        .from('empresa')
        .insert({
          razon_social: cleanName,
          nit: cleanNit,
          digito_verificacion: Number(cleanNitDv),
          sector_economico: newCompanySector.trim() || null,
          numero_trabajadores: newCompanyWorkers.trim() || null,
          paquete_servicios: newCompanyPackage.trim() || null,
          nombre_responsable: newCompanyContact.trim() || null,
          cargo_responsable: newCompanyRole.trim() || null,
          correo: newCompanyEmail.trim() || null,
          telefono: newCompanyPhone.trim() || null,
          extension: newCompanyExtension.trim() || null,
          celular: newCompanyCell.trim() || null,
        })
        .select('id, fecha, razon_social, nit, digito_verificacion, sector_economico, numero_trabajadores, paquete_servicios, nombre_responsable, cargo_responsable, correo, telefono, extension, celular')
        .single())
    } catch {
      setCompanyFormError('No se pudo conectar con Supabase. Revisa tu conexión e inténtalo de nuevo.')
      setIsSavingCompany(false)
      return
    }
    setIsSavingCompany(false)

    if (error) {
      const errorDetails = [error.message, error.details, error.hint].filter(Boolean).join(' ')
      setCompanyFormError(`Supabase (${error.code || 'error'}): ${errorDetails}`)
      return
    }

    setCompanies((currentCompanies) => [{
      id: data.id,
      name: data.razon_social,
      nit: String(data.nit),
      nitVerification: data.digito_verificacion,
      sector: data.sector_economico || 'Sin sector',
      employees: data.numero_trabajadores || '0',
      status: 'Al día',
      level: data.paquete_servicios || 'Sin paquete',
      contact: data.nombre_responsable || '',
      contactRole: data.cargo_responsable || '',
      email: data.correo || '',
      phone: data.telefono || '',
      extension: data.extension || '',
      cell: data.celular || '',
    }, ...currentCompanies])
    addPendingItem({
      title: `Completar registro de ${cleanName}`,
      detail: newCompanySector.trim() || 'Empresa nueva',
      category: 'Empresa',
      dueDate: 'Hoy',
      priority: 'Normal',
    })
    setNewCompanyName('')
    setNewCompanyNit('')
    setNewCompanyNitDv('')
    setNewCompanySector('')
    setNewCompanyWorkers('')
    setNewCompanyPackage('')
    setNewCompanyContact('')
    setNewCompanyRole('')
    setNewCompanyEmail('')
    setNewCompanyPhone('')
    setNewCompanyExtension('')
    setNewCompanyCell('')
    closeModal()
  }

  function addTraining(event) {
    event.preventDefault()
    const cleanName = newTrainingName.trim()
    if (!cleanName || !newTrainingDate) return

    addPendingItem({
      title: `Preparar capacitación: ${cleanName}`,
      detail: newTrainingCompany,
      category: 'Capacitación',
      dueDate: newTrainingDate,
      priority: 'Alta',
    })
    setNewTrainingName('')
    setNewTrainingDate('')
    closeModal()
  }

  if (!isAuthReady) {
    return <main className="auth-loading">Verificando sesión...</main>
  }

  if (!session) {
    return <LoginScreen onLogin={setSession} />
  }

  if (session.user.user_metadata?.needs_password_setup || isPasswordRecovery) {
    return <SetPasswordForm />
  }

  if (!isProfileReady) {
    return <main className="auth-loading">Cargando permisos de usuario...</main>
  }

  if (currentRole !== 'admin' && !userProfile) {
    return (
      <main className="auth-loading auth-loading-message">
        <p role="alert">{profileError || 'Esta cuenta no tiene permisos asignados.'}</p>
        <button className="secondary-button" onClick={() => supabase.auth.signOut()}>Cerrar sesión</button>
      </main>
    )
  }

  return (
    <div className={`app-shell${currentRole !== 'admin' ? ' app-shell-split' : ''}`}>

      {currentRole !== 'admin' && (
        <aside className="sidebar" aria-label="Menú principal">
          <div className="brand-lockup">
            <span className="brand-mark"><ShieldCheck size={17} /></span>
            <div className="brand-name">SG-SST<span>GESTIÓN PREVENTIVA</span></div>
          </div>
          <div className="workspace-chip"><span className="workspace-dot" /><span>{accountCompany?.name || 'Tu cuenta'}</span></div>
          <nav className="sidebar-nav">
            {getNavigationForRole(currentRole).map((group) => (
              <div className="nav-group" key={group.section}>
                <p className="nav-section-label">{group.section}</p>
                {group.items.map((item) => (
                  <button
                    key={item.label}
                    type="button"
                    className={`nav-link${activeView === item.label ? ' nav-link-active' : ''}`}
                    aria-current={activeView === item.label ? 'page' : undefined}
                    onClick={() => selectView(item.label)}
                  >
                    <item.icon size={15} /><span>{item.label}</span>
                  </button>
                ))}
              </div>
            ))}
          </nav>
          <div className="sidebar-footer">
            <span className="avatar">{accountInitials}</span>
            <div className="user-meta"><strong>{accountName}</strong><span>{accountRole}</span></div>
            <button type="button" className="icon-button" aria-label="Cerrar sesión" onClick={() => supabase.auth.signOut()}><LogOut size={15} /></button>
          </div>
        </aside>
      )}

      <main className="main-panel">
        <header className="topbar">

          <div className="breadcrumbs">
            <button type="button" className="breadcrumb-home" onClick={() => selectView('Inicio')}>{selectedCompany && activeView === 'Archivos de empresa' ? 'Inicio' : 'SG-SST'}</button>
            {selectedCompany && activeView === 'Archivos de empresa' ? <>
              <ChevronRight size={14} />
              <button type="button" className="breadcrumb-link" onClick={() => selectView('Empresas')}>Empresas</button>
              <ChevronRight size={14} />
              <strong>{selectedCompany.name}</strong>
            </> : activeView !== 'Inicio' && <><ChevronRight size={14} /><strong>{activeView}</strong></>}
          </div>
          <div className="topbar-actions">
            {currentRole === 'admin' && (
              <>
                <label className="global-search">
                  <Search size={17} />
                  <input
                    aria-label="Buscar empresa"
                    placeholder="Buscar empresa o módulo"
                    value={searchTerm}
                    onChange={(event) => setSearchTerm(event.target.value)}
                  />
                  <kbd>⌘ K</kbd>
                </label>
                <button className="icon-button notification-button" aria-label="Notificaciones, 2 pendientes">
                  <Bell size={18} /><span className="notification-dot" />
                </button>
              </>
            )}
            <div className="account-control" ref={accountMenuRef}>
              <button
                type="button"
                className="top-avatar"
                aria-label={`Abrir cuenta de ${accountEmail}`}
                aria-haspopup="dialog"
                aria-expanded={isAccountMenuOpen}
                onClick={() => { setSignOutError(''); setIsAccountMenuOpen((open) => !open) }}
              >{accountInitials}</button>
              {isAccountMenuOpen && <section className="account-popover" role="dialog" aria-label="Datos de la cuenta">
                <div className="account-popover-heading"><span className="account-popover-avatar">{accountInitials}</span><div><strong>{accountName}</strong><small>{accountRole}</small></div></div>
                <dl className="account-details">
                  <div><dt>Correo</dt><dd>{accountEmail || 'No disponible'}</dd></div>
                  {userProfile?.cedula && <div><dt>Cédula</dt><dd>{userProfile.cedula}</dd></div>}
                  {userProfile?.id_empresa && <div><dt>Empresa</dt><dd>{accountCompany?.name || `Empresa #${userProfile.id_empresa}`}</dd></div>}
                  <div><dt>Sesión</dt><dd>Activa</dd></div>
                </dl>
                {signOutError && <p className="account-signout-error" role="alert">{signOutError}</p>}
                <button type="button" className="account-signout-button account-signature-button" onClick={() => { setIsAccountMenuOpen(false); setIsSignatureDialogOpen(true) }}><PenLine size={16} /> Mi firma</button>
                <button type="button" className="account-signout-button" onClick={signOut} disabled={isSigningOut}><LogOut size={16} />{isSigningOut ? 'Cerrando sesión…' : 'Cerrar sesión'}</button>
              </section>}
            </div>
          </div>
        </header>

        {pendingSignatureRequests.length > 0 && currentRole !== 'admin' && (
          <div className="database-alert" role="alert" style={{ margin: '16px 38px 0' }}>
            <strong>Usted tiene una firma pendiente.</strong>{' '}
            Revise{' '}
            <button type="button" className="breadcrumb-link" onClick={() => selectView('Firmas pendientes')}>Sus firmas pendientes</button>{' '}
            o{' '}
            <button type="button" className="breadcrumb-link" onClick={() => setIsSignatureDialogOpen(true)}>cree su firma</button>{' '}
            para firmar el documento asignado.
          </div>
        )}

        <div className={`page-content ${['Archivos de empresa', 'Documentos de mi empresa'].includes(activeView) ? 'company-documents-content' : ''}`}>
          {currentRole === 'admin' && activeView === 'Inicio' && (
            <>
              <section className="welcome-row">
                <div>
                  <p className="eyebrow">JUEVES, 01 DE OCTUBRE DE 2026 <span className="eyebrow-rule" /></p>
                  <h1>Tu gestión, al día<span>.</span></h1>
                  <p className="welcome-copy">Un panorama claro de la seguridad y salud en el trabajo.</p>
                </div>
                <button className="primary-button" onClick={() => openModal('company')}>
                  <Plus size={17} /> Nueva empresa
                </button>
              </section>
              {companyError && <p className="database-alert" role="alert">{companyError}</p>}
              {employeeError && <p className="database-alert" role="alert">{employeeError}</p>}

              <section className="metric-grid" aria-label="Indicadores principales">
                <button type="button" className="metric-card metric-card-link metric-green" onClick={() => selectView('Empresas')} aria-label="Ver empresas registradas">
                  <div className="metric-topline"><span>Empresas registradas</span><BriefcaseBusiness size={17} /></div>
                  <div className="metric-value">{isLoadingCompanies ? '--' : String(companies.length).padStart(2, '0')}<span className="metric-unit"> empresas</span></div>
                  <div className="metric-foot"><span className="metric-muted">Registros guardados en Supabase</span></div>
                </button>
                <button type="button" className="metric-card metric-card-link metric-blue" onClick={() => selectView('Consultar trabajadores')} aria-label="Ver empleados registrados">
                  <div className="metric-topline"><span>Empleados registrados</span><Users size={17} /></div>
                  <div className="metric-value">{isLoadingEmployees ? '--' : employeeError ? '—' : employees.length}</div>
                  <div className="metric-foot"><span className="metric-muted">Registros guardados en Supabase</span></div>
                </button>
                <article className="metric-card metric-lime">
                  <div className="metric-topline"><span>Visitas agendadas</span><CalendarDays size={17} /></div>
                  <div className="metric-value">{isLoadingVisitsCount ? '--' : visitsCountError ? '—' : scheduledVisitsCount}</div>
                  <div className="metric-foot"><span className="metric-muted">{visitsCountError ? 'Ejecuta supabase/visitas_empresa.sql para conectar la agenda' : 'Pendientes de realizar'}</span></div>
                </article>
                <article className="metric-card metric-coral">
                  <div className="metric-topline"><span>Alertas pendientes</span><Bell size={17} /></div>
                  <div className="metric-value">—</div>
                  <div className="metric-foot"><span className="metric-muted">Módulo de alertas aún no conectado</span></div>
                </article>
              </section>

              <section className="section-block">
                <div className="section-heading">
                  <div><p className="eyebrow">ACCIONES RÁPIDAS</p><h2>¿Qué necesitas hacer?</h2></div>
                </div>
                <div className="quick-actions">
                  <button className="quick-action" onClick={() => selectView('Empresas')}>
                    <span className="quick-icon quick-icon-green"><BriefcaseBusiness size={19} /></span>
                    <span><strong>Empresas</strong><small>Ver organizaciones</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => openModal('company')}>
                    <span className="quick-icon quick-icon-blue"><Plus size={20} /></span>
                    <span><strong>Nueva empresa</strong><small>Registrar organización</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => openModal('person')}>
                    <span className="quick-icon quick-icon-orange"><Users size={19} /></span>
                    <span><strong>Nueva persona</strong><small>Crear usuario</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => selectView('Capacitación')}>
                    <span className="quick-icon quick-icon-orange"><GraduationCap size={19} /></span>
                    <span><strong>Nueva capacitación</strong><small>Programar actividad</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => selectView('Consultar trabajadores')}>
                    <span className="quick-icon quick-icon-blue"><Users size={19} /></span>
                    <span><strong>Consultar trabajadores</strong><small>Ver personas registradas</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => selectView('Consultar capacitaciones')}>
                    <span className="quick-icon quick-icon-green"><GraduationCap size={19} /></span>
                    <span><strong>Consultar capacitaciones</strong><small>Ver actividades programadas</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => selectView('Plantillas')}>
                    <span className="quick-icon quick-icon-orange"><Plus size={20} /></span>
                    <span><strong>Crear plantillas</strong><small>Agregar un formato</small></span><ChevronRight size={17} />
                  </button>
                  <button className="quick-action" onClick={() => selectView('Plantillas')}>
                    <span className="quick-icon quick-icon-blue"><FileText size={19} /></span>
                    <span><strong>Plantillas</strong><small>Crear y consultar formatos</small></span><ChevronRight size={17} />
                  </button>
                </div>
              </section>

              <section className="section-block pending-section">
                <div className="section-heading section-heading-between">
                  <div><p className="eyebrow">SEGUIMIENTO</p><h2>Pendientes</h2></div>
                  <span className="pending-count">{pendingItems.length} por resolver</span>
                </div>
                <div className="pending-list">
                  {pendingItems.map((item) => (
                    <article className="pending-row" key={item.id}>
                      <span className="pending-icon"><Clock3 size={17} /></span>
                      <div className="pending-main"><strong>{item.title}</strong><span>{item.detail}</span></div>
                      <span className="pending-category">{item.category}</span>
                      <time>{item.dueDate}</time>
                      <span className={`priority-pill priority-${item.priority.toLowerCase()}`}>{item.priority}</span>
                    </article>
                  ))}
                </div>
              </section>

            </>
          )}

          {currentRole === 'admin' && activeView === 'Empresas' && (
            <section className="detail-view">
              <div className="welcome-row">
                <div><p className="eyebrow">PORTAFOLIO DE CLIENTES</p><h1>Empresas<span>.</span></h1><p className="welcome-copy">Administra la información y el estado de cada organización.</p></div>
                <button className="primary-button" onClick={() => openModal('company')}><Plus size={17} /> Nueva empresa</button>
              </div>
              <div className="list-toolbar"><span>{companies.length} empresas registradas</span><label className="list-search"><Search size={16} /><input placeholder="Buscar por nombre o sector" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} /></label></div>
              {companyError && <p className="database-alert" role="alert">{companyError}</p>}
              {isLoadingCompanies ? <div className="empty-state">Cargando empresas...</div> : <CompanyList companies={filteredCompanies} onSelectCompany={openCompanyFiles} onEditCompany={editCompany} onDeleteCompany={deleteCompany} deletingCompanyId={isDeletingCompanyId} />}
            </section>
          )}

          {currentRole === 'admin' && activeView === 'Gestión documental' && (
            <section className="detail-view">
              <div className="welcome-row"><div><p className="eyebrow">BIBLIOTECA DOCUMENTAL</p><h1>Gestión documental<span>.</span></h1><p className="welcome-copy">Selecciona una empresa para generar, adjuntar y consultar sus archivos.</p></div></div>
              {companyError && <p className="database-alert" role="alert">{companyError}</p>}
              {isLoadingCompanies ? <div className="empty-state">Cargando empresas...</div> : <CompanyList companies={filteredCompanies} actionLabel="Abrir archivos" onSelectCompany={openCompanyFiles} onEditCompany={editCompany} onDeleteCompany={deleteCompany} deletingCompanyId={isDeletingCompanyId} />}
            </section>
          )}

          {currentRole === 'admin' && activeView === 'Archivos de empresa' && selectedCompany && (
            <CompanyDocuments company={selectedCompany} canCreate userId={session?.user?.id} userEmail={accountEmail} userName={accountName} onBack={() => selectView('Inicio')} />
          )}

          {currentRole === 'admin' && activeView === 'Plantillas' && <TemplateLibrary />}

          {currentRole === 'intermedio' && activeView === 'Mi empresa' && (
            <section className="detail-view">
              <div className="welcome-row">
                <div><p className="eyebrow">EMPRESA ASIGNADA</p><h1>Mi empresa<span>.</span></h1><p className="welcome-copy">Consulta de solo lectura de la empresa asociada a tu cuenta.</p></div>
              </div>
              {companyError && <p className="database-alert" role="alert">{companyError}</p>}
              {isLoadingCompanies
                ? <div className="empty-state">Cargando empresa...</div>
                : companies.length
                  ? <CompanyList companies={companies} />
                  : <div className="empty-state"><BriefcaseBusiness size={20} /><strong>No hay una empresa asociada a esta cuenta</strong><span>Contacta al administrador para revisar la asignación.</span></div>}
            </section>
          )}

          {currentRole === 'intermedio' && activeView === 'Documentos de mi empresa' && (
            isLoadingCompanies
              ? <div className="empty-state">Cargando empresa...</div>
              : companies.length
                ? <CompanyDocuments company={companies[0]} canCreate={false} userId={session?.user?.id} userEmail={accountEmail} userName={accountName} onBack={() => selectView('Mi empresa')} />
                : <section className="detail-view"><div className="empty-state"><FileText size={20} /><strong>No hay una empresa asociada</strong><span>Contacta al administrador para revisar la asignación.</span></div></section>
          )}

          {activeView === 'Consultar trabajadores' && (
            <section className="detail-view records-view">
              <div className="welcome-row">
                <div>
                  <p className="eyebrow">CONSULTA DE REGISTROS</p>
                  <h1>{activeView}<span>.</span></h1>
                  <p className="welcome-copy">{currentRole === 'admin' ? 'Información de demostración para las empresas registradas.' : 'Capacitaciones disponibles para tu cuenta.'}</p>
                </div>
                {activeView === 'Consultar trabajadores' && <button className="primary-button" onClick={() => openModal('person')}><Plus size={17} /> Nuevo usuario</button>}
              </div>
              {activeView === 'Consultar trabajadores' && (
                <>
                  {employeeError && <p className="database-alert" role="alert">{employeeError}</p>}
                  {isLoadingEmployees
                    ? <div className="empty-state">Cargando trabajadores...</div>
                    : <EmployeeDirectory employees={employees} companies={companies}
                      onUpdated={(updatedEmployee) => setEmployees((items) => items.map((item) => item.id === updatedEmployee.id ? { ...item, ...updatedEmployee } : item))}
                      onDeleted={(employeeId) => setEmployees((items) => items.filter((item) => item.id !== employeeId))} />}
                </>
              )}
            </section>
          )}

          {activeView === 'Consultar capacitaciones' && <section className="detail-view"><TrainingCenter userId={session?.user?.id} isAdmin={currentRole === 'admin'} companies={companies} /></section>}
          {activeView === 'Firmas pendientes' && <section className="detail-view"><MySignatures userId={session?.user?.id} isSignatureDialogOpen={isSignatureDialogOpen} onManageSignature={() => setIsSignatureDialogOpen(true)} /></section>}
          {activeView === 'Capacitación' && currentRole === 'admin' && <section className="detail-view"><TrainingCenter userId={session?.user?.id} isAdmin companies={companies} /></section>}

          {activeView === 'Consultar plantillas' && currentRole === 'admin' && <TemplateLibrary />}

          {selectedModule && (
            <section className="detail-view module-detail">
              <div className="welcome-row">
                <div><p className="eyebrow">GESTIÓN OPERATIVA SG-SST / {selectedModule.code}</p><h1>{selectedModule.name}<span>.</span></h1><p className="welcome-copy">{selectedModule.description}</p></div>
                <button className="secondary-button" onClick={() => selectView('Inicio')}><Gauge size={16} /> Ir al resumen</button>
              </div>
              <div className="module-detail-panel">
                <span className={`module-icon module-icon-${selectedModule.tone}`}><selectedModule.icon size={20} /></span>
                <div><h2>Tu módulo está listo para organizarse</h2><p>Selecciona una empresa para consultar su información y comenzar a registrar actividades.</p></div>
                <button className="primary-button" onClick={() => selectView('Empresas')}>Seleccionar empresa <ChevronRight size={16} /></button>
              </div>
            </section>
          )}

          {!selectedModule && !['Inicio', 'Empresas', 'Gestión documental', 'Archivos de empresa', 'Plantillas', 'Mi empresa', 'Documentos de mi empresa', 'Consultar trabajadores', 'Consultar capacitaciones', 'Consultar plantillas', 'Capacitación', 'Firmas pendientes'].includes(activeView) && (
            <section className="detail-view module-detail">
              <div className="welcome-row"><div><p className="eyebrow">GESTIÓN OPERATIVA SG-SST</p><h1>{activeView}<span>.</span></h1><p className="welcome-copy">Organiza el seguimiento de {activeView.toLowerCase()} de tus empresas.</p></div><button className="secondary-button" onClick={() => selectView('Inicio')}><Gauge size={16} /> Ir al resumen</button></div>
              <div className="module-detail-panel"><span className="module-icon module-icon-blue"><ClipboardCheck size={20} /></span><div><h2>Empieza desde una empresa</h2><p>Elige una organización para registrar y consultar sus actividades de SG-SST.</p></div><button className="primary-button" onClick={() => selectView('Empresas')}>Ver empresas <ChevronRight size={16} /></button></div>
            </section>
          )}

          <footer className="page-footer"><span>SG-SST Platform <span className="footer-separator">/</span> Gestión preventiva</span><span>Datos de demostración</span></footer>
        </div>
      </main>

      {isModalOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeModal() }}>
          <section className="company-modal" role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <div className="modal-heading"><div><p className="eyebrow">GESTIÓN SG-SST</p><h2 id="modal-title">{editingCompany ? 'Editar empresa' : modalType === 'company' ? 'Nueva empresa' : modalType === 'person' ? 'Nueva persona' : 'Nueva capacitación'}</h2></div><button className="icon-button" aria-label="Cerrar formulario" onClick={closeModal}><X size={19} /></button></div>
            <p className="modal-copy">{editingCompany ? 'Actualiza la información operativa y de contacto. El ID, el NIT y la razón social permanecen fijos.' : modalType === 'company' ? 'Agrega una organización para comenzar a organizar su gestión SG-SST.' : modalType === 'person' ? 'Registra a una persona y asígnala a una empresa.' : 'Programa una actividad de formación para una empresa.'}</p>
            {editingCompany ? (
              <CompanyEditForm company={editingCompany} error={companyFormError} saving={isSavingCompany} onCancel={closeModal} onSave={updateCompany} onChange={(field, value) => setEditingCompany((company) => ({ ...company, [field]: value }))} />
            ) : modalType === 'person' ? (
              <EmployeeForm
                companies={companies}
                onCancel={closeModal}
                onCreated={({ employee, full_name, company_name, role }) => {
                  setEmployees((currentEmployees) => [{ ...employee, rol: role }, ...currentEmployees])
                  addPendingItem({
                    title: `Persona registrada: ${full_name}`,
                    detail: company_name,
                    category: 'Usuario',
                    dueDate: 'Hoy',
                    priority: 'Normal',
                  })
                  closeModal()
                }}
              />
            ) : (
            <form onSubmit={modalType === 'company' ? addCompany : addTraining}>
              {modalType === 'company' && (
                <>
                  <label className="form-field">Razón social<input autoFocus required value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Ej. Empresa del Norte S.A.S." /></label>
                  <label className="form-field">NIT
                    <span className="nit-input-group">
                      <input className="nit-number" required type="text" inputMode="numeric" pattern="[0-9]{1,18}" title="Escribe solo números, sin puntos ni guion." value={newCompanyNit} onChange={(event) => setNewCompanyNit(event.target.value.replace(/\D/g, ''))} placeholder="Número de NIT" />
                      <span className="nit-hyphen" aria-hidden="true">-</span>
                      <input className="nit-dv" required type="text" inputMode="numeric" pattern="[0-9]" maxLength={1} title="Escribe el dígito de verificación." aria-label="Dígito de verificación" value={newCompanyNitDv} onChange={(event) => setNewCompanyNitDv(event.target.value.replace(/\D/g, '').slice(0, 1))} />
                    </span>
                  </label>
                  <label className="form-field">Sector económico<select value={newCompanySector} onChange={(event) => setNewCompanySector(event.target.value)}><option value="">Selecciona un sector</option>{economicSectors.map((sector) => <option key={sector} value={sector}>{sector}</option>)}</select></label>
                  <label className="form-field">Número de trabajadores<input type="number" min="0" value={newCompanyWorkers} onChange={(event) => setNewCompanyWorkers(event.target.value)} placeholder="Ej. 25" /></label>
                  <label className="form-field">Paquete de servicios<select value={newCompanyPackage} onChange={(event) => setNewCompanyPackage(event.target.value)}><option value="">Selecciona un paquete</option>{servicePackages.map((servicePackage) => <option key={servicePackage} value={servicePackage}>{servicePackage}</option>)}</select></label>
                  <label className="form-field">Nombre del responsable<input value={newCompanyContact} onChange={(event) => setNewCompanyContact(event.target.value)} placeholder="Nombre completo" /></label>
                  <label className="form-field">Cargo del responsable<input value={newCompanyRole} onChange={(event) => setNewCompanyRole(event.target.value)} placeholder="Ej. Coordinador SST" /></label>
                  <label className="form-field">Correo de contacto<input type="email" value={newCompanyEmail} onChange={(event) => setNewCompanyEmail(event.target.value)} placeholder="contacto@empresa.com" /></label>
                  <div className="form-field-row">
                    <label className="form-field">Teléfono<input type="tel" value={newCompanyPhone} onChange={(event) => setNewCompanyPhone(event.target.value)} placeholder="Teléfono de contacto" /></label>
                    <label className="form-field extension-field">Ext<input type="text" inputMode="numeric" pattern="[0-9]{1,5}" maxLength={5} value={newCompanyExtension} onChange={(event) => setNewCompanyExtension(event.target.value.replace(/\D/g, '').slice(0, 5))} placeholder="12345" /></label>
                  </div>
                  <label className="form-field">Celular<input type="tel" value={newCompanyCell} onChange={(event) => setNewCompanyCell(event.target.value)} placeholder="Número celular" /></label>
                </>
              )}
              {modalType === 'training' && (
                <>
                  <label className="form-field">Nombre de la capacitación<input autoFocus required value={newTrainingName} onChange={(event) => setNewTrainingName(event.target.value)} placeholder="Ej. Inducción en seguridad" /></label>
                  <label className="form-field">Fecha<input type="date" required value={newTrainingDate} onChange={(event) => setNewTrainingDate(event.target.value)} /></label>
                  <label className="form-field">Empresa<select value={newTrainingCompany} onChange={(event) => setNewTrainingCompany(event.target.value)}>{companies.map((company) => <option key={company.nit} value={company.name}>{company.name}</option>)}</select></label>
                </>
              )}
              {modalType === 'company' && companyFormError && <p className="login-error" role="alert">{companyFormError}</p>}
              <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeModal}>Cancelar</button><button type="submit" className="primary-button" disabled={modalType === 'company' && isSavingCompany}><Plus size={16} /> {isSavingCompany && modalType === 'company' ? 'Guardando...' : modalType === 'company' ? 'Crear empresa' : 'Crear capacitación'}</button></div>
            </form>
            )}
          </section>
        </div>
      )}

      {isSignatureDialogOpen && session?.user?.id && <UserSignatureDialog userId={session.user.id} onClose={() => setIsSignatureDialogOpen(false)} />}
    </div>
  )
}

function CompanyEditForm({ company, error, saving, onCancel, onSave, onChange }) {
  const fields = [
    ['sector', 'Sector económico', 'select'],
    ['employees', 'Número de trabajadores', 'number'],
    ['level', 'Paquete de servicios', 'package'],
    ['contact', 'Nombre del responsable', 'text'],
    ['contactRole', 'Cargo del responsable', 'text'],
    ['email', 'Correo de contacto', 'email'],
    ['phone', 'Teléfono', 'text'],
    ['extension', 'Extensión', 'text'],
    ['cell', 'Celular', 'text'],
  ]
  return (
    <form onSubmit={onSave}>
      <p className="company-edit-identity"><strong>{company.name}</strong><span>NIT {company.nit}{company.nitVerification == null ? '' : `-${company.nitVerification}`} · ID {company.id}</span></p>
      {fields.map(([key, label, type]) => (
        <label className="form-field" key={key}>{label}
          {type === 'select' ? <select value={company[key]} onChange={(event) => onChange(key, event.target.value)}><option value="">Selecciona un sector</option>{economicSectors.map((item) => <option key={item} value={item}>{item}</option>)}</select>
            : type === 'package' ? <select value={company[key]} onChange={(event) => onChange(key, event.target.value)}><option value="">Selecciona un paquete</option>{servicePackages.map((item) => <option key={item} value={item}>{item}</option>)}</select>
              : <input type={type} min={type === 'number' ? '0' : undefined} value={company[key]} onChange={(event) => onChange(key, event.target.value)} />}
        </label>
      ))}
      {error && <p className="login-error" role="alert">{error}</p>}
      <div className="modal-actions"><button type="button" className="secondary-button" onClick={onCancel}>Cancelar</button><button type="submit" className="primary-button" disabled={saving}><Pencil size={16} /> {saving ? 'Guardando...' : 'Guardar cambios'}</button></div>
    </form>
  )
}

function CompanyList({ companies, onSelectCompany, actionLabel = 'Ver archivos', onEditCompany, onDeleteCompany, deletingCompanyId }) {
  if (!companies.length) {
    return <div className="empty-state"><Search size={20} /><strong>No encontramos empresas</strong><span>Prueba con otro nombre o sector.</span></div>
  }

  return (
    <div className="company-list">
      {companies.map((company) => (
        <article className="company-row" key={`${company.name}-${company.nit}`}>
          <span className="company-mark"><BriefcaseBusiness size={18} /></span>
          <div className="company-main">{onSelectCompany ? <button type="button" className="company-name-link" onClick={() => onSelectCompany(company)}>{company.name}</button> : <strong>{company.name}</strong>}<span>{company.sector} <i /> {company.employees} trabajadores</span></div>
          <span className="company-nit">NIT {company.nit}{company.nitVerification === null || company.nitVerification === undefined ? '' : `-${company.nitVerification}`}</span>
          <span className={`status-pill status-${company.status.toLowerCase().replace(' ', '-')}`}><span />{company.status}</span>
          <span className="company-level">{company.level}</span>
          <div className="company-row-actions">
            {onSelectCompany && <button className="company-open-button secondary-button" aria-label={`${actionLabel}: ${company.name}`} title={actionLabel} onClick={() => onSelectCompany(company)}><span>{actionLabel}</span><ChevronRight size={16} /></button>}
            {onEditCompany && <button type="button" className="row-action" aria-label={`Editar ${company.name}`} title="Editar empresa" onClick={() => onEditCompany(company)}><Pencil size={15} /></button>}
            {onDeleteCompany && <button type="button" className="row-action row-action-danger" aria-label={`Eliminar ${company.name}`} title="Eliminar empresa" disabled={String(deletingCompanyId) === String(company.id)} onClick={() => onDeleteCompany(company)}><Trash2 size={15} /></button>}
          </div>
        </article>
      ))}
    </div>
  )
}

function RecordList({ records, icon: Icon }) {
  return (
    <div className="record-list">
      {records.map((record) => (
        <article className="record-row" key={record.id}>
          <span className="record-icon"><Icon size={18} /></span>
          <div className="record-main"><strong>{record.title}</strong><span>{record.detail}</span></div>
          <span className="record-badge">{record.badge}</span>
          <span className="record-meta">{record.meta}</span>
        </article>
      ))}
    </div>
  )
}

function App() {
  const externalAuditToken = new URLSearchParams(window.location.search).get('auditoria')
  if (externalAuditToken) return <ExternalAuditPortal token={externalAuditToken} />
  return <AuthenticatedApp />
}

export default App
