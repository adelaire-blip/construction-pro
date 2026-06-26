'use client'

import { Annotation } from '@/types'
import { MessageSquare, AlertTriangle, Bookmark } from 'lucide-react'

const TYPE_CONFIG = {
  reservation: { icon: Bookmark, color: 'bg-blue-500', borderColor: 'border-blue-600' },
  note: { icon: MessageSquare, color: 'bg-green-500', borderColor: 'border-green-600' },
  alerte: { icon: AlertTriangle, color: 'bg-red-500', borderColor: 'border-red-600' },
}

const STATUS_DOT = {
  ouvert: 'bg-gray-300',
  en_cours: 'bg-yellow-400',
  resolu: 'bg-green-400',
}

interface Props {
  annotation: Annotation
  imageWidth: number
  imageHeight: number
  isFocused?: boolean
  onClick: (e: React.MouseEvent) => void
}

export default function AnnotationMarker({ annotation, imageWidth, imageHeight, isFocused, onClick }: Props) {
  const config = TYPE_CONFIG[annotation.type] || TYPE_CONFIG.note
  const Icon = config.icon
  const x = (annotation.x / 100) * imageWidth
  const y = (annotation.y / 100) * imageHeight

  return (
    <div
      style={{ position: 'absolute', left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -100%)', zIndex: isFocused ? 30 : undefined }}
      onClick={onClick}
      className="cursor-pointer group"
      title={annotation.title}
    >
      {/* Pin */}
      <div className={`relative flex flex-col items-center`}>
        {isFocused && (
          <span className="absolute top-0 w-8 h-8 rounded-full bg-orange-400/60 animate-ping" />
        )}
        <div className={`${config.color} text-white rounded-full w-8 h-8 flex items-center justify-center shadow-lg border-2 ${isFocused ? 'border-orange-300 ring-2 ring-orange-300 scale-110' : config.borderColor} group-hover:scale-110 transition-transform`}>
          <Icon size={14} />
        </div>
        {/* Status dot */}
        <div className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${STATUS_DOT[annotation.status]} border border-white`} />
        {/* Needle */}
        <div className={`w-0.5 h-2 ${config.color}`} />
        <div className={`w-1 h-1 rounded-full ${config.color}`} />
      </div>
      {/* Tooltip */}
      <div className="absolute bottom-full mb-1 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs rounded px-2 py-1 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-20 max-w-48 truncate">
        {annotation.title}
      </div>
    </div>
  )
}
