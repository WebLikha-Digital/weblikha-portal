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

export type UserRole       = 'admin' | 'provider' | 'client'
export type Specialty      = 'developer' | 'designer' | 'seo' | 'pm' | 'other'
export type ProjectStatus  = 'discovery' | 'in_progress' | 'review' | 'completed' | 'archived'
export type TaskStatus     = 'pending' | 'in_progress' | 'done'
export type RevenueType    = 'income' | 'expense'
export type EmploymentType = 'in-house' | 'outsource'

// ── Base entities (match DB columns 1-to-1) ───────────────────────────────────

export interface User {
  id:              string
  email:           string
  name:            string
  role:            UserRole
  specialty:       Specialty        // legacy primary skill — prefer skills[0]
  skills:          string[]         // ordered; first element is primary display skill
  employment_type: EmploymentType
  avatar_url:      string | null
  approved:        boolean
  created_at:      string
  updated_at:      string
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
  updated_at:  string
}

export interface ProjectMember {
  id:               string
  project_id:       string
  user_id:          string
  role_in_project:  string
  joined_at:        string
}

export interface TaskList {
  id:         string
  project_id: string
  name:       string
  position:   number
  created_at: string
}

export interface Task {
  id:           string
  project_id:   string
  task_list_id: string | null
  assignee_id:  string | null
  title:        string
  description:  string | null
  status:       TaskStatus
  due_date:     string
  completed_at: string | null
  points_value: number        // Default 60 (task completion points)
  position:     number        // Sort order within the task list
  created_at:   string
  updated_at:   string
}

export interface TaskComment {
  id:         string
  task_id:    string
  author_id:  string | null
  body:       string      // Rich-text HTML (legacy rows may be plain text)
  mentions:   string[]    // User IDs @mentioned in the body
  created_at: string
  updated_at: string      // > created_at ⇒ edited
}

export interface Message {
  id:                string
  project_id:        string
  author_id:         string | null
  title:             string
  body:              string
  is_client_visible: boolean
  created_at:        string
  updated_at:        string
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

/** Task comment with its author user data */
export interface TaskCommentWithAuthor extends TaskComment {
  author: User | null
}

/** Task with assignee and comment thread — as rendered in TodosTab */
export type TaskWithMeta = Task & {
  assignee: User | null
  comments: TaskCommentWithAuthor[]
}

/** Task list with its tasks, assignee, and comment data */
export interface TaskListWithTasks extends TaskList {
  tasks: TaskWithMeta[]
}

/** Message with its author user data */
export interface MessageWithAuthor extends Message {
  author: User | null
}

/** Performance period joined with the team member's user row */
export interface PerformancePeriodWithUser extends PerformancePeriod {
  user: User
}

/** Full project detail — everything needed for the detail page */
export interface ProjectDetail extends Project {
  members:    (ProjectMember & { user: User })[]
  task_lists: TaskListWithTasks[]
  messages:   MessageWithAuthor[]
}

// ── Template types ────────────────────────────────────────────────────────────

export interface ProjectTemplate {
  id:          string
  name:        string
  description: string | null
  created_by:  string | null
  created_at:  string
  updated_at:  string
}

export interface TemplateTaskList {
  id:          string
  template_id: string
  name:        string
  position:    number
  created_at:  string
}

export interface TemplateTask {
  id:                    string
  template_task_list_id: string
  title:                 string
  description:           string | null
  points_value:          number
  position:              number
  created_at:            string
}

/** Full template with nested phases and tasks */
export interface ProjectTemplateWithLists extends ProjectTemplate {
  task_lists: (TemplateTaskList & { tasks: TemplateTask[] })[]
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
export interface AdminPointsPayload {
  user_id:     string
  month:       number
  year:        number
  adminPoints: number
  adminNote:   string | null
}

// ── Notifications ──────────────────────────────────────────────────────────────────

export type NotificationType = 'mention' | 'task_assigned'

/** notifications table row (named to avoid clashing with the DOM Notification type) */
export interface AppNotification {
  id:         string
  user_id:    string
  actor_id:   string | null
  type:       NotificationType
  project_id: string
  task_id:    string | null
  comment_id: string | null
  read_at:    string | null
  created_at: string
}

/** Notification with the joined actor + task the bell dropdown renders */
export interface NotificationWithMeta extends AppNotification {
  actor: Pick<User, 'id' | 'name' | 'avatar_url'> | null
  task:  { id: string; title: string } | null
}

// ── Push subscriptions ─────────────────────────────────────────────────────────

/** push_subscriptions table row (Web Push endpoint + keys per browser/device) */
export interface PushSubscriptionRow {
  id:         string
  user_id:    string
  endpoint:   string
  p256dh:     string
  auth:       string
  user_agent: string | null
  created_at: string
  updated_at: string
}
