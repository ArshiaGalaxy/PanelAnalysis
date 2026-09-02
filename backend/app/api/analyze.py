from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.services.image import process_image
from app.services.openrouter import analyze_image
from app.services.json_utils import extract_json_object
from app.schemas.analysis import AnalysisResult


router = APIRouter()

PROMPT_PATH = (
    Path(__file__).resolve().parent.parent
    / "prompts"
    / "manga_analysis.txt"
)


@router.post("/analyze", response_model=AnalysisResult)
async def analyze(
    file: UploadFile = File(...),
):
    if not file.content_type:
        raise HTTPException(
            status_code=400,
            detail="Missing content type",
        )

    allowed_types = {
        "image/jpeg",
        "image/png",
        "image/webp",
    }

    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail="Only JPG, PNG and WebP images are supported",
        )

    try:
        original_data = await file.read()

        processed_data = process_image(
            original_data
        )

        prompt = PROMPT_PATH.read_text(
            encoding="utf-8"
        )

        result = await analyze_image(
            processed_data,
            prompt,
        )

        return AnalysisResult.model_validate(
            extract_json_object(result)
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )