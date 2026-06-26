import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createClient as createServiceClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  // L'appelant doit être authentifié
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Non autorisé' }, { status: 401 })

  const body = await req.json()
  const { email, password, first_name, last_name, phone, company, trade } = body

  if (!email || !password) {
    return NextResponse.json({ error: 'Email et mot de passe requis' }, { status: 400 })
  }

  const service = createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  const fullName = [first_name, last_name].filter(Boolean).join(' ').trim()

  // Crée le compte (email confirmé d'office)
  const { data: created, error: createError } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  })

  if (createError || !created.user) {
    return NextResponse.json(
      { error: createError?.message || 'Création impossible' },
      { status: 400 }
    )
  }

  // Renseigne le profil (upsert car le trigger a déjà créé une ligne)
  const { error: profileError } = await service
    .from('profiles')
    .upsert({
      id: created.user.id,
      full_name: fullName || null,
      first_name: first_name || null,
      last_name: last_name || null,
      email,
      phone: phone || null,
      company: company || null,
      trade: trade || null,
    })

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true, userId: created.user.id })
}
