const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000"

export interface Project {
  project_code: number
  project_name: string
  state?: string
  sector?: string
  agency?: string
  ministry_department?: string
  original_cost_crore?: number
  revised_cost_crore?: number
  cumulative_expenditure_crore?: number
  physical_progress_pct?: number
  cost_revision_pct?: number
  schedule_revision_months?: number
  expenditure_to_original_cost_pct?: number
}

export interface RiskResult {
  project_code: number
  project_name: string

  cost_overrun: {
    prediction: number
    probability: number
    risk_level: string
  }

  time_overrun: {
    prediction: number
    probability: number
    risk_level: string
  }

  overall_risk: {
    probability: number
    risk_level: string
  }

  early_warning_alerts: string[]
  shap: {
  feature: string
  value: number
}[]
}

export async function getProjects(): Promise<Project[]> {
  const url = `${API_BASE_URL}/api/projects`

  console.log("=================================")
  console.log("PAIMANA FRONTEND API CALL")
  console.log("API URL:", url)
  console.log("=================================")

  const response = await fetch(url, {
    method: "GET",
    cache: "no-store",
  })

  console.log("PAIMANA API STATUS:", response.status)
  console.log("PAIMANA API OK:", response.ok)

  if (!response.ok) {
    const errorText = await response.text()

    console.error(
      "PAIMANA API ERROR:",
      errorText
    )

    throw new Error(
      `Failed to load projects: ${response.status}`
    )
  }

  const data = await response.json()

  console.log(
    "PAIMANA RAW API DATA:",
    data
  )

  if (Array.isArray(data)) {
    console.log(
      "PAIMANA PROJECT COUNT:",
      data.length
    )

    return data
  }

  if (
    data &&
    Array.isArray(data.projects)
  ) {
    console.log(
      "PAIMANA PROJECT COUNT:",
      data.projects.length
    )

    return data.projects
  }

  console.error(
    "Unexpected API response:",
    data
  )

  throw new Error(
    "Invalid projects API response"
  )
}

export async function getProjectRisk(
  projectCode: number
): Promise<RiskResult> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/${projectCode}/risk`,
    {
      method: "GET",
      headers: {
        "Content-Type": "application/json",
      },
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to load project risk: ${response.status}`
    )
  }

  const data = await response.json()

  return data as RiskResult
}
export async function getAllProjectRisks(): Promise<RiskResult[]> {
  const response = await fetch(
    `${API_BASE_URL}/api/projects/risks`,
    {
      method: "GET",
      cache: "no-store",
    }
  )

  if (!response.ok) {
    throw new Error(
      `Failed to load project risks: ${response.status}`
    )
  }

  const data = await response.json()

  console.log(
    "PAIMANA BULK RISK RESPONSE:",
    data
  )

 if (data && Array.isArray(data.projects)) {
  console.log(
    "PAIMANA BULK RISK PROJECT COUNT:",
    data.projects.length
  )

  return data.projects
}

  throw new Error(
    "Invalid bulk risk API response"
  )
}