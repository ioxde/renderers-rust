---
'@codama/renderers-rust': minor
---

Generated account decoding now validates discriminators and owners instead of trusting whatever bytes it is handed. `from_bytes` compares the leading bytes against the account's discriminator constant and fails with `invalid account discriminator` before deserializing, so feeding it the wrong account no longer silently produces a struct populated from unrelated data. `TryFrom<&AccountInfo>` checks `account_info.owner` against the program ID and fails with `invalid account owner`, then delegates to `from_bytes` rather than duplicating the deserialization path, and `fetch_all_*` and `fetch_all_maybe_*` apply the same owner check per account with the offending address in the error. On the Anchor side, `AccountDeserialize::try_deserialize` now gates on the discriminator and returns `ErrorCode::AccountDiscriminatorMismatch` before delegating to `try_deserialize_unchecked`, and the `Discriminator` impl emits the real discriminator constant instead of the `[0; 8]` placeholder.

Note that this tightens what already-generated code accepts. Callers that were decoding accounts owned by a different program, or reusing an account struct to read data that does not carry its discriminator, will now receive an error where the call previously succeeded. Accounts with no discriminator in the IDL are unaffected by the discriminator check.
