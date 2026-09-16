from app.services.feature_service import (
    prepare_cost_features,
    prepare_time_features
)

from app.services.model_service import (
    predict_cost_risk,
    predict_time_risk,
    get_shap_explanation
)


# ============================================================
# RISK LEVEL
# ============================================================

def get_risk_level(probability: float) -> str:

    if probability < 0.25:
        return "LOW"

    elif probability < 0.50:
        return "MEDIUM"

    elif probability < 0.75:
        return "HIGH"

    else:
        return "CRITICAL"

# ============================================================
# RISK LABEL
# ============================================================

def get_cost_risk_label(risk_level: str) -> str:

    return f"{risk_level.title()} Cost Overrun Risk"


def get_time_risk_label(risk_level: str) -> str:

    return f"{risk_level.title()} Time Overrun Risk"


def get_project_risk_label(risk_level: str) -> str:

    return f"{risk_level.title()} Project Risk"




# ============================================================
# EARLY WARNING ALERTS
# ============================================================

def generate_early_warnings(
    project: dict,
    cost_features: dict,
    time_features: dict,
    cost_probability: float,
    time_probability: float,
    overall_risk_level: str
):

    alerts = []

    physical_progress = float(
        cost_features["physical_progress_pct"]
    )

    financial_physical_gap = float(
        cost_features["financial_physical_gap"]
    )

    schedule_revision = cost_features[
        "schedule_revision_months"
    ]

    elapsed_planned_ratio = float(
        time_features["elapsed_planned_ratio"]
    )

    # --------------------------------------------------------
    # TIME OVERRUN
    # --------------------------------------------------------

    if time_probability >= 0.75:

        alerts.append(
            "HIGH TIME OVERRUN RISK"
        )

    elif time_probability >= 0.50:

        alerts.append(
            "MODERATE TIME OVERRUN RISK"
        )

    # --------------------------------------------------------
    # LOW PHYSICAL PROGRESS
    # --------------------------------------------------------

    if physical_progress < 50:

        alerts.append(
            "LOW PHYSICAL PROGRESS"
        )

    # --------------------------------------------------------
    # FINANCIAL-PHYSICAL GAP
    # --------------------------------------------------------

    if financial_physical_gap >= 25:

        alerts.append(
            "HIGH FINANCIAL-PHYSICAL GAP"
        )

    # --------------------------------------------------------
    # SCHEDULE REVISION
    # --------------------------------------------------------

    if (
        schedule_revision is not None
        and schedule_revision >= 12
    ):

        alerts.append(
            "HIGH SCHEDULE REVISION"
        )

    # --------------------------------------------------------
    # HIGH COST OVERRUN RISK
    # --------------------------------------------------------

    if cost_probability >= 0.75:

        alerts.append(
            "HIGH COST OVERRUN RISK"
        )

    elif cost_probability >= 0.50:

        alerts.append(
            "MODERATE COST OVERRUN RISK"
        )

    # --------------------------------------------------------
    # PROJECT RISK
    # --------------------------------------------------------

    if overall_risk_level == "CRITICAL":

        alerts.append(
            "CRITICAL PROJECT RISK"
        )

    elif overall_risk_level == "HIGH":

        alerts.append(
            "HIGH PROJECT RISK"
        )

    # --------------------------------------------------------
    # NO ALERT
    # --------------------------------------------------------

    if not alerts:
        return []

    return alerts


# ============================================================
# COMPLETE PROJECT RISK
# ============================================================

def predict_project_risk(project: dict):

    # --------------------------------------------------------
    # 1. Feature engineering
    # --------------------------------------------------------

    cost_features = prepare_cost_features(
        project
    )

    time_features = prepare_time_features(
        project
    )

    # --------------------------------------------------------
    # 2. Cost prediction
    # --------------------------------------------------------

    cost_result = predict_cost_risk(
        cost_features
    )

    cost_probability = cost_result[
        "probability"
    ]

    cost_risk_level = get_risk_level(
        cost_probability
    )

    # --------------------------------------------------------
    # 3. Time prediction
    # --------------------------------------------------------

    time_result = predict_time_risk(
        time_features
    )

    time_probability = time_result[
        "probability"
    ]

    time_risk_level = get_risk_level(
        time_probability
    )

    # --------------------------------------------------------
    # 4. Overall risk
    # --------------------------------------------------------

    overall_probability = max(
        cost_probability,
        time_probability
    )

    overall_risk_level = get_risk_level(
        overall_probability
    )

    # --------------------------------------------------------
    # 5. Early warnings
    # --------------------------------------------------------

    alerts = generate_early_warnings(
        project=project,
        cost_features=cost_features,
        time_features=time_features,
        cost_probability=cost_probability,
        time_probability=time_probability,
        overall_risk_level=overall_risk_level
    )
        # --------------------------------------------------------
    # 6. SHAP EXPLANATION
    # --------------------------------------------------------

    shap_explanation = get_shap_explanation(
        cost_features=cost_features,
        time_features=time_features
    )

    # --------------------------------------------------------
    # 6. Final response
    # --------------------------------------------------------

    return {

        "project_code": project.get(
            "project_code"
        ),

        "project_name": project.get(
            "project_name"
        ),

        "cost_overrun": {

            "prediction": cost_result[
                "prediction"
            ],

            "probability": round(
                cost_probability,
                4
            ),

            "risk_level": cost_risk_level
        },

        "time_overrun": {

            "prediction": time_result[
                "prediction"
            ],

            "probability": round(
                time_probability,
                4
            ),

            "risk_level": time_risk_level
        },

        "overall_risk": {

            "probability": round(
                overall_probability,
                4
            ),

            "risk_level": overall_risk_level
        },

        "early_warning_alerts": alerts,
        "shap": shap_explanation
    }
# ============================================================
# BULK PROJECT RISK
# ============================================================

def predict_all_projects_risk(projects: list[dict]):

    results = []

    for project in projects:

        try:
            risk = predict_project_risk(project)
            results.append(risk)

        except Exception as e:

            print(
                f"Risk prediction failed for project "
                f"{project.get('project_code')}: {e}"
            )

    return results