from pathlib import Path

import numpy as np
import xgboost as xgb
import shap


# ============================================================
# MODEL PATHS
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

MODEL_DIR = BASE_DIR / "app" / "models"

COST_MODEL_PATH = MODEL_DIR / "cost_overrun_xgboost_model.json"
TIME_MODEL_PATH = MODEL_DIR / "time_overrun_xgboost_model.json"


# ============================================================
# FEATURE ORDER
# IMPORTANT: Must match training order exactly
# ============================================================

COST_FEATURES = [
    "original_cost_crore",
    "cumulative_expenditure_crore",
    "physical_progress_pct",
    "expenditure_to_original_cost_pct",
    "financial_physical_gap",
    "schedule_revision_months",
]


TIME_FEATURES = [
    "original_cost_crore",
    "cumulative_expenditure_crore",
    "physical_progress_pct",
    "expenditure_to_original_cost_pct",
    "financial_physical_gap",
    "planned_duration_months",
    "elapsed_duration_months",
    "elapsed_planned_ratio",
]


# ============================================================
# LOAD COST MODEL
# ============================================================

if not COST_MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Cost model not found: {COST_MODEL_PATH}"
    )

cost_model = xgb.XGBClassifier()

cost_model.load_model(
    str(COST_MODEL_PATH)
)


# ============================================================
# LOAD TIME MODEL
# ============================================================

if not TIME_MODEL_PATH.exists():
    raise FileNotFoundError(
        f"Time model not found: {TIME_MODEL_PATH}"
    )

time_model = xgb.XGBClassifier()

time_model.load_model(
    str(TIME_MODEL_PATH)
)
# ============================================================
# SHAP EXPLAINERS
# ============================================================

cost_explainer = shap.TreeExplainer(cost_model)
time_explainer = shap.TreeExplainer(time_model)


print("====================================")
print("      XGBOOST MODELS LOADED")
print("====================================")
print(f"Cost model : {COST_MODEL_PATH}")
print(f"Time model : {TIME_MODEL_PATH}")
print("====================================")


# ============================================================
# COST OVERRUN PREDICTION
# ============================================================

def predict_cost_risk(features: dict):

    values = []

    for feature in COST_FEATURES:
        value = features.get(feature)

        if value is None:
            raise ValueError(
                f"Missing cost feature: {feature}"
            )

        values.append(float(value))

    X = np.array(
        values,
        dtype=float
    ).reshape(1, -1)

    probability = float(
        cost_model.predict_proba(X)[0][1]
    )

    prediction = int(
        cost_model.predict(X)[0]
    )

    return {
        "prediction": prediction,
        "probability": probability
    }


# ============================================================
# TIME OVERRUN PREDICTION
# ============================================================

def predict_time_risk(features: dict):

    values = []

    for feature in TIME_FEATURES:
        value = features.get(feature)

        if value is None:
            raise ValueError(
                f"Missing time feature: {feature}"
            )

        values.append(float(value))

    X = np.array(
        values,
        dtype=float
    ).reshape(1, -1)

    probability = float(
        time_model.predict_proba(X)[0][1]
    )

    prediction = int(
        time_model.predict(X)[0]
    )

    return {
        "prediction": prediction,
        "probability": probability
    }
# ============================================================
# SHAP EXPLANATION
# ============================================================

def get_shap_explanation(
    cost_features: dict,
    time_features: dict
):

    # --------------------------------------------------------
    # COST MODEL FEATURES
    # --------------------------------------------------------

    cost_values = [
        float(cost_features[feature])
        for feature in COST_FEATURES
    ]

    cost_X = np.array(
        cost_values,
        dtype=float
    ).reshape(1, -1)

    cost_shap_values = cost_explainer.shap_values(
        cost_X
    )

    # --------------------------------------------------------
    # TIME MODEL FEATURES
    # --------------------------------------------------------

    time_values = [
        float(time_features[feature])
        for feature in TIME_FEATURES
    ]

    time_X = np.array(
        time_values,
        dtype=float
    ).reshape(1, -1)

    time_shap_values = time_explainer.shap_values(
        time_X
    )

    # --------------------------------------------------------
    # HANDLE SHAP OUTPUT
    # --------------------------------------------------------

    if isinstance(cost_shap_values, list):
        cost_shap_values = cost_shap_values[-1]

    if isinstance(time_shap_values, list):
        time_shap_values = time_shap_values[-1]

    cost_shap_values = np.asarray(
        cost_shap_values
    ).reshape(-1)

    time_shap_values = np.asarray(
        time_shap_values
    ).reshape(-1)

    # --------------------------------------------------------
    # COMBINE COST + TIME CONTRIBUTIONS
    # --------------------------------------------------------

    contributions = {}

    for feature, value in zip(
        COST_FEATURES,
        cost_shap_values
    ):
        contributions[feature] = (
            contributions.get(feature, 0)
            + float(value)
        )

    for feature, value in zip(
        TIME_FEATURES,
        time_shap_values
    ):
        contributions[feature] = (
            contributions.get(feature, 0)
            + float(value)
        )

    # --------------------------------------------------------
    # SORT BY ABSOLUTE CONTRIBUTION
    # --------------------------------------------------------

    sorted_features = sorted(
        contributions.items(),
        key=lambda item: abs(item[1]),
        reverse=True
    )

    return [
        {
            "feature": feature,
            "value": round(value, 4)
        }
        for feature, value in sorted_features
    ]