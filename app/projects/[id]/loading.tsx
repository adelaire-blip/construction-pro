import { Building2, Loader2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="h-screen flex flex-col bg-gray-50">
      {/* Header skeleton */}
      <header className="bg-white border-b border-gray-200 flex-shrink-0">
        <div className="px-4 h-14 flex items-center gap-3">
          <div className="h-8 w-8 rounded bg-gray-100 animate-pulse" />
          <div className="bg-orange-500 text-white p-1.5 rounded-lg">
            <Building2 size={16} />
          </div>
          <div className="flex-1">
            <div className="h-3.5 w-40 bg-gray-200 rounded animate-pulse mb-1.5" />
            <div className="h-2.5 w-28 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </header>

      {/* Tabs skeleton */}
      <div className="mx-4 mt-3 flex gap-1">
        {['Plans', 'Discussion', 'Membres'].map((t) => (
          <div key={t} className="h-8 w-24 bg-gray-100 rounded-md animate-pulse" />
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 m-4 rounded-xl border border-gray-200 bg-white flex items-center justify-center">
        <div className="flex flex-col items-center text-gray-300">
          <Loader2 size={32} className="animate-spin text-orange-400" />
          <p className="text-sm text-gray-400 mt-3">Chargement du projet…</p>
        </div>
      </div>
    </div>
  )
}
