---
'@codama/renderers-rust': patch
---

The renderer now tolerates Codama nodes that omit empty arrays. Codama stopped serialising empty node arrays and typed every array attribute as optional, so `accounts`, `arguments`, `seeds`, `fields`, `variants`, `items`, `entries`, `errors` and hidden-prefix `prefix` can now be absent rather than `[]`. Every reader normalises an absent array to `[]`, and the instruction template is handed a normalised `accounts` array so an instruction with no accounts keeps rendering a valid CPI `Vec::with_capacity` instead of `NaN`. Value rendering also handles the new `injectedValueNode`, resolving it to its fallback and raising a clear error when no fallback is available, since a static renderer cannot evaluate the provide/inject graph.
