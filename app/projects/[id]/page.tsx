import { redirect, notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import ProjectClient from '@/components/projects/ProjectClient'

export default async function ProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createClient()

  // Les requêtes liées au projet ne dépendent que de l'id : on les lance
  // immédiatement, en parallèle avec la vérification d'authentification.
  const projectPromise = supabase.from('projects').select('*').eq('id', id).single()
  const floorsPromise = supabase.from('floors').select('*').eq('project_id', id).order('level')
  const membersPromise = supabase.from('project_members').select('*, profile:profiles(*)').eq('project_id', id)
  const lotsPromise = supabase.from('lots').select('*, member:profiles(*)').eq('project_id', id).order('position')
  const templatesPromise = supabase.from('plan_templates').select('*').order('name')

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [projectRes, floorsRes, membersRes, lotsRes, templatesRes, profileRes] = await Promise.all([
    projectPromise,
    floorsPromise,
    membersPromise,
    lotsPromise,
    templatesPromise,
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
      initialLots={lotsRes.data || []}
      templates={templatesRes.data || []}
    />
  )
}
