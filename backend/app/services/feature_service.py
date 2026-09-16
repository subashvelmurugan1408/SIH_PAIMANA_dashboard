from datetime import datetime
import pandas as pd


# ============================================================
# COST FEATURES
# ============================================================

def prepare_cost_features(project: dict):

    original_cost = pd.to_numeric(
        project.get("original_cost_crore"),
        errors="coerce"
    )

    expenditure = pd.to_numeric(
        project.get("cumulative_expenditure_crore"),
        errors="coerce"
    )

    physical_progress = pd.to_numeric(
        project.get("physical_progress_pct"),
        errors="coerce"
    )

    schedule_revision = pd.to_numeric(
        project.get("schedule_revision_months"),
        errors="coerce"
    )

    # Expenditure / Original Cost × 100
    if pd.notna(original_cost) and original_cost != 0:
        expenditure_pct = (
            expenditure / original_cost
        ) * 100
    else:
        expenditure_pct = 0

    # Financial - Physical gap
    financial_physical_gap = (
        expenditure_pct - physical_progress
    )

    return {
        "original_cost_crore": original_cost,
        "cumulative_expenditure_crore": expenditure,
        "physical_progress_pct": physical_progress,
        "expenditure_to_original_cost_pct": expenditure_pct,
        "financial_physical_gap": financial_physical_gap,
        "schedule_revision_months": schedule_revision
    }


# ============================================================
# DATE PARSER
# ============================================================

def parse_project_date(value):

    if value is None:
        return None

    if pd.isna(value):
        return None

    value = str(value).strip()

    if not value:
        return None

    # Dataset format: MM/YYYY
    for fmt in ("%m/%Y", "%m-%Y", "%Y-%m"):

        try:
            return datetime.strptime(
                value,
                fmt
            )
        except ValueError:
            pass

    return None


# ============================================================
# MONTH DIFFERENCE
# ============================================================

def months_between(start_date, end_date):

    if start_date is None or end_date is None:
        return None

    return (
        (end_date.year - start_date.year) * 12
        + (end_date.month - start_date.month)
    )


# ============================================================
# TIME FEATURES
# ============================================================

def prepare_time_features(project: dict):

    # -----------------------------------------
    # Cost-related features
    # -----------------------------------------

    cost_features = prepare_cost_features(project)

    # -----------------------------------------
    # Dates
    # -----------------------------------------

    start_date = parse_project_date(
        project.get("start_date_mm_yyyy")
    )

    original_target_date = parse_project_date(
        project.get("original_target_doc_mm_yyyy")
    )

    # -----------------------------------------
    # Planned duration
    # -----------------------------------------

    planned_duration = months_between(
        start_date,
        original_target_date
    )

    # -----------------------------------------
    # Elapsed duration
    # -----------------------------------------
    #
    # IMPORTANT:
    # This uses today's date for a live prediction.
    # If your Colab training used a specific snapshot
    # date instead, use that same date here.
    # -----------------------------------------

    current_date = datetime.now()

    elapsed_duration = months_between(
        start_date,
        current_date
    )

    if (
        planned_duration is not None
        and planned_duration > 0
        and elapsed_duration is not None
    ):

        elapsed_planned_ratio = (
            elapsed_duration
            / planned_duration
        )

    else:

        elapsed_planned_ratio = 0

    # -----------------------------------------
    # Combine cost + time features
    # -----------------------------------------

    return {
        "original_cost_crore":
            cost_features["original_cost_crore"],

        "cumulative_expenditure_crore":
            cost_features["cumulative_expenditure_crore"],

        "physical_progress_pct":
            cost_features["physical_progress_pct"],

        "expenditure_to_original_cost_pct":
            cost_features[
                "expenditure_to_original_cost_pct"
            ],

        "financial_physical_gap":
            cost_features[
                "financial_physical_gap"
            ],

        "planned_duration_months":
            planned_duration,

        "elapsed_duration_months":
            elapsed_duration,

        "elapsed_planned_ratio":
            elapsed_planned_ratio
    }