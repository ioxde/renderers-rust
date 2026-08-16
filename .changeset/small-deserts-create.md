---
'@codama/renderers-rust': minor
---

The opt-in serde feature now emits `#[serde(rename_all = "camelCase")]` on generated structs and serializes `u64`, `i64`, `u128` and `i128` fields through `serde_with::As::<serde_with::DisplayFromStr>`. The JSON produced by a generated client is normally paired with the JS client for the same program, and the previous output disagreed with it on both counts: field names came out `snake_case`, and 64- and 128-bit integers came out as JSON numbers, which lose precision past 2^53 in any JavaScript consumer. Enums keep their PascalCase variant names, which already matched. Both attributes follow the trait's own feature gating, so they are emitted as bare `#[serde(...)]` when serde is unconditional and wrapped in `#[cfg_attr(feature = "...", serde(...))]` when serde sits behind a feature flag.

This changes the JSON representation of generated types for anyone already using the serde feature. After regenerating, consumers reading that JSON must expect camelCase keys on struct fields and quoted strings rather than numbers for the four wide integer types.
