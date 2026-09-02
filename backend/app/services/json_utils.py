import json


def extract_json_object(text: str) -> dict:
    """Parse a JSON object from model output.

    Some models wrap the JSON in markdown fences or add prose
    around it despite response_format — find the outermost
    {...} block and parse that.
    """
    text = text.strip()

    try:
        data = json.loads(text)
        if isinstance(data, dict):
            return data
    except json.JSONDecodeError:
        pass

    start = text.find("{")
    end = text.rfind("}")

    if start == -1 or end <= start:
        raise ValueError(
            "Model response does not contain a JSON object"
        )

    data = json.loads(text[start:end + 1])

    if not isinstance(data, dict):
        raise ValueError(
            "Model response is not a JSON object"
        )

    return data
