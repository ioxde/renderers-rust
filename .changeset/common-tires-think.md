---
'@codama/renderers-rust': major
---

Guard generated event parse helpers on the emitting program id

Anchor discriminators are derived from names alone, so byte-identical discriminators recur across programs and the generated event helpers previously mis-decoded foreign data silently — borsh does not require full consumption, so a foreign event whose layout extends this one's decodes into a well-typed wrong value. `<Event>::matches`, `<Event>::try_parse`, `identify_<program>_event` and `try_parse_<program>_event` now take the observed program id as a required leading `&solana_address::Address` and compare it against the generated `<PROGRAM>_ID` constant.

A mismatch returns `false`/`None`, never `Some(Err(_))`: callers iterate whole transactions where other programs are ordinary rather than erroneous, and `Some(Err(_))` is the slot for a body that failed to deserialize. The program compare is ANDed onto the front of the existing `matches` condition rather than replacing any part of it, and the aggregate guard lives in `identify_<program>_event`, which owns every byte comparison, so the guards cannot disagree with the identifiers and the length proofs the generated body slices rely on are preserved.

There is no opt-out and no expected-program override — the program address is fixed at generation time, and nothing else in the generated Rust allows substituting a different one. This is a breaking change: the new leading parameter turns every existing call site into a compile error, which is intended so the check propagates rather than being silently skipped.
