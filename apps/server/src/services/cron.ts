import cron from 'node-cron'
import type Database from 'better-sqlite3'
import { ingestPokemonTcg } from './pokemontcg.js'
import { runFullModel } from './model.js'
import { pollRedditOptimized } from './reddit.js'
import { refreshTrendsForAllCharacters } from './trends.js'
import { refreshEbayMediansForCards } from './ebay.js'
import { recordPriceSnapshot } from './priceHistory.js'
import { refreshSetMetrics } from './setMetrics.js'
import { notifyPriceAlerts } from './push.js'

let refreshing = false

export function startCronJobs(db: Database.Database) {
  const safe = (name: string, fn: () => void | Promise<void>) => async () => {
    if (refreshing) return
    refreshing = true
    try {
      await Promise.resolve(fn())
    } catch (e) {
      console.error(`[cron ${name}]`, e)
    } finally {
      refreshing = false
    }
  }

  cron.schedule('0 */4 * * *', safe('prices', () => fullRefresh(db)))
  cron.schedule('0 */6 * * *', safe('ebay', () => refreshEbayMediansForCards(db)))
  cron.schedule('*/30 * * * *', safe('reddit', async () => {
    await pollRedditOptimized(db)
  }))
  cron.schedule('0 3 * * *', safe('trends', () => refreshTrendsForAllCharacters(db)))
  cron.schedule('0 4 * * 0', safe('regression', () => runFullModel(db)))
  cron.schedule('*/15 * * * *', safe('alerts', () => notifyPriceAlerts(db)))
}

export async function fullRefresh(db: Database.Database) {
  await ingestPokemonTcg(db)
  runFullModel(db)
  recordPriceSnapshot(db)
  refreshSetMetrics(db)
}
