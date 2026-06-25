import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'

export default async function Home() {
  let user = null
  try {
    const supabase = await createClient()
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch {
    // Supabase indisponible, on redirige vers login
  }

  if (user) {
    redirect('/dashboard')
  } else {
    redirect('/auth/login')
  }
}
