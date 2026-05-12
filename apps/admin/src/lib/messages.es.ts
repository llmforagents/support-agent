/**
 * messages.es.ts — Spanish message catalog for the admin app.
 */
const messages = {
  // ── Login ──────────────────────────────────────────────────────────────────
  'login.title': 'Admin Login',
  'login.description': 'Iniciá sesión para gestionar tu widget de soporte.',
  'login.email': 'Email',
  'login.password': 'Contraseña',
  'login.submit': 'Iniciar sesión',
  'login.submitting': 'Iniciando sesión…',
  'login.error.invalidCredentials': 'Email o contraseña incorrectos.',
  'login.error.generic': 'Algo salió mal. Intentá de nuevo.',

  // ── Onboarding wizard ──────────────────────────────────────────────────────
  'onboarding.step': 'Paso',
  'onboarding.of': 'de',
  'onboarding.stepLabel.welcome': 'Bienvenida',
  'onboarding.stepLabel.adminAccount': 'Cuenta Admin',
  'onboarding.stepLabel.siteConfig': 'Config. del Sitio',
  'onboarding.stepLabel.connectAgent': 'Conectar Agente',
  'onboarding.stepLabel.systemPrompt': 'Prompt del Sistema',
  'onboarding.stepLabel.embed': 'Integración',

  // ── WelcomeStep ────────────────────────────────────────────────────────────
  'welcome.title': 'Bienvenido a LLM4Agents Support',
  'welcome.description': 'Configurá tu widget de soporte con IA en pocos pasos.',
  'welcome.step1': 'Creá tu cuenta de administrador',
  'welcome.step2': 'Configurá los detalles de tu sitio',
  'welcome.step3': 'Conectá tu agente de IA',
  'welcome.step4': 'Personalizá el prompt del sistema',
  'welcome.step5': 'Integrá el widget en tu sitio',
  'welcome.cta': 'Empezar',

  // ── CreateAdminStep ────────────────────────────────────────────────────────
  'createAdmin.title': 'Crear Cuenta Admin',
  'createAdmin.description': 'Esta será tu cuenta para el dashboard de soporte.',
  'createAdmin.email': 'Email',
  'createAdmin.password': 'Contraseña',
  'createAdmin.passwordHint': 'Mínimo 12 caracteres',
  'createAdmin.submit': 'Crear cuenta',
  'createAdmin.submitting': 'Creando cuenta…',
  'createAdmin.error.conflict': 'Ya existe una cuenta de administrador.',
  'createAdmin.error.generic': 'No se pudo crear la cuenta. Intentá de nuevo.',

  // ── SiteConfigStep ─────────────────────────────────────────────────────────
  'siteConfig.title': 'Configuración del Sitio',
  'siteConfig.description': 'Personalizá cómo se ve tu widget de soporte.',
  'siteConfig.siteName': 'Nombre del sitio',
  'siteConfig.siteNamePlaceholder': 'Acme Soporte',
  'siteConfig.primaryColor': 'Color principal',
  'siteConfig.submit': 'Continuar',

  // ── ConnectAgentStep ───────────────────────────────────────────────────────
  'connectAgent.title': 'Conectar tu Agente',
  'connectAgent.description': 'Ingresá tu clave de API de LLM4Agents y elegí el modelo.',
  'connectAgent.apiKey': 'Clave de API LLM4Agents',
  'connectAgent.apiKeyPlaceholder': 'Pegá tu clave de 64 caracteres',
  'connectAgent.apiKeyHint': 'Obtené tu clave en',
  'connectAgent.model': 'Modelo',
  'connectAgent.submit': 'Continuar',

  // ── SystemPromptStep ───────────────────────────────────────────────────────
  'systemPrompt.title': 'Prompt del Sistema',
  'systemPrompt.description': 'Definí cómo debe comportarse tu agente de soporte.',
  'systemPrompt.label': 'Prompt del sistema',
  'systemPrompt.charCount': 'caracteres',
  'systemPrompt.submit': 'Guardar y continuar',
  'systemPrompt.submitting': 'Guardando…',
  'systemPrompt.error.generic': 'Algo salió mal. Intentá de nuevo.',

  // ── EmbedStep ──────────────────────────────────────────────────────────────
  'embed.title': 'Integrar el Widget',
  'embed.description': 'Copiá el fragmento y pegalo antes de la etiqueta',
  'embed.copy': 'Copiar fragmento',
  'embed.copied': '¡Copiado!',
  'embed.goToDashboard': 'Ir al dashboard',

  // ── Conversations ──────────────────────────────────────────────────────────
  'conversations.sectionTitle': 'Conversaciones',
  'conversations.supportDashboard': 'Dashboard de Soporte',
  'conversations.signOut': 'Cerrar sesión',
  'conversations.loading': 'Cargando…',
  'conversations.loadError': 'No se pudieron cargar las sesiones.',
  'conversations.empty': 'Todavía no hay conversaciones.',
  'conversations.selectPrompt': 'Seleccioná una conversación para ver los mensajes.',
  'conversations.threadStub': 'Hilo de la sesión',
  'conversations.visitorInfo': 'Info del Visitante',
  'conversations.visitorInfoPrompt': 'Seleccioná una conversación para ver los detalles del visitante.',
  'conversations.noMessages': 'Sin mensajes aún',

  // ── Knowledge base ─────────────────────────────────────────────────────────
  'kb.title': 'Knowledge base',
  'kb.upload': 'Subir documento',
  'kb.empty': 'Todavía no hay documentos. Subí un PDF, Markdown o texto plano para empezar.',
  'kb.errorBanner': 'Una o más fuentes están en error. Hacé click en "Ver" para más detalles.',
  'kb.activeOn': 'Activa',
  'kb.activeOff': 'Pausada',
  'kb.view': 'Ver',
  'kb.reindex': 'Re-indexar',
  'kb.delete': 'Eliminar',
  'kb.confirmDelete': '¿Eliminar esta fuente y todos sus chunks?',
  'kb.upload.title': 'Subir documento',
  'kb.upload.name': 'Nombre',
  'kb.upload.type': 'Tipo',
  'kb.upload.file': 'Archivo',
  'kb.upload.submit': 'Subir',
  'kb.upload.uploading': 'Subiendo…',
  'kb.detail.chunks': 'Primeros chunks',
  'kb.detail.close': 'Cerrar',

  // ── Sidebar ────────────────────────────────────────────────────────────────
  'sidebar.conversations': 'Conversaciones',
  'sidebar.knowledgeBase': 'Knowledge base',

  // ── Common ─────────────────────────────────────────────────────────────────
  'common.cancel': 'Cancelar',
  'common.close': 'Cerrar',
  'common.loading': 'Cargando…',

  // ── Accessibility ──────────────────────────────────────────────────────────
  'a11y.skipToContent': 'Saltar al contenido',
  'a11y.primaryNav': 'Navegación principal',
  'a11y.closeModal': 'Cerrar diálogo',
  'a11y.appRegion': 'Aplicación de soporte',
} as const

export default messages
export type AdminMessages = typeof messages
