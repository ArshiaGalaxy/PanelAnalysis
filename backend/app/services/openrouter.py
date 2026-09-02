import base64
import os
import httpx


OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions"

MODEL = os.getenv(
    "AI_MODEL",
    "minimax/minimax-m3:free",
)


async def analyze_image(
    image_data: bytes,
    prompt: str,
) -> str:

    api_key = os.getenv("OPENROUTER_API_KEY")

    if not api_key:
        raise RuntimeError(
            "OPENROUTER_API_KEY is not configured"
        )

    image_base64 = base64.b64encode(
        image_data
    ).decode("utf-8")

    payload = {
        "model": MODEL,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "text",
                        "text": prompt,
                    },
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": (
                                f"data:image/webp;base64,"
                                f"{image_base64}"
                            )
                        },
                    },
                ],
            }
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