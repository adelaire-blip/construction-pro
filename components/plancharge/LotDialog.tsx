'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lot, LotSlot, ProjectMember } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, Loader2, Trash2, Check, Plus, CalendarPlus } from 'lucide-react'

const COLORS = ['blue', 'red', 'green', 'yellow', 'orange', 'amber', 'teal', 'purple', 'cyan', 'gray', 'pink']
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500',
  orange: 'bg-orange-500', amber: 'bg-amber-500', teal: 'bg-teal-500', purple: 'bg-purple-500',
  cyan: 'bg-cyan-500', gray: 'bg-gray-500', pink: 'bg-pink-500',
}
const iso = (d: Date) => d.toISOString().slice(0, 10)
function addDays(d: Date, n: number) { const x = new Date(d); x.setDate(x.getDate() + n); return x }

type EditSlot = { id?: string; start_date: string; end_date: string }

interface Props {
  lot: Lot
  isNew: boolean
  isAdmin: boolean
  userId: string
  members: ProjectMember[]
  onClose: () => void
  onSaved: (lot: Lot) => void
  onDeleted: (id: string) => void
}

export default function LotDialog({ lot, isNew, isAdmin, userId, members, onClose, onSaved, onDeleted }: Props) {
  const supabase = createClient()
  const [form, setForm] = useState({
    name: lot.name,
    member_id: lot.member_id || '',
    progress: lot.progress,
    color: lot.color,
  })
  const initialSlots: EditSlot[] = (lot.slots || []).length
    ? (lot.slots || []).map(s => ({ id: s.id, start_date: s.start_date, end_date: s.end_date }))
    : isNew
      ? [{ start_date: iso(new Date()), end_date: iso(addDays(new Date(), 4)) }]
      : []
  const [slots, setSlots] = useState<EditSlot[]>(initialSlots)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  const isAssignee = lot.member_id === userId
  const canEdit = isAdmin

  const addSlot = () => {
    const last = slots[slots.length - 1]
    const start = last ? addDays(new Date(last.end_date), 3) : new Date()
    setSlots([...slots, { start_date: iso(start), end_date: iso(addDays(start, 4)) }])
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      let lotId = lot.id
      if (isNew) {
        const { data, error } = await supabase.from('lots')
          .insert({ project_id: lot.project_id, name: form.name, member_id: form.member_id || null, trade: lot.trade, progress: form.progress, color: form.color, position: lot.position })
          .select('id').single()
        if (error || !data) throw new Error(error?.message || 'Création impossible')
        lotId = data.id
      } else {
        const { error } = await supabase.from('lots')
          .update({ name: form.name, member_id: form.member_id || null, progress: form.progress, color: form.color, updated_at: new Date().toISOString() })
          .eq('id', lot.id)
        if (error) throw new Error(error.message)
      }

      // Synchroniser les créneaux
      const originalIds = new Set((lot.slots || []).map(s => s.id))
      const keptIds = new Set(slots.filter(s => s.id).map(s => s.id))
      // supprimés
      const toDelete = [...originalIds].filter(id => !keptIds.has(id))
      if (toDelete.length) await supabase.from('lot_slots').delete().in('id', toDelete)
      // mis à jour + créés
      for (const s of slots) {
        if (!s.start_date || !s.end_date) continue
        if (s.id) await supabase.from('lot_slots').update({ start_date: s.start_date, end_date: s.end_date }).eq('id', s.id)
        else await supabase.from('lot_slots').insert({ lot_id: lotId, start_date: s.start_date, end_date: s.end_date })
      }

      // Relire le lot complet
      const { data: full } = await supabase.from('lots').select('*, member:profiles(*), slots:lot_slots(*)').eq('id', lotId).single()
      toast.success(isNew ? 'Lot créé' : 'Lot mis à jour')
      if (full) onSaved(full)
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Erreur')
    }
    setSaving(false)
  }

  const handleProgressOnly = async () => {
    setSaving(true)
    const { data, error } = await supabase.from('lots').update({ progress: form.progress, updated_at: new Date().toISOString() }).eq('id', lot.id).select('*, member:profiles(*), slots:lot_slots(*)').single()
    if (error) toast.error(`Erreur: ${error.message}`); else { toast.success('Avancement mis à jour'); if (data) onSaved(data) }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('lots').delete().eq('id', lot.id)
    if (error) { toast.error(`Erreur: ${error.message}`); setDeleting(false) } else { toast.success('Lot supprimé'); onDeleted(lot.id) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white z-10">
          <h3 className="font-semibold text-gray-900">{isNew ? 'Nouveau lot' : lot.name}</h3>
          <div className="flex items-center gap-1">
            {canEdit && !isNew && <button onClick={() => setConfirmDel(true)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"><Trash2 size={15} /></button>}
            <button onClick={onClose} className="p-1.5 text-gray-400 hover:text-gray-600"><X size={18} /></button>
          </div>
        </div>

        {canEdit ? (
          <form onSubmit={handleSave} className="p-4 space-y-3">
            <div>
              <Label className="text-xs">Nom du lot *</Label>
              <Input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} required autoFocus className="mt-1" placeholder="Ex: Plomberie" />
            </div>
            <div>
              <Label className="text-xs">Adhérent assigné</Label>
              <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })} className="mt-1 w-full h-9 rounded-lg border border-input bg-white px-2 text-sm">
                <option value="">— Non assigné —</option>
                {members.map(m => <option key={m.user_id} value={m.user_id}>{m.profile?.full_name || 'Utilisateur'}{m.profile?.company ? ` — ${m.profile.company}` : ''}</option>)}
              </select>
            </div>

            {/* Créneaux */}
            <div>
              <div className="flex items-center justify-between">
                <Label className="text-xs">Créneaux ({slots.length})</Label>
                <button type="button" onClick={addSlot} className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium">
                  <CalendarPlus size={12} /> Ajouter
                </button>
              </div>
              <div className="mt-1 space-y-2">
                {slots.length === 0 && <p className="text-xs text-gray-400 italic">Aucun créneau — cliquez sur « Ajouter »</p>}
                {slots.map((s, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Input type="date" value={s.start_date} onChange={e => setSlots(slots.map((x, idx) => idx === i ? { ...x, start_date: e.target.value } : x))} className="flex-1 h-8 text-xs" />
                    <span className="text-gray-300 text-xs">→</span>
                    <Input type="date" value={s.end_date} onChange={e => setSlots(slots.map((x, idx) => idx === i ? { ...x, end_date: e.target.value } : x))} className="flex-1 h-8 text-xs" />
                    <button type="button" onClick={() => setSlots(slots.filter((_, idx) => idx !== i))} className="text-gray-300 hover:text-red-500 shrink-0"><Trash2 size={13} /></button>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <Label className="text-xs">Avancement : {form.progress}%</Label>
              <input type="range" min={0} max={100} step={5} value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} className="w-full mt-1 accent-orange-500" />
            </div>
            <div>
              <Label className="text-xs">Couleur</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })} className={`w-7 h-7 rounded-full ${COLOR_BG[c]} flex items-center justify-center ${form.color === c ? 'ring-2 ring-offset-1 ring-gray-800' : ''}`}>
                    {form.color === c && <Check size={13} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}{isNew ? 'Créer' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        ) : (
          <div className="p-4 space-y-3">
            <div className="text-sm text-gray-600">
              {lot.member?.full_name && <p>Assigné à <span className="font-medium">{lot.member.full_name}</span></p>}
              {(lot.slots || []).map(s => <p key={s.id} className="text-xs text-gray-400 mt-0.5">Du {s.start_date} au {s.end_date}</p>)}
            </div>
            {isAssignee ? (
              <>
                <div>
                  <Label className="text-xs">Avancement : {form.progress}%</Label>
                  <input type="range" min={0} max={100} step={5} value={form.progress} onChange={e => setForm({ ...form, progress: Number(e.target.value) })} className="w-full mt-1 accent-orange-500" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleProgressOnly} className="bg-orange-500 hover:bg-orange-600" disabled={saving}>{saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null} Mettre à jour</Button>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs mb-1"><span className="text-gray-500">Avancement</span><span className="font-medium">{lot.progress}%</span></div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden"><div className="h-full bg-orange-500" style={{ width: `${lot.progress}%` }} /></div>
              </div>
            )}
          </div>
        )}

        {confirmDel && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center p-4 rounded-2xl" onClick={() => setConfirmDel(false)}>
            <div className="bg-white rounded-xl p-4 max-w-xs w-full" onClick={e => e.stopPropagation()}>
              <p className="text-sm text-gray-700 mb-3">Supprimer le lot <strong>{lot.name}</strong> ?</p>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setConfirmDel(false)} disabled={deleting}>Annuler</Button>
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>{deleting ? <Loader2 size={13} className="animate-spin mr-1" /> : null} Supprimer</Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
