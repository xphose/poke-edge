/** Rule-of-thumb % of Near Mint (TCG singles). For viewing only — not from graded APIs. */
export const CONDITION_LABELS: Record<string, string> = {
  NM: 'Near Mint — baseline',
  LP: 'Lightly Played',
  MP: 'Moderately Played',
  HP: 'Heavily Played',
  Damaged: 'Damaged / creased',
}

export const CONDITION_PCT: Record<string, number> = {
  NM: 1,
  LP: 0.85,
  MP: 0.65,
  HP: 0.45,
  Damaged: 0.25,
}

export type ConditionCode = keyof typeof CONDITION_PCT

const LS_COND = 'pokeedge_condition'
const LS_ADJ = 'pokeedge_show_adjusted'

export function loadStoredCondition(): ConditionCode {
  try {
    const v = localStorage.getItem(LS_COND) as ConditionCode | null
    if (v && v in CONDITION_PCT) return v
  } catch {
    /* ignore */
  }
  return 'NM'
}

export function saveStoredCondition(c: ConditionCode) {
  try {
    localStorage.setItem(LS_COND, c)
  } catch {
    /* ignore */
  }
}

export function loadShowAdjusted(): boolean {
  try {
    return localStorage.getItem(LS_ADJ) === '1'
  } catch {
    return false
  }
}

export function saveShowAdjusted(v: boolean) {
  try {
    localStorage.setItem(LS_ADJ, v ? '1' : '0')
  } catch {
    /* ignore */
  }
}

export function adjustPrice(price: number | null | undefined, cond: ConditionCode): number | null {
  if (price == null || Number.isNaN(price)) return null
  const m = CONDITION_PCT[cond] ?? 1
  return price * m
}
