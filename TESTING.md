# PokéEdge — testing and manual QA

## Quick run

From the repository root:

```bash
npm install
npm run dev
```

- UI: http://localhost:5173 (Vite proxies `/api` to the API)
- API: http://127.0.0.1:3001 — try `GET /api/health`

Run **only** the API or **only** the UI:

```bash
npm run dev:api
npm run dev:web
```

Copy `.env.example` to `.env` and optionally set `POKEMONTCG_API_KEY` (see [Pokémon TCG API](https://dev.pokemontcg.io/)).

## Automated tests

```bash
npm test                 # server + web
npm run test:server      # Vitest: helpers, API routes (in-memory SQLite)
npm run test:web         # Vitest + Testing Library: layout smoke test
```

## Manual checklist (per release)

| Area | What to verify |
|------|----------------|
| Dashboard | KPIs load; scatter has points after ingest; error banner + Retry if API is down |
| Cards | Search; set + print filters; sortable headers; condition-adjusted columns (toggle); row opens sheet with image and links; PSA block shows numbers |
| Buy Signals | Lists undervalued cards; external links open |
| Sets | Set grid and verdict copy |
| Watchlist | Add by card id; optional target price; P&amp;L when purchase price set |
| Card Show | Download HTML opens; preview tab shows printable view |
| API | `POST /api/internal/refresh` completes (may take minutes first time) |

## Model / predictions

- **Same Pull + same Desirability ⇒ same predicted price** — the fair-value formula is deterministic. If two rows show identical scores, identical `$` predictions are expected until character parsing or tier signals differentiate them.
- After changing **`parseCharacterName`** or related model logic, run a full refresh (`POST /api/internal/refresh` or your ingest + `runFullModel` path) so `character_name` and scores are recomputed.

## Suggestions (next iterations)

1. **E2E:** Add Playwright for full browser flows against `npm run dev` (health → dashboard paints).
2. **Row sparklines:** Load last N `price_history` points per card (batched endpoint) for the Cards table column.
3. **Nav active state:** Already uses `NavLink` with `end` on Dashboard so sub-routes do not highlight Home.
4. **Accessibility:** Add `aria-busy` on tables during load; ensure focus trap in sheet (shadcn Sheet).
5. **Stricter API tests:** Mock `fetch` for `/api/arbitrage` FX call to avoid network in CI.
