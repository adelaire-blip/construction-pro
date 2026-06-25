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
import { Plus, Upload, Layers, ChevronLeft, ChevronRight, Loader2, FileText, Image } from 'lucide-react'
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
  const supabase = createClient()

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
          <PlanViewer floor={selectedFloor} user={user} />
        </div>
      ) : null}
    </div>
  )
}
