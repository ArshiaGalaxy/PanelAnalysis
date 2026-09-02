from pydantic import BaseModel


class Character(BaseModel):
    id: str
    name: str
    description: str


class AnalysisResult(BaseModel):
    scene: str
    characters: list[Character]
    emotions: list[str]
    youtube_hook: str
    youtube_title: str
    animation_prompt: str