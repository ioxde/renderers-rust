---
'@codama/renderers-rust': patch
---

`traitOptions.featureFlags` now emits `cfg_attr` for traits that are not also listed in the defaults or overrides. The partitioning step only ever assigned a feature to traits it encountered while walking the resolved trait list, so a trait named exclusively in `featureFlags` was dropped instead of being rendered behind its feature gate. Flagged traits absent from the resolved list are now injected into their feature group, which also means `getSerdeFieldAttribute` correctly detects serde as feature-gated in that configuration and wraps its field attributes in `cfg_attr` rather than emitting them unconditionally.
