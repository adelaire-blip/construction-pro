'use client'

import { useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Annotation, AnnotationComment } from '@/types'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Separator } from '@/components/ui/separator'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import { X, Send, Image, Loader2, Bookmark, MessageSquare, AlertTriangle, CheckCircle, Clock } from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const TYPE_OPTIONS = [
  { value: 'reservation', label: 'Réservation', icon: Bookmark, color: 'text-blue-600' },
  { value: 'note', label: 'Note', icon: MessageSquare, color: 'text-green-600' },
  { value: 'alerte', label: 'Alerte', icon: AlertTriangle, color: 'text-red-600' },
]

const STATUS_OPTIONS = [
  { value: 'ouvert', label: 'Ouvert', color: 'bg-gray-100 text-gray-700' },
  { value: 'en_cours', label: 'En cours', color: 'bg-yellow-100 text-yellow-700' },
  { value: 'resolu', label: 'Résolu', color: 'bg-green-100 text-green-700' },
]

interface CreateProps {
  mode: 'create'
  floorId: string
  userId: string
  position: { x: number; y: number }
  onClose: () => void
  onCreated: (annotation: Annotation) => void
}

interface ViewProps {
  mode: 'view'
  annotation: Annotation
  userId: string
  onClose: () => void
  onUpdated: (annotation: Annotation) => void
}

type Props = CreateProps | ViewProps

export default function AnnotationDialog(props: Props) {
  const supabase = createClient()
  const fileRef = useRef<HTMLInputElement>(null)

  // Create mode state
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [type, setType] = useState('reservation')
  const [loading, setLoading] = useState(false)

  // View mode state
  const [comment, setComment] = useState('')
  const [commentLoading, setCommentLoading] = useState(false)
  const [photoUploading, setPhotoUploading] = useState(false)
  const [status, setStatus] = useState(props.mode === 'view' ? props.annotation.status : 'ouvert')
  const [localAnnotation, setLocalAnnotation] = useState<Annotation | null>(
    props.mode === 'view' ? props.annotation : null
  )

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
        status: 'ouvert',
        created_by: props.userId,
      })
      .select('*, profile:profiles(*), comments:annotation_comments(*, profile:profiles(*))')
      .single()

    if (error) {
      toast.error('Erreur lors de la création')
    } else {
      toast.success('Annotation créée !')
      props.onCreated(data)
    }
    setLoading(false)
  }

  const handleStatusChange = async (newStatus: string) => {
    if (props.mode !== 'view') return
    setStatus(newStatus as Annotation['status'])
    const { data, error } = await supabase
      .from('annotations')
      .update({ status: newStatus, updated_at: new Date().toISOString() })
      .eq('id', props.annotation.id)
      .select('*, profile:profiles(*), comments:annotation_comments(*, profile:profiles(*))')
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

  return (
    <div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50"
      onClick={props.onClose}
    >
      <div
        className="bg-white w-full sm:w-[480px] rounded-t-2xl sm:rounded-2xl shadow-2xl max-h-[85vh] flex flex-col"
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
            <h3 className="font-semibold text-gray-900">
              {props.mode === 'create' ? 'Nouvelle annotation' : annotation?.title}
            </h3>
          </div>
          <button onClick={props.onClose} className="text-gray-400 hover:text-gray-600">
            <X size={18} />
          </button>
        </div>

        {props.mode === 'create' ? (
          /* CREATE FORM */
          <form onSubmit={handleCreate} className="p-4 space-y-3">
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
              <Label>Description</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="Détails supplémentaires..."
                rows={3}
                className="mt-1"
              />
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <Button type="button" variant="outline" onClick={props.onClose}>Annuler</Button>
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Créer
              </Button>
            </div>
          </form>
        ) : annotation ? (
          /* VIEW MODE */
          <div className="flex flex-col flex-1 overflow-hidden">
            {/* Meta info */}
            <div className="px-4 py-3 space-y-2 border-b border-gray-100">
              {annotation.description && (
                <p className="text-sm text-gray-600">{annotation.description}</p>
              )}
              <div className="flex items-center gap-2 flex-wrap">
                <Select value={status} onValueChange={(v) => v && handleStatusChange(v)}>
                  <SelectTrigger className="h-7 w-auto text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUS_OPTIONS.map(opt => (
                      <SelectItem key={opt.value} value={opt.value}>
                        <span className={`px-1.5 py-0.5 rounded text-xs ${opt.color}`}>{opt.label}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <span className="text-xs text-gray-400">
                  par {annotation.profile?.full_name || 'Inconnu'} •{' '}
                  {format(new Date(annotation.created_at), 'dd MMM yyyy', { locale: fr })}
                </span>
              </div>
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
                  {photoUploading ? <Loader2 size={18} className="animate-spin" /> : <Image size={18} />}
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
    </div>
  )
}
