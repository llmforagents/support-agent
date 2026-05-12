/**
 * messages.en.ts — English message catalog for the admin app.
 */
const messages = {
  // ── Login ──────────────────────────────────────────────────────────────────
  'login.title': 'Admin Login',
  'login.description': 'Sign in to manage your support widget.',
  'login.email': 'Email',
  'login.password': 'Password',
  'login.submit': 'Sign in',
  'login.submitting': 'Signing in…',
  'login.error.invalidCredentials': 'Invalid email or password.',
  'login.error.generic': 'Something went wrong. Please try again.',

  // ── Onboarding wizard ──────────────────────────────────────────────────────
  'onboarding.step': 'Step',
  'onboarding.of': 'of',
  'onboarding.stepLabel.welcome': 'Welcome',
  'onboarding.stepLabel.adminAccount': 'Admin Account',
  'onboarding.stepLabel.siteConfig': 'Site Config',
  'onboarding.stepLabel.connectAgent': 'Connect Agent',
  'onboarding.stepLabel.systemPrompt': 'System Prompt',
  'onboarding.stepLabel.embed': 'Embed',

  // ── WelcomeStep ────────────────────────────────────────────────────────────
  'welcome.title': 'Welcome to LLM4Agents Support',
  'welcome.description': 'Get your AI-powered support widget up and running in just a few steps.',
  'welcome.step1': 'Create your admin account',
  'welcome.step2': 'Configure your site details',
  'welcome.step3': 'Connect your AI agent',
  'welcome.step4': 'Customise the system prompt',
  'welcome.step5': 'Embed the widget on your site',
  'welcome.cta': 'Get started',

  // ── CreateAdminStep ────────────────────────────────────────────────────────
  'createAdmin.title': 'Create Admin Account',
  'createAdmin.description': 'This will be your login for the support dashboard.',
  'createAdmin.email': 'Email',
  'createAdmin.password': 'Password',
  'createAdmin.passwordHint': 'Minimum 12 characters',
  'createAdmin.submit': 'Create account',
  'createAdmin.submitting': 'Creating account…',
  'createAdmin.error.conflict': 'An admin account already exists.',
  'createAdmin.error.generic': 'Failed to create account. Please try again.',

  // ── SiteConfigStep ─────────────────────────────────────────────────────────
  'siteConfig.title': 'Site Configuration',
  'siteConfig.description': 'Customise how your support widget looks on your site.',
  'siteConfig.siteName': 'Site name',
  'siteConfig.siteNamePlaceholder': 'Acme Support',
  'siteConfig.primaryColor': 'Primary colour',
  'siteConfig.submit': 'Continue',

  // ── ConnectAgentStep ───────────────────────────────────────────────────────
  'connectAgent.title': 'Connect Your Agent',
  'connectAgent.description': 'Enter your LLM4Agents API key and choose the model for your support agent.',
  'connectAgent.apiKey': 'LLM4Agents API key',
  'connectAgent.apiKeyPlaceholder': 'Paste your 64-character API key',
  'connectAgent.apiKeyHint': 'Get your key from',
  'connectAgent.model': 'Model',
  'connectAgent.submit': 'Continue',

  // ── SystemPromptStep ───────────────────────────────────────────────────────
  'systemPrompt.title': 'System Prompt',
  'systemPrompt.description': 'Define how your AI support agent should behave.',
  'systemPrompt.label': 'System prompt',
  'systemPrompt.charCount': 'characters',
  'systemPrompt.submit': 'Save & continue',
  'systemPrompt.submitting': 'Saving…',
  'systemPrompt.error.generic': 'Something went wrong. Please try again.',

  // ── EmbedStep ──────────────────────────────────────────────────────────────
  'embed.title': 'Embed the Widget',
  'embed.description': 'Copy the snippet below and paste it before the closing',
  'embed.copy': 'Copy snippet',
  'embed.copied': 'Copied!',
  'embed.goToDashboard': 'Go to dashboard',

  // ── Conversations ──────────────────────────────────────────────────────────
  'conversations.sectionTitle': 'Conversations',
  'conversations.supportDashboard': 'Support Dashboard',
  'conversations.signOut': 'Sign out',
  'conversations.loading': 'Loading…',
  'conversations.loadError': 'Failed to load sessions.',
  'conversations.empty': 'No conversations yet.',
  'conversations.selectPrompt': 'Select a conversation to view messages.',
  'conversations.threadStub': 'Thread for session',
  'conversations.visitorInfo': 'Visitor Info',
  'conversations.visitorInfoPrompt': 'Select a conversation to see visitor details.',
  'conversations.noMessages': 'No messages yet',

  // ── Knowledge base ─────────────────────────────────────────────────────────
  'kb.title': 'Knowledge base',
  'kb.upload': 'Upload document',
  'kb.empty': 'No documents yet. Upload a PDF, Markdown, or plain text file to get started.',
  'kb.errorBanner': 'One or more sources have errors. Click "View" for details.',
  'kb.activeOn': 'Active',
  'kb.activeOff': 'Paused',
  'kb.view': 'View',
  'kb.reindex': 'Re-index',
  'kb.delete': 'Delete',
  'kb.confirmDelete': 'Delete this source and all its chunks?',
  'kb.upload.title': 'Upload document',
  'kb.upload.name': 'Name',
  'kb.upload.type': 'Type',
  'kb.upload.file': 'File',
  'kb.upload.submit': 'Upload',
  'kb.upload.uploading': 'Uploading…',
  'kb.detail.chunks': 'First chunks',
  'kb.detail.close': 'Close',

  // ── Sidebar ────────────────────────────────────────────────────────────────
  'sidebar.conversations': 'Conversations',
  'sidebar.knowledgeBase': 'Knowledge base',

  // ── Common ─────────────────────────────────────────────────────────────────
  'common.cancel': 'Cancel',
  'common.close': 'Close',
  'common.loading': 'Loading…',

  // ── Accessibility ──────────────────────────────────────────────────────────
  'a11y.skipToContent': 'Skip to content',
  'a11y.primaryNav': 'Primary navigation',
  'a11y.closeModal': 'Close dialog',
  'a11y.appRegion': 'Support application',
} as const

export default messages
export type AdminMessages = typeof messages
