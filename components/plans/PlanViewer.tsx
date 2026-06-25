'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Floor, Annotation } from '@/types'
import { User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import AnnotationMarker from './AnnotationMarker'
import AnnotationDialog from './AnnotationDialog'

interface Props {
  floor: Floor
  user: User
}

export default function PlanViewer({ floor, user }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [annotations, setAnnotations] = useState<Annotation[]>([])
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [pendingClick, setPendingClick] = useState<{ x: number; y: number } | null>(null)
  const [selectedAnnotation, setSelectedAnnotation] = useState<Annotation | null>(null)
  const [dialogMode, setDialogMode] = useState<'create' | 'view'>('create')
  const [imageSize, setImageSize] = useState({ w: 0, h: 0 })
  const dragMoved = useRef(false)
  const supabase = createClient()

  useEffect(() => {
    loadAnnotations()
  }, [floor.id])

  const loadAnnotations = async () => {
    const { data } = await supabase
      .from('annotations')
      .select('*, profile:profiles(*), comments:annotation_comments(*, profile:profiles(*))')
      .eq('floor_id', floor.id)
      .order('created_at')
    setAnnotations(data || [])
  }

  const handleImageLoad = (e: React.SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget
    setImageSize({ w: img.naturalWidth, h: img.naturalHeight })
  }

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return
    dragMoved.current = false
    setDragging(true)
    setDragStart({ x: e.clientX - offset.x, y: e.clientY - offset.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!dragging) return
    const dx = Math.abs(e.clientX - (dragStart.x + offset.x))
    const dy = Math.abs(e.clientY - (dragStart.y + offset.y))
    if (dx > 3 || dy > 3) dragMoved.current = true
    setOffset({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y })
  }

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    setDragging(false)
    if (dragMoved.current) return
    // Click on the plan to create annotation
    const container = containerRef.current
    if (!container) return
    const rect = container.getBoundingClientRect()
    const cx = (e.clientX - rect.left - offset.x) / scale
    const cy = (e.clientY - rect.top - offset.y) / scale
    if (imageSize.w > 0 && imageSize.h > 0) {
      const xPct = Math.max(0, Math.min(100, (cx / imageSize.w) * 100))
      const yPct = Math.max(0, Math.min(100, (cy / imageSize.h) * 100))
      if (xPct > 0 && yPct > 0 && xPct < 100 && yPct < 100) {
        setPendingClick({ x: xPct, y: yPct })
        setDialogMode('create')
      }
    }
  }, [dragging, offset, scale, imageSize])

  const handleAnnotationClick = (annotation: Annotation, e: React.MouseEvent) => {
    e.stopPropagation()
    setSelectedAnnotation(annotation)
    setDialogMode('view')
  }

  const handleAnnotationCreated = (annotation: Annotation) => {
    setAnnotations(prev => [...prev, annotation])
    setPendingClick(null)
  }

  const handleAnnotationUpdated = (annotation: Annotation) => {
    setAnnotations(prev => prev.map(a => a.id === annotation.id ? annotation : a))
    setSelectedAnnotation(annotation)
  }

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.1 : 0.9
    setScale(s => Math.max(0.3, Math.min(4, s * factor)))
  }

  const resetView = () => {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div className="flex-1 relative overflow-hidden bg-gray-900" ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={() => setDragging(false)}
      onWheel={handleWheel}
      style={{ cursor: dragging ? 'grabbing' : 'crosshair' }}
    >
      {/* Plan image */}
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
            style={{ display: 'block', maxWidth: 'none' }}
          />
        ) : (
          <iframe
            src={`${floor.plan_url}#toolbar=0`}
            style={{ width: '900px', height: '1200px', border: 'none', display: 'block', background: 'white' }}
            title="Plan PDF"
          />
        )}

        {/* Annotation markers */}
        {imageSize.w > 0 && annotations.map(annotation => (
          <AnnotationMarker
            key={annotation.id}
            annotation={annotation}
            imageWidth={imageSize.w}
            imageHeight={imageSize.h}
            onClick={(e) => handleAnnotationClick(annotation, e)}
          />
        ))}

        {/* Pending click indicator */}
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

      {/* Zoom controls */}
      <div className="absolute bottom-4 right-4 flex flex-col gap-1 z-10">
        <button onClick={() => setScale(s => Math.min(4, s * 1.2))} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50 transition-colors">
          <ZoomIn size={16} />
        </button>
        <button onClick={() => setScale(s => Math.max(0.3, s * 0.8))} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50 transition-colors">
          <ZoomOut size={16} />
        </button>
        <button onClick={resetView} className="bg-white shadow rounded-lg p-2 hover:bg-gray-50 transition-colors">
          <RotateCcw size={16} />
        </button>
      </div>

      {/* Zoom level indicator */}
      <div className="absolute bottom-4 left-4 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">
        {Math.round(scale * 100)}% — Cliquez pour annoter
      </div>

      {/* Annotation count */}
      <div className="absolute top-2 left-2 bg-black/50 text-white text-xs px-2 py-1 rounded z-10">
        {annotations.length} annotation{annotations.length > 1 ? 's' : ''}
      </div>

      {/* Create annotation dialog */}
      {pendingClick && (
        <AnnotationDialog
          mode="create"
          floorId={floor.id}
          userId={user.id}
          position={pendingClick}
          onClose={() => setPendingClick(null)}
          onCreated={handleAnnotationCreated}
        />
      )}

      {/* View/edit annotation dialog */}
      {selectedAnnotation && dialogMode === 'view' && (
        <AnnotationDialog
          mode="view"
          annotation={selectedAnnotation}
          userId={user.id}
          onClose={() => setSelectedAnnotation(null)}
          onUpdated={handleAnnotationUpdated}
        />
      )}
    </div>
  )
}
