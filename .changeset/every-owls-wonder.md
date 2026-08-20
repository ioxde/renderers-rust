---
'@codama/renderers-rust': patch
---

Make generated event guards prove the bytes their parse helpers skip

`<Event>::try_parse` and `try_parse_<program>_event` index past the event's hidden prefix with a raw `&data[N..]`, which is only sound when the gate in front of it has already proven at least `N` bytes. The gate was built from `discriminators` while `N` was the width of the hidden prefix, so an IDL that declares fewer discriminators than the prefix carries produced a gate that proves less than the index consumes. An event with a `[const8, const8]` hidden prefix and a single discriminator on the first entry rendered a `matches` proving 8 bytes in front of `&data[16..]`, and any buffer of length 8–15 carrying that discriminator panicked with a slice index out of range. The CPI-framed path skewed the same way. Anchor-extracted IDLs declare every prefix entry, so no existing fixture reached it.

The rendered check and the byte count it proves are now produced together as one value, and the skip is reconciled against that count at generation time: when the discriminators already prove the full width the output is unchanged, and when they fall short the guard gains a `data.len() >= N` clause covering the remainder. `matches == true` iff `try_parse` returns `Some` therefore holds again, so the short buffer is rejected as a non-match rather than parsing to `None` — the aggregate arms in `identify_<program>_event` gain the same clause, since that function owns every byte comparison the arms' slices depend on. A hidden prefix whose remainder cannot be stated as a length check drops its parse helpers with a warning instead of emitting an index the guard does not cover.
