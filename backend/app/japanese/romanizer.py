import re

from pykakasi import kakasi
from sudachipy import Dictionary, SplitMode


class JapaneseRomanizer:
    def __init__(self) -> None:
        self.tokenizer = Dictionary().create()
        self.converter = kakasi()

    def reading(self, text: str) -> str:
        values = []
        for token in self.tokenizer.tokenize(text, SplitMode.C):
            reading = token.reading_form()
            values.append(token.surface() if reading == "" else reading)
        return "".join(values)

    def romanize(self, text: str) -> str:
        reading = self.reading(text)
        result = " ".join(part["hepburn"] for part in self.converter.convert(reading))
        result = re.sub(r"\s+([、。！？,.!?])", r"\1", result)
        return re.sub(r"\s+", " ", result).strip()
