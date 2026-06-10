---
'@codama/renderers-rust': patch
---

Generated event `from_bytes` functions now report a distinct error message when the Anchor CPI framing prefix is missing or malformed. Previously, both the shared CPI framing check and the per-event discriminator check returned the same "invalid event discriminator" message, so passing raw, unframed event data pointed consumers at the wrong layer. The framing check now fails with "invalid event CPI framing", while per-event discriminator checks continue to report "invalid event discriminator".
