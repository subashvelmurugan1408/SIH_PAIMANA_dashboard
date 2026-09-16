from fastapi import FastAPI

from app.api.predictions import router as prediction_router
from app.api.projects import router as projects_router
from fastapi.middleware.cors import CORSMiddleware


app = FastAPI(
    title="PAIMANA Project Risk Prediction API",
    description="AI-powered project cost and time overrun prediction system",
    version="1.0.0"
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    prediction_router
)

app.include_router(
    projects_router
)


@app.get("/")
def root():

    return {
        "message": "PAIMANA Risk Prediction API is running",
        "status": "healthy"
    }


@app.get("/health")
def health():

    return {
        "status": "ok"
    }