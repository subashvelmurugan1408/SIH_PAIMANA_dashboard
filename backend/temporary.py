import pandas as pd

from app.services.feature_service import (
    prepare_cost_features,
    prepare_time_features
)


# Load your dataset
projects_df = pd.read_csv(
    "data/paimana_projects.csv"
)


# Take first project
project = projects_df.iloc[0].to_dict()


# -------------------------------
# COST FEATURES
# -------------------------------

cost_features = prepare_cost_features(project)

print("\n==============================")
print("COST FEATURES")
print("==============================")

for key, value in cost_features.items():
    print(f"{key}: {value}")


# -------------------------------
# TIME FEATURES
# -------------------------------

time_features = prepare_time_features(project)

print("\n==============================")
print("TIME FEATURES")
print("==============================")

for key, value in time_features.items():
    print(f"{key}: {value}")