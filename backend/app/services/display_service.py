# ============================================================
# DISPLAY NAME MAPPING
# ============================================================

FEATURE_DISPLAY_NAMES = {

    "original_cost_crore":
        "Original Project Cost",

    "cumulative_expenditure_crore":
        "Cumulative Expenditure",

    "physical_progress_pct":
        "Physical Progress",

    "expenditure_to_original_cost_pct":
        "Expenditure to Original Cost",

    "financial_physical_gap":
        "Financial–Physical Gap",

    "schedule_revision_months":
        "Schedule Revision",

    "planned_duration_months":
        "Planned Duration",

    "elapsed_duration_months":
        "Elapsed Duration",

    "elapsed_planned_ratio":
        "Elapsed / Planned Duration Ratio",

    "cost_revision_pct":
        "Cost Revision"
}


# ============================================================
# GET DISPLAY NAME
# ============================================================

def get_display_name(feature):

    return FEATURE_DISPLAY_NAMES.get(
        feature,
        feature.replace("_", " ").title()
    )


# ============================================================
# CONVERT COST DRIVERS
# ============================================================

def format_cost_drivers(driver_result):

    formatted_drivers = []

    for driver in driver_result.get("drivers", []):

        formatted_drivers.append({

            "feature": driver["feature"],

            "name": get_display_name(
                driver["feature"]
            ),

            "value": driver["value"],

            "shap_value": driver["shap_value"],

            "impact": driver["impact"],

            "absolute_impact":
                driver["absolute_impact"]
        })


    formatted_top_drivers = []

    for driver in driver_result.get(
        "top_cost_drivers", []
    ):

        formatted_top_drivers.append({

            "feature": driver["feature"],

            "name": get_display_name(
                driver["feature"]
            ),

            "value": driver["value"],

            "shap_value": driver["shap_value"],

            "impact": driver["impact"],

            "absolute_impact":
                driver["absolute_impact"]
        })


    return {

        "project_code":
            driver_result.get("project_code"),

        "project_name":
            driver_result.get("project_name"),

        "drivers":
            formatted_drivers,

        "top_cost_drivers":
            formatted_top_drivers,

        "risk_reducing_factors":
            driver_result.get(
                "risk_reducing_factors",
                []
            ),

        "explanations":
            driver_result.get(
                "explanations",
                []
            )
    }
# ============================================================
# FORMAT BENCHMARKS
# ============================================================

def format_benchmark(benchmark_result):

    project_values = {}

    for feature, value in benchmark_result.get(
        "project_values", {}
    ).items():

        project_values[
            get_display_name(feature)
        ] = {
            "feature": feature,
            "value": value
        }


    benchmarks = {}

    for group_name, group_data in benchmark_result.get(
        "benchmarks", {}
    ).items():

        values = {}

        for feature, value in group_data.get(
            "values", {}
        ).items():

            values[
                get_display_name(feature)
            ] = value


        comparisons = {}

        for feature, comparison in group_data.get(
            "comparison", {}
        ).items():

            comparisons[
                get_display_name(feature)
            ] = comparison


        benchmarks[group_name] = {

            "projects_count":
                group_data.get(
                    "projects_count"
                ),

            "values":
                values,

            "comparison":
                comparisons
        }


    return {

        "project_values":
            project_values,

        "benchmarks":
            benchmarks
    }