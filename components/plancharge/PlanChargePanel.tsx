'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Lot, PlanTemplate, ProjectMember } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Plus, LayoutGrid, Loader2, Wand2, GripVertical, Trash2,
  Pencil, Copy, UserCog, Link2, Link2Off
} from 'lucide-react'
import LotDialog from './LotDialog'

export const LOT_COLORS: Record<string, string> = {
  blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500',
  orange: 'bg-orange-500', amber: 'bg-amber-500', teal: 'bg-teal-500', purple: 'bg-purple-500',
  cyan: 'bg-cyan-500', gray: 'bg-gray-500', pink: 'bg-pink-500',
}

interface Props {
  user: User
  project: Project
  isAdmin: boolean
  initialLots: Lot[]
  members: ProjectMember[]
  templates: PlanTemplate[]
}

const MS_DAY = 86400000
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / MS_DAY) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']

// Numéro de semaine ISO 8601
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * MS_DAY))
}
function mondayOf(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x }

export default function PlanChargePanel({ user, project, isAdmin, initialLots, members, templates }: Props) {
  const supabase = createClient()
  const [lots, setLots] = useState<Lot[]>(initialLots)
  const [editingLot, setEditingLot] = useState<Lot | null>(null)
  const [creating, setCreating] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [applyingTpl, setApplyingTpl] = useState(false)
  const [confirmDeleteLot, setConfirmDeleteLot] = useState<Lot | null>(null)
  const [deletingLot, setDeletingLot] = useState(false)

  const doDeleteLot = async () => {
    if (!confirmDeleteLot) return
    setDeletingLot(true)
    const { error } = await supabase.from('lots').delete().eq('id', confirmDeleteLot.id)
    if (error) toast.error(`Erreur: ${error.message}`)
    else {
      setLots(prev => prev.filter(l => l.id !== confirmDeleteLot.id))
      toast.success('Lot supprimé')
      setConfirmDeleteLot(null)
    }
    setDeletingLot(false)
  }

  const iso = (d: Date) => d.toISOString().slice(0, 10)

  // Décale un lot ET tous ses dépendants (récursif) de `delta` jours
  const cascadeShift = (rootId: string, delta: number, source: Lot[]): Map<string, { start: string; end: string }> => {
    const byId = new Map(source.map(l => [l.id, l]))
    const result = new Map<string, { start: string; end: string }>()
    const visit = (id: string) => {
      const lot = byId.get(id)
      if (!lot || !lot.start_date || !lot.end_date || result.has(id)) return
      result.set(id, {
        start: iso(addDays(new Date(lot.start_date), delta)),
        end: iso(addDays(new Date(lot.end_date), delta)),
      })
      source.filter(l => l.depends_on === id).forEach(dep => visit(dep.id))
    }
    visit(rootId)
    return result
  }

  const applyCascade = async (rootId: string, delta: number) => {
    if (delta === 0) return
    const changes = cascadeShift(rootId, delta, lots)
    setLots(prev => prev.map(l => changes.has(l.id) ? { ...l, start_date: changes.get(l.id)!.start, end_date: changes.get(l.id)!.end } : l))
    const updates = Array.from(changes.entries()).map(([id, v]) =>
      supabase.from('lots').update({ start_date: v.start, end_date: v.end, updated_at: new Date().toISOString() }).eq('id', id)
    )
    const res = await Promise.all(updates)
    if (res.some(r => r.error)) toast.error('Erreur lors du décalage')
  }

  // --- Menu contextuel (clic droit) ---
  const [ctxMenu, setCtxMenu] = useState<{ lot: Lot; x: number; y: number } | null>(null)
  const [ctxSub, setCtxSub] = useState<'member' | 'link' | null>(null)

  const openContext = (e: React.MouseEvent, lot: Lot) => {
    if (!isAdmin) return
    e.preventDefault()
    setCtxSub(null)
    setCtxMenu({ lot, x: e.clientX, y: e.clientY })
  }

  const duplicateLot = (lot: Lot) => {
    setCtxMenu(null)
    setCreating(true)
    setEditingLot({ ...lot, id: '', name: `${lot.name} (copie)`, progress: 0, position: lots.length, depends_on: null, created_at: '', updated_at: '' })
  }

  const reassignLot = async (lot: Lot, memberId: string | null) => {
    setCtxMenu(null)
    const { data, error } = await supabase.from('lots').update({ member_id: memberId }).eq('id', lot.id).select('*, member:profiles(*)').single()
    if (error) toast.error(`Erreur: ${error.message}`)
    else { setLots(prev => prev.map(l => l.id === lot.id ? data : l)); toast.success('Lot réaffecté') }
  }

  const linkLot = async (lot: Lot, targetId: string | null) => {
    setCtxMenu(null)
    const { data, error } = await supabase.from('lots').update({ depends_on: targetId }).eq('id', lot.id).select('*, member:profiles(*)').single()
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setLots(prev => prev.map(l => l.id === lot.id ? data : l))
    toast.success(targetId ? 'Lot lié' : 'Lien retiré')
  }

  // --- Déplacement d'une barre (change les dates + cascade) ---
  const timelineRef = useRef<HTMLDivElement>(null)
  const barDrag = useRef<{ id: string; startX: number; s: Date; e: Date; delta: number; moved: boolean } | null>(null)
  const [previewShift, setPreviewShift] = useState<Map<string, { start: string; end: string }> | null>(null)
  const justDragged = useRef(false)

  const onBarPointerDown = (e: React.PointerEvent, lot: Lot) => {
    if (!isAdmin || !lot.start_date || !lot.end_date) return
    e.stopPropagation()
    barDrag.current = { id: lot.id, startX: e.clientX, s: new Date(lot.start_date), e: new Date(lot.end_date), delta: 0, moved: false }
    document.addEventListener('pointermove', onBarPointerMove)
    document.addEventListener('pointerup', onBarPointerUp)
  }
  const onBarPointerMove = (ev: PointerEvent) => {
    const d = barDrag.current
    if (!d) return
    const w = timelineRef.current?.clientWidth || 1
    const pxPerDay = w / timelineDaysRef.current
    const delta = Math.round((ev.clientX - d.startX) / pxPerDay)
    if (delta !== d.delta) {
      d.delta = delta
      if (delta !== 0) d.moved = true
      setPreviewShift(cascadeShift(d.id, delta, lotsRef.current))
    }
  }
  const onBarPointerUp = () => {
    const d = barDrag.current
    document.removeEventListener('pointermove', onBarPointerMove)
    document.removeEventListener('pointerup', onBarPointerUp)
    setPreviewShift(null)
    if (d && d.moved) { justDragged.current = true; applyCascade(d.id, d.delta) }
    barDrag.current = null
  }
  // refs pour lire l'état à jour dans les listeners globaux
  const lotsRef = useRef(lots); lotsRef.current = lots
  const timelineDaysRef = useRef(30)

  // Fenêtre temporelle du Gantt
  const timeline = useMemo(() => {
    const dated = lots.filter(l => l.start_date && l.end_date)
    let min: Date, max: Date
    if (dated.length === 0) {
      min = startOfMonth(new Date())
      max = addDays(min, 180)
    } else {
      min = startOfMonth(new Date(Math.min(...dated.map(l => new Date(l.start_date!).getTime()))))
      max = new Date(Math.max(...dated.map(l => new Date(l.end_date!).getTime())))
      max = addDays(max, 7)
    }
    const totalDays = Math.max(daysBetween(min, max), 30)
    // Colonnes mensuelles
    const months: { label: string; leftPct: number; widthPct: number }[] = []
    let cursor = new Date(min)
    while (cursor < max) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const segEnd = next < max ? next : max
      const leftPct = (daysBetween(min, cursor) / totalDays) * 100
      const widthPct = (daysBetween(cursor, segEnd) / totalDays) * 100
      months.push({ label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, leftPct, widthPct })
      cursor = next
    }
    // Colonnes hebdomadaires (numéros de semaine)
    const weeks: { label: string; leftPct: number; widthPct: number }[] = []
    let wc = mondayOf(min)
    while (wc < max) {
      const wEnd = addDays(wc, 7)
      const leftPct = (daysBetween(min, wc) / totalDays) * 100
      const widthPct = (daysBetween(wc, wEnd < max ? wEnd : max) / totalDays) * 100
      weeks.push({ label: `S${isoWeek(wc)}`, leftPct, widthPct })
      wc = wEnd
    }
    return { min, max, totalDays, months, weeks }
  }, [lots])

  timelineDaysRef.current = timeline.totalDays

  // Applique l'aperçu de déplacement (pendant le drag) à un lot
  const effectiveDates = (lot: Lot): { start: string | null; end: string | null } => {
    const p = previewShift?.get(lot.id)
    return p ? { start: p.start, end: p.end } : { start: lot.start_date, end: lot.end_date }
  }

  const barGeom = (lot: Lot) => {
    const { start, end } = effectiveDates(lot)
    if (!start || !end) return null
    const s = new Date(start)
    const e = new Date(end)
    const left = (daysBetween(timeline.min, s) / timeline.totalDays) * 100
    const width = Math.max((daysBetween(s, e) / timeline.totalDays) * 100, 1.5)
    return { left, width }
  }

  const sortedLots = [...lots].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at))

  // --- Glisser-déposer pour réordonner ---
  const [dragId, setDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)

  const handleDrop = async (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setOverId(null); return }
    const ordered = [...sortedLots]
    const from = ordered.findIndex(l => l.id === dragId)
    const to = ordered.findIndex(l => l.id === targetId)
    if (from === -1 || to === -1) { setDragId(null); setOverId(null); return }
    const [moved] = ordered.splice(from, 1)
    ordered.splice(to, 0, moved)
    // Réassigner les positions
    const repositioned = ordered.map((l, i) => ({ ...l, position: i }))
    setLots(repositioned)
    setDragId(null); setOverId(null)
    // Persister
    const updates = repositioned.map(l =>
      supabase.from('lots').update({ position: l.position }).eq('id', l.id)
    )
    const results = await Promise.all(updates)
    if (results.some(r => r.error)) toast.error('Erreur lors du réordonnancement')
  }

  const handleCreateBlank = () => {
    setCreating(true)
    setEditingLot({
      id: '', project_id: project.id, name: '', member_id: null, trade: null,
      start_date: null, end_date: null, progress: 0, color: 'blue',
      position: lots.length, depends_on: null, created_at: '', updated_at: '',
    })
  }

  const applyTemplate = async (tpl: PlanTemplate) => {
    setApplyingTpl(true)
    // Charger les lots du modèle
    const { data: tplLots } = await supabase
      .from('plan_template_lots')
      .select('*')
      .eq('template_id', tpl.id)
      .order('position')

    if (!tplLots || tplLots.length === 0) {
      toast.error('Ce modèle ne contient aucun lot')
      setApplyingTpl(false)
      return
    }

    // Séquencer les dates à partir d'aujourd'hui
    let cursor = new Date()
    const rows = tplLots.map((tl, i) => {
      const start = new Date(cursor)
      const end = addDays(start, Math.max(tl.duration_days - 1, 0))
      cursor = addDays(end, 1)
      return {
        project_id: project.id,
        name: tl.name,
        trade: tl.trade,
        color: tl.color,
        position: lots.length + i,
        start_date: start.toISOString().slice(0, 10),
        end_date: end.toISOString().slice(0, 10),
        progress: 0,
      }
    })

    const { data, error } = await supabase.from('lots').insert(rows).select('*, member:profiles(*)')
    if (error) {
      toast.error(`Erreur: ${error.message}`)
    } else {
      setLots(prev => [...prev, ...(data || [])])
      toast.success(`${data?.length} lots créés depuis « ${tpl.name} »`)
      setShowTemplates(false)
    }
    setApplyingTpl(false)
  }

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Barre d'actions */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <LayoutGrid size={15} className="text-gray-500" />
        <h3 className="font-semibold text-gray-800 text-sm flex-1">Plan de charge</h3>
        {isAdmin && (
          <>
            <div className="relative">
              <Button variant="outline" size="sm" className="gap-1 h-7 text-xs" onClick={() => setShowTemplates(v => !v)}>
                <Wand2 size={12} /> Depuis un modèle
              </Button>
              {showTemplates && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setShowTemplates(false)} />
                  <div className="absolute right-0 top-8 z-20 w-56 bg-white rounded-lg shadow-lg border border-gray-100 py-1">
                    {templates.length === 0 ? (
                      <p className="text-xs text-gray-400 px-3 py-2">Aucun modèle. Créez-en dans Paramètres.</p>
                    ) : templates.map(t => (
                      <button
                        key={t.id}
                        onClick={() => applyTemplate(t)}
                        disabled={applyingTpl}
                        className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-2"
                      >
                        {applyingTpl ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} className="text-orange-500" />}
                        {t.name}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <Button size="sm" className="gap-1 h-7 text-xs bg-orange-500 hover:bg-orange-600" onClick={handleCreateBlank}>
              <Plus size={12} /> Lot
            </Button>
          </>
        )}
      </div>

      {/* Gantt */}
      {sortedLots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <LayoutGrid size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Aucun lot planifié</p>
          {isAdmin && <p className="text-sm text-gray-400 mt-1">Créez un lot ou partez d&apos;un modèle</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="min-w-[820px]">
            {/* En-tête : mois + semaines */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
              <div className="w-56 shrink-0 px-3 flex items-center text-xs font-semibold text-gray-500 border-r border-gray-100">Lot / Adhérent</div>
              <div className="flex-1" ref={timelineRef}>
                {/* Mois */}
                <div className="relative h-6 border-b border-gray-100">
                  {timeline.months.map((m, i) => (
                    <div key={i} className="absolute top-0 h-full border-l border-gray-200 flex items-center px-1.5"
                      style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}>
                      <span className="text-[10px] font-semibold text-gray-500 truncate">{m.label}</span>
                    </div>
                  ))}
                </div>
                {/* Semaines */}
                <div className="relative h-5">
                  {timeline.weeks.map((w, i) => (
                    <div key={i} className="absolute top-0 h-full border-l border-gray-100 flex items-center justify-center"
                      style={{ left: `${w.leftPct}%`, width: `${w.widthPct}%` }}>
                      <span className="text-[8px] text-gray-400 truncate">{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lignes de lots */}
            {sortedLots.map(lot => {
              const g = barGeom(lot)
              const colorClass = LOT_COLORS[lot.color] || LOT_COLORS.blue
              const isDragOver = overId === lot.id && dragId !== lot.id
              const predecessor = lot.depends_on ? lots.find(l => l.id === lot.depends_on) : null
              return (
                <div
                  key={lot.id}
                  className={`flex items-stretch border-b border-gray-50 hover:bg-gray-50/60 group ${isDragOver ? 'border-t-2 border-t-orange-400' : ''} ${dragId === lot.id ? 'opacity-40' : ''}`}
                  onDragOver={isAdmin ? (e) => { e.preventDefault(); setOverId(lot.id) } : undefined}
                  onDrop={isAdmin ? () => handleDrop(lot.id) : undefined}
                  onContextMenu={(e) => openContext(e, lot)}
                >
                  {/* Colonne gauche */}
                  <div className="w-56 shrink-0 flex items-center border-r border-gray-100">
                    {isAdmin && (
                      <span
                        draggable
                        onDragStart={() => setDragId(lot.id)}
                        onDragEnd={() => { setDragId(null); setOverId(null) }}
                        className="pl-1.5 pr-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing"
                        title="Glisser pour réordonner"
                      >
                        <GripVertical size={14} />
                      </span>
                    )}
                    <button onClick={() => setEditingLot(lot)} className={`flex-1 min-w-0 px-2 py-2 text-left ${!isAdmin ? 'pl-3' : ''}`}>
                      <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1">
                        {lot.name}
                        {predecessor && <Link2 size={11} className="text-gray-300 shrink-0" />}
                      </p>
                      <div className="flex items-center gap-1 mt-0.5">
                        {lot.member ? (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                            <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[8px] font-bold shrink-0">
                              {(lot.member.full_name || 'U')[0].toUpperCase()}
                            </span>
                            {lot.member.company || lot.member.full_name}
                          </span>
                        ) : predecessor ? (
                          <span className="text-[11px] text-gray-400 italic truncate">après « {predecessor.name} »</span>
                        ) : (
                          <span className="text-[11px] text-gray-300 italic">Non assigné</span>
                        )}
                      </div>
                    </button>
                  </div>
                  {/* Piste Gantt */}
                  <div className="flex-1 relative min-h-[44px]">
                    {/* gridlines hebdomadaires */}
                    {timeline.weeks.map((w, i) => (
                      <div key={i} className="absolute top-0 h-full border-l border-gray-50" style={{ left: `${w.leftPct}%` }} />
                    ))}
                    {timeline.months.map((m, i) => (
                      <div key={`m${i}`} className="absolute top-0 h-full border-l border-gray-200" style={{ left: `${m.leftPct}%` }} />
                    ))}
                    {g ? (
                      <div
                        onPointerDown={(e) => onBarPointerDown(e, lot)}
                        onClick={() => { if (justDragged.current) { justDragged.current = false; return } setEditingLot(lot) }}
                        className={`absolute top-1/2 -translate-y-1/2 h-5 rounded ${colorClass} shadow-sm overflow-hidden ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${previewShift?.has(lot.id) ? 'ring-2 ring-orange-400' : ''}`}
                        style={{ left: `${g.left}%`, width: `${g.width}%`, touchAction: 'none' }}
                        title={`${lot.name} — ${lot.progress}%${isAdmin ? ' (glisser pour déplacer)' : ''}`}
                      >
                        <div className="h-full bg-black/25 pointer-events-none" style={{ width: `${lot.progress}%` }} />
                        {lot.progress > 0 && (
                          <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium pointer-events-none">{lot.progress}%</span>
                        )}
                      </div>
                    ) : (
                      <button onClick={() => setEditingLot(lot)} className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 italic">Sans dates — cliquer pour planifier</button>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {editingLot && (
        <LotDialog
          lot={editingLot}
          isNew={creating}
          isAdmin={isAdmin}
          userId={user.id}
          members={members}
          onClose={() => { setEditingLot(null); setCreating(false) }}
          onSaved={(l) => {
            setLots(prev => {
              const exists = prev.some(x => x.id === l.id)
              return exists ? prev.map(x => x.id === l.id ? l : x) : [...prev, l]
            })
            setEditingLot(null); setCreating(false)
          }}
          onDeleted={(id) => { setLots(prev => prev.filter(x => x.id !== id)); setEditingLot(null); setCreating(false) }}
        />
      )}

      {/* Confirmation suppression rapide (depuis la ligne) */}
      {confirmDeleteLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteLot(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-red-100 text-red-600 p-2 rounded-lg"><Trash2 size={18} /></div>
              <h3 className="font-bold text-gray-900">Supprimer ce lot ?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Le lot <strong>{confirmDeleteLot.name}</strong> sera supprimé du plan de charge.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteLot(null)} disabled={deletingLot}>Annuler</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={doDeleteLot} disabled={deletingLot}>
                {deletingLot ? <Loader2 size={13} className="animate-spin mr-1" /> : <Trash2 size={13} className="mr-1" />} Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Menu contextuel (clic droit) */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div
            className="fixed z-50 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 text-sm"
            style={{ left: Math.min(ctxMenu.x, (typeof window !== 'undefined' ? window.innerWidth : 9999) - 220), top: Math.min(ctxMenu.y, (typeof window !== 'undefined' ? window.innerHeight : 9999) - 280) }}
          >
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 truncate border-b border-gray-50">{ctxMenu.lot.name}</div>

            <button onClick={() => { const l = ctxMenu.lot; setCtxMenu(null); setEditingLot(l) }} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50">
              <Pencil size={14} className="text-gray-400" /> Modifier
            </button>
            <button onClick={() => duplicateLot(ctxMenu.lot)} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50">
              <Copy size={14} className="text-gray-400" /> Dupliquer
            </button>

            {/* Réaffecter */}
            <div className="relative" onMouseEnter={() => setCtxSub('member')}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50">
                <UserCog size={14} className="text-gray-400" /> Réaffecter à…
              </button>
              {ctxSub === 'member' && (
                <div className="absolute left-full top-0 -ml-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 max-h-64 overflow-y-auto">
                  <button onClick={() => reassignLot(ctxMenu.lot, null)} className="w-full text-left px-3 py-2 text-gray-500 italic hover:bg-gray-50">— Non assigné —</button>
                  {members.map(m => (
                    <button key={m.user_id} onClick={() => reassignLot(ctxMenu.lot, m.user_id)} className="w-full text-left px-3 py-2 text-gray-700 hover:bg-orange-50 truncate">
                      {m.profile?.full_name || 'Utilisateur'}{m.profile?.company ? ` — ${m.profile.company}` : ''}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Lier */}
            <div className="relative" onMouseEnter={() => setCtxSub('link')}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50">
                <Link2 size={14} className="text-gray-400" /> Lier à…
              </button>
              {ctxSub === 'link' && (
                <div className="absolute left-full top-0 -ml-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 max-h-64 overflow-y-auto">
                  {ctxMenu.lot.depends_on && (
                    <button onClick={() => linkLot(ctxMenu.lot, null)} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50">
                      <Link2Off size={13} /> Retirer le lien
                    </button>
                  )}
                  {sortedLots.filter(l => l.id !== ctxMenu.lot.id).map(l => (
                    <button key={l.id} onClick={() => linkLot(ctxMenu.lot, l.id)} className={`w-full text-left px-3 py-2 hover:bg-orange-50 truncate ${ctxMenu.lot.depends_on === l.id ? 'text-orange-600 font-medium' : 'text-gray-700'}`}>
                      {l.name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-gray-50 my-1" />
            <button onClick={() => { const l = ctxMenu.lot; setCtxMenu(null); setConfirmDeleteLot(l) }} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50">
              <Trash2 size={14} /> Supprimer
            </button>
          </div>
        </>
      )}
    </div>
  )
}
