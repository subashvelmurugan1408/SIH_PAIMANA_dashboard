import pandas as pd
from pathlib import Path


# ============================================================
# DATASET
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

DATA_PATH = BASE_DIR / "data" / "paimana_projects.csv"

projects_df = pd.read_csv(DATA_PATH)

print(f"Benchmark dataset loaded: {len(projects_df)} projects")


# ============================================================
# FEATURE ENGINEERING
# ============================================================

projects_df["original_cost_crore"] = pd.to_numeric(
    projects_df["original_cost_crore"],
    errors="coerce"
)

projects_df["cumulative_expenditure_crore"] = pd.to_numeric(
    projects_df["cumulative_expenditure_crore"],
    errors="coerce"
)

projects_df["physical_progress_pct"] = pd.to_numeric(
    projects_df["physical_progress_pct"],
    errors="coerce"
)

projects_df["schedule_revision_months"] = pd.to_numeric(
    projects_df["schedule_revision_months"],
    errors="coerce"
)

projects_df["cost_revision_pct"] = pd.to_numeric(
    projects_df["cost_revision_pct"],
    errors="coerce"
)


# ============================================================
# EXPENDITURE / ORIGINAL COST
# ============================================================

projects_df["expenditure_to_original_cost_pct"] = (
    projects_df["cumulative_expenditure_crore"]
    / projects_df["original_cost_crore"]
) * 100


# ============================================================
# FINANCIAL-PHYSICAL GAP
# ============================================================

projects_df["financial_physical_gap"] = (
    projects_df["expenditure_to_original_cost_pct"]
    - projects_df["physical_progress_pct"]
)


# ============================================================
# METRICS USED FOR BENCHMARKING
# ============================================================

METRICS = [
    "physical_progress_pct",
    "original_cost_crore",
    "cumulative_expenditure_crore",
    "expenditure_to_original_cost_pct",
    "financial_physical_gap",
    "cost_revision_pct",
    "schedule_revision_months"
]


# ============================================================
# SAFE NUMBER
# ============================================================

def clean_number(value):

    if pd.isna(value):
        return None

    return round(float(value), 2)


# ============================================================
# BENCHMARK COMPARISON
# ============================================================

def compare_to_benchmark(
    project_value,
    benchmark_value
):

    if project_value is None or benchmark_value is None:
        return {
            "difference": None,
            "percentage_difference": None,
            "status": "NO DATA"
        }

    difference = project_value - benchmark_value

    if benchmark_value != 0:
        percentage_difference = (
            difference / abs(benchmark_value)
        ) * 100
    else:
        percentage_difference = None

    # --------------------------------------------------------
    # Generic comparison
    # --------------------------------------------------------

    if difference > 0:
        status = "ABOVE AVERAGE"

    elif difference < 0:
        status = "BELOW AVERAGE"

    else:
        status = "AT AVERAGE"

    return {
        "difference": round(
            float(difference), 2
        ),

        "percentage_difference": (
            round(
                float(percentage_difference), 2
            )
            if percentage_difference is not None
            else None
        ),

        "status": status
    }


# ============================================================
# GET PROJECT BENCHMARK
# ============================================================

def get_benchmark(project_code: str):

    # --------------------------------------------------------
    # Find project
    # --------------------------------------------------------

    rows = projects_df[
        projects_df["project_code"].astype(str)
        == str(project_code)
    ]

    if rows.empty:
        return None

    project = rows.iloc[0]


    # --------------------------------------------------------
    # Project groups
    # --------------------------------------------------------

    state = project["state"]

    sector = project["sector"]

    ministry = project["ministry_department"]


    # --------------------------------------------------------
    # Benchmark groups
    # --------------------------------------------------------

    state_df = projects_df[
        projects_df["state"] == state
    ]

    sector_df = projects_df[
        projects_df["sector"] == sector
    ]

    ministry_df = projects_df[
        projects_df["ministry_department"] == ministry
    ]

    overall_df = projects_df


    # --------------------------------------------------------
    # Groups
    # --------------------------------------------------------

    groups = {
        "state": state_df,
        "sector": sector_df,
        "ministry_department": ministry_df,
        "overall": overall_df
    }


    # --------------------------------------------------------
    # Project values
    # --------------------------------------------------------

    project_values = {}

    for metric in METRICS:

        project_values[metric] = clean_number(
            project[metric]
        )


    # --------------------------------------------------------
    # Benchmark results
    # --------------------------------------------------------

    benchmarks = {}


    for group_name, group_df in groups.items():

        benchmark_values = {}
        comparisons = {}


        for metric in METRICS:

            project_value = project_values[metric]

            benchmark_value = clean_number(
                group_df[metric].mean()
            )

            benchmark_values[metric] = benchmark_value

            comparisons[metric] = compare_to_benchmark(
                project_value,
                benchmark_value
            )


        benchmarks[group_name] = {

            "projects_count": len(group_df),

            "values": benchmark_values,

            "comparison": comparisons
        }


    # ========================================================
    # FINAL RESPONSE
    # ========================================================

    return {

        "project_code": str(
            project["project_code"]
        ),

        "project_name": project["project_name"],

        "state": state,

        "sector": sector,

        "ministry_department": ministry,

        "project_values": project_values,

        "benchmarks": benchmarks
    }