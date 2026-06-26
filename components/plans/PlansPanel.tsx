'use client'

import { useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Floor } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { Plus, Upload, Layers, ChevronLeft, ChevronRight, Loader2, FileText, Image, Pencil, Trash2, AlertTriangle } from 'lucide-react'
import PlanViewer from './PlanViewer'

interface Props {
  user: User
  project: Project
  floors: Floor[]
  setFloors: (floors: Floor[]) => void
  isOwner: boolean
}

const FLOOR_NAMES = [
  'Rez-de-chaussée',
  'Étage 1',
  'Étage 2',
  'Étage 3',
  'Sous-sol',
  'Combles',
]

export default function PlansPanel({ user, project, floors, setFloors, isOwner }: Props) {
  const [selectedFloor, setSelectedFloor] = useState<Floor | null>(floors[0] || null)
  const [addFloorOpen, setAddFloorOpen] = useState(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [floorName, setFloorName] = useState('')
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [renameFloor, setRenameFloor] = useState<Floor | null>(null)
  const [renameValue, setRenameValue] = useState('')
  const [deleteFloor, setDeleteFloor] = useState<Floor | null>(null)
  const [floorActionLoading, setFloorActionLoading] = useState(false)
  const supabase = createClient()

  const handleRenameFloor = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!renameFloor) return
    setFloorActionLoading(true)
    const { data, error } = await supabase
      .from('floors')
      .update({ name: renameValue })
      .eq('id', renameFloor.id)
      .select()
      .single()
    if (error) {
      toast.error(`Erreur: ${error.message}`)
    } else {
      setFloors(floors.map(f => f.id === data.id ? data : f))
      if (selectedFloor?.id === data.id) setSelectedFloor(data)
      setRenameFloor(null)
      toast.success('Niveau renommé')
    }
    setFloorActionLoading(false)
  }

  const handleDeleteFloor = async () => {
    if (!deleteFloor) return
    setFloorActionLoading(true)
    const { error } = await supabase.from('floors').delete().eq('id', deleteFloor.id)
    if (error) {
      toast.error(`Erreur: ${error.message}`)
    } else {
      const remaining = floors.filter(f => f.id !== deleteFloor.id)
      setFloors(remaining)
      if (selectedFloor?.id === deleteFloor.id) setSelectedFloor(remaining[0] || null)
      toast.success('Niveau supprimé')
      setDeleteFloor(null)
    }
    setFloorActionLoading(false)
  }

  const handleAddFloor = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const level = floors.length
    const { data, error } = await supabase
      .from('floors')
      .insert({ project_id: project.id, name: floorName, level })
      .select()
      .single()

    if (error) {
      toast.error('Erreur lors de la création du niveau')
    } else {
      const newFloors = [...floors, data]
      setFloors(newFloors)
      setSelectedFloor(data)
      setAddFloorOpen(false)
      setFloorName('')
      toast.success(`Niveau "${floorName}" créé`)
    }
    setLoading(false)
  }

  const handleUploadPlan = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!selectedFloor) {
      toast.error('Aucun niveau sélectionné')
      return
    }
    if (!file) return

    const isPdf = file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    const isImage = file.type.startsWith('image/')
    if (!isPdf && !isImage) {
      toast.error(`Format non supporté (${file.type || 'inconnu'}). Utilisez PDF, PNG ou JPG.`)
      return
    }

    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() || (isPdf ? 'pdf' : 'png')
      const path = `${project.id}/${selectedFloor.id}.${ext}`

      const { error: uploadError } = await supabase.storage
        .from('plans')
        .upload(path, file, { upsert: true, contentType: file.type || undefined })

      if (uploadError) {
        console.error('Upload error:', uploadError)
        toast.error(`Erreur upload: ${uploadError.message}`)
        return
      }

      const { data: urlData } = supabase.storage.from('plans').getPublicUrl(path)
      const publicUrl = `${urlData.publicUrl}?t=${Date.now()}`

      const { data, error } = await supabase
        .from('floors')
        .update({ plan_url: publicUrl, plan_type: isPdf ? 'pdf' : 'image' })
        .eq('id', selectedFloor.id)
        .select()
        .single()

      if (error) {
        console.error('Floor update error:', error)
        toast.error(`Erreur mise à jour: ${error.message}`)
        return
      }

      const updatedFloors = floors.map(f => f.id === selectedFloor.id ? data : f)
      setFloors(updatedFloors)
      setSelectedFloor(data)
      toast.success('Plan importé avec succès')
    } catch (err: unknown) {
      console.error('Upload exception:', err)
      const msg = err instanceof Error ? err.message : 'Erreur inconnue'
      toast.error(`Erreur: ${msg}`)
    } finally {
      setUploading(false)
      e.target.value = ''
    }
  }

  const currentIndex = floors.findIndex(f => f.id === selectedFloor?.id)

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Floor selector bar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <Layers size={14} className="text-gray-500 shrink-0" />
        <div className="flex items-center gap-1 overflow-x-auto flex-1 no-scrollbar">
          {floors.map(floor => (
            <button
              key={floor.id}
              onClick={() => setSelectedFloor(floor)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors ${
                selectedFloor?.id === floor.id
                  ? 'bg-orange-500 text-white'
                  : 'bg-white text-gray-600 hover:bg-gray-100 border border-gray-200'
              }`}
            >
              {floor.name}
              {floor.plan_url && <span className="ml-1 w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />}
            </button>
          ))}
        </div>
        {isOwner && selectedFloor && (
          <div className="flex items-center gap-0.5 shrink-0">
            <button
              onClick={() => { setRenameFloor(selectedFloor); setRenameValue(selectedFloor.name) }}
              className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md"
              title="Renommer le niveau"
            >
              <Pencil size={13} />
            </button>
            <button
              onClick={() => setDeleteFloor(selectedFloor)}
              className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
              title="Supprimer le niveau"
            >
              <Trash2 size={13} />
            </button>
          </div>
        )}
        {isOwner && (
          <Dialog open={addFloorOpen} onOpenChange={setAddFloorOpen}>
            <DialogTrigger render={<Button variant="outline" size="sm" className="gap-1 shrink-0 h-7 text-xs" />}>
              <Plus size={12} /> Niveau
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ajouter un niveau</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleAddFloor} className="space-y-4 mt-2">
                <div>
                  <Label>Nom du niveau *</Label>
                  <Input
                    value={floorName}
                    onChange={e => setFloorName(e.target.value)}
                    placeholder="Rez-de-chaussée"
                    list="floor-suggestions"
                    required
                    className="mt-1"
                  />
                  <datalist id="floor-suggestions">
                    {FLOOR_NAMES.map(n => <option key={n} value={n} />)}
                  </datalist>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setAddFloorOpen(false)}>Annuler</Button>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                    Créer
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Plan viewer area */}
      {floors.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <Layers size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-500 font-medium">Aucun niveau créé</p>
          {isOwner && (
            <p className="text-sm text-gray-400 mt-1">Cliquez sur &quot;+ Niveau&quot; pour commencer</p>
          )}
        </div>
      ) : selectedFloor && !selectedFloor.plan_url ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
          <Upload size={40} className="text-gray-300 mb-3" />
          <p className="text-gray-600 font-medium">Aucun plan pour &quot;{selectedFloor.name}&quot;</p>
          {isOwner && (
            <>
              <p className="text-sm text-gray-400 mt-1 mb-4">Importez un fichier PDF ou image</p>
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleUploadPlan}
                  disabled={uploading}
                />
                <div className="flex items-center gap-2 bg-orange-500 hover:bg-orange-600 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
                  {uploading ? 'Upload en cours...' : 'Importer le plan'}
                </div>
              </label>
              <div className="flex items-center gap-4 mt-3 text-xs text-gray-400">
                <span className="flex items-center gap-1"><FileText size={11} /> PDF</span>
                <span className="flex items-center gap-1"><Image size={11} /> PNG, JPG</span>
              </div>
            </>
          )}
        </div>
      ) : selectedFloor ? (
        <div className="flex-1 overflow-hidden flex flex-col">
          {/* Upload replace button for owners */}
          {isOwner && (
            <div className="px-3 py-1.5 flex justify-end border-b border-gray-100 bg-gray-50 flex-shrink-0">
              <label className="cursor-pointer">
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={handleUploadPlan}
                  disabled={uploading}
                />
                <span className="flex items-center gap-1 text-xs text-gray-500 hover:text-orange-600 transition-colors">
                  {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
                  {uploading ? 'Upload...' : 'Remplacer le plan'}
                </span>
              </label>
            </div>
          )}
          <PlanViewer floor={selectedFloor} user={user} isAdmin={isOwner} />
        </div>
      ) : null}

      {/* Renommer un niveau */}
      {renameFloor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setRenameFloor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <h3 className="font-bold text-gray-900 mb-3">Renommer le niveau</h3>
            <form onSubmit={handleRenameFloor}>
              <Input value={renameValue} onChange={e => setRenameValue(e.target.value)} autoFocus required />
              <div className="flex justify-end gap-2 mt-4">
                <Button type="button" variant="outline" size="sm" onClick={() => setRenameFloor(null)}>Annuler</Button>
                <Button type="submit" size="sm" className="bg-orange-500 hover:bg-orange-600" disabled={floorActionLoading}>
                  {floorActionLoading ? <Loader2 size={13} className="animate-spin mr-1" /> : null}
                  Enregistrer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Supprimer un niveau */}
      {deleteFloor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setDeleteFloor(null)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-red-100 text-red-600 p-2 rounded-lg"><AlertTriangle size={18} /></div>
              <h3 className="font-bold text-gray-900">Supprimer ce niveau ?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">
              <strong>{deleteFloor.name}</strong> sera supprimé avec son plan et <strong>toutes ses annotations</strong>. Action irréversible.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setDeleteFloor(null)} disabled={floorActionLoading}>Annuler</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleDeleteFloor} disabled={floorActionLoading}>
                {floorActionLoading ? <Loader2 size={13} className="animate-spin mr-1" /> : <Trash2 size={13} className="mr-1" />}
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
