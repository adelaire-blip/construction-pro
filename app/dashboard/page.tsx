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

  const { data: projects } = await supabase
    .from('projects')
    .select(`
      *,
      project_members(count),
      floors(count)
    `)
    .or(`created_by.eq.${user.id},project_members.user_id.eq.${user.id}`)
    .order('updated_at', { ascending: false })

  return <DashboardClient user={user} profile={profile} projects={projects || []} />
}
