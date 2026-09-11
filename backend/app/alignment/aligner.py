from dataclasses import dataclass


@dataclass(frozen=True)
class AlignmentScore:
    value: float
    overlap: float
    center: float


def score_alignment(cue_start: float, cue_end: float, segment_start: float, segment_end: float, speech_confidence: float) -> AlignmentScore:
    intersection = max(0.0, min(cue_end, segment_end) - max(cue_start, segment_start))
    union = max(cue_end, segment_end) - min(cue_start, segment_start)
    overlap = intersection / union if union else 0.0
    cue_duration = max(0.1, cue_end - cue_start)
    distance = abs((cue_start + cue_end) / 2 - (segment_start + segment_end) / 2)
    center = max(0.0, 1.0 - distance / cue_duration)
    value = max(0.0, min(1.0, 0.60 * overlap + 0.25 * center + 0.15 * speech_confidence))
    return AlignmentScore(value, overlap, center)
