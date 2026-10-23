import { db } from './db.ts'

export type BoardMessage = { id: string; name: string; message: string; created_ms: number }

export function visibleMessages(): BoardMessage[] {
  // Keep original family-linked messages in their original table, with stable IDs.
  return db.prepare(`SELECT * FROM (
    SELECT 'legacy:' || id AS id, name, message, created_ms FROM guest_messages WHERE hidden=0
    UNION ALL
    SELECT 'public:' || id AS id, name, message, created_ms FROM public_messages WHERE hidden=0
  ) ORDER BY created_ms DESC, id DESC LIMIT 100`).all() as BoardMessage[]
}

export function hideMessage(id: string): number {
  const match = /^(?:(legacy|public):)?([1-9][0-9]*)$/.exec(id)
  if (!match) return 0
  const table = match[1] === 'public' ? 'public_messages' : 'guest_messages'
  return Number(db.prepare(`UPDATE ${table} SET hidden=1 WHERE id=?`).run(match[2]).changes)
}
