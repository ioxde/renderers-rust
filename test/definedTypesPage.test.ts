import {
    definedTypeNode,
    enumEmptyVariantTypeNode,
    enumStructVariantTypeNode,
    enumTupleVariantTypeNode,
    enumTypeNode,
    numberTypeNode,
    programNode,
    sizePrefixTypeNode,
    stringTypeNode,
    structFieldTypeNode,
    structTypeNode,
    tupleTypeNode,
} from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { expect, test, vi } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { codeContains, codeDoesNotContains } from './_setup';

test('it renders a prefix string on a defined type', () => {
    // Given the following program with 1 defined type using a prefixed size string.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'blob',
                type: structTypeNode([
                    structFieldTypeNode({
                        name: 'contentType',
                        type: sizePrefixTypeNode(stringTypeNode('utf8'), numberTypeNode('u8')),
                    }),
                ]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following use and identifier to be rendered.
    codeContains(getFromRenderMap(renderMap, 'types/blob.rs').content, [
        `use spl_collections::U8PrefixedStr;`,
        `content_type: U8PrefixedStr,`,
    ]);
});

test('it renders a scalar enum with Copy derive', () => {
    // Given the following program with 1 defined type using a prefixed size string.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'tag',
                type: enumTypeNode([enumEmptyVariantTypeNode('Uninitialized'), enumEmptyVariantTypeNode('Account')]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following use and identifier to be rendered.
    codeContains(getFromRenderMap(renderMap, 'types/tag.rs').content, [`#[derive(`, `Copy`, `pub enum Tag`]);
});

test('it renders a non-scalar enum without Copy derive', () => {
    // Given the following program with 1 defined type using a prefixed size string.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'tagWithStruct',
                type: enumTypeNode([
                    enumEmptyVariantTypeNode('Uninitialized'),
                    enumStructVariantTypeNode(
                        'Account',
                        structTypeNode([
                            structFieldTypeNode({
                                name: 'contentType',
                                type: sizePrefixTypeNode(stringTypeNode('utf8'), numberTypeNode('u8')),
                            }),
                        ]),
                    ),
                ]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following use and identifier to be rendered.
    codeContains(getFromRenderMap(renderMap, 'types/tag_with_struct.rs').content, [
        `#[derive(`,
        `pub enum TagWithStruct`,
    ]);
    // And we expect the Copy derive to be missing.
    codeDoesNotContains(getFromRenderMap(renderMap, 'types/tag_with_struct.rs').content, `Copy`);
});

test('it renders an enum without explicit discriminators using positional variants', () => {
    // Given the following program with 1 enum whose variants carry no explicit discriminator.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'tag',
                type: enumTypeNode([enumEmptyVariantTypeNode('Uninitialized'), enumEmptyVariantTypeNode('Account')]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the variants to be rendered without any discriminant.
    codeContains(getFromRenderMap(renderMap, 'types/tag.rs').content, [`pub enum Tag {\nUninitialized,\nAccount,\n}`]);
    // And we expect no discriminant-related attribute to be rendered.
    codeDoesNotContains(getFromRenderMap(renderMap, 'types/tag.rs').content, [`use_discriminant`, `#[repr(`]);
});

test('it renders explicit discriminants on every variant of a scalar enum', () => {
    // Given the following program with 1 scalar enum using explicit discriminators.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'status',
                type: enumTypeNode([
                    enumEmptyVariantTypeNode('idle'),
                    enumEmptyVariantTypeNode('active', 5),
                    enumEmptyVariantTypeNode('closed', 9),
                ]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect every variant to carry a discriminant, alongside the borsh attribute.
    codeContains(getFromRenderMap(renderMap, 'types/status.rs').content, [
        `#[borsh(use_discriminant = true)]\npub enum Status {\nIdle = 0,\nActive = 5,\nClosed = 9,\n}`,
    ]);
    // And we expect no repr attribute since all variants are unit variants.
    codeDoesNotContains(getFromRenderMap(renderMap, 'types/status.rs').content, `#[repr(`);
});

test('it falls back to the variant position for variants without an explicit discriminator', () => {
    // Given the following program with 1 enum mixing explicit and omitted discriminators.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'status',
                type: enumTypeNode([
                    enumEmptyVariantTypeNode('idle'),
                    enumEmptyVariantTypeNode('active', 5),
                    enumEmptyVariantTypeNode('closed'),
                ]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the last variant to use its position (2) rather than Rust's previous + 1 (6).
    codeContains(getFromRenderMap(renderMap, 'types/status.rs').content, [
        `#[borsh(use_discriminant = true)]\npub enum Status {\nIdle = 0,\nActive = 5,\nClosed = 2,\n}`,
    ]);
});

test('it renders a repr attribute when a discriminated enum has non-unit variants', () => {
    // Given the following program with 1 data enum using explicit discriminators.
    const node = programNode({
        definedTypes: [
            definedTypeNode({
                name: 'mixed',
                type: enumTypeNode([
                    enumEmptyVariantTypeNode('idle', 3),
                    enumTupleVariantTypeNode('amount', tupleTypeNode([numberTypeNode('u8')]), 7),
                    enumStructVariantTypeNode(
                        'details',
                        structTypeNode([structFieldTypeNode({ name: 'x', type: numberTypeNode('u16') })]),
                        11,
                    ),
                ]),
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect a repr attribute, since Rust requires one for non-unit variants (E0732).
    codeContains(getFromRenderMap(renderMap, 'types/mixed.rs').content, [
        `#[repr(u8)]\n#[borsh(use_discriminant = true)]\npub enum Mixed {\nIdle = 3,\nAmount(u8) = 7,\nDetails {\nx: u16,\n} = 11,\n}`,
    ]);
});

test('it warns when an enum declares a size that Borsh cannot represent', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        // Given the following program with 1 enum declaring a u32 size.
        const node = programNode({
            definedTypes: [
                definedTypeNode({
                    name: 'wide',
                    type: enumTypeNode([enumEmptyVariantTypeNode('idle')], { size: numberTypeNode('u32') }),
                }),
            ],
            name: 'splToken',
            publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
        });

        // When we render it.
        const renderMap = visit(node, getRenderMapVisitor());

        // Then we expect a warning explaining that Borsh always uses a one-byte discriminator.
        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toMatch(/Enum \[Wide\] declares a 'u32' size but Borsh always encodes/);

        // And we expect the enum to still render.
        codeContains(getFromRenderMap(renderMap, 'types/wide.rs').content, [`pub enum Wide {\nIdle,\n}`]);
    } finally {
        warnSpy.mockRestore();
    }
});
