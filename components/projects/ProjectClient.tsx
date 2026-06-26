'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Project, Floor, ProjectMember, Profile } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'
import { ArrowLeft, Building2, MapPin, MessageSquare, Map, Users, Settings } from 'lucide-react'
import PlansPanel from '@/components/plans/PlansPanel'
import ChatPanel from '@/components/chat/ChatPanel'
import MembersPanel from '@/components/projects/MembersPanel'

const STATUS_COLOR = {
  en_cours: 'bg-blue-100 text-blue-700',
  termine: 'bg-green-100 text-green-700',
  en_pause: 'bg-yellow-100 text-yellow-700',
}

const STATUS_LABEL = {
  en_cours: 'En cours',
  termine: 'Terminé',
  en_pause: 'En pause',
}

interface Props {
  user: User
  profile: Profile | null
  project: Project
  initialFloors: Floor[]
  initialMembers: ProjectMember[]
}

export default function ProjectClient({ user, profile, project, initialFloors, initialMembers }: Props) {
  const router = useRouter()
  const [floors, setFloors] = useState(initialFloors)
  const [members, setMembers] = useState(initialMembers)
  const isOwner = project.created_by === user.id

  // Précharge le dashboard pour un retour instantané
  useEffect(() => {
    router.prefetch('/dashboard')
  }, [router])

  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
          <div className="bg-orange-500 text-white p-1.5 rounded-lg">
            <Building2 size={16} />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-gray-900 leading-none truncate">{project.name}</h1>
            {project.address && (
              <p className="text-xs text-gray-500 flex items-center gap-0.5 truncate">
                <MapPin size={10} /> {project.address}
              </p>
            )}
          </div>
          <Badge className={`text-xs shrink-0 ${STATUS_COLOR[project.status]}`}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>
      </header>

      {/* Main content with tabs */}
      <div className="flex-1 overflow-hidden">
        <Tabs defaultValue="plans" className="h-full flex flex-col">
          <TabsList className="mx-4 mt-3 mb-0 w-fit bg-gray-100 shrink-0">
            <TabsTrigger value="plans" className="gap-1.5 text-xs">
              <Map size={14} /> Plans
            </TabsTrigger>
            <TabsTrigger value="chat" className="gap-1.5 text-xs">
              <MessageSquare size={14} /> Discussion
            </TabsTrigger>
            <TabsTrigger value="members" className="gap-1.5 text-xs">
              <Users size={14} /> Membres
            </TabsTrigger>
          </TabsList>

          <TabsContent value="plans" className="flex-1 overflow-hidden mt-3 mx-4 mb-4">
            <PlansPanel
              user={user}
              project={project}
              floors={floors}
              setFloors={setFloors}
              isOwner={isOwner}
            />
          </TabsContent>

          <TabsContent value="chat" className="flex-1 overflow-hidden mt-3 mx-4 mb-4">
            <ChatPanel user={user} profile={profile} project={project} />
          </TabsContent>

          <TabsContent value="members" className="flex-1 overflow-auto mt-3 mx-4 mb-4">
            <MembersPanel
              user={user}
              project={project}
              members={members}
              setMembers={setMembers}
              isOwner={isOwner}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  )
}
