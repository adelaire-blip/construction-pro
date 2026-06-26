import { Building2 } from 'lucide-react'

export default function Loading() {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center gap-3">
          <div className="bg-orange-500 text-white p-2 rounded-lg">
            <Building2 size={20} />
          </div>
          <div>
            <div className="h-4 w-28 bg-gray-200 rounded animate-pulse mb-1.5" />
            <div className="h-2.5 w-20 bg-gray-100 rounded animate-pulse" />
          </div>
        </div>
      </header>
      <main className="max-w-6xl mx-auto px-4 py-8">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse mb-6" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="h-9 w-9 bg-gray-100 rounded-lg animate-pulse mb-3" />
              <div className="h-4 w-3/4 bg-gray-200 rounded animate-pulse mb-2" />
              <div className="h-3 w-1/2 bg-gray-100 rounded animate-pulse mb-4" />
              <div className="h-3 w-full bg-gray-50 rounded animate-pulse" />
            </div>
          ))}
        </div>
      </main>
    </div>
  )
}
