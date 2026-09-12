import numpy as np
from numpy.typing import NDArray


def speech_only(
    samples: NDArray[np.float32], sample_rate: int = 16000, threshold: float = 0.008
) -> NDArray[np.float32]:
    """Trim leading/trailing silence using frame RMS; preserve internal pauses."""
    if samples.size == 0:
        return samples
    frame = max(1, sample_rate // 50)
    rms = np.array(
        [
            np.sqrt(np.mean(chunk * chunk))
            for chunk in np.array_split(samples, max(1, len(samples) // frame))
        ]
    )
    active = np.flatnonzero(rms >= threshold)
    if active.size == 0:
        return np.empty(0, dtype=np.float32)
    scale = len(samples) / len(rms)
    pad = int(0.15 * sample_rate)
    start = max(0, int(active[0] * scale) - pad)
    end = min(len(samples), int((active[-1] + 1) * scale) + pad)
    return samples[start:end]
