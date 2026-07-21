'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Profile, Trade, PlanTemplate, PlanTemplateLot } from '@/types'
import { User } from '@supabase/supabase-js'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { toast } from 'sonner'
import {
  ArrowLeft, Settings, Users, Wrench, Plus, Loader2, Trash2,
  Mail, Phone, Building2, UserPlus, HardHat, KeyRound, Copy, LayoutGrid, ChevronDown, ChevronRight
} from 'lucide-react'

interface Props {
  user: User
  profile: Profile | null
  initialUsers: Profile[]
  initialTrades: Trade[]
  initialTemplates: PlanTemplate[]
}

type Tab = 'users' | 'trades' | 'templates'

function genPassword() {
  return Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4).toUpperCase() + '!'
}

export default function SettingsClient({ user, profile, initialUsers, initialTrades, initialTemplates }: Props) {
  const router = useRouter()
  const supabase = createClient()
  const [tab, setTab] = useState<Tab>('users')
  const [users, setUsers] = useState(initialUsers)
  const [trades, setTrades] = useState(initialTrades)
  const [templates, setTemplates] = useState<PlanTemplate[]>(initialTemplates)

  // --- Modèles de plan de charge ---
  const [newTplName, setNewTplName] = useState('')
  const [addingTpl, setAddingTpl] = useState(false)
  const [openTpl, setOpenTpl] = useState<string | null>(null)
  const [lotForm, setLotForm] = useState({ name: '', trade: '', duration_days: 7 })

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTplName.trim()) return
    setAddingTpl(true)
    const { data, error } = await supabase
      .from('plan_templates')
      .insert({ name: newTplName.trim(), created_by: user.id })
      .select('*, lots:plan_template_lots(*)')
      .single()
    if (error) toast.error(`Erreur: ${error.message}`)
    else { setTemplates(prev => [...prev, data]); setNewTplName(''); setOpenTpl(data.id); toast.success('Modèle créé') }
    setAddingTpl(false)
  }

  const handleDeleteTemplate = async (id: string) => {
    const { error } = await supabase.from('plan_templates').delete().eq('id', id)
    if (error) toast.error(`Erreur: ${error.message}`)
    else { setTemplates(prev => prev.filter(t => t.id !== id)); toast.success('Modèle supprimé') }
  }

  const handleAddLot = async (templateId: string) => {
    if (!lotForm.name.trim()) return
    const pos = (templates.find(t => t.id === templateId)?.lots?.length || 0) + 1
    const { data, error } = await supabase
      .from('plan_template_lots')
      .insert({ template_id: templateId, name: lotForm.name.trim(), trade: lotForm.trade || null, duration_days: lotForm.duration_days, position: pos })
      .select()
      .single()
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, lots: [...(t.lots || []), data] } : t))
    setLotForm({ name: '', trade: '', duration_days: 7 })
  }

  const handleDeleteLot = async (templateId: string, lotId: string) => {
    const { error } = await supabase.from('plan_template_lots').delete().eq('id', lotId)
    if (error) { toast.error(`Erreur: ${error.message}`); return }
    setTemplates(prev => prev.map(t => t.id === templateId ? { ...t, lots: (t.lots || []).filter(l => l.id !== lotId) } : t))
  }

  // --- Création utilisateur ---
  const [form, setForm] = useState({
    first_name: '', last_name: '', email: '', phone: '', company: '', trade: '', password: genPassword(),
  })
  const [creating, setCreating] = useState(false)
  const [lastCreated, setLastCreated] = useState<{ email: string; password: string } | null>(null)

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setCreating(true)
    try {
      const res = await fetch('/api/users/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'Erreur lors de la création')
      } else {
        toast.success('Utilisateur créé')
        setLastCreated({ email: form.email, password: form.password })
        // Recharger la liste
        const { data: refreshed } = await supabase.from('profiles').select('*').order('created_at', { ascending: false })
        if (refreshed) setUsers(refreshed)
        setForm({ first_name: '', last_name: '', email: '', phone: '', company: '', trade: '', password: genPassword() })
      }
    } catch {
      toast.error('Erreur réseau')
    }
    setCreating(false)
  }

  // --- Corps de métier ---
  const [newTrade, setNewTrade] = useState('')
  const [addingTrade, setAddingTrade] = useState(false)

  const handleAddTrade = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTrade.trim()) return
    setAddingTrade(true)
    const { data, error } = await supabase
      .from('trades')
      .insert({ name: newTrade.trim().toUpperCase(), created_by: user.id })
      .select()
      .single()
    if (error) {
      toast.error(`Erreur: ${error.message}`)
    } else {
      setTrades(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
      setNewTrade('')
      toast.success('Corps de métier ajouté')
    }
    setAddingTrade(false)
  }

  const handleDeleteTrade = async (id: string) => {
    const { error } = await supabase.from('trades').delete().eq('id', id)
    if (error) toast.error(`Erreur: ${error.message}`)
    else {
      setTrades(prev => prev.filter(t => t.id !== id))
      toast.success('Supprimé')
    }
  }

  const copy = (text: string) => {
    navigator.clipboard?.writeText(text)
    toast.success('Copié')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200 sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 h-16 flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.push('/dashboard')} className="h-8 w-8">
            <ArrowLeft size={16} />
          </Button>
          <div className="bg-gray-800 text-white p-2 rounded-lg">
            <Settings size={18} />
          </div>
          <div>
            <h1 className="font-bold text-gray-900 leading-none">Paramètres</h1>
            <p className="text-xs text-gray-500">{profile?.company || 'Administration'}</p>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 py-6">
        {/* Onglets */}
        <div className="flex gap-1 bg-gray-100 p-1 rounded-lg w-fit mb-6">
          <button
            onClick={() => setTab('users')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'users' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            <Users size={15} /> Utilisateurs
          </button>
          <button
            onClick={() => setTab('trades')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'trades' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            <Wrench size={15} /> Corps de métier
          </button>
          <button
            onClick={() => setTab('templates')}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              tab === 'templates' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-500'
            }`}
          >
            <LayoutGrid size={15} /> Modèles de plan
          </button>
        </div>

        {tab === 'users' ? (
          <div className="grid md:grid-cols-2 gap-6">
            {/* Formulaire création */}
            <div className="bg-white rounded-xl border border-gray-200 p-5 h-fit">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2 mb-4">
                <UserPlus size={16} className="text-orange-500" /> Nouvel utilisateur
              </h2>
              <form onSubmit={handleCreateUser} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <Label className="text-xs">Prénom</Label>
                    <Input value={form.first_name} onChange={e => setForm({ ...form, first_name: e.target.value })} className="mt-1" />
                  </div>
                  <div>
                    <Label className="text-xs">Nom</Label>
                    <Input value={form.last_name} onChange={e => setForm({ ...form, last_name: e.target.value })} className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label className="text-xs">Email *</Label>
                  <Input type="email" required value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} className="mt-1" placeholder="pro@exemple.com" />
                </div>
                <div>
                  <Label className="text-xs">Téléphone mobile</Label>
                  <Input value={form.phone} onChange={e => setForm({ ...form, phone: e.target.value })} className="mt-1" placeholder="06 12 34 56 78" />
                </div>
                <div>
                  <Label className="text-xs">Nom de l&apos;entreprise</Label>
                  <Input value={form.company} onChange={e => setForm({ ...form, company: e.target.value })} className="mt-1" placeholder="Plomberie Martin SARL" />
                </div>
                <div>
                  <Label className="text-xs">Corps de métier</Label>
                  <select
                    value={form.trade}
                    onChange={e => setForm({ ...form, trade: e.target.value })}
                    className="mt-1 w-full h-9 rounded-lg border border-input bg-transparent px-2.5 text-sm"
                  >
                    <option value="">— Aucun —</option>
                    {trades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                  </select>
                </div>
                <div>
                  <Label className="text-xs flex items-center gap-1"><KeyRound size={12} /> Mot de passe initial *</Label>
                  <div className="flex gap-1 mt-1">
                    <Input value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} required className="flex-1 font-mono text-xs" />
                    <Button type="button" variant="outline" size="sm" onClick={() => setForm({ ...form, password: genPassword() })}>↻</Button>
                  </div>
                  <p className="text-[11px] text-gray-400 mt-1">À communiquer au professionnel pour sa 1ère connexion.</p>
                </div>
                <Button type="submit" className="w-full bg-orange-500 hover:bg-orange-600" disabled={creating}>
                  {creating ? <Loader2 size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />}
                  Créer l&apos;utilisateur
                </Button>
              </form>

              {lastCreated && (
                <div className="mt-4 bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                  <p className="font-medium text-green-800 mb-1">Identifiants créés :</p>
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-green-700 text-xs break-all">{lastCreated.email}</span>
                    <button onClick={() => copy(lastCreated.email)} className="text-green-600"><Copy size={13} /></button>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-1">
                    <span className="text-green-700 text-xs font-mono">{lastCreated.password}</span>
                    <button onClick={() => copy(`${lastCreated.email} / ${lastCreated.password}`)} className="text-green-600"><Copy size={13} /></button>
                  </div>
                </div>
              )}
            </div>

            {/* Liste utilisateurs */}
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden h-fit">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50">
                <h2 className="font-semibold text-gray-800 text-sm">Utilisateurs ({users.length})</h2>
              </div>
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {users.map(u => (
                  <div key={u.id} className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <div className="w-9 h-9 rounded-full bg-orange-100 text-orange-600 flex items-center justify-center text-sm font-bold shrink-0">
                        {(u.full_name || u.email || 'U')[0].toUpperCase()}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-800 text-sm truncate">
                          {u.full_name || 'Sans nom'}
                          {u.id === user.id && <span className="text-gray-400 font-normal"> (vous)</span>}
                        </p>
                        {u.trade && <span className="inline-block text-[10px] bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">{u.trade}</span>}
                      </div>
                    </div>
                    <div className="mt-1.5 ml-11 space-y-0.5 text-xs text-gray-500">
                      {u.company && <p className="flex items-center gap-1 truncate"><Building2 size={11} /> {u.company}</p>}
                      {u.email && <p className="flex items-center gap-1 truncate"><Mail size={11} /> {u.email}</p>}
                      {u.phone && <p className="flex items-center gap-1"><Phone size={11} /> {u.phone}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : tab === 'trades' ? (
          /* Corps de métier */
          <div className="max-w-xl">
            <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
                <HardHat size={16} className="text-gray-500" />
                <h2 className="font-semibold text-gray-800 text-sm">Corps de métier ({trades.length})</h2>
              </div>
              <form onSubmit={handleAddTrade} className="p-4 flex gap-2 border-b border-gray-100">
                <Input
                  value={newTrade}
                  onChange={e => setNewTrade(e.target.value)}
                  placeholder="Ex: SERRURERIE"
                  className="flex-1"
                />
                <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={addingTrade}>
                  {addingTrade ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                </Button>
              </form>
              <div className="divide-y divide-gray-50 max-h-[60vh] overflow-y-auto">
                {trades.length === 0 ? (
                  <p className="text-sm text-gray-400 text-center py-8">Aucun corps de métier</p>
                ) : trades.map(t => (
                  <div key={t.id} className="px-4 py-2.5 flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-700">{t.name}</span>
                    <button onClick={() => handleDeleteTrade(t.id)} className="text-gray-300 hover:text-red-500">
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          /* Modèles de plan de charge */
          <div className="max-w-2xl">
            <p className="text-sm text-gray-500 mb-4">
              Définissez des modèles réutilisables (liste de lots avec durées) pour générer rapidement le plan de charge d&apos;un projet.
            </p>
            <form onSubmit={handleAddTemplate} className="flex gap-2 mb-4">
              <Input value={newTplName} onChange={e => setNewTplName(e.target.value)} placeholder="Nom du modèle (ex: Rénovation)" className="flex-1" />
              <Button type="submit" className="bg-orange-500 hover:bg-orange-600" disabled={addingTpl}>
                {addingTpl ? <Loader2 size={14} className="animate-spin mr-1" /> : <Plus size={14} className="mr-1" />} Modèle
              </Button>
            </form>

            <div className="space-y-3">
              {templates.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">Aucun modèle</p>
              ) : templates.map(tpl => {
                const open = openTpl === tpl.id
                const lots = (tpl.lots || []).slice().sort((a, b) => a.position - b.position)
                return (
                  <div key={tpl.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                    <div className="flex items-center gap-2 px-4 py-3 bg-gray-50">
                      <button onClick={() => setOpenTpl(open ? null : tpl.id)} className="flex items-center gap-2 flex-1 text-left">
                        {open ? <ChevronDown size={15} className="text-gray-400" /> : <ChevronRight size={15} className="text-gray-400" />}
                        <span className="font-semibold text-gray-800 text-sm">{tpl.name}</span>
                        <span className="text-xs text-gray-400">({lots.length} lots)</span>
                      </button>
                      <button onClick={() => handleDeleteTemplate(tpl.id)} className="text-gray-300 hover:text-red-500">
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {open && (
                      <div className="p-3 space-y-1">
                        {lots.map((l, i) => (
                          <div key={l.id} className="flex items-center gap-2 px-2 py-1.5 rounded hover:bg-gray-50">
                            <span className="text-[10px] text-gray-400 font-mono w-5">{i + 1}</span>
                            <span className="text-sm text-gray-700 flex-1">{l.name}</span>
                            {l.trade && <span className="text-[10px] bg-gray-100 text-gray-500 rounded px-1.5 py-0.5">{l.trade}</span>}
                            <span className="text-xs text-gray-400">{l.duration_days} j</span>
                            <button onClick={() => handleDeleteLot(tpl.id, l.id)} className="text-gray-300 hover:text-red-500">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        ))}
                        <div className="flex flex-wrap gap-2 pt-2 border-t border-gray-100 mt-2">
                          <Input value={lotForm.name} onChange={e => setLotForm({ ...lotForm, name: e.target.value })} placeholder="Nom du lot" className="flex-1 min-w-[120px] h-8 text-sm" />
                          <select value={lotForm.trade} onChange={e => setLotForm({ ...lotForm, trade: e.target.value })} className="h-8 rounded-lg border border-input bg-white px-2 text-sm">
                            <option value="">Métier…</option>
                            {trades.map(t => <option key={t.id} value={t.name}>{t.name}</option>)}
                          </select>
                          <div className="flex items-center gap-1">
                            <Input type="number" min={1} value={lotForm.duration_days} onChange={e => setLotForm({ ...lotForm, duration_days: Number(e.target.value) })} className="w-16 h-8 text-sm" />
                            <span className="text-xs text-gray-400">jours</span>
                          </div>
                          <Button type="button" size="sm" className="h-8 bg-orange-500 hover:bg-orange-600" onClick={() => handleAddLot(tpl.id)}>
                            <Plus size={13} />
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
