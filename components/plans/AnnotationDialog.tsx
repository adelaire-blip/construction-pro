'use client'

import { useState, useRef, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Annotation, AnnotationPhoto, Trade } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  X, Send, Image as ImageIcon, ImagePlus, Loader2, Bookmark, MessageSquare,
  AlertTriangle, Trash2, ChevronLeft, ChevronRight, Pencil, Check,
  RotateCcw, ShieldCheck, Lock
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const TYPE_OPTIONS = [
  { value: 'reservation', label: 'Réservation', icon: Bookmark, color: 'text-blue-600' },
  { value: 'note', label: 'Note', icon: MessageSquare, color: 'text-green-600' },
  { value: 'alerte', label: 'Alerte', icon: AlertTriangle, color: 'text-red-600' },
]

const STATUS_OPTIONS = [
  { value: 'ouvert', label: 'Ouverte', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_cours', label: 'En cours', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'resolu', label: 'Réserve levée', color: 'bg-green-100 text-green-700' },
  { value: 'cloture', label: 'Clôturée', color: 'bg-blue-100 text-blue-700' },
]

interface CreateProps {
  mode: 'create'
  floorId: string
  userId: string
  position: { x: number; y: number }
  anchor?: { x: number; y: number } | null
  onClose: () => void
  onCreated: (annotation: Annotation) => void
}

interface ViewProps {
  mode: 'view'
  annotation: Annotation
  userId: string
  isAdmin: boolean
  onClose: () => void
  onUpdated: (annotation: Annotation) => void
  onDeleted: (id: string) => void
}

type Props = CreateProps | ViewProps

export default function AnnotationDialog(props: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const createPhotoRef = useRef<HTMLInputElement>(null)

  // Create mode state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('reservation')
  const [trade, setTrade] = useState('')
  const [trades, setTrades] = useState<Trade[]>([])
  const [loading, setLoading] = useState(false)
  const [pendingFiles, setPendingFiles] = useState<File[]>([])

  // Charge les corps de métier (mode création)
  useEffect(() => {
    if (props.mode === 'create') {
      supabase.from('trades').select('*').order('name').then(({ data }) => {
        if (data) setTrades(data)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // View mode state
  const [comment, setComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [galleryUploading, setGalleryUploading] = useState(false)
  const [lightbox, setLightbox] = useState<number | null>(null)
  const [status, setStatus] = useState(props.mode === 'view' ? props.annotation.status : 'ouvert')
  const [localAnnotation, setLocalAnnotation] = useState<Annotation | null>(
    props.mode === 'view' ? props.annotation : null
  )

  // Édition / suppression (mode view)
  const [editing, setEditing] = useState(false)
  const [editForm, setEditForm] = useState({
    title: props.mode === 'view' ? props.annotation.title : '',
    description: props.mode === 'view' ? (props.annotation.description || '') : '',
    type: props.mode === 'view' ? props.annotation.type : 'reservation',
    trade: props.mode === 'view' ? (props.annotation.trade || '') : '',
  })
  const [savingEdit, setSavingEdit] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Droits : admin du projet OU auteur de l'annotation
  const canManage = props.mode === 'view' && (props.isAdmin || props.annotation.created_by === props.userId)

  // Charge les métiers aussi en mode view (pour l'édition)
  useEffect(() => {
    if (props.mode === 'view') {
      supabase.from('trades').select('*').order('name').then(({ data }) => {
        if (data) setTrades(data)
      })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const handleSaveEdit = async () => {
    if (props.mode !== 'view') return
    setSavingEdit(true)
    const { data, error } = await supabase
      .from('annotations')
      .update({
        title: editForm.title,
        description: editForm.description || null,
        type: editForm.type,
        trade: editForm.trade || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', props.annotation.id)
      .select('*, profile:profiles(*), photos:annotation_photos(*), comments:annotation_comments(*, profile:profiles(*))')
      .single()
    if (error) {
      toast.error(`Erreur: ${error.message}`)
    } else {
      setLocalAnnotation(data)
      props.onUpdated(data)
      setEditing(false)
      toast.success('Annotation modifiée')
    }
    setSavingEdit(false)
  }

  const handleDelete = async () => {
    if (props.mode !== 'view') return
    setDeleting(true)
    const { error } = await supabase.from('annotations').delete().eq('id', props.annotation.id)
    if (error) {
      toast.error(`Erreur: ${error.message}`)
      setDeleting(false)
    } else {
      toast.success('Annotation supprimée')
      props.onDeleted(props.annotation.id)
    }
  }

  // Action rapide de statut (lever réserve / clôturer / rouvrir)
  const quickStatus = (s: string) => handleStatusChange(s)

  // Upload un fichier vers le bucket attachments, renvoie l'URL publique
  const uploadFile = async (file: File, annotationId: string): Promise<string | null> => {
    const safeName = file.name.replace(/[^a-zA-Z0-9.\-_]/g, '_')
    const path = `annotations/${annotationId}/${Date.now()}_${safeName}`
    const { error } = await supabase.storage.from('attachments').upload(path, file)
    if (error) {
      console.error('Upload photo error:', error)
      return null
    }
    return supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (props.mode !== 'create') return
    setLoading(true)
    const { data, error } = await supabase
      .from('annotations')
      .insert({
        floor_id: props.floorId,
        x: props.position.x,
        y: props.position.y,
        title,
        description,
        type,
        trade: trade || null,
        status: 'ouvert',
        created_by: props.userId,
      })
      .select('*, profile:profiles(*), photos:annotation_photos(*), comments:annotation_comments(*, profile:profiles(*))')
      .single()

    if (error) {
      console.error('Annotation create error:', error)
      toast.error(`Erreur: ${error.message} (${error.code})`)
      setLoading(false)
      return
    }

    // Upload des photos sélectionnées
    const photos: AnnotationPhoto[] = []
    for (const file of pendingFiles) {
      const url = await uploadFile(file, data.id)
      if (url) {
        const { data: photo } = await supabase
          .from('annotation_photos')
          .insert({ annotation_id: data.id, photo_url: url, created_by: props.userId })
          .select()
          .single()
        if (photo) photos.push(photo)
      }
    }

    toast.success('Annotation créée !')
    props.onCreated({ ...data, photos })
    setLoading(false)
  }

  const handleCreatePhotoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || [])
    setPendingFiles(prev => [...prev, ...files])
    e.target.value = ''
  }

  const handleAddGalleryPhotos = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (props.mode !== 'view') return
    const files = Array.from(e.target.files || [])
    if (files.length === 0) return
    setGalleryUploading(true)
    const newPhotos: AnnotationPhoto[] = []
    for (const file of files) {
      const url = await uploadFile(file, props.annotation.id)
      if (url) {
        const { data: photo } = await supabase
          .from('annotation_photos')
          .insert({ annotation_id: props.annotation.id, photo_url: url, created_by: props.userId })
          .select()
          .single()
        if (photo) newPhotos.push(photo)
      }
    }
    if (newPhotos.length && localAnnotation) {
      const updated = { ...localAnnotation, photos: [...(localAnnotation.photos || []), ...newPhotos] }
      setLocalAnnotation(updated)
      props.onUpdated(updated)
      toast.success(`${newPhotos.length} photo(s) ajoutée(s)`)
    } else {
      toast.error('Erreur lors de l\'ajout des photos')
    }
    setGalleryUploading(false)
    if (galleryRef.current) galleryRef.current.value = ''
  }

  const handleDeletePhoto = async (photo: AnnotationPhoto) => {
    if (props.mode !== 'view') return
    const { error } = await supabase.from('annotation_photos').delete().eq('id', photo.id)
    if (error) {
      toast.error('Suppression impossible (photo d\'un autre utilisateur ?)')
      return
    }
    if (localAnnotation) {
      const updated = { ...localAnnotation, photos: (localAnnotation.photos || []).filter(p => p.id !== photo.id) }
      setLocalAnnotation(updated)
      props.onUpdated(updated)
    }
    setLightbox(null)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (props.mode !== 'view') return
    setStatus(newStatus as Annotation['status'])
    const { data, error } = await supabase
      .from('annotations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', props.annotation.id)
      .select('*, profile:profiles(*), photos:annotation_photos(*), comments:annotation_comments(*, profile:profiles(*))')
      .single()
    if (!error && data) {
      setLocalAnnotation(data)
      props.onUpdated(data)
      toast.success('Statut mis à jour')
    }
  }

  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault()
    if (props.mode !== 'view' || !comment.trim()) return
    setCommentLoading(true)
    const { data, error } = await supabase
      .from('annotation_comments')
      .insert({
        annotation_id: props.annotation.id,
        text: comment,
        created_by: props.userId,
      })
      .select('*, profile:profiles(*)')
      .single()

    if (!error && data && localAnnotation) {
      const updated = {
        ...localAnnotation,
        comments: [...(localAnnotation.comments || []), data],
      }
      setLocalAnnotation(updated)
      props.onUpdated(updated)
      setComment('')
    } else {
      toast.error('Erreur lors de l\'envoi')
    }
    setCommentLoading(false)
  }

  const handlePhotoComment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (props.mode !== 'view' || !e.target.files?.[0]) return
    const file = e.target.files[0]
    setPhotoUploading(true)
    const path = `comments/${props.annotation.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(path, file)

    if (uploadError) {
      toast.error('Erreur upload photo')
      setPhotoUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)

    const { data, error } = await supabase
      .from('annotation_comments')
      .insert({
        annotation_id: props.annotation.id,
        photo_url: publicUrl,
        created_by: props.userId,
      })
      .select('*, profile:profiles(*)')
      .single()

    if (!error && data && localAnnotation) {
      const updated = {
        ...localAnnotation,
        comments: [...(localAnnotation.comments || []), data],
      }
      setLocalAnnotation(updated)
      props.onUpdated(updated)
      toast.success('Photo ajoutée')
    }
    setPhotoUploading(false)
  }

  const annotation = localAnnotation || (props.mode === 'view' ? props.annotation : null)
  const typeConfig = TYPE_OPTIONS.find(t => t.value === (annotation?.type || type))

  // Popover ancré près du point cliqué (création, écrans larges)
  const [vw, setVw] = useState(0)
  useEffect(() => {
    setVw(window.innerWidth)
    const onResize = () => setVw(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const anchor = props.mode === 'create' ? props.anchor : null
  const anchored = !!anchor && vw >= 640

  let popStyle: React.CSSProperties | undefined
  if (anchored && anchor) {
    const W = 360
    const margin = 12
    const vh = typeof window !== 'undefined' ? window.innerHeight : 800
    // Place à droite du point ; bascule à gauche si pas la place
    let left = anchor.x + 18
    if (left + W > vw - margin) left = anchor.x - W - 18
    if (left < margin) left = margin
    // Verticalement : centré sur le point, borné à l'écran
    const estH = Math.min(vh * 0.8, 560)
    let top = anchor.y - 60
    if (top + estH > vh - margin) top = vh - estH - margin
    if (top < margin) top = margin
    popStyle = { position: 'fixed', left, top, width: W, maxHeight: '80vh' }
  }

  return (
    <div
      className={anchored ? 'fixed inset-0 z-50 bg-black/10' : 'fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50'}
      onClick={props.onClose}
    >
      <div
        className={anchored
          ? 'bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden ring-1 ring-black/5'
          : 'bg-white w-full sm:w-[480px] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col'}
        style={popStyle}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {typeConfig && (
              <span className={typeConfig.color}>
                <typeConfig.icon size={16} />
              </span>
            )}
            <h3 className="font-semibold text-gray-900 truncate max-w-[200px]">
              {props.mode === 'create' ? 'Nouvelle annotation' : (editing ? 'Modifier' : annotation?.title)}
            </h3>
          </div>
          <div className="flex items-center gap-1">
            {canManage && !editing && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded-md"
                  title="Modifier"
                >
                  <Pencil size={15} />
                </button>
                <button
                  onClick={() => setConfirmDelete(true)}
                  className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-md"
                  title="Supprimer"
                >
                  <Trash2 size={15} />
                </button>
              </>
            )}
            <button onClick={props.onClose} className="p-1.5 text-gray-400 hover:text-gray-600">
              <X size={18} />
            </button>
          </div>
        </div>

        {props.mode === 'create' ? (
          /* CREATE FORM */
          <form onSubmit={handleCreate} className="p-4 space-y-3 overflow-y-auto">
            <div>
              <Label>Titre *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Ex: Réservation passage gaine électrique"
                required
                autoFocus
                className="mt-1"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={type} onValueChange={(v) => v && setType(v)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      <span className="flex items-center gap-2">
                        <opt.icon size={14} className={opt.color} />
                        {opt.label}
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Corps de métier concerné</Label>
              <select
                value={trade}
                onChange={e => setTrade(e.target.value)}
                className="mt-1 w-full h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
              >
                <option value="">— Aucun —</option>
                {trades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
              </select>
            </div>
            <div>
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={3}
                className="mt-1"
              />
            </div>
            {/* Galerie photos (création) */}
            <div>
              <Label>Photos</Label>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                ref={createPhotoRef}
                onChange={handleCreatePhotoSelect}
              />
              <div className="mt-1 grid grid-cols-4 gap-2">
                {pendingFiles.map((file, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden border border-gray-200">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={URL.createObjectURL(file)} alt="" className="w-full h-full object-cover" />
                    <button
                      type="button"
                      onClick={() => setPendingFiles(prev => prev.filter((_, idx) => idx !== i))}
                      className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full p-0.5"
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => createPhotoRef.current?.click()}
                  className="aspect-square rounded-lg border-2 border-dashed border-gray-300 flex flex-col items-center justify-center text-gray-400 hover:border-orange-400 hover:text-orange-500 transition-colors"
                >
                  <ImagePlus size={18} />
                  <span className="text-[10px] mt-0.5">Ajouter</span>
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={props.onClose}>Annuler</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                {loading && pendingFiles.length ? 'Upload photos...' : 'Créer'}
              </Button>
            </div>
          </form>
        ) : annotation ? (
          /* VIEW MODE */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Meta info OU édition */}
            {editing ? (
              <div className="px-4 py-3 space-y-3 border-b border-gray-100 bg-orange-50/40">
                <div>
                  <Label className="text-xs">Titre *</Label>
                  <Input value={editForm.title} onChange={e => setEditForm({ ...editForm, title: e.target.value })} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Type</Label>
                    <select value={editForm.type} onChange={e => setEditForm({ ...editForm, type: e.target.value as Annotation['type'] })} className="mt-1 w-full h-9 rounded-lg border border-input bg-white px-2 text-sm">
                      {TYPE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label className="text-xs">Corps de métier</Label>
                    <select value={editForm.trade} onChange={e => setEditForm({ ...editForm, trade: e.target.value })} className="mt-1 w-full h-9 rounded-lg border border-input bg-white px-2 text-sm">
                      <option value="">— Aucun —</option>
                      {trades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Description</Label>
                  <Textarea value={editForm.description} onChange={e => setEditForm({ ...editForm, description: e.target.value })} rows={2} className="mt-1" />
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}>Annuler</Button>
                  <Button type="button" size="sm" className="bg-orange-500 hover:bg-orange-600" onClick={handleSaveEdit} disabled={savingEdit}>
                    {savingEdit ? <Loader2 size={13} className="animate-spin mr-1" /> : <Check size={13} className="mr-1" />}
                    Enregistrer
                  </Button>
                </div>
              </div>
            ) : (
              <div className="px-4 py-3 space-y-2 border-b border-gray-100">
                {annotation.trade && (
                  <span className="inline-block text-xs font-semibold bg-gray-800 text-white rounded px-2 py-0.5">
                    {annotation.trade}
                  </span>
                )}
                {annotation.description && (
                  <p className="text-sm text-gray-600">{annotation.description}</p>
                )}

                {/* Statut courant */}
                <div className="flex items-center gap-2">
                  {(() => {
                    const so = STATUS_OPTIONS.find(o => o.value === status) || STATUS_OPTIONS[0]
                    return <span className={`text-xs px-2 py-1 rounded-full font-medium ${so.color}`}>{so.label}</span>
                  })()}
                </div>

                {/* Actions rapides de réserve */}
                <div className="flex flex-wrap gap-2 pt-1">
                  {status !== 'resolu' && status !== 'cloture' && (
                    <button onClick={() => quickStatus('resolu')} className="flex items-center gap-1 text-xs font-medium bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg">
                      <ShieldCheck size={13} /> Lever la réserve
                    </button>
                  )}
                  {status === 'resolu' && (
                    <button onClick={() => quickStatus('cloture')} className="flex items-center gap-1 text-xs font-medium bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded-lg">
                      <Lock size={13} /> Clôturer
                    </button>
                  )}
                  {(status === 'resolu' || status === 'cloture') && (
                    <button onClick={() => quickStatus('ouvert')} className="flex items-center gap-1 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                      <RotateCcw size={13} /> Rouvrir
                    </button>
                  )}
                  {status === 'ouvert' && (
                    <button onClick={() => quickStatus('en_cours')} className="flex items-center gap-1 text-xs font-medium border border-gray-200 text-gray-600 hover:bg-gray-50 px-3 py-1.5 rounded-lg">
                      Démarrer le traitement
                    </button>
                  )}
                </div>

                <div className="text-xs text-gray-500 pt-1">
                  <span className="font-medium text-gray-700">{annotation.profile?.full_name || 'Inconnu'}</span>
                  {annotation.profile?.company && <span> — {annotation.profile.company}</span>}
                  <span className="text-gray-400"> • {format(new Date(annotation.created_at), 'dd MMM yyyy', { locale: fr })}</span>
                </div>
              </div>
            )}

            {/* Galerie photos (consultation) */}
            <div className="px-4 py-3 border-b border-gray-100">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">
                  Photos ({(annotation.photos || []).length})
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  ref={galleryRef}
                  onChange={handleAddGalleryPhotos}
                />
                <button
                  onClick={() => galleryRef.current?.click()}
                  disabled={galleryUploading}
                  className="flex items-center gap-1 text-xs text-orange-600 hover:text-orange-700 font-medium"
                >
                  {galleryUploading ? <Loader2 size={12} className="animate-spin" /> : <ImagePlus size={12} />}
                  {galleryUploading ? 'Ajout...' : 'Ajouter'}
                </button>
              </div>
              {(annotation.photos || []).length === 0 ? (
                <p className="text-xs text-gray-400 text-center py-2">Aucune photo</p>
              ) : (
                <div className="grid grid-cols-4 gap-2">
                  {(annotation.photos || []).map((photo, i) => (
                    <button
                      key={photo.id}
                      onClick={() => setLightbox(i)}
                      className="relative aspect-square rounded-lg overflow-hidden border border-gray-200 group"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.photo_url} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:opacity-90" />
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Comments */}
            <ScrollArea className="flex-1 px-4 py-3">
              {(annotation.comments || []).length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-4">Aucun commentaire</p>
              ) : (
                <div className="space-y-3">
                  {(annotation.comments || []).map(c => (
                    <div key={c.id} className="flex gap-2">
                      <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0">
                        {(c.profile?.full_name || 'U')[0].toUpperCase()}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-baseline gap-1">
                          <span className="text-xs font-medium text-gray-800">{c.profile?.full_name || 'Utilisateur'}</span>
                          <span className="text-xs text-gray-400">{format(new Date(c.created_at), 'HH:mm dd/MM', { locale: fr })}</span>
                        </div>
                        {c.text && <p className="text-sm text-gray-700 mt-0.5">{c.text}</p>}
                        {c.photo_url && (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={c.photo_url} alt="Photo" className="mt-1 rounded-lg max-w-full max-h-40 object-cover cursor-pointer" onClick={() => window.open(c.photo_url!, '_blank')} />
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>

            {/* Comment input */}
            <div className="border-t border-gray-100 p-3">
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  ref={fileRef}
                  onChange={handlePhotoComment}
                />
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  disabled={photoUploading}
                  className="p-2 text-gray-400 hover:text-orange-500 transition-colors"
                >
                  {photoUploading ? <Loader2 size={18} className="animate-spin" /> : <ImageIcon size={18} />}
                </button>
                <Input
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  placeholder="Ajouter un commentaire..."
                  className="flex-1 h-9 text-sm"
                />
                <Button type="submit" size="sm" disabled={commentLoading || !comment.trim()} className="bg-orange-500 hover:bg-orange-600 h-9 px-3">
                  {commentLoading ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                </Button>
              </form>
            </div>
          </div>
        ) : null}
      </div>

      {/* Confirmation de suppression */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" onClick={(e) => { e.stopPropagation(); setConfirmDelete(false) }}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-5" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 mb-2">
              <div className="bg-red-100 text-red-600 p-2 rounded-lg"><Trash2 size={18} /></div>
              <h3 className="font-bold text-gray-900">Supprimer l&apos;annotation ?</h3>
            </div>
            <p className="text-sm text-gray-500 mb-4">Cette annotation, ses photos et commentaires seront supprimés définitivement.</p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>Annuler</Button>
              <Button size="sm" className="bg-red-600 hover:bg-red-700" onClick={handleDelete} disabled={deleting}>
                {deleting ? <Loader2 size={13} className="animate-spin mr-1" /> : <Trash2 size={13} className="mr-1" />}
                Supprimer
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Visionneuse plein écran (lightbox) */}
      {lightbox !== null && annotation?.photos && annotation.photos[lightbox] && (
        <div
          className="fixed inset-0 z-[60] bg-black/90 flex items-center justify-center"
          onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
        >
          <button
            onClick={(e) => { e.stopPropagation(); setLightbox(null) }}
            className="absolute top-4 right-4 text-white/80 hover:text-white"
          >
            <X size={28} />
          </button>

          {lightbox > 0 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lightbox - 1) }}
              className="absolute left-4 text-white/80 hover:text-white"
            >
              <ChevronLeft size={36} />
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={annotation.photos[lightbox].photo_url}
            alt=""
            className="max-w-[90vw] max-h-[85vh] object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {lightbox < annotation.photos.length - 1 && (
            <button
              onClick={(e) => { e.stopPropagation(); setLightbox(lightbox + 1) }}
              className="absolute right-4 text-white/80 hover:text-white"
            >
              <ChevronRight size={36} />
            </button>
          )}

          <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3">
            <span className="text-white/70 text-sm">{lightbox + 1} / {annotation.photos.length}</span>
            {annotation.photos[lightbox].created_by === props.userId && (
              <button
                onClick={(e) => { e.stopPropagation(); handleDeletePhoto(annotation.photos![lightbox]) }}
                className="flex items-center gap-1 text-red-300 hover:text-red-200 text-sm"
              >
                <Trash2 size={14} /> Supprimer
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
