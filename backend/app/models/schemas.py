from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

PROTOCOL_VERSION = "3"


class SessionCreate(BaseModel):
    filmId: str = Field(min_length=1, max_length=4096)
    model: Literal["base", "small", "medium"] = "small"
    confidenceThreshold: float = Field(0.65, ge=0, le=1)
    protocolVersion: str


class SessionCreated(BaseModel):
    sessionId: str


class SubtitleEvent(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    id: str
    sessionId: str
    filmId: str
    englishText: str
    appearedAtVideoTime: float = Field(ge=0)
    disappearedAtVideoTime: float | None = Field(None, ge=0)
    detectedAtWallClock: int
    generation: int = Field(ge=0)
    windowKind: Literal["caption", "rolling"] = "caption"
    playbackRate: float = Field(1, ge=0.25, le=4)

    @model_validator(mode="after")
    def valid_window(self) -> "SubtitleEvent":
        end = self.disappearedAtVideoTime
        if end is None or not 0 < end - self.appearedAtVideoTime <= 32:
            raise ValueError("A completed window of at most 32 media seconds is required")
        return self


class RomanizeRequest(BaseModel):
    text: str = Field(min_length=1, max_length=10_000)


class RomanizeResponse(BaseModel):
    japanese: str
    romaji: str


class AlignedSubtitle(BaseModel):
    subtitleId: str
    filmId: str
    sessionId: str = ""
    generation: int = 0
    english: str
    japanese: str
    romaji: str
    start: float
    end: float
    confidence: float = Field(ge=0, le=1)
    source: Literal["whisper", "subtitle-file", "cache"]


class AudioHeader(BaseModel):
    model_config = ConfigDict(allow_inf_nan=False)
    type: Literal["audio"]
    generation: int = Field(ge=0)
    mediaStart: float = Field(ge=0)
    mediaEnd: float = Field(ge=0)
    sampleRate: Literal[16000]
    frames: int = Field(gt=0, le=16000 * 5)

    @model_validator(mode="after")
    def valid_duration(self) -> "AudioHeader":
        ratio = (self.mediaEnd - self.mediaStart) / (self.frames / self.sampleRate)
        if not 0.24 <= ratio <= 4.01:
            raise ValueError("Audio timestamps must match 0.25x to 4x playback")
        return self


class SyncHeader(BaseModel):
    type: Literal["sync"]
    generation: int = Field(ge=0)
