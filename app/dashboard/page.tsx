import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardClient from '@/components/projects/DashboardClient'

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Le RLS limite déjà la visibilité aux projets dont l'utilisateur est
  // propriétaire ou membre — pas besoin de filtre .or() ici.
  const { data: projects, error } = await supabase
    .from('projects')
    .select(`
      *,
      project_members(count),
      floors(count)
    `)
    .order('updated_at', { ascending: false })

  if (error) {
    console.error('Dashboard projects error:', error)
  }

  return <DashboardClient user={user} profile={profile} projects={projects || []} />
}
