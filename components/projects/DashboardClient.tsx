'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Project, Profile } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue
} from '@/components/ui/select'
import { toast } from 'sonner'
import {
  Building2, Plus, MapPin, Users, Layers, LogOut,
  HardHat, Clock, CheckCircle, PauseCircle, Loader2
} from 'lucide-react'
import { format } from 'date-fns'
import { fr } from 'date-fns/locale'

const STATUS_CONFIG = {
  en_cours: { label: 'En cours', icon: Clock, color: 'bg-blue-100 text-blue-700' },
  termine: { label: 'Terminé', icon: CheckCircle, color: 'bg-green-100 text-green-700' },
  en_pause: { label: 'En pause', icon: PauseCircle, color: 'bg-yellow-100 text-yellow-700' },
}

interface Props {
  user: User
  profile: Profile | null
  projects: Project[]
}

export default function DashboardClient({ user, profile, projects: initialProjects }: Props) {
  const router = useRouter()
  const [projects, setProjects] = useState(initialProjects)
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ name: '', address: '', description: '', status: 'en_cours' })

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    const supabase = createClient()

    const { data: project, error } = await supabase
      .from('projects')
      .insert({ ...form, created_by: user.id })
      .select()
      .single()

    if (error) {
      toast.error(`Erreur projet: ${error.message} (${error.code})`)
    } else {
      const { error: memberError } = await supabase.from('project_members').insert({
        project_id: project.id,
        user_id: user.id,
        role: 'admin',
      })
      if (memberError) {
        toast.error(`Erreur membre: ${memberError.message} (${memberError.code})`)
      }
      setProjects([project, ...projects])
      setOpen(false)
      setForm({ name: '', address: '', description: '', status: 'en_cours' })
      toast.success('Projet créé !')
      router.push(`/projects/${project.id}`)
    }
    setLoading(false)
  }

  const handleLogout = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/auth/login')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="bg-orange-500 text-white p-2 rounded-lg">
              <Building2 size={20} />
            </div>
            <div>
              <h1 className="font-bold text-gray-900 leading-none">ConstructPro</h1>
              <p className="text-xs text-gray-500">{profile?.company || 'Mes projets'}</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-medium text-gray-900">{profile?.full_name || user.email}</p>
              <p className="text-xs text-gray-500">{user.email}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout}>
              <LogOut size={18} />
            </Button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-8">
        {/* Actions bar */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Mes projets</h2>
            <p className="text-sm text-gray-500">{projects.length} projet{projects.length > 1 ? 's' : ''}</p>
          </div>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button className="bg-orange-500 hover:bg-orange-600 gap-2" />}>
              <Plus size={16} /> Nouveau projet
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nouveau projet de construction</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleCreate} className="space-y-4 mt-2">
                <div>
                  <Label>Nom du projet *</Label>
                  <Input
                    value={form.name}
                    onChange={e => setForm({ ...form, name: e.target.value })}
                    placeholder="Villa Dupont - Maison neuve"
                    required
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Adresse</Label>
                  <Input
                    value={form.address}
                    onChange={e => setForm({ ...form, address: e.target.value })}
                    placeholder="12 rue des Fleurs, 75001 Paris"
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea
                    value={form.description}
                    onChange={e => setForm({ ...form, description: e.target.value })}
                    placeholder="Maison de 120m² avec garage..."
                    rows={3}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label>Statut</Label>
                  <Select value={form.status} onValueChange={(v) => v && setForm({ ...form, status: v })}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="en_cours">En cours</SelectItem>
                      <SelectItem value="en_pause">En pause</SelectItem>
                      <SelectItem value="termine">Terminé</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                    Créer le projet
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {/* Projects grid */}
        {projects.length === 0 ? (
          <div className="text-center py-16">
            <HardHat size={48} className="text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-600">Aucun projet</h3>
            <p className="text-gray-400 text-sm mt-1">Créez votre premier projet de construction</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(project => {
              const status = STATUS_CONFIG[project.status] || STATUS_CONFIG.en_cours
              const StatusIcon = status.icon
              return (
                <button
                  key={project.id}
                  onClick={() => router.push(`/projects/${project.id}`)}
                  className="bg-white rounded-xl border border-gray-200 p-5 text-left hover:shadow-md hover:border-orange-200 transition-all group"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div className="bg-orange-50 text-orange-600 p-2 rounded-lg group-hover:bg-orange-100 transition-colors">
                      <Building2 size={20} />
                    </div>
                    <span className={`flex items-center gap-1 text-xs px-2 py-1 rounded-full font-medium ${status.color}`}>
                      <StatusIcon size={11} />
                      {status.label}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 mb-1 truncate">{project.name}</h3>
                  {project.address && (
                    <p className="text-xs text-gray-500 flex items-center gap-1 mb-2 truncate">
                      <MapPin size={11} /> {project.address}
                    </p>
                  )}
                  {project.description && (
                    <p className="text-sm text-gray-600 line-clamp-2 mb-3">{project.description}</p>
                  )}
                  <div className="flex items-center gap-3 text-xs text-gray-400 pt-3 border-t border-gray-100">
                    <span className="flex items-center gap-1"><Users size={11} /> {(project as any).project_members?.[0]?.count ?? 0} membre(s)</span>
                    <span className="flex items-center gap-1"><Layers size={11} /> {(project as any).floors?.[0]?.count ?? 0} niveau(x)</span>
                    <span className="ml-auto">{format(new Date(project.created_at), 'dd MMM yyyy', { locale: fr })}</span>
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </main>
    </div>
  )
}
