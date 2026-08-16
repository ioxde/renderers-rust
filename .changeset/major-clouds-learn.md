---
'@codama/renderers-rust': patch
---

Numeric PDA seeds in standalone `pdas/*.rs` helpers are now encoded as little-endian bytes instead of their decimal string. `create_*_pda` and `find_*_pda` sent numeric variable seeds through a catch-all that emitted `.to_string().as_ref()`, so the generated client derived its address from the ASCII decimal rather than the bytes the program uses and never matched. This brings `pdasPage` in line with the same fix already applied to the PDA helpers rendered on account pages.
