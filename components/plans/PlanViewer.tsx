'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Floor, Annotation } from '@/types'
import { User } from '@supabase/supabase-js'
import {
  ZoomIn, ZoomOut, Maximize, Hand, MapPin, List, X,
  Bookmark, MessageSquare, AlertTriangle
} from 'lucide-react'
import AnnotationMarker from './AnnotationMarker'
import AnnotationDialog from './AnnotationDialog'

interface Props {
  floor: Floor
  user: User
}

type Mode = 'pan' | 'annotate'

const TYPE_META: Record<string, { icon: typeof Bookmark; color: string; bg: string; label: string }> = {
  reservation: { icon: Bookmark, color: 'text-blue-600', bg: 'bg-blue-100', label: 'Réservation' },
  note: { icon: MessageSquare, color: 'text-green-600', bg: 'bg-green-100', label: 'Note' },
  alerte: { icon: AlertTriangle, color: 'text-red-600', bg: 'bg-red-100', label: 'Alerte' },
}

const STATUS_META: Record<string, { color: string; label: string }> = {
  ouvert: { color: 'bg-gray-100 text-gray-600', label: 'Ouvert' },
  en_cours: { color: 'bg-yellow-100 text-yellow-700', label: 'En cours' },
  resolu: { color: 'bg-green-100 text-green-700', label: 'Résolu' },
}

export default function PlanViewer({ floor, user }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<Mode>('pan')
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 })
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [showList, setShowList] = useState(false)
  const [animating, setAnimating] = useState(false)
  const [focusedId, setFocusedId] = useState<string | null>(null)

  // Gestion des pointeurs (souris + tactile)
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map())
  const lastPan = useRef<{ x: number; y: number } | null>(null)
  const lastPinchDist = useRef<number | null>(null)
  const movedDist = useRef(0)
  const supabase = createClient()

  useEffect(() => { loadAnnotations() }, [floor.id])

  const loadAnnotations = async () => {
    const { data } = await supabase
      .from('annotations')
      .select('*, profile:profiles(*), photos:annotation_photos(*), comments:annotation_comments(*, profile:profiles(*))')
      .eq('floor_id', floor.id)
      .order('created_at')
    setAnnotations(data || [])
  }

  // Ajuste le plan pour qu'il tienne dans le conteneur (fit)
  const fitToView = useCallback((w?: number, h?: number) => {
    const container = containerRef.current
    const iw = w ?? imageSize.w
    const ih = h ?? imageSize.h
    if (!container || !iw || !ih) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const s = Math.min(cw / iw, ch / ih) * 0.95
    setScale(s)
    setOffset({ x: (cw - iw * s) / 2, y: (ch - ih * s) / 2 })
  }, [imageSize])

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    const w = img.naturalWidth
    const h = img.naturalHeight
    setImageSize({ w, h })
    fitToView(w, h)
  }

  // Zoom centré sur un point écran (x, y relatifs au conteneur)
  const zoomAt = useCallback((factor: number, px: number, py: number) => {
    setScale(prevScale => {
      const newScale = Math.max(0.1, Math.min(8, prevScale * factor))
      const realFactor = newScale / prevScale
      setOffset(prev => ({
        x: px - (px - prev.x) * realFactor,
        y: py - (py - prev.y) * realFactor,
      }))
      return newScale
    })
  }, [])

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect) return
    const factor = e.deltaY < 0 ? 1.12 : 0.89
    zoomAt(factor, e.clientX - rect.left, e.clientY - rect.top)
  }

  // --- Pointeurs ---
  // NB : pas de setPointerCapture (bug iOS Safari avec touch-action:none + transform)
  const onPointerDown = (e: React.PointerEvent) => {
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    movedDist.current = 0
    if (pointers.current.size === 1) {
      lastPan.current = { x: e.clientX, y: e.clientY }
    } else if (pointers.current.size === 2) {
      const pts = Array.from(pointers.current.values())
      lastPinchDist.current = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    }
  }

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointers.current.size === 2) {
      // Pincer pour zoomer
      const pts = Array.from(pointers.current.values())
      const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
      const rect = containerRef.current?.getBoundingClientRect()
      if (lastPinchDist.current && rect) {
        const cx = (pts[0].x + pts[1].x) / 2 - rect.left
        const cy = (pts[0].y + pts[1].y) / 2 - rect.top
        zoomAt(dist / lastPinchDist.current, cx, cy)
      }
      lastPinchDist.current = dist
      return
    }

    if (pointers.current.size === 1 && lastPan.current) {
      const dx = e.clientX - lastPan.current.x
      const dy = e.clientY - lastPan.current.y
      movedDist.current += Math.abs(dx) + Math.abs(dy)
      setOffset(prev => ({ x: prev.x + dx, y: prev.y + dy }))
      lastPan.current = { x: e.clientX, y: e.clientY }
    }
  }

  const onPointerUp = (e: React.PointerEvent) => {
    const wasSingle = pointers.current.size === 1
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) lastPinchDist.current = null
    if (pointers.current.size === 0) lastPan.current = null

    // Clic simple en mode annotation (pas un drag) — tolérance tactile
    if (wasSingle && mode === 'annotate' && movedDist.current < 12) {
      const rect = containerRef.current?.getBoundingClientRect()
      if (rect && imageSize.w > 0) {
        const cx = (e.clientX - rect.left - offset.x) / scale
        const cy = (e.clientY - rect.top - offset.y) / scale
        const xPct = (cx / imageSize.w) * 100
        const yPct = (cy / imageSize.h) * 100
        if (xPct >= 0 && yPct >= 0 && xPct <= 100 && yPct <= 100) {
          setPendingClick({ x: xPct, y: yPct })
        }
      }
    }
  }

  // Centre et zoome sur une annotation (animé), puis ouvre sa fenêtre
  const focusAnnotation = (annotation: Annotation, openDialog = true) => {
    const container = containerRef.current
    if (!container || !imageSize.w) return
    const cw = container.clientWidth
    const ch = container.clientHeight
    const targetScale = Math.min(3, Math.max(scale, 1.8))
    const px = (annotation.x / 100) * imageSize.w
    const py = (annotation.y / 100) * imageSize.h

    setFocusedId(annotation.id)
    setAnimating(true)
    setScale(targetScale)
    setOffset({ x: cw / 2 - px * targetScale, y: ch / 2 - py * targetScale })
    setShowList(false)

    window.setTimeout(() => setAnimating(false), 450)
    if (openDialog) {
      window.setTimeout(() => setSelectedAnnotation(annotation), 380)
    }
  }

  const cursor = mode === 'pan'
    ? (pointers.current.size > 0 ? 'grabbing' : 'grab')
    : 'crosshair'

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-800">
      {/* Barre d'outils */}
      <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1 bg-white rounded-full shadow-lg px-1.5 py-1">
        <button
          onClick={() => setMode('pan')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            mode === 'pan' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Hand size={14} /> <span className="hidden sm:inline">Naviguer</span>
        </button>
        <button
          onClick={() => setMode('annotate')}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            mode === 'annotate' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <MapPin size={14} /> <span className="hidden sm:inline">Annoter</span>
        </button>
        <div className="w-px h-5 bg-gray-200 mx-0.5" />
        <button
          onClick={() => setShowList(v => !v)}
          className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            showList ? 'bg-gray-800 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <List size={14} /> <span className="hidden sm:inline">Liste</span>
          <span className="bg-gray-200 text-gray-700 rounded-full px-1.5 text-[10px] leading-4">{annotations.length}</span>
        </button>
      </div>

      {/* Zone du plan */}
      <div
        ref={containerRef}
        className="absolute inset-0 touch-none"
        onWheel={handleWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor }}
      >
        <div
          style={{
            transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
            transformOrigin: '0 0',
            position: 'absolute',
            userSelect: 'none',
            transition: animating ? 'transform 0.4s cubic-bezier(0.22, 1, 0.36, 1)' : 'none',
          }}
        >
          {floor.plan_type === 'image' || !floor.plan_type ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={floor.plan_url!}
              alt="Plan"
              onLoad={handleImageLoad}
              draggable={false}
              style={{ display: 'block', maxWidth: 'none', pointerEvents: 'none' }}
            />
          ) : (
            <iframe
              src={`${floor.plan_url}#toolbar=0`}
              style={{ width: '900px', height: '1200px', border: 'none', display: 'block', background: 'white', pointerEvents: 'none' }}
              title="Plan PDF"
              onLoad={() => { if (!imageSize.w) { setImageSize({ w: 900, h: 1200 }); fitToView(900, 1200) } }}
            />
          )}

          {imageSize.w > 0 && annotations.map(annotation => (
            <AnnotationMarker
              key={annotation.id}
              annotation={annotation}
              imageWidth={imageSize.w}
              imageHeight={imageSize.h}
              isFocused={focusedId === annotation.id}
              onSelect={() => { setFocusedId(annotation.id); setSelectedAnnotation(annotation) }}
            />
          ))}

          {pendingClick && imageSize.w > 0 && (
            <div
              style={{
                position: 'absolute',
                left: `${(pendingClick.x / 100) * imageSize.w}px`,
                top: `${(pendingClick.y / 100) * imageSize.h}px`,
                transform: 'translate(-50%, -50%)',
              }}
              className="w-6 h-6 rounded-full border-2 border-orange-500 bg-orange-500/30 animate-ping"
            />
          )}
        </div>
      </div>

      {/* Contrôles de zoom */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-20">
        <button onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(1.25, r.width / 2, r.height / 2) }} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => { const r = containerRef.current!.getBoundingClientRect(); zoomAt(0.8, r.width / 2, r.height / 2) }} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50">
          <ZoomOut size={16} />
        </button>
        <button onClick={() => fitToView()} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50" title="Ajuster">
          <Maximize size={16} />
        </button>
      </div>

      {/* Indicateurs */}
      <div className="absolute bottom-4 left-4 z-20 flex flex-col gap-1.5 items-start">
        <span className="bg-black/50 text-white text-xs px-2 py-1 rounded">{Math.round(scale * 100)}%</span>
        {mode === 'annotate' && (
          <span className="bg-orange-500 text-white text-xs px-2 py-1 rounded animate-pulse">
            Cliquez sur le plan pour ajouter une annotation
          </span>
        )}
      </div>

      {/* Panneau liste des annotations (drawer responsive) */}
      {showList && (
        <>
          {/* Voile (mobile/tablette) */}
          <div className="absolute inset-0 bg-black/20 z-20 sm:bg-transparent sm:pointer-events-none" onClick={() => setShowList(false)} />
          <div className="absolute top-0 right-0 h-full w-full sm:w-80 max-w-[85%] bg-white shadow-2xl z-30 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100 shrink-0">
              <h3 className="font-semibold text-gray-800 text-sm">
                Annotations ({annotations.length})
              </h3>
              <button onClick={() => setShowList(false)} className="text-gray-400 hover:text-gray-600">
                <X size={18} />
              </button>
            </div>
            <div className="flex-1 overflow-y-auto">
              {annotations.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-10 px-4">
                  Aucune annotation. Passez en mode &laquo; Annoter &raquo; et cliquez sur le plan.
                </p>
              ) : (
                <ul className="divide-y divide-gray-50">
                  {annotations.map((a, i) => {
                    const t = TYPE_META[a.type] || TYPE_META.note
                    const s = STATUS_META[a.status] || STATUS_META.ouvert
                    const Icon = t.icon
                    const photoCount = a.photos?.length || 0
                    const commentCount = a.comments?.length || 0
                    return (
                      <li key={a.id}>
                        <button
                          onClick={() => focusAnnotation(a)}
                          className="w-full text-left px-4 py-3 hover:bg-orange-50 transition-colors flex gap-3 items-start"
                        >
                          <div className={`${t.bg} ${t.color} w-7 h-7 rounded-full flex items-center justify-center shrink-0`}>
                            <Icon size={13} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-[10px] text-gray-400 font-mono shrink-0">#{i + 1}</span>
                              <span className="font-medium text-gray-800 text-sm truncate">{a.title}</span>
                            </div>
                            {a.description && (
                              <p className="text-xs text-gray-500 truncate mt-0.5">{a.description}</p>
                            )}
                            <div className="flex items-center gap-2 mt-1.5">
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${s.color}`}>{s.label}</span>
                              {photoCount > 0 && <span className="text-[10px] text-gray-400">📷 {photoCount}</span>}
                              {commentCount > 0 && <span className="text-[10px] text-gray-400">💬 {commentCount}</span>}
                            </div>
                          </div>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}

      {/* Création d'annotation */}
      {pendingClick && (
        <AnnotationDialog
          mode="create"
          floorId={floor.id}
          userId={user.id}
          position={pendingClick}
          onClose={() => setPendingClick(null)}
          onCreated={(a) => { setAnnotations(prev => [...prev, a]); setPendingClick(null); setMode('pan') }}
        />
      )}

      {/* Consultation d'annotation */}
      {selectedAnnotation && (
        <AnnotationDialog
          mode="view"
          annotation={selectedAnnotation}
          userId={user.id}
          onClose={() => { setSelectedAnnotation(null); setFocusedId(null) }}
          onUpdated={(a) => {
            setAnnotations(prev => prev.map(x => x.id === a.id ? a : x))
            setSelectedAnnotation(a)
          }}
        />
      )}
    </div>
  )
}
