# Optional ASR smoke sample

For an optional real-model check, download `test-audio/konnichiwa.ogg` (ignored by Git) from the
[Wikibooksqsjapanese1-snd005.ogg](https://commons.wikimedia.org/wiki/File:Wikibooksqsjapanese1-snd005.ogg)
recording by Nesnad, distributed under [CC BY-SA 3.0](https://creativecommons.org/licenses/by-sa/3.0/).
It says こんにちは. This recording can be used to check real local-model inference;
it is not included in the extension or required by the deterministic test suite.

From backend: `python -m app.smoke ../samples/test-audio/konnichiwa.ogg`.
Model weights are downloaded on first use; inference runs locally on CPU.
