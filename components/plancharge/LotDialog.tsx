'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Lot, ProjectMember } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import { X, Loader2, Trash2, Check } from 'lucide-react'

const COLORS = ['blue', 'red', 'green', 'yellow', 'orange', 'amber', 'teal', 'purple', 'cyan', 'gray', 'pink']
const COLOR_BG: Record<string, string> = {
  blue: 'bg-blue-500', red: 'bg-red-500', green: 'bg-green-500', yellow: 'bg-yellow-500',
  orange: 'bg-orange-500', amber: 'bg-amber-500', teal: 'bg-teal-500', purple: 'bg-purple-500',
  cyan: 'bg-cyan-500', gray: 'bg-gray-500', pink: 'bg-pink-500',
}

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
    start_date: lot.start_date || '',
    end_date: lot.end_date || '',
    progress: lot.progress,
    color: lot.color,
  })
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmDel, setConfirmDel] = useState(false)

  // L'admin gère tout ; le membre assigné peut ajuster l'avancement
  const isAssignee = lot.member_id === userId
  const canEditAll = isAdmin || (isNew && isAdmin)
  const canEdit = isAdmin

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    const payload = {
      project_id: lot.project_id,
      name: form.name,
      member_id: form.member_id || null,
      start_date: form.start_date || null,
      end_date: form.end_date || null,
      progress: form.progress,
      color: form.color,
      position: lot.position,
      updated_at: new Date().toISOString(),
    }
    let res
    if (isNew) {
      res = await supabase.from('lots').insert(payload).select('*, member:profiles(*)').single()
    } else {
      res = await supabase.from('lots').update(payload).eq('id', lot.id).select('*, member:profiles(*)').single()
    }
    if (res.error) {
      toast.error(`Erreur: ${res.error.message}`)
    } else {
      toast.success(isNew ? 'Lot créé' : 'Lot mis à jour')
      onSaved(res.data)
    }
    setSaving(false)
  }

  // Avancement seul (membre assigné non-admin)
  const handleProgressOnly = async () => {
    setSaving(true)
    const { data, error } = await supabase
      .from('lots')
      .update({ progress: form.progress, updated_at: new Date().toISOString() })
      .eq('id', lot.id)
      .select('*, member:profiles(*)')
      .single()
    if (error) toast.error(`Erreur: ${error.message}`)
    else { toast.success('Avancement mis à jour'); onSaved(data) }
    setSaving(false)
  }

  const handleDelete = async () => {
    setDeleting(true)
    const { error } = await supabase.from('lots').delete().eq('id', lot.id)
    if (error) { toast.error(`Erreur: ${error.message}`); setDeleting(false) }
    else { toast.success('Lot supprimé'); onDeleted(lot.id) }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 p-0 sm:p-4" onClick={onClose}>
      <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 sticky top-0 bg-white">
          <h3 className="font-semibold text-gray-900">{isNew ? 'Nouveau lot' : lot.name}</h3>
          <div className="flex items-center gap-1">
            {canEdit && !isNew && (
              <button onClick={() => setConfirmDel(true)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md">
                <Trash2 size={15} />
              </button>
            )}
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
              <select value={form.member_id} onChange={e => setForm({ ...form, member_id: e.target.value })}
                className="mt-1 w-full h-9 rounded-lg border border-input bg-white px-2 text-sm">
                <option value="">— Non assigné —</option>
                {members.map(m => (
                  <option key={m.user_id} value={m.user_id}>
                    {m.profile?.full_name || 'Utilisateur'}{m.profile?.company ? ` — ${m.profile.company}` : ''}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs">Début</Label>
                <Input type="date" value={form.start_date} onChange={e => setForm({ ...form, start_date: e.target.value })} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Fin</Label>
                <Input type="date" value={form.end_date} onChange={e => setForm({ ...form, end_date: e.target.value })} className="mt-1" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Avancement : {form.progress}%</Label>
              <input type="range" min={0} max={100} step={5} value={form.progress}
                onChange={e => setForm({ ...form, progress: Number(e.target.value) })}
                className="w-full mt-1 accent-orange-500" />
            </div>
            <div>
              <Label className="text-xs">Couleur</Label>
              <div className="flex flex-wrap gap-1.5 mt-1">
                {COLORS.map(c => (
                  <button key={c} type="button" onClick={() => setForm({ ...form, color: c })}
                    className={`w-7 h-7 rounded-full ${COLOR_BG[c]} flex items-center justify-center ${form.color === c ? 'ring-2 ring-offset-1 ring-gray-800' : ''}`}>
                    {form.color === c && <Check size={13} className="text-white" />}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={onClose}>Annuler</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={saving}>
                {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {isNew ? 'Créer' : 'Enregistrer'}
              </Button>
            </div>
          </form>
        ) : (
          /* Vue membre : avancement seul */
          <div className="p-4 space-y-3">
            <div className="text-sm text-gray-600">
              {lot.member?.full_name && <p>Assigné à <span className="font-medium">{lot.member.full_name}</span></p>}
              {lot.start_date && lot.end_date && (
                <p className="text-xs text-gray-400 mt-0.5">Du {lot.start_date} au {lot.end_date}</p>
              )}
            </div>
            {isAssignee ? (
              <>
                <div>
                  <Label className="text-xs">Avancement : {form.progress}%</Label>
                  <input type="range" min={0} max={100} step={5} value={form.progress}
                    onChange={e => setForm({ ...form, progress: Number(e.target.value) })}
                    className="w-full mt-1 accent-orange-500" />
                </div>
                <div className="flex justify-end">
                  <Button onClick={handleProgressOnly} className="bg-orange-500 hover:bg-orange-600" disabled={saving}>
                    {saving ? <Loader2 size={14} className="animate-spin mr-1" /> : null} Mettre à jour
                  </Button>
                </div>
              </>
            ) : (
              <div className="bg-gray-50 rounded-lg p-3">
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="text-gray-500">Avancement</span>
                  <span className="font-medium">{lot.progress}%</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div className="h-full bg-orange-500" style={{ width: `${lot.progress}%` }} />
                </div>
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
                <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
                  {deleting ? <Loader2 size={13} className="animate-spin mr-1" /> : null} Supprimer
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
