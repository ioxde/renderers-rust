---
'@codama/renderers-rust': minor
---

PDA derivation now honours `pdaValueNode.programId` and instruction `extraArguments`. Previously every PDA was derived against the rendering program's own ID, which silently produced the wrong address for accounts owned by another program. Builders now derive against the account or argument the IDL names as the deriving program, and standalone helpers in `pdas/*.rs` handle the two cases separately: when the IDL pins the owning program's address, that address is baked in as a `<PDA>_PROGRAM_ADDRESS` constant, and when it is only known at runtime the generated `create_*_pda` and `find_*_pda` take a `program_address` parameter. Instruction `extraArguments` — the argument values that Anchor account-data seeds are lowered into — are rendered as required builder fields that feed seed resolution without being encoded into instruction data. Constant seeds now also accept a `publicKeyValueNode`, decoded to its 32 bytes at generation time.

PDA ordering is resolved with Codama's `getResolvedInstructionInputsVisitor`, so a PDA that cannot be resolved because its seeds form a cycle or reference a missing argument now fails generation with an explicit error rather than quietly degrading that account back to a required parameter.
