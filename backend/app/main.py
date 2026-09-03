from dotenv import load_dotenv
load_dotenv()
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.analyze import router as analyze_router
from app.api.translate import router as translate_router
import os


app = FastAPI(
    title="Manga Analyzer API",
    version="0.1.0",
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        os.getenv("ALLOW_ORIGINS", "http://localhost:5173"),
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


app.include_router(
    analyze_router,
    prefix="/api",
)

app.include_router(
    translate_router,
    prefix="/api",
)


@app.get("/health")
async def health():
    return {"status": "ok"}