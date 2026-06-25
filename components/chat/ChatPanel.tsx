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
  const bottomRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    loadMessages()
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
          if (data) setMessages(prev => [...prev, data])
        }
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [project.id])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadMessages = async () => {
    const { data } = await supabase
      .from('messages')
      .select('*, profile:profiles(*)')
      .eq('project_id', project.id)
      .order('created_at')
    setMessages(data || [])
  }

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!text.trim()) return
    setSending(true)
    const { error } = await supabase.from('messages').insert({
      project_id: project.id,
      user_id: user.id,
      content: text.trim(),
    })
    if (error) toast.error('Erreur envoi')
    else setText('')
    setSending(false)
  }

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    const path = `${project.id}/${Date.now()}_${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('attachments')
      .upload(path, file)

    if (uploadError) {
      toast.error('Erreur upload')
      setUploading(false)
      return
    }

    const { data: { publicUrl } } = supabase.storage.from('attachments').getPublicUrl(path)
    const isImage = file.type.startsWith('image/')

    const { error } = await supabase.from('messages').insert({
      project_id: project.id,
      user_id: user.id,
      attachment_url: publicUrl,
      attachment_type: isImage ? 'image' : 'document',
    })
    if (error) toast.error('Erreur envoi')
    setUploading(false)
    if (fileRef.current) fileRef.current.value = ''
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
        <form onSubmit={handleSend} className="flex gap-2">
          <input
            type="file"
            ref={fileRef}
            className="hidden"
            accept="image/*,.pdf,.doc,.docx"
            onChange={handleFileUpload}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="p-2 text-gray-400 hover:text-orange-500 transition-colors shrink-0"
          >
            {uploading ? <Loader2 size={18} className="animate-spin" /> : <Paperclip size={18} />}
          </button>
          <Input
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder="Votre message..."
            className="flex-1 h-10"
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e) } }}
          />
          <Button
            type="submit"
            disabled={sending || !text.trim()}
            className="bg-orange-500 hover:bg-orange-600 h-10 px-3 shrink-0"
          >
            {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          </Button>
        </form>
      </div>
    </div>
  )
}
