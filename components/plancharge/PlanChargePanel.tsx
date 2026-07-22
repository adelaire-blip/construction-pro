'use client'

import { useState, useMemo, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Lot, LotSlot, PlanTemplate, ProjectMember } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import {
  Plus, LayoutGrid, Loader2, Wand2, GripVertical, Trash2,
  Pencil, Copy, UserCog, Link2, Link2Off, CalendarPlus, Scissors
} from 'lucide-react'
import LotDialog from './LotDialog'

export const LOT_COLORS: Record<string, string> = {
  blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500',
  orange: 'bg-orange-500', amber: 'bg-amber-500', teal: 'bg-teal-500', purple: 'bg-purple-500',
  cyan: 'bg-cyan-500', gray: 'bg-gray-500', pink: 'bg-pink-500',
}

const MS_DAY = 86400000
const ROW_H = 48 // hauteur fixe d'une ligne (px) — nécessaire pour tracer les flèches
function daysBetween(a: Date, b: Date) { return Math.round((b.getTime() - a.getTime()) / MS_DAY) }
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }
function startOfMonth(d: Date) { return new Date(d.getFullYear(), d.getMonth(), 1) }
function iso(d: Date) { return d.toISOString().slice(0, 10) }
const MONTHS = ['Janv', 'Févr', 'Mars', 'Avr', 'Mai', 'Juin', 'Juil', 'Août', 'Sept', 'Oct', 'Nov', 'Déc']
function isoWeek(d: Date): number {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()))
  const dayNum = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - dayNum + 3)
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4))
  return 1 + Math.round((date.getTime() - firstThursday.getTime()) / (7 * MS_DAY))
}
function mondayOf(d: Date) { const x = new Date(d); const dow = (x.getDay() + 6) % 7; x.setDate(x.getDate() - dow); x.setHours(0, 0, 0, 0); return x }

interface Props {
  user: User
  project: Project
  isAdmin: boolean
  initialLots: Lot[]
  members: ProjectMember[]
  templates: PlanTemplate[]
}

export default function PlanChargePanel({ user, project, isAdmin, initialLots, members, templates }: Props) {
  const supabase = createClient()
  const [lots, setLots] = useState<Lot[]>(initialLots)
  const [editingLot, setEditingLot] = useState<Lot | null>(null)
  const [creating, setCreating] = useState(false)
  const [showTemplates, setShowTemplates] = useState(false)
  const [applyingTpl, setApplyingTpl] = useState(false)
  const [confirmDeleteLot, setConfirmDeleteLot] = useState<Lot | null>(null)
  const [deletingLot, setDeletingLot] = useState(false)

  const sortedLots = useMemo(
    () => [...lots].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
    [lots]
  )

  // Fenêtre temporelle à partir de tous les créneaux
  const timeline = useMemo(() => {
    const dates: number[] = []
    lots.forEach(l => (l.slots || []).forEach(s => { dates.push(new Date(s.start_date).getTime(), new Date(s.end_date).getTime()) }))
    let min: Date, max: Date
    if (dates.length === 0) { min = startOfMonth(new Date()); max = addDays(min, 180) }
    else { min = startOfMonth(new Date(Math.min(...dates))); max = addDays(new Date(Math.max(...dates)), 7) }
    const totalDays = Math.max(daysBetween(min, max), 30)
    const months: { label: string; leftPct: number; widthPct: number }[] = []
    let cursor = new Date(min)
    while (cursor < max) {
      const next = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1)
      const segEnd = next < max ? next : max
      months.push({ label: `${MONTHS[cursor.getMonth()]} ${String(cursor.getFullYear()).slice(2)}`, leftPct: (daysBetween(min, cursor) / totalDays) * 100, widthPct: (daysBetween(cursor, segEnd) / totalDays) * 100 })
      cursor = next
    }
    const weeks: { label: string; leftPct: number; widthPct: number }[] = []
    let wc = mondayOf(min)
    while (wc < max) {
      const wEnd = addDays(wc, 7)
      weeks.push({ label: `S${isoWeek(wc)}`, leftPct: (daysBetween(min, wc) / totalDays) * 100, widthPct: (daysBetween(wc, wEnd < max ? wEnd : max) / totalDays) * 100 })
      wc = wEnd
    }
    return { min, max, totalDays, months, weeks }
  }, [lots])

  // ---- Déplacement d'un créneau à la souris (pointer capture) ----
  const timelineRef = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<{ slotId: string; lotId: string; startX: number; delta: number; moved: boolean } | null>(null)

  const pxPerDay = () => (timelineRef.current?.clientWidth || 1) / timeline.totalDays

  const onBarDown = (e: React.PointerEvent, lot: Lot, slot: LotSlot) => {
    if (!isAdmin) return
    e.stopPropagation()
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    setDrag({ slotId: slot.id, lotId: lot.id, startX: e.clientX, delta: 0, moved: false })
  }
  const onBarMove = (e: React.PointerEvent) => {
    if (!drag) return
    const delta = Math.round((e.clientX - drag.startX) / pxPerDay())
    if (delta !== drag.delta) setDrag({ ...drag, delta, moved: drag.moved || delta !== 0 })
  }
  const onBarUp = async (e: React.PointerEvent, lot: Lot, slot: LotSlot) => {
    if (!drag) return
    ;(e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId)
    const d = drag
    setDrag(null)
    if (!d.moved || d.delta === 0) return

    // Décale le créneau + tous les créneaux des lots dépendants (cascade)
    const newSlots = new Map<string, { start: string; end: string }>()
    newSlots.set(slot.id, { start: iso(addDays(new Date(slot.start_date), d.delta)), end: iso(addDays(new Date(slot.end_date), d.delta)) })
    const shiftDependents = (lotId: string) => {
      lots.filter(l => l.depends_on === lotId).forEach(dep => {
        (dep.slots || []).forEach(s => {
          if (!newSlots.has(s.id)) newSlots.set(s.id, { start: iso(addDays(new Date(s.start_date), d.delta)), end: iso(addDays(new Date(s.end_date), d.delta)) })
        })
        shiftDependents(dep.id)
      })
    }
    shiftDependents(lot.id)

    setLots(prev => prev.map(l => ({ ...l, slots: (l.slots || []).map(s => newSlots.has(s.id) ? { ...s, start_date: newSlots.get(s.id)!.start, end_date: newSlots.get(s.id)!.end } : s) })))
    const updates = Array.from(newSlots.entries()).map(([id, v]) => supabase.from('lot_slots').update({ start_date: v.start, end_date: v.end }).eq('id', id))
    const res = await Promise.all(updates)
    if (res.some(r => r.error)) toast.error('Erreur lors du déplacement')
  }

  // Géométrie d'un créneau (avec aperçu pendant le drag)
  const slotGeom = (lot: Lot, slot: LotSlot) => {
    let s = new Date(slot.start_date)
    let e = new Date(slot.end_date)
    if (drag && (drag.slotId === slot.id || (lot.depends_on && isDependentOfDragged(lot.id)))) {
      s = addDays(s, drag.delta); e = addDays(e, drag.delta)
    }
    const left = (daysBetween(timeline.min, s) / timeline.totalDays) * 100
    const width = Math.max((daysBetween(s, e) / timeline.totalDays + 1 / timeline.totalDays) * 100, 1.5)
    return { left, width }
  }
  // un lot est-il (récursivement) dépendant du lot en cours de drag ?
  const isDependentOfDragged = (lotId: string): boolean => {
    if (!drag) return false
    let cur = lots.find(l => l.id === lotId)
    const seen = new Set<string>()
    while (cur?.depends_on && !seen.has(cur.id)) {
      seen.add(cur.id)
      if (cur.depends_on === drag.lotId) return true
      cur = lots.find(l => l.id === cur!.depends_on)
    }
    return false
  }

  // ---- Réordonnancement des lignes (grip) ----
  const [rowDragId, setRowDragId] = useState<string | null>(null)
  const [overId, setOverId] = useState<string | null>(null)
  const handleRowDrop = async (targetId: string) => {
    if (!rowDragId || rowDragId === targetId) { setRowDragId(null); setOverId(null); return }
    const ordered = [...sortedLots]
    const from = ordered.findIndex(l => l.id === rowDragId)
    const to = ordered.findIndex(l => l.id === targetId)
    if (from === -1 || to === -1) { setRowDragId(null); setOverId(null); return }
    const [m] = ordered.splice(from, 1); ordered.splice(to, 0, m)
    const repositioned = ordered.map((l, i) => ({ ...l, position: i }))
    setLots(repositioned); setRowDragId(null); setOverId(null)
    await Promise.all(repositioned.map(l => supabase.from('lots').update({ position: l.position }).eq('id', l.id)))
  }

  // ---- Créer / modèle ----
  const handleCreateBlank = () => {
    setCreating(true)
    setEditingLot({ id: '', project_id: project.id, name: '', member_id: null, trade: null, start_date: null, end_date: null, progress: 0, color: 'blue', position: lots.length, depends_on: null, created_at: '', updated_at: '', slots: [] })
  }

  const applyTemplate = async (tpl: PlanTemplate) => {
    setApplyingTpl(true)
    const { data: tplLots } = await supabase.from('plan_template_lots').select('*').eq('template_id', tpl.id).order('position')
    if (!tplLots || tplLots.length === 0) { toast.error('Modèle vide'); setApplyingTpl(false); return }
    let cursor = new Date()
    const created: Lot[] = []
    for (let i = 0; i < tplLots.length; i++) {
      const tl = tplLots[i]
      const start = new Date(cursor)
      const end = addDays(start, Math.max(tl.duration_days - 1, 0))
      cursor = addDays(end, 1)
      const { data: lot, error } = await supabase.from('lots').insert({ project_id: project.id, name: tl.name, trade: tl.trade, color: tl.color, position: lots.length + i, progress: 0 }).select('*, member:profiles(*)').single()
      if (error || !lot) continue
      const { data: slot } = await supabase.from('lot_slots').insert({ lot_id: lot.id, start_date: iso(start), end_date: iso(end) }).select().single()
      created.push({ ...lot, slots: slot ? [slot] : [] })
    }
    setLots(prev => [...prev, ...created])
    toast.success(`${created.length} lots créés depuis « ${tpl.name} »`)
    setShowTemplates(false); setApplyingTpl(false)
  }

  // ---- Actions lot ----
  const doDeleteLot = async () => {
    if (!confirmDeleteLot) return
    setDeletingLot(true)
    const { error } = await supabase.from('lots').delete().eq('id', confirmDeleteLot.id)
    if (error) toast.error(`Erreur: ${error.message}`)
    else { setLots(prev => prev.filter(l => l.id !== confirmDeleteLot.id)); toast.success('Lot supprimé'); setConfirmDeleteLot(null) }
    setDeletingLot(false)
  }

  const duplicateLot = (lot: Lot) => { setCtxMenu(null); setCreating(true); setEditingLot({ ...lot, id: '', name: `${lot.name} (copie)`, progress: 0, position: lots.length, depends_on: null, created_at: '', updated_at: '', slots: [] }) }

  const reassignLot = async (lot: Lot, memberId: string | null) => {
    setCtxMenu(null)
    const { data, error } = await supabase.from('lots').update({ member_id: memberId }).eq('id', lot.id).select('*, member:profiles(*), slots:lot_slots(*)').single()
    if (error) toast.error(`Erreur: ${error.message}`); else { setLots(prev => prev.map(l => l.id === lot.id ? data : l)); toast.success('Lot réaffecté') }
  }

  const linkLot = async (lot: Lot, targetId: string | null) => {
    setCtxMenu(null)
    const { data, error } = await supabase.from('lots').update({ depends_on: targetId }).eq('id', lot.id).select('*, member:profiles(*), slots:lot_slots(*)').single()
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setLots(prev => prev.map(l => l.id === lot.id ? data : l)); toast.success(targetId ? 'Lot lié' : 'Lien retiré')
  }

  // Ajouter un créneau à un lot (positionné sur la semaine du clic droit si dispo)
  const addSlot = async (lot: Lot, clientX?: number) => {
    setCtxMenu(null)
    let start: Date
    const rect = timelineRef.current?.getBoundingClientRect()
    if (clientX != null && rect && clientX >= rect.left && rect.width > 0) {
      // Convertir la position du clic en date, puis caler sur le lundi de la semaine
      const dayOffset = Math.round(((clientX - rect.left) / rect.width) * timeline.totalDays)
      start = mondayOf(addDays(timeline.min, Math.max(0, dayOffset)))
    } else {
      const existing = lot.slots || []
      start = existing.length ? addDays(new Date(Math.max(...existing.map(s => new Date(s.end_date).getTime()))), 3) : new Date()
    }
    const end = addDays(start, 4)
    const { data, error } = await supabase.from('lot_slots').insert({ lot_id: lot.id, start_date: iso(start), end_date: iso(end) }).select().single()
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, slots: [...(l.slots || []), data] } : l))
    toast.success('Créneau ajouté')
  }

  const deleteSlot = async (lot: Lot, slot: LotSlot) => {
    setCtxMenu(null)
    const { error } = await supabase.from('lot_slots').delete().eq('id', slot.id)
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setLots(prev => prev.map(l => l.id === lot.id ? { ...l, slots: (l.slots || []).filter(s => s.id !== slot.id) } : l))
    toast.success('Créneau supprimé')
  }

  // ---- Menu contextuel ----
  const [ctxMenu, setCtxMenu] = useState<{ lot: Lot; slot: LotSlot | null; x: number; y: number } | null>(null)
  const [ctxSub, setCtxSub] = useState<'member' | 'link' | null>(null)
  const openContext = (e: React.MouseEvent, lot: Lot, slot: LotSlot | null) => {
    if (!isAdmin) return
    e.preventDefault(); e.stopPropagation()
    setCtxSub(null); setCtxMenu({ lot, slot, x: e.clientX, y: e.clientY })
  }

  const winW = typeof window !== 'undefined' ? window.innerWidth : 9999
  const winH = typeof window !== 'undefined' ? window.innerHeight : 9999

  // Flèches de dépendance : du dernier créneau du prédécesseur → premier créneau du dépendant
  const rowIndex = new Map(sortedLots.map((l, i) => [l.id, i]))
  const arrows = sortedLots.flatMap(lot => {
    if (!lot.depends_on) return []
    const pred = lots.find(l => l.id === lot.depends_on)
    if (!pred) return []
    const iDep = rowIndex.get(lot.id); const iPred = rowIndex.get(pred.id)
    if (iDep === undefined || iPred === undefined) return []
    const predSlots = pred.slots || []; const depSlots = lot.slots || []
    if (predSlots.length === 0 || depSlots.length === 0) return []
    const predLast = [...predSlots].sort((a, b) => a.end_date.localeCompare(b.end_date))[predSlots.length - 1]
    const depFirst = [...depSlots].sort((a, b) => a.start_date.localeCompare(b.start_date))[0]
    const pg = slotGeom(pred, predLast)
    const dg = slotGeom(lot, depFirst)
    const x1 = pg.left + pg.width           // fin du prédécesseur (%)
    const x2 = dg.left                       // début du dépendant (%)
    const midX = Math.min(x1 + 1.4, 99)
    const y1 = iPred * ROW_H + ROW_H / 2
    const y2 = iDep * ROW_H + ROW_H / 2
    return [{ id: lot.id, x1, x2, midX, y1, y2 }]
  })

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Actions */}
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
                      <button key={t.id} onClick={() => applyTemplate(t)} disabled={applyingTpl} className="w-full text-left px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 flex items-center gap-2">
                        {applyingTpl ? <Loader2 size={12} className="animate-spin" /> : <Wand2 size={12} className="text-orange-500" />} {t.name}
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

      {sortedLots.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <LayoutGrid size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Aucun lot planifié</p>
          {isAdmin && <p className="text-sm text-gray-400 mt-1">Créez un lot ou partez d&apos;un modèle</p>}
        </div>
      ) : (
        <div className="flex-1 overflow-auto">
          <div className="min-w-[820px]">
            {/* En-tête */}
            <div className="flex sticky top-0 z-10 bg-white border-b border-gray-200">
              <div className="w-56 shrink-0 px-3 flex items-center text-xs font-semibold text-gray-500 border-r border-gray-100">Lot / Adhérent</div>
              <div className="flex-1" ref={timelineRef}>
                <div className="relative h-6 border-b border-gray-100">
                  {timeline.months.map((m, i) => (
                    <div key={i} className="absolute top-0 h-full border-l border-gray-200 flex items-center px-1.5" style={{ left: `${m.leftPct}%`, width: `${m.widthPct}%` }}>
                      <span className="text-[10px] font-semibold text-gray-500 truncate">{m.label}</span>
                    </div>
                  ))}
                </div>
                <div className="relative h-5">
                  {timeline.weeks.map((w, i) => (
                    <div key={i} className="absolute top-0 h-full border-l border-gray-100 flex items-center justify-center" style={{ left: `${w.leftPct}%`, width: `${w.widthPct}%` }}>
                      <span className="text-[8px] text-gray-400 truncate">{w.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Lignes */}
            <div className="relative">
            {/* Overlay des flèches de dépendance */}
            <svg className="absolute top-0 pointer-events-none z-20" style={{ left: 224, right: 0, width: 'calc(100% - 224px)', height: sortedLots.length * ROW_H }}>
              <defs>
                <marker id="dep-arrow" markerWidth="7" markerHeight="7" refX="5" refY="3" orient="auto">
                  <path d="M0,0 L6,3 L0,6 Z" fill="#f97316" />
                </marker>
              </defs>
              {arrows.map(a => (
                <g key={a.id}>
                  <line x1={`${a.x1}%`} y1={a.y1} x2={`${a.midX}%`} y2={a.y1} stroke="#f9a34e" strokeWidth={1.5} />
                  <line x1={`${a.midX}%`} y1={a.y1} x2={`${a.midX}%`} y2={a.y2} stroke="#f9a34e" strokeWidth={1.5} />
                  <line x1={`${a.midX}%`} y1={a.y2} x2={`${a.x2}%`} y2={a.y2} stroke="#f9a34e" strokeWidth={1.5} markerEnd="url(#dep-arrow)" />
                </g>
              ))}
            </svg>
            {sortedLots.map(lot => {
              const colorClass = LOT_COLORS[lot.color] || LOT_COLORS.blue
              const isDragOver = overId === lot.id && rowDragId !== lot.id
              const predecessor = lot.depends_on ? lots.find(l => l.id === lot.depends_on) : null
              const slots = lot.slots || []
              return (
                <div
                  key={lot.id}
                  style={{ height: ROW_H }}
                  className={`flex items-stretch border-b border-gray-50 hover:bg-gray-50/60 group ${isDragOver ? 'border-t-2 border-t-orange-400' : ''} ${rowDragId === lot.id ? 'opacity-40' : ''}`}
                  onDragOver={isAdmin ? (e) => { e.preventDefault(); setOverId(lot.id) } : undefined}
                  onDrop={isAdmin ? () => handleRowDrop(lot.id) : undefined}
                  onContextMenu={(e) => openContext(e, lot, null)}
                >
                  {/* Colonne gauche */}
                  <div className="w-56 shrink-0 flex items-center border-r border-gray-100">
                    {isAdmin && (
                      <span draggable onDragStart={() => setRowDragId(lot.id)} onDragEnd={() => { setRowDragId(null); setOverId(null) }} className="pl-1.5 pr-0.5 text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing" title="Réordonner">
                        <GripVertical size={14} />
                      </span>
                    )}
                    <button onClick={() => setEditingLot(lot)} className={`flex-1 min-w-0 px-2 py-2 text-left ${!isAdmin ? 'pl-3' : ''}`}>
                      <p className="text-sm font-medium text-gray-800 truncate flex items-center gap-1">
                        {lot.name}
                        {slots.length > 1 && <span className="text-[9px] text-gray-400 font-normal shrink-0">({slots.length} créneaux)</span>}
                        {predecessor && <Link2 size={11} className="text-gray-300 shrink-0" />}
                      </p>
                      <div className="mt-0.5">
                        {lot.member ? (
                          <span className="flex items-center gap-1 text-[11px] text-gray-500 truncate">
                            <span className="w-4 h-4 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-[8px] font-bold shrink-0">{(lot.member.full_name || 'U')[0].toUpperCase()}</span>
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
                  {/* Piste */}
                  <div className="flex-1 relative min-h-[44px]" onContextMenu={(e) => openContext(e, lot, null)}>
                    {timeline.weeks.map((w, i) => <div key={i} className="absolute top-0 h-full border-l border-gray-50" style={{ left: `${w.leftPct}%` }} />)}
                    {timeline.months.map((m, i) => <div key={`m${i}`} className="absolute top-0 h-full border-l border-gray-200" style={{ left: `${m.leftPct}%` }} />)}
                    {slots.length === 0 ? (
                      <button onClick={() => setEditingLot(lot)} className="absolute left-2 top-1/2 -translate-y-1/2 text-[10px] text-gray-300 italic">Sans créneau — cliquer pour planifier</button>
                    ) : slots.map(slot => {
                      const g = slotGeom(lot, slot)
                      const isDragging = drag?.slotId === slot.id
                      return (
                        <div
                          key={slot.id}
                          onPointerDown={(e) => onBarDown(e, lot, slot)}
                          onPointerMove={onBarMove}
                          onPointerUp={(e) => onBarUp(e, lot, slot)}
                          onClick={() => { if (drag?.moved) return; setEditingLot(lot) }}
                          onContextMenu={(e) => openContext(e, lot, slot)}
                          className={`absolute top-1/2 -translate-y-1/2 h-5 rounded ${colorClass} shadow-sm overflow-hidden ${isAdmin ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'} ${isDragging ? 'ring-2 ring-orange-400 z-10' : ''}`}
                          style={{ left: `${g.left}%`, width: `${g.width}%`, touchAction: 'none' }}
                          title={`${lot.name} — ${lot.progress}%${isAdmin ? ' • glisser pour déplacer, clic droit pour options' : ''}`}
                        >
                          <div className="h-full bg-black/25 pointer-events-none" style={{ width: `${lot.progress}%` }} />
                          {lot.progress > 0 && <span className="absolute inset-0 flex items-center justify-center text-[9px] text-white font-medium pointer-events-none">{lot.progress}%</span>}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
            </div>
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
          onSaved={(l) => { setLots(prev => { const ex = prev.some(x => x.id === l.id); return ex ? prev.map(x => x.id === l.id ? l : x) : [...prev, l] }); setEditingLot(null); setCreating(false) }}
          onDeleted={(id) => { setLots(prev => prev.filter(x => x.id !== id)); setEditingLot(null); setCreating(false) }}
        />
      )}

      {confirmDeleteLot && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setConfirmDeleteLot(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2"><div className="bg-red-100 text-red-600 p-2 rounded-lg"><Trash2 size={18} /></div><h3 className="font-bold text-gray-900">Supprimer ce lot ?</h3></div>
            <p className="text-sm text-gray-500 mb-4">Le lot <strong>{confirmDeleteLot.name}</strong> et tous ses créneaux seront supprimés.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDeleteLot(null)} disabled={deletingLot}>Annuler</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={doDeleteLot} disabled={deletingLot}>
                {deletingLot ? <Loader2 size={13} className="animate-spin mr-1" /> : <Trash2 size={13} className="mr-1" />} Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Menu contextuel */}
      {ctxMenu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setCtxMenu(null)} onContextMenu={(e) => { e.preventDefault(); setCtxMenu(null) }} />
          <div className="fixed z-50 w-56 bg-white rounded-lg shadow-xl border border-gray-100 py-1 text-sm" style={{ left: Math.min(ctxMenu.x, winW - 230), top: Math.min(ctxMenu.y, winH - 320) }}>
            <div className="px-3 py-1.5 text-xs font-semibold text-gray-400 truncate border-b border-gray-50">{ctxMenu.lot.name}</div>
            <button onClick={() => { const l = ctxMenu.lot; setCtxMenu(null); setEditingLot(l) }} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><Pencil size={14} className="text-gray-400" /> Modifier</button>
            <button onClick={() => addSlot(ctxMenu.lot, ctxMenu.x)} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><CalendarPlus size={14} className="text-gray-400" /> Ajouter un créneau</button>
            {ctxMenu.slot && (
              <button onClick={() => deleteSlot(ctxMenu.lot, ctxMenu.slot!)} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><Scissors size={14} className="text-gray-400" /> Supprimer ce créneau</button>
            )}
            <button onClick={() => duplicateLot(ctxMenu.lot)} className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><Copy size={14} className="text-gray-400" /> Dupliquer le lot</button>
            <div className="relative" onMouseEnter={() => setCtxSub('member')}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><UserCog size={14} className="text-gray-400" /> Réaffecter à…</button>
              {ctxSub === 'member' && (
                <div className="absolute right-full top-0 -mr-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 max-h-64 overflow-y-auto">
                  <button onClick={() => reassignLot(ctxMenu.lot, null)} className="w-full text-left px-3 py-2 text-gray-500 italic hover:bg-gray-50">— Non assigné —</button>
                  {[...members].sort((a, b) => (a.profile?.trade || 'zz').localeCompare(b.profile?.trade || 'zz') || (a.profile?.company || '').localeCompare(b.profile?.company || '')).map(m => (
                    <button key={m.user_id} onClick={() => reassignLot(ctxMenu.lot, m.user_id)} className="w-full text-left px-3 py-1.5 hover:bg-orange-50">
                      <span className="block text-gray-700 text-sm truncate">{m.profile?.company || m.profile?.full_name || 'Utilisateur'}</span>
                      {m.profile?.trade && <span className="block text-[10px] text-gray-400 truncate">{m.profile.trade}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="relative" onMouseEnter={() => setCtxSub('link')}>
              <button className="w-full flex items-center gap-2 px-3 py-2 text-gray-700 hover:bg-gray-50"><Link2 size={14} className="text-gray-400" /> Lier à…</button>
              {ctxSub === 'link' && (
                <div className="absolute right-full top-0 -mr-1 w-52 bg-white rounded-lg shadow-xl border border-gray-100 py-1 max-h-64 overflow-y-auto">
                  {ctxMenu.lot.depends_on && <button onClick={() => linkLot(ctxMenu.lot, null)} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50"><Link2Off size={13} /> Retirer le lien</button>}
                  {sortedLots.filter(l => l.id !== ctxMenu.lot.id).map(l => <button key={l.id} onClick={() => linkLot(ctxMenu.lot, l.id)} className={`w-full text-left px-3 py-2 hover:bg-orange-50 truncate ${ctxMenu.lot.depends_on === l.id ? 'text-orange-600 font-medium' : 'text-gray-700'}`}>{l.name}</button>)}
                </div>
              )}
            </div>
            <div className="border-t border-gray-50 my-1" />
            <button onClick={() => { const l = ctxMenu.lot; setCtxMenu(null); setConfirmDeleteLot(l) }} className="w-full flex items-center gap-2 px-3 py-2 text-red-600 hover:bg-red-50"><Trash2 size={14} /> Supprimer le lot</button>
          </div>
        </>
      )}
    </div>
  )
}
