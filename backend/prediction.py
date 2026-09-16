import pandas as pd

from app.services.risk_service import predict_project_risk


# ============================================================
# LOAD DATASET
# ============================================================

DATA_PATH = "data/paimana_projects.csv"

projects_df = pd.read_csv(DATA_PATH)

print("Projects loaded:", len(projects_df))


# ============================================================
# SELECT PROJECT
# ============================================================

project = projects_df.iloc[0].to_dict()


print("\n====================================")
print("PROJECT")
print("====================================")

print("Project code:", project.get("project_code"))
print("Project name:", project.get("project_name"))


# ============================================================
# RUN PREDICTION
# ============================================================

result = predict_project_risk(project)


# ============================================================
# COST OVERRUN
# ============================================================

print("\n====================================")
print("COST OVERRUN")
print("====================================")

print(
    "Prediction:",
    result["cost_overrun"]["prediction"]
)

print(
    "Probability:",
    result["cost_overrun"]["probability"]
)

print(
    "Risk:",
    result["cost_overrun"]["risk_level"]
)


# ============================================================
# TIME OVERRUN
# ============================================================

print("\n====================================")
print("TIME OVERRUN")
print("====================================")

print(
    "Prediction:",
    result["time_overrun"]["prediction"]
)

print(
    "Probability:",
    result["time_overrun"]["probability"]
)

print(
    "Risk:",
    result["time_overrun"]["risk_level"]
)


# ============================================================
# OVERALL PROJECT RISK
# ============================================================

print("\n====================================")
print("OVERALL PROJECT RISK")
print("====================================")

print(
    "Probability:",
    result["overall_risk"]["probability"]
)

print(
    "Risk:",
    result["overall_risk"]["risk_level"]
)


# ============================================================
# MODULE D — EARLY WARNING ALERTS
# ============================================================

print("\n====================================")
print("MODULE D - EARLY WARNING ALERTS")
print("====================================")

for alert in result["early_warning_alerts"]:

    print("⚠", alert)