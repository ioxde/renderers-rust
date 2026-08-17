import {
    bytesTypeNode,
    bytesValueNode,
    constantPdaSeedNode,
    constantPdaSeedNodeFromBytes,
    constantPdaSeedNodeFromString,
    constantValueNodeFromBytes,
    fixedSizeTypeNode,
    hiddenPrefixTypeNode,
    hiddenSuffixTypeNode,
    numberTypeNode,
    numberValueNode,
    postOffsetTypeNode,
    preOffsetTypeNode,
    programIdValueNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    sentinelTypeNode,
    sizePrefixTypeNode,
    stringTypeNode,
    stringValueNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { getBase16Encoder, getBase58Encoder, getBase64Encoder, getUtf8Encoder } from '@solana/codecs-strings';
import { describe, expect, test } from 'vitest';

import { computePdaAddress, findProgramAddress } from '../../src/utils/computePda';

const AMM_PROGRAM = '675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8';
const LAN_PROGRAM = 'LanMV9sAd7wArD4vJFi2qDdfnVhFxYSUg6eADduJ3uj';
const TOKEN_PROGRAM = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';

function base58(value: string): Uint8Array {
    return getBase58Encoder().encode(value) as Uint8Array;
}

function utf8(value: string): Uint8Array {
    return getUtf8Encoder().encode(value) as Uint8Array;
}

/** Derives from explicit seed bytes, so each expectation states the bytes it assumes. */
function deriveAddress(seedBytes: Uint8Array[], programAddress: string): string {
    const result = findProgramAddress(seedBytes, base58(programAddress));
    if (!result) throw new Error('Expected the seeds to derive a valid PDA');
    return result.address;
}

function u32Bytes(value: number, littleEndian: boolean): Uint8Array {
    const bytes = new Uint8Array(4);
    new DataView(bytes.buffer).setUint32(0, value, littleEndian);
    return bytes;
}

describe('golden values', () => {
    test('it derives the known amm authority PDA', () => {
        // Given the raydium AMM program and its well-known authority seed.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'amm authority')];

        // When we compute the address at generation time.
        const address = computePdaAddress(seeds, AMM_PROGRAM);

        // Then we get the published authority address and bump.
        expect(address).toBe('5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1');
        expect(findProgramAddress([utf8('amm authority')], base58(AMM_PROGRAM))).toEqual({
            address: '5Q544fKrFoe6tsEbD7S8EmxGTJYAKtTVhAW5Q5pge4j1',
            bump: 254,
        });
    });

    test('it derives a known PDA from the maximum of fifteen seeds', () => {
        // Given fifteen single-byte seeds, the most `find_program_address` allows.
        const seeds = Array.from({ length: 15 }, () => constantPdaSeedNodeFromString('utf8', 'x'));

        // When we compute the address at generation time.
        const address = computePdaAddress(seeds, LAN_PROGRAM);

        // Then we get the expected address and bump.
        expect(address).toBe('BJPeChFSL6WVp6pZC5ikmfznPSDPQRzyszD6TWNQxLmR');
        expect(
            findProgramAddress(
                Array.from({ length: 15 }, () => utf8('x')),
                base58(LAN_PROGRAM),
            ),
        ).toEqual({
            address: 'BJPeChFSL6WVp6pZC5ikmfznPSDPQRzyszD6TWNQxLmR',
            bump: 251,
        });
    });
});

describe('supported constant seeds', () => {
    test('it computes an address from a utf8 string seed', () => {
        // Given a bare utf8 string seed.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'config')];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it matches the derivation from the raw utf8 bytes.
        expect(address).toBe(deriveAddress([utf8('config')], TOKEN_PROGRAM));
    });

    test('it computes an address from a base58 bytes seed', () => {
        // Given a bare bytes seed encoded as base58.
        const seeds = [constantPdaSeedNodeFromBytes('base58', 'F9bS')];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the bytes are base58-decoded before hashing.
        expect(address).toBe(deriveAddress([base58('F9bS')], TOKEN_PROGRAM));
    });

    test('it computes an address from a number seed', () => {
        // Given a bare u64 number seed.
        const seeds = [constantPdaSeedNode(numberTypeNode('u64'), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the number is serialized as little-endian bytes.
        const bytes = new Uint8Array(8);
        new DataView(bytes.buffer).setBigUint64(0, 1n, true);
        expect(address).toBe(deriveAddress([bytes], TOKEN_PROGRAM));
    });

    test('it computes an address from a public key seed', () => {
        // Given a bare public key seed.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode(AMM_PROGRAM))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the key is base58-decoded to its 32 bytes.
        expect(address).toBe(deriveAddress([base58(AMM_PROGRAM)], TOKEN_PROGRAM));
    });

    test('it computes an address from a program id seed', () => {
        // Given a seed standing for the deriving program itself.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), programIdValueNode())];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the program address is used as the seed bytes.
        expect(address).toBe(deriveAddress([base58(TOKEN_PROGRAM)], TOKEN_PROGRAM));
    });

    test('it returns null when any seed is variable', () => {
        // Given a PDA with a runtime-provided seed.
        const seeds = [
            constantPdaSeedNodeFromString('utf8', 'metadata'),
            variablePdaSeedNode('mint', publicKeyTypeNode()),
        ];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then nothing can be folded at generation time.
        expect(address).toBeNull();
    });

    test('it computes an address from no seeds at all', () => {
        // Given a PDA with an empty seed list, which the runtime derives from happily.
        // When we compute the address.
        const address = computePdaAddress([], TOKEN_PROGRAM);

        // Then it folds like any other constant PDA: no guard may reject what Solana itself accepts.
        expect(address).toBe(deriveAddress([], TOKEN_PROGRAM));
    });
});

describe('guard: seed count', () => {
    test('it returns null when there are more than fifteen seeds', () => {
        // Given sixteen caller seeds, one too many once the bump seed is appended.
        const seeds = Array.from({ length: 16 }, () => constantPdaSeedNodeFromString('utf8', 'x'));

        // When we compute the address.
        const address = computePdaAddress(seeds, LAN_PROGRAM);

        // Then we refuse rather than emit an address the runtime would reject.
        expect(address).toBeNull();
    });

    test('it returns null well past the seed limit', () => {
        // Given far more seeds than the runtime accepts.
        const seeds = Array.from({ length: 32 }, () => constantPdaSeedNodeFromString('utf8', 'x'));

        // When we compute the address.
        const address = computePdaAddress(seeds, LAN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('guard: program address length', () => {
    test('it returns null when the program address decodes to too few bytes', () => {
        // Given a program address that is not a 32-byte key.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'config')];

        // When we compute the address.
        const address = computePdaAddress(seeds, 'abc');

        // Then we refuse instead of hashing a short program id.
        expect(address).toBeNull();
    });

    test('it returns null for an all-zero placeholder program address', () => {
        // Given the `1111` placeholder used by some fixtures, which decodes to four zero bytes.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'config')];

        // When we compute the address.
        const address = computePdaAddress(seeds, '1111');

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null when the program address decodes to more than 32 bytes', () => {
        // Given an over-long base58 string that still decodes cleanly.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'config')];

        // When we compute the address.
        const address = computePdaAddress(seeds, 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DAxx');

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null when the program address is not valid base58', () => {
        // Given a program address containing characters outside the base58 alphabet.
        const seeds = [constantPdaSeedNodeFromString('utf8', 'config')];

        // When we compute the address.
        const address = computePdaAddress(seeds, 'not-a-valid-address!');

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('guard: per-seed length', () => {
    test('it computes an address for a seed of exactly 32 bytes', () => {
        // Given a seed at the runtime maximum length.
        const seed = 'a'.repeat(32);

        // When we compute the address.
        const address = computePdaAddress([constantPdaSeedNodeFromString('utf8', seed)], TOKEN_PROGRAM);

        // Then it is still folded.
        expect(address).toBe(deriveAddress([utf8(seed)], TOKEN_PROGRAM));
    });

    test('it returns null when a string seed exceeds 32 bytes', () => {
        // Given a 40-byte utf8 seed.
        const seed = 'a'.repeat(40);

        // When we compute the address.
        const address = computePdaAddress([constantPdaSeedNodeFromString('utf8', seed)], TOKEN_PROGRAM);

        // Then we refuse rather than emit an address `create_program_address` would reject.
        expect(address).toBeNull();
    });

    test('it returns null when a bytes seed exceeds 32 bytes', () => {
        // Given a 33-byte base16 seed.
        const seeds = [constantPdaSeedNodeFromBytes('base16', 'ff'.repeat(33))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('guard: number range', () => {
    test('it computes an address for the lower u8 bound', () => {
        // Given a u8 seed at its minimum.
        const seeds = [constantPdaSeedNode(numberTypeNode('u8'), numberValueNode(0))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it is folded.
        expect(address).toBe(deriveAddress([Uint8Array.from([0])], TOKEN_PROGRAM));
    });

    test('it computes an address for the upper u8 bound', () => {
        // Given a u8 seed at its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('u8'), numberValueNode(255))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it is folded.
        expect(address).toBe(deriveAddress([Uint8Array.from([255])], TOKEN_PROGRAM));
    });

    test('it computes an address for the lower i8 bound', () => {
        // Given an i8 seed at its minimum.
        const seeds = [constantPdaSeedNode(numberTypeNode('i8'), numberValueNode(-128))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it is folded.
        expect(address).toBe(deriveAddress([Uint8Array.from([0x80])], TOKEN_PROGRAM));
    });

    test('it computes an address for the upper i8 bound', () => {
        // Given an i8 seed at its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('i8'), numberValueNode(127))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it is folded.
        expect(address).toBe(deriveAddress([Uint8Array.from([127])], TOKEN_PROGRAM));
    });

    test('it returns null for a u8 seed above the format range', () => {
        // Given a u8 seed whose value does not fit in one byte.
        const seeds = [constantPdaSeedNode(numberTypeNode('u8'), numberValueNode(300))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse rather than silently masking 300 down to 44.
        expect(address).toBeNull();
        expect(address).not.toBe(
            computePdaAddress([constantPdaSeedNode(numberTypeNode('u8'), numberValueNode(44))], TOKEN_PROGRAM),
        );
    });

    test('it returns null for a negative u8 seed', () => {
        // Given a u8 seed with a negative value.
        const seeds = [constantPdaSeedNode(numberTypeNode('u8'), numberValueNode(-1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for an i8 seed above the format range', () => {
        // Given an i8 seed one past its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('i8'), numberValueNode(128))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse rather than wrapping to -128.
        expect(address).toBeNull();
    });

    test('it returns null for an i8 seed below the format range', () => {
        // Given an i8 seed one below its minimum.
        const seeds = [constantPdaSeedNode(numberTypeNode('i8'), numberValueNode(-129))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a u16 seed above the format range', () => {
        // Given a u16 seed one past its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('u16'), numberValueNode(65536))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a u32 seed above the format range', () => {
        // Given a u32 seed one past its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('u32'), numberValueNode(4294967296))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a negative u64 seed', () => {
        // Given a u64 seed with a negative value.
        const seeds = [constantPdaSeedNode(numberTypeNode('u64'), numberValueNode(-1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse rather than wrapping to u64::MAX.
        expect(address).toBeNull();
    });

    test('it returns null for an i64 seed above the format range', () => {
        // Given an i64 seed one past its maximum.
        const seeds = [constantPdaSeedNode(numberTypeNode('i64'), numberValueNode(2 ** 63))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse rather than wrapping to i64::MIN.
        expect(address).toBeNull();
    });

    test('it returns null for a non-integer number seed', () => {
        // Given a u32 seed holding a fractional value.
        const seeds = [constantPdaSeedNode(numberTypeNode('u32'), numberValueNode(1.5))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse rather than truncating to 1.
        expect(address).toBeNull();
    });
});

describe('guard: bare type nodes', () => {
    test('it returns null for a fixed-size wrapped number seed', () => {
        // Given a number seed wrapped in a fixed size.
        const seeds = [constantPdaSeedNode(fixedSizeTypeNode(numberTypeNode('u64'), 8), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse instead of stripping the wrapper.
        expect(address).toBeNull();
    });

    test('it returns null for a fixed-size wrapped string seed', () => {
        // Given a string seed wrapped in a fixed size, which pads its bytes.
        const seeds = [constantPdaSeedNode(fixedSizeTypeNode(stringTypeNode('utf8'), 16), stringValueNode('config'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a size-prefixed string seed', () => {
        // Given a string seed whose encoding writes a length prefix.
        const seeds = [
            constantPdaSeedNode(
                sizePrefixTypeNode(stringTypeNode('utf8'), numberTypeNode('u32')),
                stringValueNode('config'),
            ),
        ];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a hidden-prefix wrapped seed', () => {
        // Given a seed whose encoding writes extra leading bytes.
        const seeds = [
            constantPdaSeedNode(
                hiddenPrefixTypeNode(numberTypeNode('u8'), [constantValueNodeFromBytes('base16', 'ff')]),
                numberValueNode(1),
            ),
        ];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a hidden-suffix wrapped seed', () => {
        // Given a seed whose encoding writes extra trailing bytes.
        const seeds = [
            constantPdaSeedNode(
                hiddenSuffixTypeNode(numberTypeNode('u8'), [constantValueNodeFromBytes('base16', 'ff')]),
                numberValueNode(1),
            ),
        ];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a pre-offset wrapped seed', () => {
        // Given a seed whose encoding moves the cursor before writing.
        const seeds = [constantPdaSeedNode(preOffsetTypeNode(numberTypeNode('u8'), 4), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a post-offset wrapped seed', () => {
        // Given a seed whose encoding moves the cursor after writing.
        const seeds = [constantPdaSeedNode(postOffsetTypeNode(numberTypeNode('u8'), 4), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a sentinel wrapped seed', () => {
        // Given a seed whose encoding appends a sentinel.
        const seeds = [
            constantPdaSeedNode(
                sentinelTypeNode(stringTypeNode('utf8'), constantValueNodeFromBytes('base16', '00')),
                stringValueNode('config'),
            ),
        ];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('guard: value and type agreement', () => {
    test('it returns null for a string value on a non-string type', () => {
        // Given a string value declared as a number.
        const seeds = [constantPdaSeedNode(numberTypeNode('u64'), stringValueNode('config'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse instead of trusting the value alone.
        expect(address).toBeNull();
    });

    test('it returns null for a number value on a non-number type', () => {
        // Given a number value declared as a string.
        const seeds = [constantPdaSeedNode(stringTypeNode('utf8'), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a bytes value on a non-bytes type', () => {
        // Given a bytes value declared as a public key.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), bytesValueNode('base16', 'deadbeef'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a public key value on a non-public-key type', () => {
        // Given a public key value declared as raw bytes.
        const seeds = [constantPdaSeedNode(bytesTypeNode(), publicKeyValueNode(AMM_PROGRAM))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null for a program id value on a non-public-key type', () => {
        // Given a program id value declared as raw bytes.
        const seeds = [constantPdaSeedNode(bytesTypeNode(), programIdValueNode())];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('guard: string encodings', () => {
    test('it decodes a base58 string seed to its bytes', () => {
        // Given a bare string seed declared with a base58 encoding.
        const seeds = [constantPdaSeedNode(stringTypeNode('base58'), stringValueNode('F9bS'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the seed hashes as its decoded bytes, not as raw utf8.
        expect(address).toBe(deriveAddress([base58('F9bS')], TOKEN_PROGRAM));
        expect(address).not.toBe(deriveAddress([utf8('F9bS')], TOKEN_PROGRAM));
    });

    test('it decodes a base16 string seed to its bytes', () => {
        // Given a bare string seed declared with a base16 encoding.
        const seeds = [constantPdaSeedNode(stringTypeNode('base16'), stringValueNode('deadbeef'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the seed hashes as its four decoded bytes.
        expect(address).toBe(deriveAddress([getBase16Encoder().encode('deadbeef') as Uint8Array], TOKEN_PROGRAM));
        expect(address).not.toBe(deriveAddress([utf8('deadbeef')], TOKEN_PROGRAM));
    });

    test('it decodes a base64 string seed to its bytes', () => {
        // Given a bare string seed declared with a base64 encoding.
        const seeds = [constantPdaSeedNode(stringTypeNode('base64'), stringValueNode('3q2+7w=='))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then the seed hashes as its decoded bytes.
        expect(address).toBe(deriveAddress([getBase64Encoder().encode('3q2+7w==') as Uint8Array], TOKEN_PROGRAM));
        expect(address).not.toBe(deriveAddress([utf8('3q2+7w==')], TOKEN_PROGRAM));
    });
});

describe('guard: public key seeds', () => {
    test('it returns null when a public key seed is too short', () => {
        // Given a public key seed that does not decode to 32 bytes.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode('abc'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null when a public key seed is too long', () => {
        // Given a public key seed that decodes to more than 32 bytes.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode(`${TOKEN_PROGRAM}xx`))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });

    test('it returns null when a public key seed is not valid base58', () => {
        // Given a public key seed outside the base58 alphabet.
        const seeds = [constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode('not-a-key!'))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then we refuse.
        expect(address).toBeNull();
    });
});

describe('endianness convention', () => {
    test('it serializes little-endian number seeds as little-endian bytes', () => {
        // Given an explicitly little-endian u32 seed.
        const seeds = [constantPdaSeedNode(numberTypeNode('u32', 'le'), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it matches the derivation from little-endian bytes.
        expect(address).toBe(deriveAddress([u32Bytes(1, true)], TOKEN_PROGRAM));
    });

    test('it serializes big-endian number seeds as big-endian bytes', () => {
        // Given an explicitly big-endian u32 seed.
        const seeds = [constantPdaSeedNode(numberTypeNode('u32', 'be'), numberValueNode(1))];

        // When we compute the address.
        const address = computePdaAddress(seeds, TOKEN_PROGRAM);

        // Then it matches the derivation from big-endian bytes.
        expect(address).toBe(deriveAddress([u32Bytes(1, false)], TOKEN_PROGRAM));
    });

    test('it distinguishes little-endian from big-endian number seeds', () => {
        // Given the same value declared with each byte order.
        const little = computePdaAddress(
            [constantPdaSeedNode(numberTypeNode('u32', 'le'), numberValueNode(1))],
            TOKEN_PROGRAM,
        );
        const big = computePdaAddress(
            [constantPdaSeedNode(numberTypeNode('u32', 'be'), numberValueNode(1))],
            TOKEN_PROGRAM,
        );

        // Then the two derive different addresses.
        expect(little).not.toBeNull();
        expect(big).not.toBeNull();
        expect(little).not.toBe(big);
    });
});
