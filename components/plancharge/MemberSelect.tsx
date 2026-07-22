'use client'

import { useState, useMemo } from 'react'
import { ProjectMember } from '@/types'
import { ChevronRight, Search, Check, X, UserRound } from 'lucide-react'

interface Props {
  members: ProjectMember[]
  value: string // user_id ou ''
  onChange: (userId: string) => void
}

export default function MemberSelect({ members, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeTrade, setActiveTrade] = useState<string | null>(null)

  const selected = members.find(m => m.user_id === value)

  // Liste des métiers présents (pour les tags de filtre)
  const allTrades = useMemo(() => {
    const set = new Set<string>()
    members.forEach(m => { const t = m.profile?.trade?.trim(); if (t) set.add(t) })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [members])

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = members.filter(m => {
      if (activeTrade && (m.profile?.trade?.trim() || '') !== activeTrade) return false
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
  }, [members, query, activeTrade])

  const select = (id: string) => { onChange(id); setOpen(false); setQuery(''); setActiveTrade(null) }

  return (
    <>
      {/* Champ déclencheur */}
      <button
        type="button"
        onClick={() => { setOpen(true); setQuery(''); setActiveTrade(null) }}
        className="mt-1 w-full min-h-9 rounded-lg border border-input bg-white px-2 py-1.5 text-sm flex items-center gap-2 text-left"
      >
        {selected ? (
          <>
            <span className="w-6 h-6 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[10px] font-bold shrink-0">
              {(selected.profile?.full_name || 'U')[0].toUpperCase()}
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-gray-800 truncate">{selected.profile?.company || selected.profile?.full_name}</span>
              {selected.profile?.trade && <span className="block text-[11px] text-gray-400 truncate">{selected.profile.trade}</span>}
            </span>
          </>
        ) : (
          <span className="flex-1 text-gray-400 italic">— Non assigné —</span>
        )}
        <ChevronRight size={16} className="text-gray-400 shrink-0" />
      </button>

      {/* Écran de sélection plein format */}
      {open && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={() => setOpen(false)}>
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[85vh]" onClick={e => e.stopPropagation()}>
            {/* En-tête */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-900">Choisir un adhérent</h3>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
            </div>

            {/* Recherche */}
            <div className="px-4 py-2.5 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2 bg-gray-100 rounded-lg px-3">
                <Search size={15} className="text-gray-400" />
                <input
                  autoFocus
                  value={query}
                  onChange={e => setQuery(e.target.value)}
                  placeholder="Rechercher un nom, une entreprise, un métier…"
                  className="flex-1 bg-transparent py-2.5 text-sm outline-none"
                />
                {query && <button onClick={() => setQuery('')} className="text-gray-300 hover:text-gray-500"><X size={15} /></button>}
              </div>
            </div>

            {/* Tags de filtre par métier */}
            <div className="px-3 py-2 border-b border-gray-100 shrink-0 flex gap-1.5 overflow-x-auto no-scrollbar">
              <button
                type="button"
                onClick={() => setActiveTrade(null)}
                className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${!activeTrade ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
              >
                Tous
              </button>
              {allTrades.map(t => (
                <button
                  key={t}
                  type="button"
                  onClick={() => setActiveTrade(activeTrade === t ? null : t)}
                  className={`shrink-0 px-2.5 py-1 rounded-full text-xs font-medium whitespace-nowrap transition-colors ${activeTrade === t ? 'bg-orange-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                >
                  {t}
                </button>
              ))}
            </div>

            {/* Liste */}
            <div className="flex-1 overflow-y-auto">
              <button
                type="button"
                onClick={() => select('')}
                className="w-full flex items-center gap-2 px-4 py-3 text-sm text-gray-500 italic hover:bg-gray-50 border-b border-gray-50"
              >
                <UserRound size={15} className="text-gray-300" /> — Non assigné —
                {!value && <Check size={15} className="ml-auto text-orange-500" />}
              </button>

              {groups.length === 0 && <p className="text-sm text-gray-400 text-center py-10">Aucun résultat pour « {query} »</p>}

              {groups.map(g => (
                <div key={g.trade}>
                  <div className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide bg-gray-50/60">{g.trade}</div>
                  {g.list.map(m => {
                    const isSel = m.user_id === value
                    return (
                      <button
                        key={m.user_id}
                        type="button"
                        onClick={() => select(m.user_id)}
                        className={`w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-orange-50 ${isSel ? 'bg-orange-50' : ''}`}
                      >
                        <span className="w-8 h-8 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
                          {(m.profile?.full_name || 'U')[0].toUpperCase()}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm text-gray-800 truncate">{m.profile?.company || m.profile?.full_name}</span>
                          {m.profile?.company && m.profile?.full_name && <span className="block text-xs text-gray-400 truncate">{m.profile.full_name}</span>}
                        </span>
                        {isSel && <Check size={16} className="text-orange-500 shrink-0" />}
                      </button>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
