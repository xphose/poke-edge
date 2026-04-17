/**
 * PM2 process spec. Running in cluster mode lets us use >1 CPU core for
 * request handling — better-sqlite3 is synchronous, so a single Node process
 * blocks the event loop during any DB query. With 2 workers, one thread can
 * be answering /api/cards while another computes gradient-boost predictions.
 *
 * Why 2 and not 4 on a 4-core box?
 *   • Each worker opens its own SQLite connection + 64 MiB page cache +
 *     64 MiB in-memory analytics cache ≈ 400-600 MB steady-state RSS.
 *     2 workers ≈ 1 GB; 4 workers ≈ 2 GB. Leaves room for the backup
 *     container, Caddy, Reddit poller spikes, and the kernel page cache
 *     that actually makes SQLite fast.
 *   • SQLite writes serialize through the WAL regardless of worker count,
 *     so beyond 2 readers the marginal benefit drops.
 *   • Worker 0 is the "primary" — it owns all cron jobs, the Reddit poller,
 *     and the initial data ingest. Other workers are HTTP-only. See
 *     apps/server/src/index.ts for the election logic.
 *
 * Known cluster-mode limitations (acceptable for current scale):
 *   • The in-memory HTTP cache (apps/server/src/cache.ts) is per-worker.
 *     First request for a given key may miss on each worker before it
 *     warms up — small fixed cost, not a hot-path problem.
 *   • express-rate-limit uses a per-worker memory store, so the effective
 *     window is 2× the configured value (300 req/15m per worker → up to
 *     600 req/15m per IP). Fine for a content site; revisit if abuse.
 *   • Admin model-run state (shared.ts startRun/isRunning) is per-worker.
 *     Two admins hitting /api/models/run/x simultaneously on different
 *     workers could both start; SQLite write-lock serializes the actual
 *     work. Not user-visible.
 */
module.exports = {
  apps: [
    {
      name: 'pokegrails-api',
      script: 'apps/server/dist/index.js',
      instances: 2,
      exec_mode: 'cluster',
      autorestart: true,
      watch: false,
      max_memory_restart: '1200M',
      kill_timeout: 10000, // give in-flight DB writes time to commit on restart
      wait_ready: false,
      listen_timeout: 15000,
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      error_file: '/app/logs/api-error.log',
      out_file: '/app/logs/api-out.log',
      merge_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    },
  ],
}
