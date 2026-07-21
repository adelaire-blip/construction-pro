export type ProjectStatus = 'en_cours' | 'termine' | 'en_pause'
export type AnnotationType = 'reservation' | 'note' | 'alerte'
export type AnnotationStatus = 'ouvert' | 'en_cours' | 'resolu' | 'cloture'
export type UserRole = 'admin' | 'professional'
export type AttachmentType = 'image' | 'document'

export interface Profile {
  id: string
  full_name: string | null
  first_name: string | null
  last_name: string | null
  email: string | null
  company: string | null
  trade: string | null
  role: UserRole
  avatar_url: string | null
  phone: string | null
  created_at: string
}

export interface Trade {
  id: string
  name: string
  color: string
  created_by: string | null
  created_at: string
}

export interface Lot {
  id: string
  project_id: string
  name: string
  member_id: string | null
  trade: string | null
  start_date: string | null
  end_date: string | null
  progress: number
  color: string
  position: number
  created_at: string
  updated_at: string
  member?: Profile
}

export interface PlanTemplate {
  id: string
  name: string
  created_by: string | null
  created_at: string
  lots?: PlanTemplateLot[]
}

export interface PlanTemplateLot {
  id: string
  template_id: string
  name: string
  trade: string | null
  position: number
  duration_days: number
  color: string
  created_at: string
}

export interface Project {
  id: string
  name: string
  address: string | null
  description: string | null
  status: ProjectStatus
  archived: boolean
  cover_url: string | null
  created_by: string
  created_at: string
  updated_at: string
  member_count?: number
  floor_count?: number
}

export interface ProjectMember {
  id: string
  project_id: string
  user_id: string
  role: UserRole
  created_at: string
  profile?: Profile
}

export interface Floor {
  id: string
  project_id: string
  name: string
  level: number
  plan_url: string | null
  plan_type: 'pdf' | 'image' | null
  created_at: string
}

export interface Annotation {
  id: string
  floor_id: string
  x: number
  y: number
  title: string
  description: string | null
  type: AnnotationType
  status: AnnotationStatus
  trade: string | null
  created_by: string
  created_at: string
  updated_at: string
  profile?: Profile
  comments?: AnnotationComment[]
  photos?: AnnotationPhoto[]
}

export interface AnnotationPhoto {
  id: string
  annotation_id: string
  photo_url: string
  created_by: string
  created_at: string
}

export interface AnnotationComment {
  id: string
  annotation_id: string
  text: string | null
  photo_url: string | null
  created_by: string
  created_at: string
  profile?: Profile
}

export interface Message {
  id: string
  project_id: string
  user_id: string
  content: string | null
  attachment_url: string | null
  attachment_type: AttachmentType | null
  created_at: string
  profile?: Profile
}
