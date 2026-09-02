from fastapi import APIRouter, HTTPException

from app.schemas.analysis import AnalysisResult
from app.services.translate import translate_result
from app.services.json_utils import extract_json_object


router = APIRouter()


@router.post("/translate")
async def translate(
    result: AnalysisResult,
) -> AnalysisResult:

    try:
        translated = await translate_result(
            result.model_dump()
        )

        return AnalysisResult.model_validate(
            extract_json_object(translated)
        )

    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=str(exc),
        )
