import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/projects/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  // Profil + projets en parallèle. Le RLS limite déjà la visibilité aux projets
  // dont l'utilisateur est propriétaire ou membre — pas besoin de filtre .or().
  const [profileRes, projectsRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase
      .from('projects')
      .select(`*, project_members(count), floors(count)`)
      .order('updated_at', { ascending: false }),
  ])

  const profile = profileRes.data
  const projects = projectsRes.data
  if (projectsRes.error) {
    console.error('Dashboard projects error:', projectsRes.error)
  }

  return <DashboardClient user={user} profile={profile} projects={projects || []} />
}
