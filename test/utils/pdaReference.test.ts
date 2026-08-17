import { createHash } from 'node:crypto';

import { constantPdaSeedNodeFromString, pdaNode, programNode, snakeCase } from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { ed25519 } from '@noble/curves/ed25519.js';
import { getBase58Decoder, getBase58Encoder } from '@solana/codecs-strings';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../../src';

/**
 * An independent re-implementation of `Pubkey::find_program_address`, written from the spec.
 * Expected values must never come from `src/utils/computePda.ts`: that is the code under test.
 */

const PDA_MARKER = new TextEncoder().encode('ProgramDerivedAddress');

function concatBytes(chunks: Uint8Array[]): Uint8Array {
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.length;
    }
    return out;
}

function sha256(input: Uint8Array): Uint8Array {
    return new Uint8Array(createHash('sha256').update(input).digest());
}

function base58ToBytes(address: string): Uint8Array {
    return getBase58Encoder().encode(address) as Uint8Array;
}

/**
 * sha256(seeds || [bump] || programId || "ProgramDerivedAddress"), walking the bump down
 * from 255 and taking the first candidate that is not a valid ed25519 point.
 */
function referenceFindProgramAddress(seeds: Uint8Array[], programAddress: string): { address: string; bump: number } {
    const programId = base58ToBytes(programAddress);
    for (let bump = 255; bump >= 0; bump--) {
        const candidate = sha256(concatBytes([...seeds, Uint8Array.of(bump), programId, PDA_MARKER]));
        if (!ed25519.utils.isValidPublicKey(candidate)) {
            return { address: getBase58Decoder().decode(candidate), bump };
        }
    }
    throw new Error(`No off-curve address exists for program [${programAddress}]`);
}

/** Parses either `b"seed"` or `&[1, 2, 3]` back into the bytes the constant stands for. */
function parseRustByteLiteral(literal: string): Uint8Array {
    const trimmed = literal.trim();

    const byteString = /^b"([^"]*)"$/.exec(trimmed);
    if (byteString) {
        return new TextEncoder().encode(byteString[1]);
    }

    const byteArray = /^&\[([\s\S]*)\]$/.exec(trimmed);
    if (byteArray) {
        const values = byteArray[1]
            .split(',')
            .map(part => part.trim())
            .filter(part => part.length > 0);
        return Uint8Array.from(values.map(value => Number.parseInt(value, 10)));
    }

    throw new Error(`Unrecognised Rust byte literal: [${trimmed}]`);
}

function extractConstant(content: string, pattern: RegExp, label: string): string {
    const match = pattern.exec(content);
    if (!match) {
        throw new Error(`Could not find ${label} in the generated file.`);
    }
    return match[1];
}

type PdaFixture = {
    /** Transcribed from the checked-in e2e output. */
    expectedAddress: string;
    expectedBump: number;
    /** Program that owns the generated crate. */
    localProgram: string;
    /** Drives the file name and the constant prefix. */
    name: string;
    /** Foreign program pinned via `pdaNode.programId`, when the PDA does not derive locally. */
    pinnedProgram?: string;
    /** The PDA's single constant utf8 seed. */
    seed: string;
};

const RAYDIUM_LAUNCHPAD = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const RAYDIUM_AMM_V4 = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const RAYDIUM_CP_SWAP = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';
const RAYDIUM_LOCK = 'LockrWmn6K5twhz3y9w1dQERbmgSaRkfnTeTKbpofwE';

/** A program none of the fixtures derive under; proves the reference is program-sensitive. */
const DECOY_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

const PDA_FIXTURES: PdaFixture[] = [
    {
        expectedAddress: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
        expectedBump: 254,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'ammAuthority',
        pinnedProgram: RAYDIUM_AMM_V4,
        seed: 'amm authority',
    },
    {
        expectedAddress: '9DCxsMizn3H1hprZ7xWe6LDzeUeZBksYFpBWBtSf1PQX',
        expectedBump: 255,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'ammConfig',
        pinnedProgram: RAYDIUM_AMM_V4,
        seed: 'amm_config_account_seed',
    },
    {
        expectedAddress: 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL',
        expectedBump: 253,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'cpswapAuthority',
        pinnedProgram: RAYDIUM_CP_SWAP,
        seed: 'vault_and_lp_mint_auth_seed',
    },
    {
        expectedAddress: '3f7GcQFG397GAaEnv51zR6tsTVihYRydnydDD1cXekxH',
        expectedBump: 255,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'lockAuthority',
        pinnedProgram: RAYDIUM_LOCK,
        seed: 'lock_cp_authority_seed',
    },
    {
        expectedAddress: '2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr',
        expectedBump: 255,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'eventAuthority',
        seed: '__event_authority',
    },
    {
        expectedAddress: 'WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh',
        expectedBump: 250,
        localProgram: RAYDIUM_LAUNCHPAD,
        name: 'authority',
        seed: 'vault_auth_seed',
    },
    {
        expectedAddress: 'GpMZbSM2GgvTKHJirzeGfMFoaZ8UR2X7F4v8vHTvxFbL',
        expectedBump: 253,
        localProgram: RAYDIUM_CP_SWAP,
        name: 'cpmmAuthority',
        seed: 'vault_and_lp_mint_auth_seed',
    },
];

function renderPda(fixture: PdaFixture): string {
    const node = programNode({
        name: 'myProgram',
        pdas: [
            pdaNode({
                name: fixture.name,
                ...(fixture.pinnedProgram ? { programId: fixture.pinnedProgram } : {}),
                seeds: [constantPdaSeedNodeFromString('utf8', fixture.seed)],
            }),
        ],
        publicKey: fixture.localProgram,
    });

    const renderMap = visit(node, getRenderMapVisitor());
    return getFromRenderMap(renderMap, `pdas/${snakeCase(fixture.name)}.rs`).content;
}

test.each(PDA_FIXTURES)('it bakes $name into an address matching an independent derivation', (fixture: PdaFixture) => {
    // Given a PDA whose address the generator folds into a constant.
    const constantPrefix = snakeCase(fixture.name).toUpperCase();
    const content = renderPda(fixture);

    // When we read it back. The `pub const` anchor keeps `<PDA>_PROGRAM_ADDRESS` from matching.
    const renderedAddress = extractConstant(
        content,
        new RegExp(
            `pub const ${constantPrefix}_ADDRESS: solana_address::Address =\\s*` +
                `solana_address::address!\\("([1-9A-HJ-NP-Za-km-z]+)"\\)`,
        ),
        `${constantPrefix}_ADDRESS`,
    );

    // Then it matches the reference derivation, computed with no help from src/utils/computePda.ts.
    const derivingProgram = fixture.pinnedProgram ?? fixture.localProgram;
    const reference = referenceFindProgramAddress([new TextEncoder().encode(fixture.seed)], derivingProgram);
    expect(renderedAddress).toBe(reference.address);
    expect(reference.bump).toBe(fixture.expectedBump);

    // And the value transcribed from the e2e output, so a bug in both generator and reference fails.
    expect(renderedAddress).toBe(fixture.expectedAddress);

    // And the reference is program-sensitive, so none of the above passes vacuously.
    expect(referenceFindProgramAddress([new TextEncoder().encode(fixture.seed)], DECOY_PROGRAM).address).not.toBe(
        fixture.expectedAddress,
    );
});

test.each(PDA_FIXTURES)('it keeps the $name seed constant in step with the folded address', (fixture: PdaFixture) => {
    // Given the same PDA, whose helpers derive from the `<PDA>_SEED` constant at runtime.
    const constantPrefix = snakeCase(fixture.name).toUpperCase();
    const content = renderPda(fixture);

    // When we read back the seed constant.
    const renderedSeed = extractConstant(
        content,
        new RegExp(`pub const ${constantPrefix}_SEED: &'static \\[u8\\] =([\\s\\S]*?);`),
        `${constantPrefix}_SEED`,
    );

    // Then it holds the utf8 seed bytes the folded address was derived from, so the two cannot drift.
    expect(Array.from(parseRustByteLiteral(renderedSeed))).toEqual(Array.from(new TextEncoder().encode(fixture.seed)));
});

test('the reference derivation is seed-sensitive', () => {
    // Given the seeds of two fixtures that derive under the same program.
    const authority = referenceFindProgramAddress([new TextEncoder().encode('vault_auth_seed')], RAYDIUM_LAUNCHPAD);
    const eventAuthority = referenceFindProgramAddress(
        [new TextEncoder().encode('__event_authority')],
        RAYDIUM_LAUNCHPAD,
    );

    // Then swapping the seed changes the address, so the reference is not returning a constant.
    expect(authority.address).not.toBe(eventAuthority.address);
    expect(authority.address).toBe('WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh');
    expect(eventAuthority.address).toBe('2DPAtwB8L12vrMRExbLuyGnC7n2J5LNoZQSejeQGpwkr');
});
