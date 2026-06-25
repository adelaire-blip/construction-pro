'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Project, ProjectMember } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger
} from '@/components/ui/dialog'
import { toast } from 'sonner'
import { UserPlus, Trash2, Loader2, Users, Crown, HardHat } from 'lucide-react'

interface Props {
  user: User
  project: Project
  members: ProjectMember[]
  setMembers: (members: ProjectMember[]) => void
  isOwner: boolean
}

export default function MembersPanel({ user, project, members, setMembers, isOwner }: Props) {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    // Find user by email via profiles
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', (
        await supabase.rpc('get_user_id_by_email', { email_input: email })
      ).data)

    // Alternative: find via auth.users - this needs a server action
    // For simplicity, we'll use a direct lookup approach
    const { data: authUser } = await supabase
      .from('profiles')
      .select('id, full_name')
      .textSearch('full_name', email)
      .limit(1)

    // Best approach: use email directly to look up via custom function or just add by email
    // We'll add a simpler lookup using the user's own auth
    const response = await fetch(`/api/users/find?email=${encodeURIComponent(email)}`)
    if (!response.ok) {
      toast.error('Utilisateur introuvable. Assurez-vous qu\'il a un compte.')
      setLoading(false)
      return
    }
    const { userId } = await response.json()

    const alreadyMember = members.some(m => m.user_id === userId)
    if (alreadyMember) {
      toast.error('Cet utilisateur est déjà membre')
      setLoading(false)
      return
    }

    const { data, error } = await supabase
      .from('project_members')
      .insert({ project_id: project.id, user_id: userId, role: 'professional' })
      .select('*, profile:profiles(*)')
      .single()

    if (error) {
      toast.error('Erreur lors de l\'invitation')
    } else {
      setMembers([...members, data])
      setOpen(false)
      setEmail('')
      toast.success('Professionnel ajouté au projet')
    }
    setLoading(false)
  }

  const handleRemove = async (memberId: string, memberUserId: string) => {
    if (memberUserId === project.created_by) {
      toast.error('Impossible de retirer le propriétaire')
      return
    }
    const { error } = await supabase
      .from('project_members')
      .delete()
      .eq('id', memberId)

    if (error) {
      toast.error('Erreur lors de la suppression')
    } else {
      setMembers(members.filter(m => m.id !== memberId))
      toast.success('Membre retiré')
    }
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between bg-gray-50">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-gray-500" />
          <h3 className="font-semibold text-gray-800 text-sm">Membres ({members.length})</h3>
        </div>
        {isOwner && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger render={<Button size="sm" className="bg-orange-500 hover:bg-orange-600 h-7 text-xs gap-1" />}>
              <UserPlus size={12} /> Inviter
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Inviter un professionnel</DialogTitle>
              </DialogHeader>
              <form onSubmit={handleInvite} className="space-y-4 mt-2">
                <div>
                  <Label>Email du professionnel *</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="professionnel@exemple.com"
                    required
                    autoFocus
                    className="mt-1"
                  />
                  <p className="text-xs text-gray-400 mt-1">
                    Le professionnel doit avoir un compte ConstructPro.
                  </p>
                </div>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>Annuler</Button>
                  <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={loading}>
                    {loading ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                    Ajouter
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Members list */}
      <div className="divide-y divide-gray-50">
        {members.map(member => {
          const isProjectOwner = member.user_id === project.created_by
          const isMe = member.user_id === user.id
          return (
            <div key={member.id} className="flex items-center gap-3 px-4 py-3">
              <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold shrink-0">
                {(member.profile?.full_name || 'U')[0].toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-800 text-sm truncate">
                  {member.profile?.full_name || 'Utilisateur'}
                  {isMe && <span className="text-gray-400 font-normal ml-1">(vous)</span>}
                </p>
                <p className="text-xs text-gray-500 truncate">{member.profile?.company || ''}</p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {isProjectOwner ? (
                  <Badge className="bg-orange-100 text-orange-700 text-xs gap-1">
                    <Crown size={10} /> Admin
                  </Badge>
                ) : (
                  <Badge variant="secondary" className="text-xs gap-1">
                    <HardHat size={10} /> Pro
                  </Badge>
                )}
                {isOwner && !isProjectOwner && (
                  <button
                    onClick={() => handleRemove(member.id, member.user_id)}
                    className="text-gray-300 hover:text-red-500 transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
