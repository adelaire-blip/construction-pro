'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Floor, Annotation } from '@/types'
import { User } from '@supabase/supabase-js'
import { ZoomIn, ZoomOut, Maximize, Hand, MapPin } from 'lucide-react'
import AnnotationMarker from './AnnotationMarker'
import AnnotationDialog from './AnnotationDialog'

interface Props {
  floor: Floor
  user: User
}

type Mode = 'pan' | 'annotate'

export default function PlanViewer({ floor, user }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [mode, setMode] = useState<Mode>('pan')
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 })
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)

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
      .select('*, profile:profiles(*), comments:annotation_comments(*, profile:profiles(*))')
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
  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as Element).setPointerCapture?.(e.pointerId)
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

    // Clic simple en mode annotation (pas un drag)
    if (wasSingle && mode === 'annotate' && movedDist.current < 6) {
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

  const handleAnnotationClick = (annotation: Annotation, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedAnnotation(annotation)
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
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            mode === 'pan' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <Hand size={13} /> Naviguer
        </button>
        <button
          onClick={() => setMode('annotate')}
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium transition-colors ${
            mode === 'annotate' ? 'bg-orange-500 text-white' : 'text-gray-600 hover:bg-gray-100'
          }`}
        >
          <MapPin size={13} /> Annoter
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
              onClick={(e) => handleAnnotationClick(annotation, e)}
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

      <div className="absolute top-2 right-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-20">
        {annotations.length} annotation{annotations.length > 1 ? 's' : ''}
      </div>

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
          onClose={() => setSelectedAnnotation(null)}
          onUpdated={(a) => {
            setAnnotations(prev => prev.map(x => x.id === a.id ? a : x))
            setSelectedAnnotation(a)
          }}
        />
      )}
    </div>
  )
}
