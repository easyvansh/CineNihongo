# Changelog

All notable changes follow [Keep a Changelog](https://keepachangelog.com/) and [Semantic Versioning](https://semver.org/).

## [Unreleased]

## [1.1.0] - Unreleased

### Changed

- Reworked extension activation around adapters for CineJoy, YouTube, native text tracks, and generic HTML5 video.
- Decoupled SRT/VTT playback from backend sessions and tab capture.
- Added acknowledged capture startup, diagnostics, subtitle offsets, rolling ASR windows, and an element picker.

Manual browser acceptance is required before tagging this release.

## [1.0.0] - 2026-09-11

### Added

- CineJoy subtitle observation and synchronized in-player overlay.
- User-approved tab-audio streaming to a loopback-only service.
- Local Japanese Whisper transcription, readings, romaji, alignment, and caching.
- Seek recovery, settings, debug view, replay shortcut, and SRT/VTT fallback.
- Automated extension/backend tests and CI quality gates.

[Unreleased]: https://github.com/easyvansh/CineNihongo/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/easyvansh/CineNihongo/releases/tag/v1.0.0
