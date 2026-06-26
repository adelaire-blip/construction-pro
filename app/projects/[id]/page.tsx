import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjectClient from '@/components/projects/ProjectClient'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Toutes les requêtes en parallèle (au lieu de l'une après l'autre)
  const [projectRes, floorsRes, membersRes, profileRes] = await Promise.all([
    supabase.from('projects').select('*').eq('id', id).single(),
    supabase.from('floors').select('*').eq('project_id', id).order('level'),
    supabase.from('project_members').select('*, profile:profiles(*)').eq('project_id', id),
    supabase.from('profiles').select('*').eq('id', user.id).single(),
  ])

  const project = projectRes.data
  if (!project) notFound()

  const floors = floorsRes.data
  const members = membersRes.data
  const profile = profileRes.data

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
