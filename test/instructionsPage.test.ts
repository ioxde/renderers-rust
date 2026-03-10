import { instructionArgumentNode, instructionNode, programNode, stringTypeNode } from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { codeContains } from './_setup';

test('it renders a public instruction data struct', () => {
    // Given the following program with 1 instruction.
    const node = programNode({
        instructions: [instructionNode({ name: 'mintTokens' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following pub struct.
    codeContains(getFromRenderMap(renderMap, 'instructions/mint_tokens.rs').content, [
        `pub struct MintTokensInstructionData`,
        `pub fn new(`,
    ]);
});

test('it renders an instruction with a remainder str', () => {
    // Given the following program with 1 instruction.
    const node = programNode({
        instructions: [
            instructionNode({
                arguments: [
                    instructionArgumentNode({
                        name: 'memo',
                        type: stringTypeNode('utf8'),
                    }),
                ],
                name: 'addMemo',
            }),
        ],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following pub struct.
    codeContains(getFromRenderMap(renderMap, 'instructions/add_memo.rs').content, [
        `use spl_collections::TrailingStr`,
        `pub memo: TrailingStr`,
    ]);
});

test('it renders a default impl for instruction data struct', () => {
    // Given the following program with 1 instruction.
    const node = programNode({
        instructions: [instructionNode({ name: 'mintTokens' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then we expect the following Default trait to be implemented.
    codeContains(getFromRenderMap(renderMap, 'instructions/mint_tokens.rs').content, [
        `impl Default for MintTokensInstructionData`,
        `fn default(`,
    ]);
});
