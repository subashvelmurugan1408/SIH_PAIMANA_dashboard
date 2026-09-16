import numpy as np
import xgboost as xgb

from app.services.feature_service import prepare_cost_features
from app.services.model_service import COST_FEATURES


# ============================================================
# COST DRIVER ANALYSIS
# ============================================================

def analyze_cost_drivers(project: dict):

    # --------------------------------------------------------
    # 1. Prepare the SAME features used by cost model
    # --------------------------------------------------------

    features = prepare_cost_features(project)

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


    # --------------------------------------------------------
    # 2. Get cost model
    # --------------------------------------------------------

    from app.services.model_service import cost_model


    # --------------------------------------------------------
    # 3. Create DMatrix
    # --------------------------------------------------------

    dmatrix = xgb.DMatrix(
        X,
        feature_names=COST_FEATURES
    )


    # --------------------------------------------------------
    # 4. Get SHAP contributions
    # --------------------------------------------------------

    booster = cost_model.get_booster()

    shap_values = booster.predict(
        dmatrix,
        pred_contribs=True
    )[0]


    # Last value is the bias/base value
    feature_shap = shap_values[:-1]


    # --------------------------------------------------------
    # 5. Create driver list
    # --------------------------------------------------------

    drivers = []

    for feature, value, shap_value in zip(
        COST_FEATURES,
        values,
        feature_shap
    ):

        drivers.append({
            "feature": feature,
            "value": round(float(value), 4),
            "shap_value": round(
                float(shap_value),
                4
            ),
            "impact": (
                "INCREASES COST RISK"
                if shap_value > 0
                else "REDUCES COST RISK"
            ),
            "absolute_impact": round(
                abs(float(shap_value)),
                4
            )
        })


    # --------------------------------------------------------
    # 6. Sort strongest drivers first
    # --------------------------------------------------------

    drivers.sort(
        key=lambda x: x["absolute_impact"],
        reverse=True
    )


    # --------------------------------------------------------
    # 7. Separate positive drivers
    # --------------------------------------------------------

    positive_drivers = [
        driver
        for driver in drivers
        if driver["shap_value"] > 0
    ]


    negative_drivers = [
        driver
        for driver in drivers
        if driver["shap_value"] < 0
    ]


    # --------------------------------------------------------
    # 8. Top drivers
    # --------------------------------------------------------

    top_drivers = positive_drivers[:3]


    # --------------------------------------------------------
    # 9. Human-readable explanation
    # --------------------------------------------------------

    explanations = []

    for driver in top_drivers:

        explanations.append(
            f"{driver['feature']} "
            f"is increasing cost-overrun risk "
            f"(SHAP: {driver['shap_value']})"
        )


    # --------------------------------------------------------
    # 10. Final response
    # --------------------------------------------------------

    return {

        "project_code": str(
            project.get("project_code")
        ),

        "project_name": project.get(
            "project_name"
        ),

        "drivers": drivers,

        "top_cost_drivers": top_drivers,

        "risk_reducing_factors": negative_drivers,

        "explanations": explanations
    }