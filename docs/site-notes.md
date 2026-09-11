# CineJoy integration notes

Supported route: `https://cinejoy.to/watch/movie/{filmId}`.

Stable observed elements:

- `.player-root`
- `.player-root video`
- `.player-root .lp-subtitle`

The video and caption tracks use same-origin `blob:` URLs. CineNihongo deliberately does not inspect the underlying media requests. It uses Chrome's user-approved `tabCapture` facility, which works at the rendered-tab boundary. The captured stream is routed to the audio destination so playback remains audible.

Generated `svelte-*` and Tailwind utility classes are not adapter contracts. All nodes can be replaced during client-side navigation, so discovery remains active.

If capture is blocked or protected, the supported fallback is a user-selected Japanese SRT/VTT file.
