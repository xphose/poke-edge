import { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { Database } from 'better-sqlite3'
import { config } from '../config.js'

export type UserRole = 'free' | 'premium' | 'admin'

export interface JwtPayload {
  userId: number
  username: string
  role: UserRole
}

const FREE_SET_LIMIT = 3

let freeSetIdsCache: string[] | null = null
let freeSetIdsCacheTime = 0
const CACHE_TTL = 60_000

export function getFreeSetIds(db: Database): string[] {
  const now = Date.now()
  if (freeSetIdsCache && now - freeSetIdsCacheTime < CACHE_TTL) return freeSetIdsCache
  const rows = db.prepare(
    `SELECT id FROM sets
     WHERE release_date IS NOT NULL AND trim(release_date) != ''
     ORDER BY release_date DESC
     LIMIT ?`
  ).all(FREE_SET_LIMIT) as { id: string }[]
  freeSetIdsCache = rows.map(r => r.id)
  freeSetIdsCacheTime = now
  return freeSetIdsCache
}

export function isFreeUser(req: Request): boolean {
  return !req.user || req.user.role === 'free'
}

export function freeSetFilter(db: Database, req: Request): { sql: string; ids: string[] } | null {
  if (!isFreeUser(req)) return null
  const ids = getFreeSetIds(db)
  if (!ids.length) return null
  const placeholders = ids.map(() => '?').join(', ')
  return { sql: ` AND set_id IN (${placeholders})`, ids }
}

declare global {
  namespace Express {
    interface Request {
      user?: JwtPayload
    }
  }
}

export function authenticate(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, config.jwtSecret) as JwtPayload
    req.user = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}

export function optionalAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) {
    try {
      req.user = jwt.verify(header.slice(7), config.jwtSecret) as JwtPayload
    } catch {
      // token invalid, continue as unauthenticated
    }
  }
  next()
}

export function requireRole(...roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({ error: 'Authentication required' })
      return
    }
    if (!roles.includes(req.user.role)) {
      res.status(403).json({ error: 'Insufficient permissions' })
      return
    }
    next()
  }
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: 'Authentication required' })
    return
  }
  if (req.user.role !== 'admin') {
    res.status(403).json({ error: 'Admin access required' })
    return
  }
  next()
}
