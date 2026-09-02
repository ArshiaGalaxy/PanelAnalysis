from io import BytesIO
from PIL import Image


MAX_DIMENSION = 2000
WEBP_QUALITY = 90


def process_image(data: bytes) -> bytes:
    image = Image.open(BytesIO(data))

    # Handle formats such as PNG with transparency
    if image.mode in ("RGBA", "LA", "P"):
        background = Image.new("RGB", image.size, "white")

        if image.mode == "P":
            image = image.convert("RGBA")

        if image.mode in ("RGBA", "LA"):
            background.paste(
                image,
                mask=image.getchannel("A"),
            )
            image = background
        else:
            image = image.convert("RGB")
    else:
        image = image.convert("RGB")

    width, height = image.size

    if max(width, height) > MAX_DIMENSION:
        scale = MAX_DIMENSION / max(width, height)

        image = image.resize(
            (
                round(width * scale),
                round(height * scale),
            ),
            Image.Resampling.LANCZOS,
        )

    output = BytesIO()

    image.save(
        output,
        format="WEBP",
        quality=WEBP_QUALITY,
        method=6,
    )

    return output.getvalue()