import webpush from 'web-push'
import type Database from 'better-sqlite3'
import { config } from '../config.js'

export function configureWebPush() {
  if (config.vapidPublicKey && config.vapidPrivateKey) {
    webpush.setVapidDetails(config.vapidSubject, config.vapidPublicKey, config.vapidPrivateKey)
  }
}

export function getVapidPublicKey() {
  return config.vapidPublicKey || ''
}

export function saveSubscription(
  db: Database.Database,
  body: { endpoint?: string; keys?: { p256dh: string; auth: string } },
) {
  const endpoint = body.endpoint
  const keys = body.keys
  if (!endpoint || !keys?.p256dh || !keys?.auth) throw new Error('Invalid subscription')
  db.prepare(
    `INSERT INTO push_subscriptions (endpoint, keys_json, created_at) VALUES (?, ?, ?)
     ON CONFLICT(endpoint) DO UPDATE SET keys_json = excluded.keys_json`,
  ).run(endpoint, JSON.stringify(keys), new Date().toISOString())
}

export async function notifyPriceAlerts(db: Database.Database) {
  if (!config.vapidPublicKey || !config.vapidPrivateKey) return

  const rows = db
    .prepare(
      `SELECT w.card_id, w.target_buy_price, c.name, c.market_price
       FROM watchlist w JOIN cards c ON c.id = w.card_id
       WHERE w.alert_active = 1 AND w.target_buy_price IS NOT NULL AND c.market_price IS NOT NULL
         AND c.market_price <= w.target_buy_price`,
    )
    .all() as { card_id: string; target_buy_price: number; name: string; market_price: number }[]

  if (!rows.length) return

  const subs = db.prepare(`SELECT endpoint, keys_json FROM push_subscriptions`).all() as {
    endpoint: string
    keys_json: string
  }[]

  for (const s of subs) {
    const keys = JSON.parse(s.keys_json) as { p256dh: string; auth: string }
    for (const r of rows) {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys },
          JSON.stringify({
            title: 'PokeGrails price alert',
            body: `${r.name} is at $${r.market_price.toFixed(2)} (target $${r.target_buy_price.toFixed(2)})`,
          }),
        )
      } catch {
        /* invalid subscription */
      }
    }
  }
}
