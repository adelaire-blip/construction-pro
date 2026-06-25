import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjectClient from '@/components/projects/ProjectClient'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: project } = await supabase
    .from('projects')
    .select('*')
    .eq('id', id)
    .single()

  if (!project) notFound()

  const { data: floors } = await supabase
    .from('floors')
    .select('*')
    .eq('project_id', id)
    .order('level')

  const { data: members } = await supabase
    .from('project_members')
    .select('*, profile:profiles(*)')
    .eq('project_id', id)

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  return (
    <ProjectClient
      user={user}
      profile={profile}
      project={project}
      initialFloors={floors || []}
      initialMembers={members || []}
    />
  )
}
