import { Router, Request, Response } from 'express'
import Stripe from 'stripe'
import type { Database } from 'better-sqlite3'
import { config } from '../config.js'
import { authenticate } from '../middleware/auth.js'

export function stripeRoutes(db: Database): Router {
  const router = Router()

  if (!config.stripeSecretKey) {
    router.use((_req, res) => {
      res.status(503).json({ error: 'Stripe not configured' })
    })
    return router
  }

  const stripe = new Stripe(config.stripeSecretKey)

  router.post('/create-checkout', authenticate, async (req: Request, res: Response) => {
    try {
      const { priceType } = req.body as { priceType?: 'monthly' | 'yearly' }
      const priceId = priceType === 'yearly' ? config.stripePriceIdYearly : config.stripePriceIdMonthly
      if (!priceId) {
        res.status(400).json({ error: 'Price not configured' })
        return
      }

      const user = db.prepare('SELECT id, email, stripe_customer_id FROM users WHERE id = ?')
        .get(req.user!.userId) as { id: number; email: string; stripe_customer_id: string | null } | undefined
      if (!user) {
        res.status(404).json({ error: 'User not found' })
        return
      }

      let customerId = user.stripe_customer_id
      if (!customerId) {
        const customer = await stripe.customers.create({ email: user.email, metadata: { userId: String(user.id) } })
        customerId = customer.id
        db.prepare('UPDATE users SET stripe_customer_id = ? WHERE id = ?').run(customerId, user.id)
      }

      const session = await stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        line_items: [{ price: priceId, quantity: 1 }],
        success_url: `${config.publicAppUrl}/settings?upgraded=true`,
        cancel_url: `${config.publicAppUrl}/settings?cancelled=true`,
        metadata: { userId: String(user.id) },
      })

      res.json({ url: session.url })
    } catch (e) {
      console.error('[stripe] Checkout error:', e)
      res.status(500).json({ error: 'Failed to create checkout session' })
    }
  })

  router.post('/portal', authenticate, async (req: Request, res: Response) => {
    try {
      const user = db.prepare('SELECT stripe_customer_id FROM users WHERE id = ?')
        .get(req.user!.userId) as { stripe_customer_id: string | null } | undefined
      if (!user?.stripe_customer_id) {
        res.status(400).json({ error: 'No active subscription' })
        return
      }
      const session = await stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: `${config.publicAppUrl}/settings`,
      })
      res.json({ url: session.url })
    } catch (e) {
      console.error('[stripe] Portal error:', e)
      res.status(500).json({ error: 'Failed to create portal session' })
    }
  })

  router.get('/status', authenticate, (req: Request, res: Response) => {
    const user = db.prepare('SELECT role, stripe_customer_id, stripe_subscription_id FROM users WHERE id = ?')
      .get(req.user!.userId) as { role: string; stripe_customer_id: string | null; stripe_subscription_id: string | null } | undefined
    if (!user) {
      res.status(404).json({ error: 'User not found' })
      return
    }
    res.json({
      role: user.role,
      hasSubscription: !!user.stripe_subscription_id,
      customerId: user.stripe_customer_id,
    })
  })

  return router
}

export function stripeWebhookRoute(db: Database): Router {
  const router = Router()

  if (!config.stripeSecretKey || !config.stripeWebhookSecret) return router

  const stripe = new Stripe(config.stripeSecretKey)

  router.post('/stripe-webhook',
    (req: Request, res: Response) => {
      const sig = req.headers['stripe-signature'] as string
      let event: Stripe.Event
      try {
        event = stripe.webhooks.constructEvent(req.body, sig, config.stripeWebhookSecret)
      } catch (e) {
        console.error('[stripe] Webhook signature verification failed:', e)
        res.status(400).send(`Webhook Error: ${e}`)
        return
      }

      switch (event.type) {
        case 'checkout.session.completed': {
          const session = event.data.object as Stripe.Checkout.Session
          const userId = session.metadata?.userId
          if (userId && session.subscription) {
            db.prepare('UPDATE users SET role = ?, stripe_subscription_id = ? WHERE id = ?')
              .run('premium', String(session.subscription), Number(userId))
            console.log(`[stripe] User ${userId} upgraded to premium`)
          }
          break
        }
        case 'customer.subscription.deleted': {
          const sub = event.data.object as Stripe.Subscription
          const user = db.prepare('SELECT id FROM users WHERE stripe_subscription_id = ?')
            .get(String(sub.id)) as { id: number } | undefined
          if (user) {
            db.prepare('UPDATE users SET role = ?, stripe_subscription_id = NULL WHERE id = ?')
              .run('free', user.id)
            console.log(`[stripe] User ${user.id} downgraded to free`)
          }
          break
        }
        case 'customer.subscription.updated': {
          const sub = event.data.object as Stripe.Subscription
          const user = db.prepare('SELECT id FROM users WHERE stripe_subscription_id = ?')
            .get(String(sub.id)) as { id: number } | undefined
          if (user && sub.status === 'active') {
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run('premium', user.id)
          } else if (user && (sub.status === 'canceled' || sub.status === 'unpaid')) {
            db.prepare('UPDATE users SET role = ? WHERE id = ?').run('free', user.id)
          }
          break
        }
      }

      res.json({ received: true })
    }
  )

  return router
}
