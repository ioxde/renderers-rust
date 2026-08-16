---
'@codama/renderers-rust': minor
---

Instruction accounts with a `pdaValueNode` default are now auto-derived by the generated builders instead of having to be passed in. Both linked and inline PDA defaults are supported: the builder emits a `let` binding per PDA-defaulted account, ordered so that an account whose seeds reference another PDA-defaulted account is derived after its dependency, and falls back to the caller-supplied address when the setter was used. Constant seeds are rendered according to the value they hold, so a string seed becomes `b"..."`, a byte array becomes `&[...]`, and a number becomes `&N<u64>.to_le_bytes()` rather than going through a stringly-typed catch-all.

This raises the minimum `@codama/nodes-from-anchor` to `^1.4.0` for `extractPdasVisitor`, which is what lowers Anchor `seeds` constraints into the `pdaValueNode` defaults this relies on.
