/**
 * WEBLIKHA PORTAL — SHARED TYPE DEFINITIONS
 * ─────────────────────────────────────────────────────────────────────────────
 * These types mirror the Supabase database schema exactly.
 * When you add a column to the DB, add it here too.
 *
 * Generated Supabase types (via `supabase gen types`) will live in
 * src/lib/supabase/database.types.ts — this file re-exports them
 * with ergonomic aliases for use in components and hooks.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── Enums ─────────────────────────────────────────────────────────────────────

export type UserRole     = 'admin' | 'provider'
export type Specialty    = 'developer' | 'designer' | 'seo' | 'pm' | 'other'
export type ProjectStatus = 'discovery' | 'in_progress' | 'review' | 'completed' | 'archived'
export type TaskStatus   = 'pending' | 'in_progress' | 'done'
export type RevenueType  = 'income' | 'expense'

// ── Base entities (match DB columns 1-to-1) ───────────────────────────────────

export interface User {
  id:          string
  email:       string
  name:        string
  role:        UserRole
  specialty:   Specialty
  avatar_url:  string | null
  created_at:  string
}

export interface Project {
  id:          string
  name:        string
  client_name: string
  status:      ProjectStatus
  start_date:  string         // ISO date string (YYYY-MM-DD)
  end_date:    string
  budget:      number
  description: string | null
  created_by:  string | null
  created_at:  string
}

export interface ProjectMember {
  id:               string
  project_id:       string
  user_id:          string
  role_in_project:  string
  joined_at:        string
}

export interface Task {
  id:           string
  project_id:   string
  assignee_id:  string | null
  title:        string
  description:  string | null
  status:       TaskStatus
  due_date:     string
  completed_at: string | null
  points_value: number        // Default 60 (task completion points)
  created_at:   string
}

export interface PerformancePeriod {
  id:               string
  user_id:          string
  period_month:     number   // 1–12
  period_year:      number
  task_points:      number
  deadline_points:  number
  admin_points:     number
  total_points:     number   // Generated column: task + deadline + admin
  admin_note:       string | null
  created_at:       string
  updated_at:       string
}

export interface RevenueEntry {
  id:         string
  project_id: string
  type:       RevenueType
  amount:     number
  date:       string
  note:       string | null
  created_at: string
}

// ── Enriched / joined types ───────────────────────────────────────────────────

/** Project with its members (and each member's User row) */
export interface ProjectWithMembers extends Project {
  members:         (ProjectMember & { user: User })[]
  revenue_entries: RevenueEntry[]
}

/** User with their current-month performance data */
export interface UserWithPerformance extends User {
  performance: PerformancePeriod | null
}

/** Summary stats for the dashboard KPI cards */
export interface DashboardStats {
  active_projects:   number
  revenue_this_month: number
  team_member_count: number
  on_track_percent:  number
  at_risk_count:     number
}

/** Monthly revenue rollup for the revenue chart */
export interface MonthlyRevenue {
  month:   number   // 1–12
  year:    number
  income:  number
  expense: number
  net:     number
}

// ── UI / form types ───────────────────────────────────────────────────────────

/** Payload for creating a new project */
export interface CreateProjectPayload {
  name:        string
  client_name: string
  status:      ProjectStatus
  start_date:  string
  end_date:    string
  budget:      number
  description: string | null
  member_ids:  string[]
}

/** Payload for creating a task */
export interface CreateTaskPayload {
  project_id:  string
  assignee_id: string
  title:       string
  description: string | null
  due_date:    string
  points_value: number
}

/** Payload for admin to update incentive points */
export interface UpdateAdminPointsPayload {
  user_id:      string
  period_month: number
  period_year:  number
  admin_points: number
  admin_note:   string | null
}
