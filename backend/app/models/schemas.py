from typing import Literal

from pydantic import BaseModel, Field

PROTOCOL_VERSION = "1"


class SessionCreate(BaseModel):
    filmId: str = Field(min_length=1, max_length=128)
    model: str = "small"
    confidenceThreshold: float = Field(0.65, ge=0, le=1)
    protocolVersion: str


class SessionCreated(BaseModel):
    sessionId: str


class SubtitleEvent(BaseModel):
    id: str
    sessionId: str
    filmId: str
    englishText: str
    appearedAtVideoTime: float = Field(ge=0)
    disappearedAtVideoTime: float | None = Field(None, ge=0)
    detectedAtWallClock: int
    generation: int = Field(ge=0)


class RomanizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class RomanizeResponse(BaseModel):
    japanese: str
    romaji: str


class AlignedSubtitle(BaseModel):
    subtitleId: str
    filmId: str
    english: str
    japanese: str
    romaji: str
    start: float
    end: float
    confidence: float = Field(ge=0, le=1)
    source: Literal["whisper", "subtitle-file", "cache"]


class AudioHeader(BaseModel):
    type: Literal["audio"]
    generation: int
    mediaStart: float
    mediaEnd: float
    sampleRate: Literal[16000]
    frames: int = Field(gt=0, le=16000 * 5)
