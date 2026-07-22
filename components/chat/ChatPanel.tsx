'use client'

import { useState, useEffect, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, Message, Profile } from '@/types'
import { User } from '@supabase/supabase-js'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { toast } from 'sonner'
import { Send, Image, Loader2, Paperclip, X } from 'lucide-react'
import { format, isToday, isYesterday } from 'date-fns'
import { fr } from 'date-fns/locale'

interface Props {
  user: User
  profile: Profile | null
  project: Project
}

function formatDay(date: Date): string {
  if (isToday(date)) return "Aujourd'hui"
  if (isYesterday(date)) return 'Hier'
  return format(date, 'EEEE d MMMM', { locale: fr })
}

function groupByDay(messages: Message[]): { day: string; messages: Message[] }[] {
  const groups: Record<string, Message[]> = {}
  messages.forEach(m => {
    const day = format(new Date(m.created_at), 'yyyy-MM-dd')
    if (!groups[day]) groups[day] = []
    groups[day].push(m)
  })
  return Object.entries(groups)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([day, messages]) => ({ day: formatDay(new Date(day)), messages }))
}

export default function ChatPanel({ user, profile, project }: Props) {
  const supabase = createClient()
  const [messages, setMessages] = useState<Message[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [pendingFile, setPendingFile] = useState<File | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const lastTs = useRef<string | null>(null)

  // Fusionne de nouveaux messages en évitant les doublons (par id)
  const mergeMessages = (incoming: Message[]) => {
    incoming.forEach(m => {
      if (!lastTs.current || m.created_at > lastTs.current) lastTs.current = m.created_at
    })
    setMessages(prev => {
      const map = new Map(prev.map(m => [m.id, m]))
      incoming.forEach(m => map.set(m.id, m))
      return Array.from(map.values()).sort(
        (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )
    })
  }

  useEffect(() => {
    loadMessages()

    // Temps réel (si activé sur la table)
    const channel = supabase
      .channel(`chat:${project.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `project_id=eq.${project.id}` },
        async (payload) => {
          const { data } = await supabase
            .from('messages')
            .select('*, profile:profiles(*)')
            .eq('id', payload.new.id)
            .single()
          if (data) mergeMessages([data])
        }
      )
      .subscribe()

    // Filet de sécurité : ne récupère QUE les nouveaux messages (incrémental),
    // et seulement quand l'onglet est visible (économise réseau + CPU).
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') loadNewMessages()
    }, 6000)

    return () => {
      supabase.removeChannel(channel)
      clearInterval(interval)
    }
  }, [project.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Chargement initial complet
  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profile:profiles(*)')
      .eq('project_id', project.id)
      .order('created_at')
    if (data) {
      mergeMessages(data)
      if (data.length) lastTs.current = data[data.length - 1].created_at
    }
  }

  // Chargement incrémental : uniquement les messages plus récents que le dernier connu
  const loadNewMessages = async () => {
    let q = supabase
      .from('messages')
      .select('*, profile:profiles(*)')
      .eq('project_id', project.id)
      .order('created_at')
    if (lastTs.current) q = q.gt('created_at', lastTs.current)
    const { data } = await q
    if (data && data.length) {
      mergeMessages(data)
      lastTs.current = data[data.length - 1].created_at
    }
  }

  // Met la pièce jointe en attente (aperçu) au lieu de l'envoyer tout de suite
  const handleFilePick = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setPendingFile(file)
    if (fileRef.current) fileRef.current.value = ''
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    const content = text.trim()
    if (!content && !pendingFile) return
    setSending(true)

    let attachment_url: string | null = null
    let attachment_type: 'image' | 'document' | null = null

    // Upload de la pièce jointe si présente
    if (pendingFile) {
      setUploading(true)
      const path = `${project.id}/${Date.now()}_${pendingFile.name}`
      const { error: uploadError } = await supabase.storage.from('attachments').upload(path, pendingFile)
      setUploading(false)
      if (uploadError) {
        toast.error(`Erreur upload: ${uploadError.message}`)
        setSending(false)
        return
      }
      attachment_url = supabase.storage.from('attachments').getPublicUrl(path).data.publicUrl
      attachment_type = pendingFile.type.startsWith('image/') ? 'image' : 'document'
    }

    const { data, error } = await supabase
      .from('messages')
      .insert({ project_id: project.id, user_id: user.id, content: content || null, attachment_url, attachment_type })
      .select('*, profile:profiles(*)')
      .single()

    if (error) {
      toast.error(`Erreur envoi: ${error.message}`)
    } else if (data) {
      mergeMessages([data])
      setText('')
      setPendingFile(null)
    }
    setSending(false)
  }

  const grouped = groupByDay(messages)
  const myName = profile?.full_name || user.email || 'Moi'

  return (
    <div className="h-full flex flex-col bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex-shrink-0">
        <h3 className="font-semibold text-gray-800 text-sm">Discussion — {project.name}</h3>
        <p className="text-xs text-gray-400">{messages.length} message{messages.length > 1 ? 's' : ''}</p>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-1">
        {messages.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-400 text-sm">Aucun message. Démarrez la conversation !</p>
          </div>
        )}
        {grouped.map(({ day, messages: dayMessages }) => (
          <div key={day}>
            <div className="flex items-center gap-2 my-3">
              <div className="flex-1 h-px bg-gray-100" />
              <span className="text-xs text-gray-400 font-medium">{day}</span>
              <div className="flex-1 h-px bg-gray-100" />
            </div>
            {dayMessages.map((message, i) => {
              const isMe = message.user_id === user.id
              const senderName = message.profile?.full_name || 'Utilisateur'
              const prevMessage = i > 0 ? dayMessages[i - 1] : null
              const showAvatar = !prevMessage || prevMessage.user_id !== message.user_id

              return (
                <div
                  key={message.id}
                  className={`flex items-end gap-2 ${isMe ? 'flex-row-reverse' : ''} ${!showAvatar ? (isMe ? 'pr-8' : 'pl-8') : ''}`}
                >
                  {showAvatar && !isMe && (
                    <div className="w-7 h-7 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-xs font-bold shrink-0 mb-1">
                      {senderName[0].toUpperCase()}
                    </div>
                  )}
                  <div className={`max-w-[75%] ${isMe ? 'items-end' : 'items-start'} flex flex-col`}>
                    {showAvatar && !isMe && (
                      <span className="text-xs text-gray-500 mb-0.5 ml-1">{senderName}</span>
                    )}
                    <div className={`rounded-2xl px-3 py-2 ${
                      isMe
                        ? 'bg-orange-500 text-white rounded-br-sm'
                        : 'bg-gray-100 text-gray-800 rounded-bl-sm'
                    }`}>
                      {message.content && (
                        <p className="text-sm whitespace-pre-wrap break-words">{message.content}</p>
                      )}
                      {message.attachment_url && message.attachment_type === 'image' && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={message.attachment_url}
                          alt="Photo"
                          loading="lazy"
                          decoding="async"
                          className="rounded-lg max-w-full max-h-48 object-cover cursor-pointer"
                          onClick={() => window.open(message.attachment_url!, '_blank')}
                        />
                      )}
                      {message.attachment_url && message.attachment_type === 'document' && (
                        <a href={message.attachment_url} target="_blank" rel="noopener noreferrer"
                          className="flex items-center gap-1 text-xs underline">
                          <Paperclip size={12} /> Document
                        </a>
                      )}
                    </div>
                    <span className={`text-xs text-gray-400 mt-0.5 ${isMe ? 'mr-1' : 'ml-1'}`}>
                      {format(new Date(message.created_at), 'HH:mm')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        ))}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="border-t border-gray-100 p-3 flex-shrink-0">
        {/* Aperçu de la pièce jointe en attente */}
        {pendingFile && (
          <div className="mb-2 flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-lg p-2 w-fit max-w-full">
            {pendingFile.type.startsWith('image/') ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={URL.createObjectURL(pendingFile)} alt="" className="w-12 h-12 rounded object-cover shrink-0" />
            ) : (
              <div className="w-12 h-12 rounded bg-orange-50 text-orange-500 flex items-center justify-center shrink-0">
                <Paperclip size={18} />
              </div>
            )}
            <div className="min-w-0">
              <p className="text-xs font-medium text-gray-700 truncate max-w-[180px]">{pendingFile.name}</p>
              <p className="text-[11px] text-gray-400">Ajoutez un texte puis envoyez</p>
            </div>
            <button type="button" onClick={() => setPendingFile(null)} className="ml-1 text-gray-400 hover:text-red-500 shrink-0">
              <X size={16} />
            </button>
          </div>
        )}
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFilePick}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="p-2 text-gray-400 hover:text-orange-500 transition-colors shrink-0"
            title="Joindre une photo ou un document"
          >
            <Paperclip size={18} />
          </button>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={pendingFile ? 'Ajouter un message (optionnel)...' : 'Votre message...'}
            className="flex-1 h-10"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
          />
          <Button
            type="submit"
            disabled={sending || (!text.trim() && !pendingFile)}
            className="bg-orange-500 hover:bg-orange-600 h-10 px-3 shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </div>
    </div>
  )
}
