---
'@codama/renderers-rust': major
---

Removed default `serde` support and replaced `kaigan` with `spl-collections`

**BREAKING CHANGES:**

- Generated variable-sized string/vector wrappers now come from `spl-collections` instead of `kaigan`. If you have handwritten code that references these generated wrapper types, update those imports and usages after regenerating your client:
  - `kaigan::types::RemainderStr` -> `spl_collections::TrailingStr`
  - `kaigan::types::RemainderVec<T>` -> `spl_collections::TrailingVec<T>`
  - `kaigan::types::U8PrefixString`, `U16PrefixString`, `U64PrefixString` -> `spl_collections::U8PrefixedStr`, `U16PrefixedStr`, `U64PrefixedStr`
  - `kaigan::types::U8PrefixVec<T>`, `U16PrefixVec<T>`, `U64PrefixVec<T>` -> `spl_collections::U8PrefixedVec<T>`, `U16PrefixedVec<T>`, `U64PrefixedVec<T>`
- `serde` is no longer part of the default or recommended generated client surface. The previous default derives on wrapper types were misleading because their `serde` representation does not match the Borsh/Wincode wire format.
- If you still want `serde` derives for a separate JSON representation, you can opt in explicitly via `traitOptions` as shown below. This does not make the generated types serde-compatible with their Borsh/Wincode wire format, but you can define a handwritten implementation with your own serde mapping as needed.

```diff
  traitOptions: {
    baseDefaults: [
      'borsh::BorshSerialize',
      'borsh::BorshDeserialize',
+     'serde::Serialize',
+     'serde::Deserialize',
      'Clone',
      'Debug',
      'Eq',
      'PartialEq',
    ],
+   featureFlags: {
+     serde: ['serde::Serialize', 'serde::Deserialize'],
+   },
  }
```
