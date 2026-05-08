import '../../types'
import { Hono } from 'hono'
import { secureHeaders } from 'hono/secure-headers'
import { bodyLimit } from 'hono/body-limit'
import type { Container } from '../../composition/composeContainer'
import { requestId } from './middleware/requestId'
import { requestLogger } from './middleware/requestLogger'
import { errorHandler } from './middleware/errorHandler'
import { widgetCors, adminCors } from './middleware/cors'
import { csrf } from './middleware/csrf'
import { healthRoutes } from './routes/health'
import { adminAuthRoutes } from './routes/adminAuth'
import { adminOnboardingRoutes } from './routes/adminOnboarding'
import { adminConfigRoutes } from './routes/adminConfig'
import { widgetConfigRoutes } from './routes/widgetConfig'
import { widgetSessionRoutes } from './routes/widgetSessions'
import { widgetStreamRoutes } from './routes/widgetStream'
import { widgetAssetRoutes } from './routes/widgetAssets'

export function createApp(c: Container): Hono {
  const app = new Hono()
  app.use('*', requestId())
  app.use('*', requestLogger(c.logger))
  app.use('*', errorHandler())
  app.use('*', secureHeaders({
    contentSecurityPolicy: {
      defaultSrc: ["'self'"],
      frameAncestors: ["'self'"],
    },
    referrerPolicy: 'strict-origin-when-cross-origin',
    xContentTypeOptions: 'nosniff',
    ...(c.env.COOKIE_SECURE
      ? { strictTransportSecurity: 'max-age=31536000; includeSubDomains' }
      : {}),
  }))
  app.use('*', bodyLimit({
    maxSize: c.env.MAX_BODY_BYTES,
    onError: (ctx) => ctx.json({ error: 'payload_too_large' }, 413),
  }))
  app.use('/v1/widget/*', widgetCors())
  app.use('/v1/admin/*', adminCors(c.env.ADMIN_ORIGIN))
  app.route('/v1/admin/auth', adminAuthRoutes(c))
  app.use('/v1/admin/onboarding/*', csrf({ secure: c.env.COOKIE_SECURE }))
  app.use('/v1/admin/config/*', csrf({ secure: c.env.COOKIE_SECURE }))
  app.route('/v1/admin/onboarding', adminOnboardingRoutes(c))
  app.route('/v1/admin/config', adminConfigRoutes(c))
  app.route('/', widgetAssetRoutes(c))
  app.route('/v1/widget/config', widgetConfigRoutes(c))
  app.route('/v1/widget/sessions', widgetSessionRoutes(c))
  app.route('/v1/widget/sessions', widgetStreamRoutes(c))
  app.route('/', healthRoutes(c))
  return app
}
