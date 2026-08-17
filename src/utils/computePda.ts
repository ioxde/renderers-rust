import { createHash } from 'node:crypto';

import { type ConstantPdaSeedNode, isNode, type PdaSeedNode } from '@codama/nodes';
import { ed25519 } from '@noble/curves/ed25519.js';
import {
    getBase16Decoder,
    getBase16Encoder,
    getBase58Decoder,
    getBase58Encoder,
    getBase64Decoder,
    getBase64Encoder,
} from '@solana/codecs-strings';

const ADDRESS_BYTES = 32;

/** `create_program_address` rejects a longer seed. */
const MAX_SEED_LENGTH = 32;

/** A derivation takes at most 16 seeds, and `find_program_address` spends the last one on the bump. */
const MAX_SEEDS_WITH_BUMP = 15;

function isOnCurve(bytes: Uint8Array): boolean {
    return ed25519.utils.isValidPublicKey(bytes);
}

/**
 * Mirrors Solana's `Pubkey::find_program_address`.
 * Returns the base58 address and bump, or `null` if no valid bump exists.
 */
export function findProgramAddress(
    seeds: Uint8Array[],
    programId: Uint8Array,
): { address: string; bump: number } | null {
    for (let bump = 255; bump >= 0; bump--) {
        const hash = createHash('sha256');
        for (const seed of seeds) {
            hash.update(seed);
        }
        hash.update(Uint8Array.from([bump]));
        hash.update(programId);
        hash.update(Buffer.from('ProgramDerivedAddress'));
        const candidate = hash.digest();

        if (!isOnCurve(candidate)) {
            return {
                address: getBase58Decoder().decode(candidate),
                bump,
            };
        }
    }
    return null;
}

/**
 * The bytes a constant PDA seed hashes as, or the reason this renderer cannot produce them.
 * `reason` is a sentence fragment meant to be embedded in a generation-time error.
 */
export type ConstantSeedBytes = Readonly<{ bytes: Uint8Array; ok: true }> | Readonly<{ ok: false; reason: string }>;

/** Inclusive bounds. Out of range means the program encodes different bytes, so refuse rather than guess. */
const INTEGER_RANGES: Record<string, readonly [bigint, bigint]> = {
    i128: [-(2n ** 127n), 2n ** 127n - 1n],
    i16: [-32768n, 32767n],
    i32: [-2147483648n, 2147483647n],
    i64: [-(2n ** 63n), 2n ** 63n - 1n],
    i8: [-128n, 127n],
    u128: [0n, 2n ** 128n - 1n],
    u16: [0n, 65535n],
    u32: [0n, 4294967295n],
    u64: [0n, 2n ** 64n - 1n],
    u8: [0n, 255n],
};

/**
 * Whether a Rust decimal literal such as `42u64` re-serialises to exactly the bytes
 * {@link getConstantPdaSeedBytes} produces for `format`.
 */
export function isIntegerNumberFormat(format: string): boolean {
    return format in INTEGER_RANGES;
}

function serializeNumber(value: number, format: string, endian: 'be' | 'le'): Uint8Array | null {
    // Mirrors the `to_le_bytes`/`to_be_bytes` dispatch the templates emit; flipping it byte-swaps every seed.
    const isLE = endian === 'le';

    const range = INTEGER_RANGES[format];
    if (range) {
        if (!Number.isInteger(value)) return null;
        const big = BigInt(value);
        if (big < range[0] || big > range[1]) return null;
    }

    switch (format) {
        case 'u8':
            return Uint8Array.from([value]);
        case 'i8': {
            const buf = new ArrayBuffer(1);
            new DataView(buf).setInt8(0, value);
            return new Uint8Array(buf);
        }
        case 'u16': {
            const buf = new ArrayBuffer(2);
            new DataView(buf).setUint16(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'i16': {
            const buf = new ArrayBuffer(2);
            new DataView(buf).setInt16(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'u32': {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setUint32(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'i32': {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setInt32(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'f32': {
            const buf = new ArrayBuffer(4);
            new DataView(buf).setFloat32(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'f64': {
            const buf = new ArrayBuffer(8);
            new DataView(buf).setFloat64(0, value, isLE);
            return new Uint8Array(buf);
        }
        case 'u64':
        case 'i64': {
            const buf = new ArrayBuffer(8);
            const view = new DataView(buf);
            if (format === 'u64') view.setBigUint64(0, BigInt(value), isLE);
            else view.setBigInt64(0, BigInt(value), isLE);
            return new Uint8Array(buf);
        }
        case 'u128':
        case 'i128': {
            const bytes = new Uint8Array(16);
            const view = new DataView(bytes.buffer);
            const big = BigInt(value);
            const mask = (1n << 64n) - 1n;
            const lo = big & mask;
            const hi = (big >> 64n) & mask;
            if (isLE) {
                view.setBigUint64(0, lo, true);
                view.setBigUint64(8, hi, true);
            } else {
                view.setBigUint64(0, hi, false);
                view.setBigUint64(8, lo, false);
            }
            return bytes;
        }
        default:
            return null;
    }
}

/** Codecs throw on characters outside their alphabet; a malformed seed is unencodable, not fatal here. */
function attempt<T>(operation: () => T): T | null {
    try {
        return operation();
    } catch {
        return null;
    }
}

type SeedTextCodec = {
    decode: (text: string) => Uint8Array;
    encode: (bytes: Uint8Array) => string;
    /** Spelling differences that carry no bytes, so they must not count as a failed round-trip. */
    normalise: (text: string) => string;
};

const SEED_TEXT_CODECS: Record<string, SeedTextCodec> = {
    base16: {
        decode: text => getBase16Encoder().encode(text) as Uint8Array,
        encode: bytes => getBase16Decoder().decode(bytes),
        // Hex is case-insensitive, so only the casing may come back different.
        normalise: text => text.toLowerCase(),
    },
    base58: {
        decode: text => getBase58Encoder().encode(text) as Uint8Array,
        encode: bytes => getBase58Decoder().decode(bytes),
        normalise: text => text,
    },
    base64: {
        decode: text => getBase64Encoder().encode(text) as Uint8Array,
        encode: bytes => getBase64Decoder().decode(bytes),
        // `=` padding is optional and encodes nothing.
        normalise: text => text.replace(/=+$/, ''),
    },
    utf8: {
        decode: text => new TextEncoder().encode(text),
        encode: bytes => new TextDecoder().decode(bytes),
        normalise: text => text,
    },
};

/**
 * `@solana/codecs-strings` only rejects characters outside the alphabet: it silently pads odd-length
 * base16 (`'abc'` becomes `[0xab, 0x00]`) and truncates incomplete base64 (`'AB'` becomes `[0x00]`).
 * The round-trip is what catches a codec that invented or dropped bytes instead of refusing.
 */
function encodeSeedText(value: string, encoding: string): Uint8Array | null {
    const codec = SEED_TEXT_CODECS[encoding];
    if (!codec) return null;
    const bytes = attempt(() => codec.decode(value));
    if (!bytes) return null;
    const roundTrip = attempt(() => codec.encode(bytes));
    if (roundTrip === null) return null;
    return codec.normalise(roundTrip) === codec.normalise(value) ? bytes : null;
}

/** Hashing a wrong-length decode bakes a plausible constant for an address that cannot exist. */
function decodeAddress(address: string): Uint8Array | null {
    const bytes = encodeSeedText(address, 'base58');
    return bytes && bytes.length === ADDRESS_BYTES ? bytes : null;
}

function unencodable(reason: string): ConstantSeedBytes {
    return { ok: false, reason };
}

/**
 * Encodes a constant PDA seed to the bytes the program hashes: the single source for both the folded
 * `<PDA>_ADDRESS` and the `<PDA>_SEED` literal. `programAddress` is `null` where only the caller knows
 * the deriving program. Wrapped types fail — their bytes are not reproducible from the value alone.
 */
export function getConstantPdaSeedBytes(seed: ConstantPdaSeedNode, programAddress: string | null): ConstantSeedBytes {
    const { type, value } = seed;

    if (isNode(value, 'programIdValueNode')) {
        if (!isNode(type, 'publicKeyTypeNode')) {
            return unencodable(`a program id seed must be typed as \`publicKeyTypeNode\`, not \`${type.kind}\``);
        }
        if (programAddress === null) {
            return unencodable('the deriving program is only known at runtime');
        }
        const bytes = decodeAddress(programAddress);
        return bytes
            ? { bytes, ok: true }
            : unencodable(`the deriving program [${programAddress}] is not a 32-byte base58 address`);
    }

    if (isNode(value, 'publicKeyValueNode')) {
        if (!isNode(type, 'publicKeyTypeNode')) {
            return unencodable(
                `a \`publicKeyValueNode\` seed must be typed as \`publicKeyTypeNode\`, not \`${type.kind}\``,
            );
        }
        const bytes = decodeAddress(value.publicKey);
        return bytes ? { bytes, ok: true } : unencodable(`[${value.publicKey}] is not a 32-byte base58 address`);
    }

    if (isNode(value, 'bytesValueNode')) {
        if (!isNode(type, 'bytesTypeNode')) {
            return unencodable(`a \`bytesValueNode\` seed must be typed as \`bytesTypeNode\`, not \`${type.kind}\``);
        }
        const bytes = encodeSeedText(value.data, value.encoding);
        return bytes ? { bytes, ok: true } : unencodable(`[${value.data}] is not well-formed ${value.encoding}`);
    }

    if (isNode(value, 'stringValueNode')) {
        if (!isNode(type, 'stringTypeNode')) {
            return unencodable(`a \`stringValueNode\` seed must be typed as \`stringTypeNode\`, not \`${type.kind}\``);
        }
        const bytes = encodeSeedText(value.string, type.encoding);
        return bytes ? { bytes, ok: true } : unencodable(`[${value.string}] is not well-formed ${type.encoding}`);
    }

    if (isNode(value, 'numberValueNode')) {
        if (!isNode(type, 'numberTypeNode')) {
            return unencodable(`a \`numberValueNode\` seed must be typed as \`numberTypeNode\`, not \`${type.kind}\``);
        }
        const bytes = serializeNumber(value.number, type.format, type.endian);
        return bytes ? { bytes, ok: true } : unencodable(`[${value.number}] is not a ${type.format} this can encode`);
    }

    return unencodable(`\`${value.kind}\` values are not supported as constant seeds`);
}

/**
 * Derives the address and bump at codegen time for PDAs with only constant seeds.
 * `null` also covers seeds that encode fine but exceed what the runtime derives from (more than 15,
 * or one over 32 bytes), so it is not an error: callers still render helpers, minus the constants.
 *
 * @param seeds - The PDA's seeds; a single variable seed makes the derivation caller-dependent.
 * @param programAddress - The base58 program the PDA derives under.
 * @return The folded `{ address, bump }`, or `null` when nothing can be folded.
 *
 * @example
 * ```ts
 * computePdaDerivation([constantPdaSeedNodeFromString('utf8', 'vault_auth_seed')], programAddress);
 * // { address: 'WLHv2UAZm6z4KyaaELi5pjdbJh6RESMva1Rnn8pJVVh', bump: 250 }
 * ```
 *
 * @see {@link computePdaAddress}
 */
export function computePdaDerivation(
    seeds: readonly PdaSeedNode[],
    programAddress: string,
): { address: string; bump: number } | null {
    if (seeds.length > MAX_SEEDS_WITH_BUMP) return null;

    const programId = decodeAddress(programAddress);
    if (!programId) return null;

    const seedBytes: Uint8Array[] = [];
    for (const seed of seeds) {
        if (!isNode(seed, 'constantPdaSeedNode')) return null;
        const encoded = getConstantPdaSeedBytes(seed, programAddress);
        if (!encoded.ok || encoded.bytes.length > MAX_SEED_LENGTH) return null;
        seedBytes.push(encoded.bytes);
    }

    return findProgramAddress(seedBytes, programId);
}

/**
 * The address half of {@link computePdaDerivation}, for callers that fold the address alone.
 *
 * @param seeds - The PDA's seeds; a single variable seed makes the derivation caller-dependent.
 * @param programAddress - The base58 program the PDA derives under.
 * @return The folded base58 address, or `null` when nothing can be folded.
 */
export function computePdaAddress(seeds: readonly PdaSeedNode[], programAddress: string): string | null {
    return computePdaDerivation(seeds, programAddress)?.address ?? null;
}
