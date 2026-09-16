from app.api.projects import router as projects
from fastapi import APIRouter, HTTPException
from app.services.benchmark_service import get_benchmark
from app.services.project_service import get_project
from app.services.risk_service import (
    predict_project_risk,
    predict_all_projects_risk
)
from app.services.driver_service import analyze_cost_drivers
from app.services.display_service import (
    format_cost_drivers,
    format_benchmark
)


router = APIRouter(
    prefix="/api",
    tags=["Predictions"]
)
# ============================================================
# PROJECT RISK
# ============================================================
@router.get("/projects/{project_code}/risk")
def get_project_risk(project_code: str):

    project = get_project(project_code)

    if project is None:

        raise HTTPException(
            status_code=404,
            detail=f"Project {project_code} not found"
        )

    try:

        result = predict_project_risk(project)

        return result

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Prediction failed: {str(e)}"
        )


# ============================================================
# MODULE D — EARLY WARNING ALERTS
# ============================================================

@router.get("/projects/{project_code}/alerts")
def get_project_alerts(project_code: str):

    project = get_project(project_code)

    if project is None:

        raise HTTPException(
            status_code=404,
            detail=f"Project {project_code} not found"
        )

    try:

        result = predict_project_risk(project)

        return {
            "project_code": result["project_code"],
            "project_name": result["project_name"],
            "overall_risk": result["overall_risk"],
            "alerts": result["early_warning_alerts"]
        }

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Alert generation failed: {str(e)}"
        )

# ============================================================
# MODULE E — BENCHMARKING
# ============================================================

@router.get("/projects/{project_code}/benchmark")
def get_project_benchmark(project_code: str):

    result = get_benchmark(project_code)

    if result is None:

        raise HTTPException(
            status_code=404,
            detail=f"Project {project_code} not found"
        )

    return result
# ============================================================
# MODULE F — COST ESCALATION DRIVERS
# ============================================================

@router.get("/projects/{project_code}/cost-drivers")
def get_cost_drivers(project_code: str):

    project = get_project(project_code)

    if project is None:

        raise HTTPException(
            status_code=404,
            detail=f"Project {project_code} not found"
        )

    try:

        return analyze_cost_drivers(project)

    except Exception as e:

        raise HTTPException(
            status_code=500,
            detail=f"Cost driver analysis failed: {str(e)}"
        )