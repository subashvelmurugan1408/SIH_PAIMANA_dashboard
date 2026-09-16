from fastapi import APIRouter, HTTPException
from pathlib import Path
import pandas as pd

from app.services.risk_service import (
    predict_project_risk,
    predict_all_projects_risk
)

# ============================================================
# ROUTER
# ============================================================

router = APIRouter(
    prefix="/api/projects",
    tags=["Projects"]
)


# ============================================================
# DATASET PATH
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

DATA_PATH = BASE_DIR / "data" / "paimana_projects.csv"

print("====================================")
print("CSV PATH:")
print(DATA_PATH)
print("FILE EXISTS:", DATA_PATH.exists())
print("====================================")


# ============================================================
# LOAD DATASET
# ============================================================

if not DATA_PATH.exists():
    raise FileNotFoundError(
        f"Project CSV not found: {DATA_PATH}"
    )


projects_df = pd.read_csv(DATA_PATH)

print("Projects loaded:", len(projects_df))


# ============================================================
# GET ALL PROJECTS
# ============================================================

@router.get("")
def get_projects():

    # Replace NaN / NaT with None
    clean_df = projects_df.astype(object).where(
        pd.notna(projects_df),
        None
    )

    return {
        "success": True,
        "count": len(clean_df),
        "projects": clean_df.to_dict(
            orient="records"
        )
    }
# ============================================================
# GET ALL PROJECT RISKS
# ============================================================

@router.get("/risks")
def get_all_project_risks():

    clean_df = projects_df.astype(object).where(
        pd.notna(projects_df),
        None
    )

    projects = clean_df.to_dict(
        orient="records"
    )

    try:

        risk_results = predict_all_projects_risk(
            projects
        )

        return {
            "success": True,
            "count": len(risk_results),
            "projects": risk_results
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Bulk risk prediction failed: {str(e)}"
        )

# ============================================================
# GET PROJECT BY CODE
# ============================================================

@router.get("/{project_code}")
def get_project(project_code: str):

    result = projects_df[
        projects_df["project_code"].astype(str)
        == str(project_code)
    ]

    if result.empty:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    project = result.iloc[0].astype(object)

    project = project.where(
        pd.notna(project),
        None
    )

    return {
        "success": True,
        "project": project.to_dict()
    }


# ============================================================
# COMPLETE PROJECT RISK
# ============================================================

@router.get("/{project_code}/risk")
def get_project_risk(project_code: str):

    result = projects_df[
        projects_df["project_code"].astype(str)
        == str(project_code)
    ]

    if result.empty:
        raise HTTPException(
            status_code=404,
            detail="Project not found"
        )

    # Keep the original values for ML
    project = result.iloc[0].to_dict()

    try:

        risk_result = predict_project_risk(
            project
        )

        return {
            "success": True,
            "project_code": str(project_code),
            "project": project,
            "risk": risk_result
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Risk prediction failed: {str(e)}"
        )
    # ============================================================
# BULK PROJECT RISK
# ============================================================

def predict_all_projects_risk(projects: list[dict]):

    results = []

    for project in projects:

        try:
            risk_result = predict_project_risk(project)

            results.append(risk_result)

        except Exception as e:

            print(
                f"Risk prediction failed for project "
                f"{project.get('project_code')}: {e}"
            )

    return results