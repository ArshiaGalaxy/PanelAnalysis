import os
import json
from pathlib import Path

import httpx


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL = os.getenv(
    "TRANSLATE_MODEL",
    os.getenv(
        "AI_MODEL",
        "minimax/minimax-m3:free",
    ),
)

PROMPT_PATH = (
    Path(__file__).resolve().parent.parent
    / "prompts"
    / "translate_fa.txt"
)


async def translate_result(
    result: dict,
) -> str:

    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not configured"
        )

    prompt = PROMPT_PATH.read_text(
        encoding="utf-8"
    )

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": (
                    f"{prompt}\n\n"
                    f"{json.dumps(result, ensure_ascii=False)}"
                ),
            },
        ],
        "response_format": {
            "type": "json_object"
        },
    }

    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=120) as client:
        response = await client.post(
            OPENROUTER_URL,
            headers=headers,
            json=payload,
        )

    response.raise_for_status()

    data = response.json()

    return data["choices"][0]["message"]["content"]
