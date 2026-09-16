'use client'

import { useEffect, useMemo, useState } from 'react'
import {
  getProjects,
  getProjectRisk,
  getAllProjectRisks,
  type RiskResult,
} from "@/lib/api"
import {
  Activity, AlertTriangle, BarChart3, Bell, Brain, Building2, Check,
  ChevronDown, ChevronLeft, ChevronRight, CircleGauge, ClipboardList,
  Download, FolderKanban, Home, Lightbulb, Menu, Search, Settings2,
  ShieldCheck, SlidersHorizontal, Sparkles, TrendingDown, TrendingUp,
  Users, X,
} from 'lucide-react'

// ============================================================================
// TYPES
// ============================================================================

// One row of the SHAP (SHapley Additive exPlanations) breakdown for a project.
// "value" is how much this feature pushes the risk score up (+) or down (-).
type Shap = {
  feature: string
  value: number
}

// A single infrastructure project being tracked by the dashboard.
type Project = {
  id: string
  name: string
  state: string          // Indian state the project is located in
  sector: string          // e.g. "Roads", "Healthcare", "Water"
  agency: string           // implementing agency, e.g. "NHAI"
  approvalDate?: string
  startDate?: string
  originalTargetDate?: string
  revisedTargetDate?: string
  risk: number             // overall risk score (0-100)
  costRisk: number          // risk score specific to cost overrun
  timeRisk: number           // risk score specific to schedule delay
  progress: number            // actual physical progress (%)
  planned?: number               // planned/expected progress (%) for comparison
  budget: number                 // total allocated budget, in ₹ crore
  spent: number                    // amount spent so far, in ₹ crore
  status: string                    // "On Track" | "Monitor" | "At Risk"
  alerts: number                      // number of currently open alerts
  warningMessages: string[]
  description: string                   // human-readable risk summary
 shap: Shap[]                          // explainability breakdown
  history: number[]                         // last 6 months of risk scores (for trend chart)
  confidence?: number                          // model confidence (%) in this prediction
}

// Two user roles supported by the dashboard; used to filter which projects are visible.
type Role = 'Agency Officer' | 'Ministry Admin'

// ============================================================================
// MOCK DATA
// ============================================================================

function mapApiProject(p: any): Project {
  const originalCost = Number(p.original_cost_crore ?? 0)
  const spent = Number(p.cumulative_expenditure_crore ?? 0)
  const progress = Number(p.physical_progress_pct ?? 0)

  return {
    id: String(p.project_code),
    name: String(p.project_name ?? 'Unnamed Project'),
    state: String(p.state ?? 'Unknown'),
    sector: String(p.sector ?? 'Unknown'),
    agency: String(p.agency ?? 'Unknown'),
    approvalDate: p.approval_date_mm_yyyy ?? undefined,
      startDate: p.start_date_mm_yyyy ?? undefined,
      originalTargetDate: p.original_target_doc_mm_yyyy ?? undefined,
      revisedTargetDate: p.revised_doc_mm_yyyy ?? undefined,
    // Temporary values until we fetch ML risk for each project.
    risk: 0,
    costRisk: 0,
    timeRisk: 0,

    progress,
  
    budget: originalCost,
    spent,

   status: 'NOT_EVALUATED',
    alerts: 0,
    warningMessages: [],

    description:
      'Project data loaded from the PAIMANA backend.',

    shap: [],

    history: [],
   }
}

// Sidebar navigation items: [label, icon component]
const nav = [
  ['Dashboard', Home],
  ['Projects', FolderKanban],
  ['Risk Monitor', CircleGauge],
  ['Early Warnings', Bell],
  ['Analytics', BarChart3],
  ['Benchmarking', SlidersHorizontal],
  ['AI Explanation', Brain],
] as const

// ============================================================================
// SMALL HELPERS
// ============================================================================

// Buckets a numeric risk score into a named severity tier, used for color-coding.
function riskTone(score: number) {
  if (score >= 75) return 'critical'
  if (score >= 50) return 'high'
  if (score >= 25) return 'medium'
  return 'low'
}

// ============================================================================
// SMALL PRESENTATIONAL COMPONENTS
// (Each renders one reusable visual element used across multiple pages.)
// ============================================================================

// Colored pill showing a risk score out of 100, colored by severity tier.
function RiskBadge({ score }: { score: number }) {
  return (
    <span className={`risk-badge ${riskTone(score)}`}>
      {score} <span className="font-normal opacity-70">/ 100</span>
    </span>
  )
}

// A KPI tile used at the top of pages (e.g. "Total projects: 248").
// `trend` optionally colors the detail text red (up/bad) or green (down/good).
function StatCard({
  label,
  value,
  detail,
  icon: Icon,
  tone = 'blue',
  trend,
}: {
  label: string
  value: string
  detail: string
  icon: typeof Activity
  tone?: string
  trend?: 'up' | 'down'
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${tone}`}>
        <Icon size={18} />
      </div>
      <div>
        <p className="eyebrow">{label}</p>
        <p className="stat-value">{value}</p>
        <p className={`stat-detail ${trend === 'up' ? 'text-red' : trend === 'down' ? 'text-green' : ''}`}>
          {trend === 'up' ? '↑ ' : trend === 'down' ? '↓ ' : ''}
          {detail}
        </p>
      </div>
    </div>
  )
}

// Tiny sparkline-style bar chart. Each value (0-100) becomes a bar of that height.
function MiniBars({ values, color = '#2463a6' }: { values: number[]; color?: string }) {
  return (
    <div className="mini-bars" aria-label="Trend chart">
      {values.map((v, i) => (
        <span key={i} style={{ height: `${v}%`, background: color }} />
      ))}
    </div>
  )
}

// Circular "gauge" showing a percentage as a ring fill (uses a CSS custom property
// `--progress`, in degrees, that the stylesheet uses to draw the arc).
function ProgressRing({ value, tone = 'blue' }: { value: number; tone?: string }) {
  return (
    <div
      className={`progress-ring ${tone}`}
      style={{ '--progress': `${value * 3.6}deg` } as React.CSSProperties} // 100% = 360deg
    >
      <div>
        <strong>{value}%</strong>
        <small>risk</small>
      </div>
    </div>
  )
}

// Small badge that reports how confident the model is in a given prediction.
function Confidence({ value }: { value: number }) {
  return (
    <span className="confidence-badge" title="Model confidence">
      {value}% confidence
    </span>
  )
}

// ============================================================================
// ROOT PAGE COMPONENT
// Owns all top-level state (which page is active, selected project, filters,
// sidebar collapse, role switch, notifications) and renders the shell:
// sidebar + topbar + the currently active page.
// ============================================================================

export default function Page() {
  const [projects, setProjects] = useState<Project[]>([])
  const [projectsLoading, setProjectsLoading] =
  useState(true)

const [projectsError, setProjectsError] =
  useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [riskLoading, setRiskLoading] = useState(false)
const [riskError, setRiskError] = useState<string | null>(null)

  const [page, setPage] = useState('Dashboard')
  const [selectedId, setSelectedId] = useState('')
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState('All')
  const [stateFilter, setStateFilter] = useState('All')
  const [sectorFilter, setSectorFilter] = useState('All')
  const [collapsed, setCollapsed] = useState(false)
  const [mobileOpen, setMobileOpen] = useState(false)
  const [role, setRole] =
    useState<Role>('Ministry Admin')
  const [notificationsOpen, setNotificationsOpen] =
    useState(false)

 useEffect(() => {
  async function loadProjects() {
    try {
      setProjectsLoading(true)
      setProjectsError(null)

      const apiProjects = await getProjects()

      console.log(
        "PAIMANA PROJECT COUNT:",
        apiProjects.length
      )

      const uiProjects = apiProjects.map(
        mapApiProject
      )

      const riskResults =
        await getAllProjectRisks()

      console.log(
        "PAIMANA RISK RESULT COUNT:",
        riskResults.length
      )

      const riskMap = new Map(
        riskResults.map((risk) => [
          String(risk.project_code),
          risk,
        ])
      )

      const missingRiskProjects =
        uiProjects.filter(
          (project) =>
            !riskMap.has(project.id)
        )

      console.log(
        "PAIMANA PROJECTS WITHOUT RISK:",
        missingRiskProjects.length
      )

      const projectsWithRisk =
        uiProjects.map((project) => {
          const risk =
            riskMap.get(project.id)

          if (!risk) {
            return project
          }

          const costProbability =
            Number(
              risk.cost_overrun?.probability ?? 0
            )

          const timeProbability =
            Number(
              risk.time_overrun?.probability ?? 0
            )

          const overallProbability =
            Number(
              risk.overall_risk?.probability ?? 0
            )

          const warnings =
            Array.isArray(
              risk.early_warning_alerts
            )
              ? risk.early_warning_alerts
              : []

          return {
            ...project,

            risk: Math.round(
              overallProbability * 100
            ),

            costRisk: Math.round(
              costProbability * 100
            ),

            timeRisk: Math.round(
              timeProbability * 100
            ),

            alerts: warnings.length,

            warningMessages: warnings,

            status:
              risk.overall_risk
                ?.risk_level ??
              "UNKNOWN",

            description:
              warnings.join(" • ") ||
              "AI risk assessment completed.",

            shap: Array.isArray(risk.shap)
              ? risk.shap
              : [],
          }
        })

      setProjects(projectsWithRisk)

      console.log(
        "PAIMANA: projects with risk loaded:",
        projectsWithRisk.length
      )
    } catch (error) {
      console.error(
        "PAIMANA projects API error:",
        error
      )

      setProjectsError(
        error instanceof Error
          ? error.message
          : "Failed to load projects"
      )
    } finally {
      setProjectsLoading(false)
    }
  }

  loadProjects()
}, [])
async function loadRisk(projectCode: string) {
  try {
    setRiskLoading(true)
    setRiskError(null)

    const response = await getProjectRisk(
      Number(projectCode)
    )

    console.log(
      "PAIMANA RISK RESPONSE:",
      response
    )

    const costProbability =
      Number(
        response.cost_overrun?.probability ?? 0
      )

    const timeProbability =
      Number(
        response.time_overrun?.probability ?? 0
      )

    const overallProbability =
      Number(
        response.overall_risk?.probability ?? 0
      )

    const costRisk =
      Math.round(costProbability * 100)

    const timeRisk =
      Math.round(timeProbability * 100)

    const overallRisk =
      Math.round(overallProbability * 100)

    const alerts =
      Array.isArray(response.early_warning_alerts)
        ? response.early_warning_alerts.length
        : 0

    setProjects((prev) =>
      prev.map((project) =>
        project.id === String(projectCode)
          ? {
              ...project,

              risk: overallRisk,
              costRisk,
              timeRisk,

        

              alerts,

              status:
                response.overall_risk?.risk_level ??
                "UNKNOWN",

              description:
                response.early_warning_alerts
                  ?.join(" • ") ||
                "AI risk assessment completed.",
            }
          : project
      )
    )

  } catch (error) {
    console.error(
      "PAIMANA risk API error:",
      error
    )

    setRiskError(
      error instanceof Error
        ? error.message
        : "Failed to load project risk"
    )
  } finally {
    setRiskLoading(false)
  }
}
 // ⭐ STEP 16 GOES HERE
  if (projectsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">
            Loading PAIMANA projects...
          </p>

          <p className="text-sm text-muted-foreground mt-2">
            Loading project data from FastAPI
          </p>
        </div>
      </div>
    )
  }

  if (projectsError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-lg font-medium">
            Unable to load projects
          </p>

          <p className="text-sm text-red-500 mt-2">
            {projectsError}
          </p>
        </div>
      </div>
    )
  }
  const selected = projects.find(
  (p) => p.id === selectedId
) ?? projects[0]

  const visibleProjects = projects

const filtered = visibleProjects.filter((p) => {
  const search = query.toLowerCase().trim()

  const matchesQuery =
    !search ||
    p.name.toLowerCase().includes(search) ||
    p.id.toLowerCase().includes(search) ||
    p.state.toLowerCase().includes(search) ||
    p.agency.toLowerCase().includes(search)

  const matchesRisk =
    filter === 'All' ||
    p.status === filter

  const matchesState =
    stateFilter === 'All' ||
    p.state === stateFilter

  const matchesSector =
    sectorFilter === 'All' ||
    p.sector === sectorFilter

  return (
    matchesQuery &&
    matchesRisk &&
    matchesState &&
    matchesSector
  )
})
  const goProject = (id: string) => {
    setSelectedId(id)
    setPage('Project Details')
    setMobileOpen(false)

    loadRisk(id)
  }

  const title =
    page === 'Project Details'
      ? selected?.name ?? 'Project Details'
      : page
  


  // Page title shown in the topbar: the project name if we're on the detail
  // page, otherwise just the page name.

  return (
    <div className="app-shell">

      {/* ---------------- SIDEBAR ---------------- */}
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''} ${mobileOpen ? 'mobile-open' : ''}`}>
        <div className="brand">
          <div className="brand-mark">
            <ShieldCheck size={20} />
          </div>
          {!collapsed && (
            <div>
              <strong>
                PAIMANA <span>AI</span>
              </strong>
              <small>Project Intelligence</small>
            </div>
          )}
          <button className="icon-button sidebar-close" aria-label="Close navigation" onClick={() => setMobileOpen(false)}>
            <X size={18} />
          </button>
        </div>

        <div className="nav-label">WORKSPACE</div>
        <nav>
          {nav.map(([label, Icon]) => (
            <button
              key={label}
              className={page === label ? 'active' : ''}
              onClick={() => {
                setPage(label)
                setMobileOpen(false)
              }}
            >
              <Icon size={18} />
              <span>{!collapsed && label}</span>
              {/* Static badge showing open-warning count next to the nav item */}
              {label === 'Early Warnings' && !collapsed && (
                    <b className="nav-count">
                      {projects.filter((p) => p.alerts > 0).length}
                    </b>
                  )}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <button onClick={() => setPage('Settings')}>
            <Settings2 size={18} />
            <span>{!collapsed && 'Settings'}</span>
          </button>
          <div className="user-card">
            <div className="avatar">AS</div>
            {!collapsed && (
              <div>
                <strong>Ananya Sharma</strong>
                <small>{role}</small>
              </div>
            )}
          </div>
        </div>

        <button className="collapse-button" aria-label="Collapse sidebar" onClick={() => setCollapsed(!collapsed)}>
          {collapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </aside>

      {/* ---------------- MAIN AREA ---------------- */}
      <main className="main-area">
        {/* ---- Topbar: breadcrumb/title, role switch, status, notifications ---- */}
        <header className="topbar">
          <button className="mobile-menu icon-button" onClick={() => setMobileOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>

          <div>
            <p className="breadcrumb">
              Workspace <span>/</span> {title}
            </p>
            <h1>{title}</h1>
          </div>

          <div className="top-actions">
            <select className="role-select" aria-label="Select role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
              <option>Ministry Admin</option>
              <option>Agency Officer</option>
            </select>

            <div className="header-status">
              <span className="status-dot" />
              PAIMANA snapshot <strong>April 2026</strong>
            </div>

            {/* Notification bell + dropdown listing the top 3 highest-risk projects */}
            <div className="notification-wrap">
              <button
                className="icon-button notification"
                aria-label="Notifications"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
              >
                <Bell size={19} />
                <i>
                  {projects.filter((p) => p.alerts > 0).length}
                </i>
              </button>
              {notificationsOpen && (
                <div className="notification-menu">
                  <strong>High & critical alerts</strong> 
                 { projects
                      .filter(
                        (p) =>
                          p.status === 'CRITICAL' ||
                          p.status === 'HIGH'
                      )
                      .sort((a, b) => b.risk - a.risk)
                      .slice(0, 3)
                    .map((p) => (
                      <button key={p.id} onClick={() => goProject(p.id)}>
                        <AlertTriangle size={14} />
                        <span>
                          {p.name}
                          <small>{p.alerts} open alerts</small>
                        </span>
                      </button>
                    ))}
                </div>
              )}
            </div>

            <div className="avatar large">AS</div>
          </div>
        </header>

        {/* ---- Routed page content: only one of these renders at a time ---- */}
        <div className="content">
          {page === 'Dashboard' && (
            <Dashboard
              projects={visibleProjects}
              goProject={goProject}
              setPage={setPage}
              stateFilter={stateFilter}
              setStateFilter={setStateFilter}
              sectorFilter={sectorFilter}
              setSectorFilter={setSectorFilter}
            />
          )}
          {page === 'Projects' && (
            <Projects projects={projects} query={query} setQuery={setQuery} filter={filter} setFilter={setFilter} goProject={goProject} />
          )}
          {page === 'Project Details' && <ProjectDetails project={selected} setPage={setPage} />}
          {page === 'Early Warnings' && <Warnings projects={visibleProjects} goProject={goProject} />}
          {page === 'AI Explanation' && (
            <Explanation projects={visibleProjects} selected={selected} selectedId={selectedId} setSelectedId={setSelectedId} />
          )}
          {page === 'Benchmarking' && selected && ( <Benchmark project={selected}projects={visibleProjects} />)}
          {page === 'Analytics' && <AnalyticsView projects={visibleProjects} />}
          {page === 'Risk Monitor' && <RiskMonitor projects={visibleProjects} goProject={goProject} />}
          {page === 'Settings' && (
            <div className="empty-page">
              <Settings2 size={36} />
              <h2>Workspace settings</h2>
              <p>Model thresholds, alert routing, and agency access controls.</p>
            </div>
          )}
        </div>
      </main>
    </div>
  )
}

// ============================================================================
// SHARED PAGE HEADER
// Every page uses this for its "kicker / title / description [+ optional action]" header.
// ============================================================================

function PageIntro({
  kicker,
  title,
  description,
  action,
}: {
  kicker: string
  title: string
  description: string
  action?: React.ReactNode
}) {
  return (
    <div className="page-intro">
      <div>
        <p className="section-kicker">{kicker}</p>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
      {action}
    </div>
  )
}

// ============================================================================
// DASHBOARD PAGE — portfolio-wide overview: KPI stats, risk distribution
// donut, top alerts, and a filterable "priority projects" table.
// ============================================================================

function Dashboard({
  projects,
  goProject,
  setPage,
  stateFilter,
  setStateFilter,
  sectorFilter,
  setSectorFilter,
}: {
  projects: Project[]
  goProject: (id: string) => void
  setPage: (p: string) => void
  stateFilter: string
  setStateFilter: (v: string) => void
  sectorFilter: string
  setSectorFilter: (v: string) => void
}) {
  // Average risk score across all visible projects -> the "portfolio risk score" KPI.
const risk =
  projects.length > 0
    ? Math.round(
        projects.reduce((a, p) => a + p.risk, 0) / projects.length
      )
    : 0
const lowCount = projects.filter(
  (p) => p.status === "LOW"
).length

const mediumCount = projects.filter(
  (p) => p.status === "MEDIUM"
).length

const highCount = projects.filter(
  (p) => p.status === "HIGH"
).length

const criticalCount = projects.filter(
  (p) => p.status === "CRITICAL"
).length

const totalRiskProjects =
  lowCount + mediumCount + highCount + criticalCount

const getPercentage = (count: number) =>
  totalRiskProjects > 0
    ? Math.round((count / totalRiskProjects) * 100)
    : 0
  // "Priority" = risk >= 60, further narrowed by the state/sector quick-filters below the table.
 const priority = projects
  .filter(
    (p) =>
      p.status === 'HIGH' ||
      p.status === 'CRITICAL'
  )
  .filter(
    (p) =>
      stateFilter === 'All' ||
      p.state === stateFilter
  )
  .filter(
    (p) =>
      sectorFilter === 'All' ||
      p.sector === sectorFilter
  )
  return (
    <>
      <PageIntro
        kicker="Portfolio overview"
        title="Good morning, Ananya"
        description="Here’s the latest intelligence across your monitored infrastructure portfolio."
        action={
          <div className="intro-actions">
            <span className="last-updated">PAIMANA snapshot · April 2026</span>
            <button className="primary-button" onClick={() => setPage('Projects')}>
              <FolderKanban size={16} /> View all projects
            </button>
          </div>
        }
      />

      {/* Top-of-page KPI tiles (static counts except the computed portfolio risk score) */}
      <div className="stats-grid">
        <StatCard
  label="Total projects"
  value={String(projects.length)}
  detail="Loaded from PAIMANA"
  trend="up"
  icon={Building2}
/>

<StatCard
  label="High / critical risk"
  value={String(
  projects.filter(
    (p) =>
      p.status === 'HIGH' ||
      p.status === 'CRITICAL'
  ).length
)}
  detail="Backend risk classification"
  trend="down"
  icon={AlertTriangle}
  tone="red"
/>

<StatCard
  label="Active alerts"
  value={String(projects.filter((p) => p.alerts > 0).length)}
  detail="Projects with early warnings"
  trend="up"
  icon={Bell}
  tone="amber"
/>
      </div>

      <div className="dashboard-grid">
        {/* Risk distribution donut + legend + 12-month mini trend chart */}
        <section className="panel distribution">
          <div className="panel-heading">
            <div>
              <h3>Risk distribution</h3>
              <p>Current project risk classification</p>
            </div>
            <button className="text-button" onClick={() => setPage('Analytics')}>
              View analytics <ChevronRight size={15} />
            </button>
          </div>
          <div className="distribution-body">
            <div className="donut">
              <div>
                <strong>{projects.length}</strong>
                <small>projects</small>
              </div>
            </div>
            <div className="legend">
              <LegendRow
  label="Low risk"
  value={String(lowCount)}
  count={`${getPercentage(lowCount)}%`}
  color="low"
/>

<LegendRow
  label="Monitor"
  value={String(mediumCount)}
  count={`${getPercentage(mediumCount)}%`}
  color="medium"
/>

<LegendRow
  label="High risk"
  value={String(highCount)}
  count={`${getPercentage(highCount)}%`}
  color="high"
/>

<LegendRow
  label="Critical"
  value={String(criticalCount)}
  count={`${getPercentage(criticalCount)}%`}
  color="critical"
/>
            </div>
                      </div>
                      <div className="chart-footer">
              <span>Portfolio score</span>
              <strong>{risk} / 100</strong>
              <div className="chart-note">
                Current April 2026 snapshot
              </div>
            </div>
        </section>

        {/* Top 3 projects that currently have open alerts */}
        <section className="panel alerts-preview">
          <div className="panel-heading">
            <div>
              <h3>Attention required</h3>
              <p>Signals that need a decision</p>
            </div>
            <button className="text-button" onClick={() => setPage('Early Warnings')}>
              View all <ChevronRight size={15} />
            </button>
          </div>
          {projects
              .filter((p) => p.alerts > 0)
              .sort((a, b) => {
                const severity = {
                  CRITICAL: 4,
                  HIGH: 3,
                  MEDIUM: 2,
                  LOW: 1,
                }

                return (
                  (severity[b.status as keyof typeof severity] ?? 0) -
                  (severity[a.status as keyof typeof severity] ?? 0)
                ) || b.risk - a.risk
              })
              .slice(0, 3)
            .map((p) => (
              <button className="alert-row" key={p.id} onClick={() => goProject(p.id)}>
                <span
                      className={`alert-dot ${
                        p.status === 'CRITICAL'
                          ? 'critical'
                          : p.status === 'HIGH'
                            ? 'high'
                            : p.status === 'MEDIUM'
                              ? 'medium'
                              : 'low'
                      }`}
                    />
                  <span>
                  <strong>{p.name}</strong>
                  <small>
                    {p.warningMessages?.[0] ?? "No active warning"} · {p.state}
                  </small>
                </span>
                <RiskBadge score={p.risk} />
              </button>
            ))}
        </section>
      </div>

      {/* Priority projects table with quick state/sector filter chips */}
      <section className="panel priority">
        <div className="panel-heading">
          <div>
            <h3>Priority projects</h3>
            <p>
            {priority.length} high or critical risk projects
          </p>
          </div>
        </div>
        <div className="quick-filters">
          <span>State</span>
                      {[
              'All',
              ...Array.from(
                new Set(projects.map((p) => p.state).filter(Boolean))
              ).sort(),
            ].map((x) => (
              <button
                className={stateFilter === x ? 'selected' : ''}
                onClick={() => setStateFilter(x)}
                    key={x}
                  >
                    {x}
                  </button>
                ))}
          <span>Sector</span>
          {[
              'All',
              ...Array.from(
                new Set(projects.map((p) => p.sector).filter(Boolean))
              ).sort(),
            ].map((x) => (
              <button
                className={sectorFilter === x ? 'selected' : ''}
                onClick={() => setSectorFilter(x)}
                key={x}
              >
                {x}
              </button>
            ))}
        </div>
        <ProjectTable projects={priority} goProject={goProject} />
      </section>
    </>
  )
}

// One row of the risk-distribution legend (e.g. "Low risk — 126 — 51%").
function LegendRow({ label, value, count, color }: { label: string; value: string; count: string; color: string }) {
  return (
    <div className="legend-row">
      <span className={`legend-dot ${color}`} />
      {label}
      <strong>{value}</strong>
      <small>{count}</small>
    </div>
  )
}

// Reusable sortable-looking table of projects, used on Dashboard, Projects,
// and Risk Monitor pages. Clicking a row (or "View") opens the project detail page.
function ProjectTable({ projects, goProject }: { projects: Project[]; goProject: (id: string) => void }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Project</th>
            <th>State</th>
            <th>Sector</th>
            <th>Risk score</th>
            <th>Progress</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {projects.map((p) => (
            <tr key={p.id}>
              <td>
                <button className="project-link" onClick={() => goProject(p.id)}>
                  <strong>{p.name}</strong>
                  <small>
                    {p.id} · {p.agency}
                  </small>
                </button>
              </td>
              <td>{p.state}</td>
              <td>{p.sector}</td>
              <td>
                <RiskBadge score={p.risk} />
              </td>
              <td>
                <div className="table-progress">
                  <span>
                    <i style={{ width: `${p.progress}%` }} />
                  </span>
                  {p.progress}%
                </div>
              </td>
              <td>
                <button className="view-button" onClick={() => goProject(p.id)}>
                  View <ChevronRight size={14} />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// ============================================================================
// PROJECTS PAGE — full searchable/filterable registry of all visible projects.
// ============================================================================
function Projects({
  projects,
  query,
  setQuery,
  filter,
  setFilter,
  goProject,
}: {
  projects: Project[]
  query: string
  setQuery: (v: string) => void
  filter: string
  setFilter: (v: string) => void
  goProject: (id: string) => void
}) {
  // Search + risk filter
  const filteredProjects = projects.filter((p) => {
    const search = query.toLowerCase().trim()

    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search) ||
      p.state.toLowerCase().includes(search) ||
      p.agency.toLowerCase().includes(search) ||
      p.id.toLowerCase().includes(search)

    const matchesFilter =
      filter === 'All' ||
      (filter === 'At Risk' && p.risk >= 60) ||
      (filter === 'Monitor' &&
        p.risk >= 40 &&
        p.risk < 60) ||
      (filter === 'On Track' && p.risk < 40)

    return matchesSearch && matchesFilter
  })
  const exportProjects = () => {
  const headers = [
    'Project Code',
    'Project Name',
    'State',
    'Sector',
    'Agency',
    'Risk',
    'Cost Risk',
    'Time Risk',
    'Risk Level',
    'Physical Progress',
    'Original Cost (Cr)',
    'Expenditure (Cr)',
  ]

  const rows = filteredProjects.map((p) => [
    p.id,
    p.name,
    p.state,
    p.sector,
    p.agency,
    p.risk,
    p.costRisk,
    p.timeRisk,
    p.status,
    p.progress,
    p.budget,
    p.spent,
  ])

  const csv = [
    headers,
    ...rows,
  ]
    .map((row) =>
      row
        .map((value) =>
          `"${String(value ?? '').replace(/"/g, '""')}"`
        )
        .join(',')
    )
    .join('\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `paimana-projects-${filter.toLowerCase().replaceAll(' ', '-')}.csv`

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}

  return (
    <>
      <PageIntro
        kicker="Portfolio registry"
        title="All projects"
        description="Search, filter, and review every monitored government infrastructure project."
        action={
          <button
            className="primary-button"
            onClick={exportProjects}
          >
            <ClipboardList size={16} /> Export report
          </button>
        }
      />

      <section className="panel priority">
        <div className="toolbar">
          <div className="search-box">
            <Search size={17} />

            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects, states, agencies..."
            />
          </div>

          <div className="filter-pills">
            {['All', 'At Risk', 'Monitor', 'On Track'].map((f) => (
              <button
                className={filter === f ? 'selected' : ''}
                onClick={() => setFilter(f)}
                key={f}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {/* Result count */}
        <div className="section-kicker">
          Showing {filteredProjects.length} of {projects.length} projects
        </div>

        <ProjectTable
          projects={filteredProjects}
          goProject={goProject}
        />
      </section>
    </>
  )
}
// ============================================================================
// PROJECT DETAILS PAGE — deep dive on a single project: risk metrics,
// trend chart, delivery progress vs plan, and financial indicators.
// ============================================================================

  function ProjectDetails({ project: p, setPage }: { project: Project; setPage: (p: string) => void }) {
    return (
      <>
        <button className="back-link" onClick={() => setPage('Dashboard')}>
          <ChevronLeft size={16} /> Back to dashboard
        </button>

        <PageIntro
          kicker={`${p.id} · ${p.agency}`}
          title={p.name}
          description={`${p.state} · ${p.sector} · PAIMANA April 2026 snapshot`}
          action={<RiskBadge score={p.risk} />}
        />

        {/* Three headline risk metrics: cost, time, overall */}
        <div className="detail-grid">
                  <Metric
              label="Cost risk"
              value={p.costRisk}
            />

            <Metric
              label="Time risk"
              value={p.timeRisk}
            />

            <Metric
              label="Overall probability"
              value={p.risk}
              tone="red"
            />
        </div>

      {/* April 2026 risk assessment */}
  <section className="panel trend-panel">
    <div className="panel-heading">
      <div>
        <h3>Risk assessment</h3>
        <p>AI risk score from the April 2026 PAIMANA snapshot</p>
      </div>

      <span className="confidence-badge">
        April 2026 assessment
      </span>
    </div>

    <div className="risk-line-chart">
      <div
        className="risk-point"
        style={{
          left: '50%',
          bottom: `${p.risk}%`,
        }}
      >
        <span>{p.risk}</span>
      </div>
    </div>

    <div className="chart-axis">
      <span>April 2026</span>
    </div>
  </section>

        

        <div className="two-col">
          {/* Physical progress bar (actual) with a marker for the planned position */}
          <section className="panel progress-panel">
            <div className="panel-heading">
              <div>
                <h3>Delivery progress</h3>
                <p>Physical progress against planned curve</p>
              </div>
              <strong className="large-number">{p.progress}%</strong>
            </div>
                            <div className="progress-track">
                    <span
                      style={{
                        width: `${Math.min(
                          Math.max(Number(p.progress) || 0, 0),
                          100
                        )}%`,
                      }}
                    />
                  </div>

                  <div className="progress-labels">
                    <span>
                      Actual{' '}
                      <b>
                        {Math.round(Number(p.progress) || 0)}%
                      </b>
                    </span>

                    <span>
                      Planned physical progress{' '}
                      <b>Not available</b>
                    </span>
                  </div>
                        <div className="timeline">
                <span>
                  <b>Start date</b>{' '}
                  {p.startDate ?? 'Not available'}
                </span>

                <span>
                  <b>Original target</b>{' '}
                  {p.originalTargetDate ?? 'Not available'}
                </span>

                <span>
                  <b>Revised target</b>{' '}
                  {p.revisedTargetDate ?? 'Not available'}
                </span>
              </div>
                        
          </section>
          

          {/* Budget allocated vs spent, with a utilization percentage bar */}
          <section className="panel financial">
            <div className="panel-heading">
              <div>
                <h3>Financial indicators</h3>
                <p>Values in ₹ crore</p>
              </div>
              <TrendingUp className="muted-icon" size={18} />
            </div>
            <div className="finance-row">
              <span>Allocated budget</span>
              <strong>₹{p.budget} Cr</strong>
            </div>
            <div className="finance-row">
              <span>Expenditure to date</span>
              <strong>₹{p.spent} Cr</strong>
            </div>
            <div className="finance-row">
              <span>Utilization</span>
              <strong>
                    {p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0}%
                  </strong>
              </div>
            <div className="util-bar">
              <span
                    style={{
                      width: `${p.budget > 0 ? Math.min((p.spent / p.budget) * 100, 100) : 0}%`,
                    }}
                  />
            </div>
          </section>
        </div>
      </>
    )
  }

// A single risk metric card: percentage value + confidence badge + a matching progress ring.
function Metric({
  label,
  value,
  tone = 'amber',
}: {
  label: string
  value: number
  tone?: string
}) {
  return (
    <div className="metric-card">
      <div>
        <p className="eyebrow">{label}</p>
        <strong>{value}%</strong>
        <p className="stat-detail">Probability estimate</p>
      </div>

      <ProgressRing value={value} tone={tone} />
    </div>
  )
}

// ============================================================================
// EARLY WARNINGS PAGE — a worklist of open alerts the user can
// acknowledge or resolve, sortable by severity or type.
// ============================================================================

function Warnings({ projects, goProject }: { projects: Project[]; goProject: (id: string) => void }) {
  // Per-project alert status, kept locally: "Open" (default) -> "Acknowledged" -> "Resolved".
  const [statuses, setStatuses] = useState<Record<string, string>>({})
  const [sort, setSort] = useState('Severity')
  // Maps risk score to a numeric severity rank so we can sort by it.
  const severity = (p: Project) => {
  if (p.status === 'CRITICAL') return 4
  if (p.status === 'HIGH') return 3
  if (p.status === 'MEDIUM') return 2
  return 1
}

  // Only projects with at least one open alert are shown, sorted per the dropdown.
  const list = [...projects]
    .filter((p) => p.alerts)
    .sort((a, b) => (sort === 'Severity' ? severity(b) - severity(a) : a.name.localeCompare(b.name)))

  return (
    <>
      <PageIntro
        kicker="Signal centre"
        title="Early warnings"
        description="Proactive signals detected by PAIMANA AI across the project portfolio."
        action={
          <select className="select-control" value={sort} onChange={(e) => setSort(e.target.value)}>
            <option>Severity</option>
            <option>Type</option>
          </select>
        }
      />

      <div className="warning-summary">
      <StatCard
  label="Critical signals"
  value={String(
    projects.filter((p) => p.status === 'CRITICAL').length
  )}
  detail="Require action today"
  icon={AlertTriangle}
  tone="red"
/>

<StatCard
  label="Resolved this month"
  value="0"
  detail="Resolution tracking starts here"
  trend="up"
  icon={ShieldCheck}
  tone="green"
/>
      </div>

      <div className="warning-list">
        {list.map((p, i) => {
          const status = statuses[p.id] ?? 'Open'
          return (
            <div className="panel warning-card" key={p.id}>
              <div
                   className={`warning-severity ${
                    p.status === 'CRITICAL'
                      ? 'critical'
                      : p.status === 'HIGH'
                        ? 'high'
                        : p.status === 'MEDIUM'
                          ? 'medium'
                          : 'low'
                  }`}
                  >
                <AlertTriangle size={18} />
              </div>
              <div className="warning-content">
                <div className="warning-title">
                  <div>
                    {/* Alternates a mock alert "type" label since the sample data has no real category field */}
                    <span className="eyebrow">
                          {p.warningMessages?.[0] ?? 'PROJECT RISK'}
                    </span>
                    <h3>{p.name}</h3>
                  </div>
                  <RiskBadge score={p.risk} />
                </div>
                <p>
                  {p.warningMessages?.join(' • ') ||
                    'No active warning details available.'}
                </p>
                <div className="warning-meta">
                  <span>
                    <b className="status-text">{status}</b>
                  </span>
                  <div className="alert-actions">
                    <button
                      className="filter-button"
                      disabled={status !== 'Open'}
                      onClick={() => setStatuses({ ...statuses, [p.id]: 'Acknowledged' })}
                    >
                      {status === 'Open' ? 'Acknowledge' : status}
                    </button>
                    {status !== 'Resolved' && (
                      <button className="primary-button" onClick={() => setStatuses({ ...statuses, [p.id]: 'Resolved' })}>
                        <Check size={14} /> Resolve
                      </button>
                    )}
                    <button className="text-button" onClick={() => goProject(p.id)}>
                      Review <ChevronRight size={15} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )
        })}
      </div>
    </>
  )
}

// ============================================================================
// AI EXPLANATION PAGE — model transparency view. Lets the user pick a
// project and toggle between a SHAP-style bar chart and a plain-English summary.
// ============================================================================

function Explanation({
  projects,
  selected,
  selectedId,
  setSelectedId,
}: {
  projects: Project[]
  selected: Project
  selectedId: string
  setSelectedId: (v: string) => void
}) {

  const [view, setView] = useState<'SHAP' | 'Plain'>('SHAP')
  const [expanded, setExpanded] = useState(false) // whether to show all SHAP factors or just top 3
if (!selected) {
    return (
      <div className="empty-page">
        <p>Select a project to view AI explanation.</p>
      </div>
    )
  }

  const factors = expanded
    ? selected.shap
    : selected.shap.slice(0, 3)

  // For the plain-language summary: name the top 2 risk-increasing factors.
  const positives = selected.shap
    .filter((s) => s.value > 0)
    .slice(0, 2)
    .map((s) => s.feature.toLowerCase())
    .join(' and ')
    const featureLabels: Record<string, string> = {
  original_cost_crore: 'Original project cost',
  cumulative_expenditure_crore: 'Cumulative expenditure',
  physical_progress_pct: 'Physical progress',
  expenditure_to_original_cost_pct: 'Expenditure vs original cost',
  financial_physical_gap: 'Financial–physical progress gap',
  schedule_revision_months: 'Schedule revision',
  planned_duration_months: 'Planned duration',
  elapsed_duration_months: 'Elapsed duration',
  elapsed_planned_ratio: 'Elapsed vs planned duration',
}

const readableFeature = (feature: string) =>
  featureLabels[feature] ?? feature.replaceAll('_', ' ')

const shapValues = Array.isArray(selected.shap)
  ? selected.shap
  : []

const positiveFactors = shapValues
  .filter((s) => s.value > 0)
  .sort((a, b) => b.value - a.value)

const negativeFactors = shapValues
  .filter((s) => s.value < 0)
  .sort((a, b) => a.value - b.value)

const topFactors = [...positiveFactors, ...negativeFactors]
  .sort((a, b) => Math.abs(b.value) - Math.abs(a.value))

const displayedFactors = expanded
  ? topFactors
  : topFactors.slice(0, 5)

const warningSummary =
  selected.warningMessages?.length
    ? selected.warningMessages.join(' • ')
    : topFactors.length
      ? topFactors
          .slice(0, 2)
          .map((s) => readableFeature(s.feature))
          .join(' and ')
      : 'No specific model drivers were returned.'

  return (
    <>
      <PageIntro
        kicker="Model transparency"
        title="AI explanation"
        description="Understand the signals behind every risk prediction in plain language."
        action={
          <select className="select-control" value={selectedId} onChange={(e) => setSelectedId(e.target.value)}>
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        }
      />

      {/* Headline narrative summarizing why the selected project is risky */}
      <div className="explanation-summary">
        <div className="summary-spark">
          <Brain size={22} />
        </div>
        <div>
          <p className="section-kicker">Risk narrative · {selected.id}</p>
          <h3>Why is this project risky?</h3>
          <p>
            {selected.warningMessages?.length
              ? selected.warningMessages.join(' • ')
              : 'No specific warning signals were returned for this project.'}{' '}
            The model assigns a{' '}
            <strong>{selected.risk}% probability</strong> of material delivery risk.
          </p>
        </div>
        <RiskBadge score={selected.risk} />
      </div>

      <section className="panel shap-panel">
        <div className="view-toggle">
          <button className={view === 'SHAP' ? 'selected' : ''} onClick={() => setView('SHAP')}>
            SHAP chart view
          </button>
          <button className={view === 'Plain' ? 'selected' : ''} onClick={() => setView('Plain')}>
            Plain language summary
          </button>
        </div>

        {view === 'Plain' ? (
          // Plain-English paraphrase of the top risk-increasing and risk-decreasing factors
          <div className="plain-summary">
  <Lightbulb size={20} />
      <p>
        This project has a{' '}
        <strong>
          {selected.status}
        </strong>{' '}
        risk classification with an overall probability of{' '}
        <strong>{selected.risk}%</strong>.
        {' '}
        Key signals identified by the model:{' '}
        <strong>{warningSummary}</strong>.
      </p>
        </div>
        ) : (
          // SHAP-style horizontal bar chart: bars grow left (negative) or right (positive) from center
          <>
            <div className="panel-heading">
              <div>
                <h3>Risk factor contribution</h3>
                <p>Top contributors moving the score from the portfolio baseline.</p>
              </div>
            </div>
            {factors.length > 0 ? (
  <div className="shap-chart">
    {displayedFactors.map((s) => (
      <div className="shap-row" key={s.feature}>
        <span>{readableFeature(s.feature)}</span>

        <div className="shap-track">
          <i
            className={s.value > 0 ? 'positive' : 'negative'}
            style={{
              width: `${Math.min(Math.abs(s.value) * 1.9, 50)}%`,
              left:
                s.value > 0
                  ? '50%'
                  : `${50 - Math.min(Math.abs(s.value) * 1.9, 50)}%`,
            }}
          />
        </div>

        <strong
          className={
            s.value > 0
              ? 'text-red'
              : 'text-green'
          }
        >
          {s.value > 0 ? '+' : ''}
          {s.value}
        </strong>
      </div>
    ))}
  </div>
) : (
                   <div className="plain-summary">
  <Lightbulb size={20} />

  <div>
    <p>
      This project has a{' '}
      <strong>{selected.status}</strong> risk classification
      with an overall probability of{' '}
      <strong>{selected.risk}%</strong>.
    </p>

    {positiveFactors.length > 0 && (
      <p>
        The strongest factors increasing risk are{' '}
        <strong>
          {positiveFactors
            .slice(0, 3)
            .map((s) => readableFeature(s.feature))
            .join(', ')}
        </strong>.
      </p>
    )}

    {negativeFactors.length > 0 && (
      <p>
        Factors reducing the model's risk contribution include{' '}
        <strong>
          {negativeFactors
            .slice(0, 2)
            .map((s) => readableFeature(s.feature))
            .join(', ')}
        </strong>.
      </p>
    )}

    {shapValues.length === 0 && (
      <p>
        SHAP feature contributions are not available for this
        assessment.
      </p>
    )}
  </div>
</div>
                  )}
                            {topFactors.length > 5 && (
                  <button
                    className="text-button more-button"
                    onClick={() => setExpanded(!expanded)}
                  >
                    {expanded ? 'Show fewer factors' : 'Show more factors'}
                    <ChevronDown
                      size={15}
                      className={expanded ? 'rotate-180' : ''}
                    />
                  </button>
                )}
          </>
        )}
      </section>
    </>
  )
}

// ============================================================================
// BENCHMARKING PAGE — compares the currently selected project's metrics
// against peer-group averages (state / sector / agency / portfolio).
// ============================================================================
function Benchmark({
  project: p,
  projects,
}: {
  project: Project
  projects: Project[]
}) {
  const [selected, setSelected] = useState([
    'State',
    'Sector',
  ])

  const options = [
    'State',
    'Sector',
    'Agency',
    'Portfolio',
  ]

  // Calculate average risk for a group of projects.
  const average = (items: Project[], getter: (p: Project) => number) => {
    if (items.length === 0) return 0

    return Math.round(
      items.reduce((sum, item) => sum + getter(item), 0) /
        items.length
    )
  }

  // Real peer groups from the loaded PAIMANA dataset.
  const stateProjects = projects.filter(
    (project) => project.state === p.state
  )

  const sectorProjects = projects.filter(
    (project) => project.sector === p.sector
  )

  const agencyProjects = projects.filter(
    (project) => project.agency === p.agency
  )

  const portfolioProjects = projects

  const groups: Record<string, Project[]> = {
    State: stateProjects,
    Sector: sectorProjects,
    Agency: agencyProjects,
    Portfolio: portfolioProjects,
  }

  // Calculate real averages for each comparison group.
  const averages: Record<string, {
    risk: number
    costRisk: number
    timeRisk: number
    progress: number
  }> = {}

  options.forEach((group) => {
    const groupProjects = groups[group]

    averages[group] = {
      risk: average(groupProjects, (project) => project.risk),
      costRisk: average(groupProjects, (project) => project.costRisk),
      timeRisk: average(groupProjects, (project) => project.timeRisk),
      progress: average(groupProjects, (project) => project.progress),
    }
  })

  return (
    <>
      <PageIntro
        kicker="Comparative intelligence"
        title="Benchmarking"
        description="Put project performance in context with peer group comparisons."
        action={
          <div className="benchmark-selects">
            {options.map((x) => (
              <label key={x}>
                <input
                  type="checkbox"
                  checked={selected.includes(x)}
                  onChange={() =>
                    setSelected(
                      selected.includes(x)
                        ? selected.filter((v) => v !== x)
                        : [...selected, x]
                    )
                  }
                />{' '}
                {x}
              </label>
            ))}
          </div>
        }
      />

      <section className="panel benchmark-panel">
        <div className="panel-heading">
          <div>
            <h3>{p.name}</h3>

            <p>
              Selected project against {selected.length} comparison groups
            </p>
          </div>

          <div>
            <RiskBadge score={p.risk} />

            <p className="percentile">
              {p.state} · {p.sector}
            </p>
          </div>
        </div>

        <div className="benchmark-chart">
          {[
            ['Risk score', p.risk, 'risk'],
            ['Cost risk', p.costRisk, 'costRisk'],
            ['Time risk', p.timeRisk, 'timeRisk'],
            ['Progress', p.progress, 'progress'],
          ].map(([label, projectValue, metric]) => (
            <div
              className="compare-row"
              key={label as string}
            >
              <span>{label}</span>

              <div className="compare-bars">
                <i
                  style={{
                    width: `${Math.min(
                      Number(projectValue),
                      100
                    )}%`,
                  }}
                />

                {selected.map((group) => (
                  <b
                    key={group}
                    style={{
                      width: `${Math.min(
                        averages[group][
                          metric as
                            | 'risk'
                            | 'costRisk'
                            | 'timeRisk'
                            | 'progress'
                        ],
                        100
                      )}%`,
                    }}
                  />
                ))}
              </div>

              <div className="compare-values">
                <strong>{projectValue}</strong>

                <small>
                  {selected
                    .map(
                      (group) =>
                        averages[group][
                          metric as
                            | 'risk'
                            | 'costRisk'
                            | 'timeRisk'
                            | 'progress'
                        ]
                    )
                    .join(' / ')}
                </small>
              </div>
            </div>
          ))}
        </div>

        <div className="benchmark-legend">
          <span>
            <i className="project-color" /> Selected project
          </span>

          {selected.map((x) => (
            <span key={x}>
              <i className="average-color" /> {x} average
            </span>
          ))}
        </div>
      </section>
    </>
  )
}

// ============================================================================
// ANALYTICS PAGE — portfolio-wide charts: risk by state, a correlation
// heatmap, and a progress-vs-expenditure scatter plot. Each chart panel
// can export its data as a (mock) CSV or PDF download.
// ============================================================================
function AnalyticsView({ projects }: { projects: Project[] }) {
  const exportData = (_type: string, title: string) => {
  const headers = [
    'Project Code',
    'Project Name',
    'State',
    'Sector',
    'Agency',
    'Risk',
    'Cost Risk',
    'Time Risk',
    'Physical Progress',
    'Original Cost (Cr)',
    'Expenditure (Cr)',
  ]

  const rows = projects.map((p) => [
    p.id,
    p.name,
    p.state,
    p.sector,
    p.agency,
    p.risk,
    p.costRisk,
    p.timeRisk,
    p.progress,
    p.budget,
    p.spent,
  ])

  const csv = [headers, ...rows]
    .map((row) =>
      row
        .map((value) =>
          `"${String(value ?? '').replace(/"/g, '""')}"`
        )
        .join(',')
    )
    .join('\n')

  const blob = new Blob([csv], {
    type: 'text/csv;charset=utf-8;',
  })

  const url = URL.createObjectURL(blob)

  const a = document.createElement('a')
  a.href = url
  a.download = `${title
    .toLowerCase()
    .replaceAll(' ', '-')}.csv`

  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)

  URL.revokeObjectURL(url)
}
    
  // -----------------------------
  // Risk by state
  // -----------------------------
  const stateRiskMap = new Map<
    string,
    { totalRisk: number; count: number }
  >()

  projects.forEach((p) => {
    const state = p.state || 'Unknown'

    const existing = stateRiskMap.get(state) ?? {
      totalRisk: 0,
      count: 0,
    }

    stateRiskMap.set(state, {
      totalRisk: existing.totalRisk + p.risk,
      count: existing.count + 1,
    })
  })

  const stateRisk = Array.from(stateRiskMap.entries())
    .map(([state, data]) => ({
      state,
      risk: Math.round(data.totalRisk / data.count),
      count: data.count,
    }))
    .sort((a, b) => b.risk - a.risk)

  // -----------------------------
  // Correlation calculation
  // -----------------------------
  const correlation = (
    x: number[],
    y: number[]
  ): number => {
    if (x.length < 2 || y.length < 2) return 0

    const meanX =
      x.reduce((sum, value) => sum + value, 0) / x.length

    const meanY =
      y.reduce((sum, value) => sum + value, 0) / y.length

    let numerator = 0
    let denominatorX = 0
    let denominatorY = 0

    for (let i = 0; i < x.length; i++) {
      const dx = x[i] - meanX
      const dy = y[i] - meanY

      numerator += dx * dy
      denominatorX += dx * dx
      denominatorY += dy * dy
    }

    const denominator = Math.sqrt(
      denominatorX * denominatorY
    )

    return denominator === 0 ? 0 : numerator / denominator
  }

  const costValues = projects.map((p) => p.costRisk)
  const timeValues = projects.map((p) => p.timeRisk)
  const progressValues = projects.map((p) => p.progress)

  const expenditureValues = projects.map((p) =>
    p.budget > 0
      ? (p.spent / p.budget) * 100
      : 0
  )

  const metrics = [
    'Cost',
    'Time',
    'Progress',
    'Expenditure',
  ]

  const metricValues = [
    costValues,
    timeValues,
    progressValues,
    expenditureValues,
  ]

  const correlationMatrix = metricValues.map((row) =>
    metricValues.map((column) =>
      correlation(row, column)
    )
  )

  // -----------------------------
  // Render
  // -----------------------------
  return (
    <>
      <PageIntro
        kicker="Portfolio intelligence"
        title="Analytics"
        description="Explore risk patterns across states, sectors, and delivery indicators."
      />

      <div className="analytics-grid">

        {/* Risk by state */}
        <ChartPanel
          title="Risk by state"
          subtitle="Average AI risk score"
          onExport={exportData}
        >
          <div className="horizontal-chart">
            {stateRisk.map((item) => (
              <div key={item.state}>
                <span>{item.state}</span>

                <i>
                  <b
                    style={{
                      width: `${item.risk}%`,
                    }}
                  />
                </i>

                <strong>{item.risk}</strong>
              </div>
            ))}
          </div>
        </ChartPanel>

        {/* Correlation heatmap */}
        <ChartPanel
          title="Correlation heatmap"
          subtitle="Relationship across portfolio"
          onExport={exportData}
        >
          <div className="heatmap">
            {metrics.map((row, i) => (
              <div
                className="heat-row"
                key={row}
              >
                <span>{row}</span>

                {metrics.map((_, j) => {
                  const value = correlationMatrix[i][j]

                  return (
                    <i
                      key={j}
                      style={{
                        opacity: Math.max(
                          0.15,
                          Math.abs(value)
                        ),
                      }}
                      title={`${row} correlation: ${value.toFixed(2)}`}
                    />
                  )
                })}
              </div>
            ))}
          </div>

          <div className="heat-labels">
            {metrics.map((metric) => (
              <span key={metric}>
                {metric}
              </span>
            ))}
          </div>
        </ChartPanel>

        {/* Progress vs expenditure */}
        <ChartPanel
          title="Progress vs expenditure"
subtitle="Physical progress compared with expenditure"
          onExport={exportData}
        >
          <div className="scatter progress-scatter">
            <span className="axis-label y">
              Expenditure
            </span>

            {projects.map((p) => {
              const expenditure =
                p.budget > 0
                  ? Math.min(
                      (p.spent / p.budget) * 100,
                      100
                    )
                  : 0

              return (
                <i
                  key={p.id}
                  style={{
                    left: `${Math.min(
                      Math.max(p.progress, 0),
                      100
                    )}%`,
                    bottom: `${expenditure}%`,
                  }}
                  title={`${p.name} — Progress: ${p.progress}% | Expenditure: ${Math.round(expenditure)}%`}
                />
              )
            })}

            <span className="axis-label x">
              Physical progress
            </span>
          </div>
        </ChartPanel>

      </div>
    </>
  )
}
// Wrapper panel used by every Analytics chart: title/subtitle header + CSV/PDF export buttons.
function ChartPanel({
  title,
  subtitle,
  children,
  onExport,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
  onExport: (type: string, title: string) => void
}) {
  return (
    <section className="panel chart-panel">
      <div className="panel-heading">
        <div>
          <h3>{title}</h3>
          <p>{subtitle}</p>
        </div>
        <div className="export-actions">
          <button onClick={() => onExport('CSV', title)} title="Export CSV">
            CSV
          </button>
          <Download size={15} />
        </div>
      </div>
      {children}
    </section>
  )
}

// ============================================================================
// RISK MONITOR PAGE — a "live" view highlighting the highest-risk projects
// ranked in descending order, framed as a 30-day intervention watchlist.
// ============================================================================
function RiskMonitor({
  projects,
  goProject,
}: {
  projects: Project[]
  goProject: (id: string) => void
}) {
  // Projects requiring intervention
        const projectsNeedingAttention = projects.filter(
        (p) =>
          p.status === 'HIGH' ||
          p.status === 'CRITICAL'
      )

      const portfolioRisk =
        projects.length > 0
          ? Math.round(
              projects.reduce(
                (sum, p) => sum + p.risk,
                0
              ) / projects.length
            )
          : 0

      
  return (
    <>
      <PageIntro
        kicker="Live monitoring"
        title="Risk monitor"
        description="Projects requiring attention based on the latest AI risk assessment."
      />

      <div className="monitor-hero">
        <div>
          <p className="section-kicker">
            April 2026 assessment
          </p>

          <h2>
            {projectsNeedingAttention.length} projects need attention
          </h2>

                    <p>
            {projectsNeedingAttention.length} high and critical risk projects · April 2026
          </p>
        </div>

        <div className="hero-score">
          <span>Portfolio risk</span>

          <strong>{portfolioRisk}</strong>

          <small>/ 100</small>
        </div>
      </div>

      <section className="panel priority">
        <div className="panel-heading">
          <div>
            <h3>Ranked by predicted risk</h3>

            <p>
              {projects.length} projects assessed · April 2026
            </p>
          </div>
        </div>

        <ProjectTable
          projects={[...projectsNeedingAttention].sort(
            (a, b) => b.risk - a.risk
          )}
          goProject={goProject}
        />
      </section>
    </>
  )
}