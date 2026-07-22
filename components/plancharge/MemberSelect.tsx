'use client'

import { useState, useMemo, useRef, useEffect } from 'react'
import { ProjectMember } from '@/types'
import { ChevronDown, Search, Check, X, UserRound } from 'lucide-react'

interface Props {
  members: ProjectMember[]
  value: string // user_id ou ''
  onChange: (userId: string) => void
}

export default function MemberSelect({ members, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = useRef<HTMLDivElement>(null)

  const selected = members.find(m => m.user_id === value)

  useEffect(() => {
    if (!open) return
    const onDoc = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', onDoc)
    return () => document.removeEventListener('mousedown', onDoc)
  }, [open])

  // Regrouper par corps de métier
  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = members.filter(m => {
      if (!q) return true
      const p = m.profile
      return [p?.full_name, p?.company, p?.trade].some(v => v?.toLowerCase().includes(q))
    })
    const map = new Map<string, ProjectMember[]>()
    filtered.forEach(m => {
      const key = m.profile?.trade?.trim() || 'Sans corps de métier'
      if (!map.has(key)) map.set(key, [])
      map.get(key)!.push(m)
    })
    return Array.from(map.entries())
      .sort((a, b) => (a[0] === 'Sans corps de métier' ? 1 : b[0] === 'Sans corps de métier' ? -1 : a[0].localeCompare(b[0])))
      .map(([trade, list]) => ({
        trade,
        list: list.sort((a, b) => (a.profile?.company || a.profile?.full_name || '').localeCompare(b.profile?.company || b.profile?.full_name || '')),
      }))
  }, [members, query])

  const label = selected
    ? `${selected.profile?.full_name || 'Utilisateur'}${selected.profile?.company ? ` — ${selected.profile.company}` : ''}`
    : '— Non assigné —'

  return (
    <div className="relative mt-1" ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen(o => !o); setQuery('') }}
        className="w-full h-9 rounded-lg border border-input bg-white px-2.5 text-sm flex items-center justify-between gap-2 text-left"
      >
        <span className={`truncate ${selected ? 'text-gray-800' : 'text-gray-400 italic'}`}>{label}</span>
        <ChevronDown size={15} className="text-gray-400 shrink-0" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-xl border border-gray-100 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-1.5 bg-gray-50 rounded-md px-2">
              <Search size={13} className="text-gray-400" />
              <input
                autoFocus
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Rechercher (nom, entreprise, métier)…"
                className="flex-1 bg-transparent py-1.5 text-sm outline-none"
              />
              {query && <button type="button" onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={13} /></button>}
            </div>
          </div>

          <div className="max-h-60 overflow-y-auto py-1">
            {/* Non assigné */}
            <button
              type="button"
              onClick={() => { onChange(''); setOpen(false) }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-500 italic hover:bg-gray-50"
            >
              <UserRound size={13} className="text-gray-300" /> — Non assigné —
              {!value && <Check size={13} className="ml-auto text-orange-500" />}
            </button>

            {groups.length === 0 && (
              <p className="text-xs text-gray-400 text-center py-4">Aucun résultat</p>
            )}

            {groups.map(g => (
              <div key={g.trade}>
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold text-gray-400 uppercase tracking-wide sticky top-0 bg-white">{g.trade}</div>
                {g.list.map(m => {
                  const isSel = m.user_id === value
                  return (
                    <button
                      key={m.user_id}
                      type="button"
                      onClick={() => { onChange(m.user_id); setOpen(false) }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-left hover:bg-orange-50 ${isSel ? 'bg-orange-50' : ''}`}
                    >
                      <span className="w-5 h-5 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[9px] font-bold shrink-0">
                        {(m.profile?.full_name || 'U')[0].toUpperCase()}
                      </span>
                      <span className="flex-1 min-w-0">
                        <span className="block text-gray-800 truncate">{m.profile?.company || m.profile?.full_name}</span>
                        {m.profile?.company && m.profile?.full_name && (
                          <span className="block text-[11px] text-gray-400 truncate">{m.profile.full_name}</span>
                        )}
                      </span>
                      {isSel && <Check size={14} className="text-orange-500 shrink-0" />}
                    </button>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
