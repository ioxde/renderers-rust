import {
    accountValueNode,
    bytesTypeNode,
    bytesValueNode,
    constantPdaSeedNode,
    constantPdaSeedNodeFromBytes,
    constantPdaSeedNodeFromString,
    fixedSizeTypeNode,
    instructionAccountNode,
    instructionNode,
    numberTypeNode,
    numberValueNode,
    pdaLinkNode,
    pdaNode,
    type PdaSeedNode,
    pdaValueNode,
    programIdValueNode,
    programNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    rootNode,
    sizePrefixTypeNode,
    stringTypeNode,
    stringValueNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { getBase16Encoder, getBase58Encoder, getBase64Encoder } from '@solana/codecs-strings';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { findProgramAddress } from '../src/utils/computePda';
import { codeContains, codeDoesNotContains } from './_setup';

test('it renders a standalone PDA with variable seeds', () => {
    // Given a program with a PDA that has variable seeds.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'myPda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'metadata'),
                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect a standalone PDA file to be created.
    codeContains(getFromRenderMap(renderMap, 'pdas/my_pda.rs').content, [
        'pub const MY_PDA_SEED: &\'static [u8] = b"metadata";',
        'pub fn create_my_pda_pda(',
        'mint: Address,',
        'bump: u8,',
        'pub fn find_my_pda_pda(',
        'mint: &Address,',
        '-> (solana_address::Address, u8)',
    ]);
});

test('it renders a PDA with only constant seeds', () => {
    // Given a program with a PDA that has only constant seeds.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'configPda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'config'),
                    constantPdaSeedNode(numberTypeNode('u64'), numberValueNode(1)),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    codeContains(getFromRenderMap(renderMap, 'pdas/config_pda.rs').content, [
        'pub const CONFIG_PDA_SEED_0: &\'static [u8] = b"config";',
        "pub const CONFIG_PDA_SEED_1: &'static [u8] = &1u64.to_le_bytes();",
        'pub const CONFIG_PDA_ADDRESS: solana_address::Address =',
        'solana_address::address!("EdgDu3sEjDtMpJuDkG8VsWnKq16EYxTsuwCmSko3wZnR")',
        'pub fn create_config_pda_pda(',
        'bump: u8,',
        'pub const fn find_config_pda_pda(',
        ') -> (solana_address::Address, u8)',
    ]);
});

test('it renders a PDA with byte array seeds', () => {
    // Given a program with a PDA that has byte array seeds.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'hashPda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'hash'),
                    variablePdaSeedNode('dataHash', fixedSizeTypeNode(bytesTypeNode(), 32)),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the byte array to be handled correctly.
    codeContains(getFromRenderMap(renderMap, 'pdas/hash_pda.rs').content, [
        'pub const HASH_PDA_SEED: &\'static [u8] = b"hash";',
        'pub fn create_hash_pda_pda(',
        'data_hash: [u8; 32],',
        '&data_hash,',
        'pub fn find_hash_pda_pda(',
        'data_hash: [u8; 32],',
    ]);
});

test('it renders a numeric seed as little-endian bytes', () => {
    // Given a program with a PDA that has a numeric (u64) variable seed.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'noncePda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'nonce'),
                    variablePdaSeedNode('nonce', numberTypeNode('u64')),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/nonce_pda.rs').content;

    // Then the seed is encoded via its little-endian bytes, matching how the
    // program derives the address, not via its decimal string.
    codeContains(content, ['nonce: u64,', '&nonce.to_le_bytes(),']);
    codeDoesNotContains(content, ['nonce.to_string().as_ref(),']);
});

test('it renders a PDA module file', () => {
    // Given a root node with a program containing multiple PDAs.
    const program = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'firstPda',
                seeds: [constantPdaSeedNodeFromString('utf8', 'first')],
            }),
            pdaNode({
                name: 'secondPda',
                seeds: [constantPdaSeedNodeFromString('utf8', 'second')],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });
    const node = rootNode(program);

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect a module file to be created.
    codeContains(getFromRenderMap(renderMap, 'pdas/mod.rs').content, [
        'pub mod first_pda;',
        'pub mod second_pda;',
        'pub use self::first_pda::*;',
        'pub use self::second_pda::*;',
    ]);
});

test('it includes PDAs module in the root mod file', () => {
    // Given a root node with a program containing PDAs.
    const program = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'myPda',
                seeds: [constantPdaSeedNodeFromString('utf8', 'test')],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });
    const node = rootNode(program);

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the pdas module to be included in the root mod.
    codeContains(getFromRenderMap(renderMap, 'mod.rs').content, ['pub mod pdas;']);
});

test('it does not emit a precomputed address for PDAs with variable seeds', () => {
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'myPda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'metadata'),
                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    codeDoesNotContains(getFromRenderMap(renderMap, 'pdas/my_pda.rs').content, ['_ADDRESS']);
});

test('it renders a PDA with byte array constant seeds', () => {
    // Given a program with a PDA that has byte array seeds (e.g. from Anchor IDL extraction).
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'guardPda',
                seeds: [
                    constantPdaSeedNodeFromBytes('base58', 'F9bS'),
                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect byte array seeds to use &[...] syntax, not b[...].
    codeContains(getFromRenderMap(renderMap, 'pdas/guard_pda.rs').content, [
        "pub const GUARD_PDA_SEED: &'static [u8] = &[",
        'pub fn create_guard_pda_pda(',
        'mint: Address,',
        'pub fn find_guard_pda_pda(',
        'mint: &Address,',
    ]);
});

test('it renders constant publicKey seeds as byte-array seed constants', () => {
    // Given a PDA with a constant publicKey seed, as codama emits when an
    // address-pinned program account is used as a seed (e.g. raydium's ammPool).
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'ammPool',
                programId: '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8',
                seeds: [
                    constantPdaSeedNode(
                        publicKeyTypeNode(),
                        publicKeyValueNode('675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8'),
                    ),
                    variablePdaSeedNode('market', publicKeyTypeNode()),
                    constantPdaSeedNodeFromString('utf8', 'amm_associated_seed'),
                ],
            }),
        ],
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the publicKey seed renders as its base58-decoded byte slice.
    const content = getFromRenderMap(renderMap, 'pdas/amm_pool.rs').content;
    codeContains(content, [
        "pub const AMM_POOL_SEED_0: &'static [u8] = " +
            '&[75, 217, 73, 196, 54, 2, 195, 63, 32, 119, 144, 237, 22, 163, 82, 76, ' +
            '161, 185, 151, 92, 241, 33, 162, 169, 12, 255, 236, 125, 248, 182, 138, 205];',
        'pub const AMM_POOL_SEED_1: &\'static [u8] = b"amm_associated_seed";',
        'pub fn find_amm_pool_pda(',
    ]);
    // And it derives under the pinned program, not this crate's.
    codeContains(content, ['&AMM_POOL_PROGRAM_ADDRESS,']);
    codeDoesNotContains(content, ['MY_PROGRAM_ID']);
});

test('it bakes a pinned foreign program into the helpers of an unused PDA', () => {
    // Given a PDA pinned to a foreign program that no instruction account uses.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'cpswapAuthority',
                programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
                seeds: [constantPdaSeedNodeFromString('utf8', 'vault_and_lp_mint_auth_seed')],
            }),
        ],
        publicKey: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/cpswap_authority.rs').content;

    // Then the helpers and the folded address agree on the pinned program.
    codeContains(content, [
        'pub const CPSWAP_AUTHORITY_PROGRAM_ADDRESS: solana_address::Address =',
        'solana_address::address!("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");',
        'pub const CPSWAP_AUTHORITY_ADDRESS: solana_address::Address =',
        'solana_address::address!("GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL");',
        '&CPSWAP_AUTHORITY_PROGRAM_ADDRESS,',
    ]);
    codeDoesNotContains(content, ['MY_PROGRAM_ID', 'program_address:']);
});

test('it bakes a pinned foreign program into the helpers of a mixed-use PDA', () => {
    // Given a pinned PDA used both with and without a runtime program reference.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C'),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'cpswapProgram',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaLinkNode('cpswapAuthority'),
                            [],
                            accountValueNode('cpswapProgram'),
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'cpswapAuthority',
                    }),
                ],
                name: 'migrate',
            }),
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('cpswapAuthority'), []),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'cpswapAuthority',
                    }),
                ],
                name: 'close',
            }),
        ],
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'cpswapAuthority',
                programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
                seeds: [constantPdaSeedNodeFromString('utf8', 'vault_and_lp_mint_auth_seed')],
            }),
        ],
        publicKey: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/cpswap_authority.rs').content;

    // Then the pin still wins over the mixed usage.
    codeContains(content, [
        'pub const CPSWAP_AUTHORITY_PROGRAM_ADDRESS: solana_address::Address =',
        'solana_address::address!("CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C");',
        '&CPSWAP_AUTHORITY_PROGRAM_ADDRESS,',
    ]);
    codeDoesNotContains(content, ['MY_PROGRAM_ID']);
});

test('it bakes the local program into helpers of same-program PDAs', () => {
    // Given a standalone PDA with no dynamic-programId usages.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'myPda',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'prefix'),
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: '1111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the helpers derive under this crate's program — no program parameter.
    codeContains(content, [`pub fn find_my_pda_pda(`, `pub fn create_my_pda_pda(`, `&MY_PROGRAM_ID,`]);
    codeDoesNotContains(content, [`program_address:`, `_with_program`]);
});

// The folded `<PDA>_ADDRESS` and the `<PDA>_SEED` literal must encode every seed identically, or
// generation must fail: a seed that is off by a byte derives an address the program never accepts.

const TEST_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

/** A program whose PDA always renders to `pdas/my_pda.rs`. */
function programWithSeeds(...seeds: PdaSeedNode[]) {
    return programNode({
        name: 'myProgram',
        pdas: [pdaNode({ name: 'myPda', seeds })],
        publicKey: TEST_PROGRAM_ADDRESS,
    });
}

function byteSliceLiteral(bytes: ArrayLike<number>): string {
    return `&[${Array.from(bytes).join(', ')}]`;
}

/** The bytes a `&42u64.to_le_bytes()` seed constant must spell. */
function u64LeBytes(value: bigint): Uint8Array {
    const bytes = new Uint8Array(8);
    new DataView(bytes.buffer).setBigUint64(0, value, true);
    return bytes;
}

test('it refuses to render a size-prefixed constant string seed', () => {
    // Given a constant seed whose type adds a u32 length prefix.
    const node = programWithSeeds(
        constantPdaSeedNode(
            sizePrefixTypeNode(stringTypeNode('utf8'), numberTypeNode('u32')),
            stringValueNode('config'),
        ),
    );

    // Then generation fails rather than dropping the prefix and emitting an unreachable address.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a fixed-size constant string seed', () => {
    // Given a constant seed padded/truncated to a fixed byte width.
    const node = programWithSeeds(
        constantPdaSeedNode(fixedSizeTypeNode(stringTypeNode('utf8'), 16), stringValueNode('config')),
    );

    // Then generation fails rather than emitting the unpadded bytes.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a fixed-size constant number seed', () => {
    // Given a constant number seed wrapped in a fixed size.
    const node = programWithSeeds(
        constantPdaSeedNode(fixedSizeTypeNode(numberTypeNode('u64'), 16), numberValueNode(1)),
    );

    // Then generation fails with the constant-seed error, not the generic value-node error.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a size-prefixed constant bytes seed', () => {
    // Given a constant bytes seed whose type adds a u32 length prefix.
    const node = programWithSeeds(
        constantPdaSeedNode(
            sizePrefixTypeNode(bytesTypeNode(), numberTypeNode('u32')),
            bytesValueNode('base16', 'deadbeef'),
        ),
    );

    // Then generation fails rather than dropping the prefix.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a constant number seed that overflows its format', () => {
    // Given a u8 seed holding 300, which rustc rejects as `literal out of range for u8`.
    const node = programWithSeeds(constantPdaSeedNode(numberTypeNode('u8', 'le'), numberValueNode(300)));

    // Then generation fails instead of emitting code that cannot compile.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a negative constant seed in an unsigned format', () => {
    // Given a u64 seed holding -1, which rustc rejects as `cannot apply unary operator -`.
    const node = programWithSeeds(constantPdaSeedNode(numberTypeNode('u64', 'le'), numberValueNode(-1)));

    // Then generation fails instead of emitting code that cannot compile.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a constant publicKey seed that is not 32 bytes', () => {
    // Given a publicKey seed whose base58 text does not decode to a 32-byte address.
    const node = programWithSeeds(constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode('abc')));

    // Then generation fails instead of emitting a short byte slice.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it refuses to render a constant seed whose value does not match its type', () => {
    // Given a numeric seed type carrying a string value.
    const node = programWithSeeds(constantPdaSeedNode(numberTypeNode('u32'), stringValueNode('x')));

    // Then generation fails instead of silently encoding it as utf8 text.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/^\[Rust\] Cannot encode constant PDA seed/);
});

test('it decodes a base58 constant string seed into its bytes', () => {
    // Given a constant string seed declared with the base58 encoding.
    const text = 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp';
    const node = programWithSeeds(constantPdaSeedNodeFromString('base58', text));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the seed constant holds the decoded bytes, not the base58 text.
    codeContains(content, [
        `pub const MY_PDA_SEED: &'static [u8] = ${byteSliceLiteral(getBase58Encoder().encode(text))};`,
    ]);
    codeDoesNotContains(content, [`b"${text}"`]);
});

test('it decodes a base16 constant string seed into its bytes', () => {
    // Given a constant string seed declared with the base16 encoding.
    const text = 'deadbeef';
    const node = programWithSeeds(constantPdaSeedNodeFromString('base16', text));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the seed constant holds the decoded bytes, not the hex text.
    codeContains(content, [
        `pub const MY_PDA_SEED: &'static [u8] = ${byteSliceLiteral(getBase16Encoder().encode(text))};`,
    ]);
    codeDoesNotContains(content, [`b"${text}"`]);
});

test('it decodes a base64 constant string seed into its bytes', () => {
    // Given a constant string seed declared with the base64 encoding.
    const text = 'SGVsbG8=';
    const node = programWithSeeds(constantPdaSeedNodeFromString('base64', text));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the seed constant holds the decoded bytes, not the base64 text.
    codeContains(content, [
        `pub const MY_PDA_SEED: &'static [u8] = ${byteSliceLiteral(getBase64Encoder().encode(text))};`,
    ]);
    codeDoesNotContains(content, [`b"${text}"`]);
});

test('it omits the baked address when there are too many seeds to derive', () => {
    // Given 16 constant seeds — `find_program_address` appends the bump, exceeding the 16-seed max.
    const seeds = Array.from({ length: 16 }, (_, i) => constantPdaSeedNodeFromString('utf8', `s${i}`));
    const node = programWithSeeds(...seeds);

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the page still renders working helpers, but no address is folded in.
    codeContains(content, ['pub fn create_my_pda_pda(', 'pub fn find_my_pda_pda(', 'MY_PDA_SEED_15']);
    codeDoesNotContains(content, ['pub const MY_PDA_ADDRESS']);
});

test('it bakes the address when the seed count is at the maximum', () => {
    // Given 15 constant seeds, which leaves exactly one slot for the bump.
    const seeds = Array.from({ length: 15 }, (_, i) => constantPdaSeedNodeFromString('utf8', `s${i}`));
    const node = programWithSeeds(...seeds);

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the address is still folded in.
    codeContains(content, ['pub const MY_PDA_ADDRESS']);
});

test('it omits the baked address when a seed is longer than 32 bytes', () => {
    // Given a 40-byte constant seed, which `create_program_address` rejects.
    const node = programWithSeeds(constantPdaSeedNodeFromString('utf8', 'a'.repeat(40)));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the page still renders working helpers, but no address is folded in.
    codeContains(content, ['pub fn create_my_pda_pda(', 'pub fn find_my_pda_pda(', 'MY_PDA_SEED']);
    codeDoesNotContains(content, ['pub const MY_PDA_ADDRESS']);
});

test('it bakes the address when a seed is exactly 32 bytes', () => {
    // Given a 32-byte constant seed, which is the maximum a seed may be.
    const node = programWithSeeds(constantPdaSeedNodeFromString('utf8', 'a'.repeat(32)));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the address is still folded in.
    codeContains(content, ['pub const MY_PDA_ADDRESS']);
});

/** Pulls the base58 literal out of `pub const <NAME>: … address!("…")`. */
function extractBakedAddress(content: string, constantName: string): string {
    const match = new RegExp(
        `pub const ${constantName}: solana_address::Address =\\s*solana_address::address!\\("([^"]+)"\\)`,
    ).exec(content);
    expect(match, `expected a baked ${constantName} constant`).not.toBeNull();
    return (match as RegExpExecArray)[1];
}

test('it bakes an address that matches the seed constants it emits', () => {
    // Given a PDA mixing a utf8 string, a u64 number and a publicKey constant seed.
    const pubkey = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
    const node = programWithSeeds(
        constantPdaSeedNodeFromString('utf8', 'config'),
        constantPdaSeedNode(numberTypeNode('u64', 'le'), numberValueNode(42)),
        constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode(pubkey)),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then each seed constant holds exactly the bytes we expect the program to hash.
    const seedBytes = [
        new TextEncoder().encode('config'),
        u64LeBytes(42n),
        getBase58Encoder().encode(pubkey) as Uint8Array,
    ];
    codeContains(content, [
        `pub const MY_PDA_SEED_0: &'static [u8] = b"config";`,
        `pub const MY_PDA_SEED_1: &'static [u8] = &42u64.to_le_bytes();`,
        `pub const MY_PDA_SEED_2: &'static [u8] = ${byteSliceLiteral(seedBytes[2])};`,
    ]);

    // And the folded address is the one those very bytes derive.
    const expected = findProgramAddress(seedBytes, getBase58Encoder().encode(TEST_PROGRAM_ADDRESS) as Uint8Array);
    expect(extractBakedAddress(content, 'MY_PDA_ADDRESS')).toBe(expected?.address);
});

test('it bakes an address that matches a decoded base58 seed constant', () => {
    // Given a base58-encoded constant string seed, whose text and decoded bytes differ.
    const text = 'GDDMwNyyx8uB6zrqwBFHjLLG3TBYk2F8Az4yrQC5RzMp';
    const node = programWithSeeds(constantPdaSeedNodeFromString('base58', text));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the seed constant and the folded address are both built from the decoded bytes.
    const seedBytes = getBase58Encoder().encode(text) as Uint8Array;
    codeContains(content, [`pub const MY_PDA_SEED: &'static [u8] = ${byteSliceLiteral(seedBytes)};`]);
    const expected = findProgramAddress([seedBytes], getBase58Encoder().encode(TEST_PROGRAM_ADDRESS) as Uint8Array);
    expect(extractBakedAddress(content, 'MY_PDA_ADDRESS')).toBe(expected?.address);
});

// A folded PDA answers `find_*_pda()` from the constants the binary already carries, instead of
// paying `sol_try_find_program_address` (1,500 CU per bump attempt) for an answer it knows.

test('it folds the finder of a constant-only PDA into its precomputed constants', () => {
    // Given a PDA whose seeds are all constant.
    const node = programWithSeeds(constantPdaSeedNodeFromString('utf8', 'vault_auth_seed'));

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the address, the bump and the signer seeds are all constants, and the finder returns
    // them without deriving anything at runtime.
    codeContains(content, [
        'pub const MY_PDA_ADDRESS: solana_address::Address =',
        /pub const MY_PDA_BUMP: u8 = \d+;/,
        'pub const MY_PDA_SIGNER_SEEDS: &[&[u8]] = &[',
        'MY_PDA_SEED,',
        '&[MY_PDA_BUMP],',
        'pub const fn find_my_pda_pda() -> (solana_address::Address, u8)',
        '(MY_PDA_ADDRESS, MY_PDA_BUMP)',
    ]);
    codeDoesNotContains(content, ['Address::find_program_address(']);
    // And `create_my_pda_pda` still derives at runtime, since it takes any bump.
    codeContains(content, ['pub fn create_my_pda_pda(', 'create_program_address']);
});

test('it renders a program id signer seed as its const-callable bytes', () => {
    // Given a constant-only PDA that hashes the deriving program itself.
    const node = programWithSeeds(
        constantPdaSeedNodeFromString('utf8', 'metadata'),
        constantPdaSeedNode(publicKeyTypeNode(), programIdValueNode()),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the signer seed spells `to_bytes()`, since `AsRef::as_ref` is not a `const fn`.
    codeContains(content, ['pub const MY_PDA_SIGNER_SEEDS: &[&[u8]] = &[', '&crate::MY_PROGRAM_ID.to_bytes(),']);
    codeDoesNotContains(content, ['crate::MY_PROGRAM_ID.as_ref(),\n        &[MY_PDA_BUMP]']);
});

test('it folds a pinned PDA under the program it is pinned to', () => {
    // Given a constant-only PDA pinned to a foreign program.
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: 'cpswapAuthority',
                programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
                seeds: [
                    constantPdaSeedNodeFromString('utf8', 'vault_and_lp_mint_auth_seed'),
                    constantPdaSeedNode(publicKeyTypeNode(), programIdValueNode()),
                ],
            }),
        ],
        publicKey: 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/cpswap_authority.rs').content;

    // Then the folded constants and the signer seeds both name the pin, never this crate.
    codeContains(content, [
        /pub const CPSWAP_AUTHORITY_BUMP: u8 = \d+;/,
        '&CPSWAP_AUTHORITY_PROGRAM_ADDRESS.to_bytes(),',
        'pub const fn find_cpswap_authority_pda() -> (solana_address::Address, u8)',
        '(CPSWAP_AUTHORITY_ADDRESS, CPSWAP_AUTHORITY_BUMP)',
    ]);
    codeDoesNotContains(content, ['MY_PROGRAM_ID', 'Address::find_program_address(']);
});

test('it keeps the runtime finder for a PDA with variable seeds', () => {
    // Given a PDA the caller has to supply a seed for.
    const node = programWithSeeds(
        constantPdaSeedNodeFromString('utf8', 'metadata'),
        variablePdaSeedNode('mint', publicKeyTypeNode()),
    );

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then nothing folds: the finder still derives, and no bump or signer seeds are emitted.
    codeContains(content, ['pub fn find_my_pda_pda(', 'Address::find_program_address(']);
    codeDoesNotContains(content, ['pub const fn find_my_pda_pda', 'MY_PDA_BUMP', 'MY_PDA_SIGNER_SEEDS']);
});

test('it keeps the runtime finder when the seeds exceed what can be derived', () => {
    // Given 16 constant seeds — one more than `find_program_address` can take with its bump.
    const seeds = Array.from({ length: 16 }, (_, i) => constantPdaSeedNodeFromString('utf8', `s${i}`));
    const node = programWithSeeds(...seeds);

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'pdas/my_pda.rs').content;

    // Then the finder stays runtime, and none of the folded constants are emitted.
    codeContains(content, ['pub fn find_my_pda_pda(', 'Address::find_program_address(']);
    codeDoesNotContains(content, [
        'pub const fn find_my_pda_pda',
        'pub const MY_PDA_ADDRESS',
        'pub const MY_PDA_BUMP',
        'pub const MY_PDA_SIGNER_SEEDS',
    ]);
});
