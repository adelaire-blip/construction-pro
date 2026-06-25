import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    supabase_url_set: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabase_url_prefix: process.env.NEXT_PUBLIC_SUPABASE_URL?.substring(0, 30) || 'MANQUANT',
    anon_key_set: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    service_key_set: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
  })
}
