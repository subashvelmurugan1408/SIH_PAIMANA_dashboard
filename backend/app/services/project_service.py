import pandas as pd
from pathlib import Path


# ============================================================
# DATASET PATH
# ============================================================

BASE_DIR = Path(__file__).resolve().parents[2]

DATA_PATH = BASE_DIR / "data" / "paimana_projects.csv"


# ============================================================
# LOAD DATASET
# ============================================================

projects_df = pd.read_csv(DATA_PATH)

print(f"Projects loaded: {len(projects_df)}")


# ============================================================
# GET PROJECT
# ============================================================

def get_project(project_code: str):

    rows = projects_df[
        projects_df["project_code"].astype(str)
        == str(project_code)
    ]

    if rows.empty:
        return None

    return rows.iloc[0].to_dict()