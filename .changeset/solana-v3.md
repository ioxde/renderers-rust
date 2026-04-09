---
'@codama/renderers-rust': minor
---

- Add camelCase `rename_all` and `DisplayFromStr` for u64/i64/u128/i128 to serde feature
- Fix `featureFlags` not emitting `cfg_attr` for traits absent from defaults
- Enforce required accounts and args at compile time via constructor params
- Validate account discriminators, owners, and Anchor `try_deserialize`
- Auto-derive PDA accounts in instruction builders
- Add PDA generation with mod/page templates
