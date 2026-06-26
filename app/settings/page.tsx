import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import SettingsClient from '@/components/settings/SettingsClient'

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/auth/login')

  const [profileRes, usersRes, tradesRes] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).single(),
    supabase.from('profiles').select('*').order('created_at', { ascending: false }),
    supabase.from('trades').select('*').order('name'),
  ])

  return (
    <SettingsClient
      user={user}
      profile={profileRes.data}
      initialUsers={usersRes.data || []}
      initialTrades={tradesRes.data || []}
    />
  )
}
