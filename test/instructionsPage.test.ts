import {
    accountValueNode,
    argumentValueNode,
    bytesTypeNode,
    bytesValueNode,
    conditionalValueNode,
    constantPdaSeedNode,
    constantPdaSeedNodeFromString,
    instructionAccountNode,
    instructionArgumentNode,
    instructionByteDeltaNode,
    type InstructionNode,
    instructionNode,
    instructionRemainingAccountsNode,
    numberTypeNode,
    numberValueNode,
    pdaLinkNode,
    type PdaNode,
    pdaNode,
    pdaSeedValueNode,
    pdaValueNode,
    programIdValueNode,
    programLinkNode,
    programNode,
    publicKeyTypeNode,
    publicKeyValueNode,
    resolverValueNode,
    rootNode,
    snakeCase,
    stringTypeNode,
    variablePdaSeedNode,
} from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { getCommonInstructionAccountDefaultRules } from '@codama/visitors';
import { visit } from '@codama/visitors-core';
import { expect, test } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { codeContains, codeDoesNotContains } from './_setup';

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

test('it renders an instruction without accounts', () => {
    // Given an instruction with no accounts, for which codama omits the `accounts` array entirely.
    const node = programNode({
        instructions: [instructionNode({ name: 'mintTokens' })],
        name: 'splToken',
        publicKey: 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());

    // Then the CPI account capacity still counts the program account only.
    const content = getFromRenderMap(renderMap, 'instructions/mint_tokens.rs').content;
    codeContains(content, [`Vec::with_capacity(1 + remaining_accounts.len())`]);
    codeDoesNotContains(content, ['NaN']);
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

test('it auto-derives PDA accounts from pdaLinkNode defaults', () => {
    // Given an instruction with a PDA-defaulted account.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'realm' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('realm', accountValueNode('realm')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then we expect the PDA to be auto-derived.
    codeContains(content, [
        `unwrap_or_else(|| {`,
        `crate::pdas::find_record_pda(`,
        `&self.realm,`,
        `&self.mint,`,
        `&self.owner,`,
        `.0`,
        `default to PDA derived from 'record'`,
    ]);
});

test('it passes argument seeds by value for non-Pubkey types', () => {
    // Given an instruction with a PDA that has a string argument seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('label', argumentValueNode('label')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'label', type: stringTypeNode('utf8') })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then we expect by-ref for the account seed (required, direct access)
    // and by-value for the argument seed (required, direct clone).
    codeContains(content, [`crate::pdas::find_record_pda(`, `&self.owner,`, `self.label.clone(),`]);
});

test('it resolves upstream account defaults as PDA seeds', () => {
    // Given an instruction where a PDA seed references an account with a publicKeyValueNode default.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'tokenProgram',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('ata'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('tokenProgram', accountValueNode('tokenProgram')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'ata',
                    }),
                ],
                name: 'createAta',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_ata.rs').content;

    // Then we expect the tokenProgram seed to use unwrap_or with its default.
    codeContains(content, [
        `crate::pdas::find_ata_pda(`,
        `&self.owner,`,
        `&self.token_program.unwrap_or(solana_address::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"))`,
        `&self.mint,`,
    ]);
});

test('it resolves programIdValueNode defaults as PDA seed defaults', () => {
    // Given a PDA seed that references an account with a programIdValueNode default.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: programIdValueNode(),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'programAddress',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('programAddress', accountValueNode('programAddress')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then the programAddress seed uses unwrap_or with the program ID constant.
    codeContains(content, [`&self.program_address.unwrap_or(crate::TEST_PROGRAM_ID)`]);
});

test('it passes Pubkey argument seeds by reference', () => {
    // Given an instruction with a PDA that has a Pubkey argument seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('delegate', argumentValueNode('delegate')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'delegate', type: publicKeyTypeNode() })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    constantPdaSeedNode(bytesTypeNode(), bytesValueNode('utf8', 'rec')),
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('delegate', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // owner is required (direct), delegate is a required arg (direct clone).
    codeContains(content, [`&self.owner,`, `&self.delegate.clone(),`]);
});

test('it handles argument/account name conflicts in PDA seeds', () => {
    // Given a non-Pubkey argument that conflicts with an account name.
    const stringConflict = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('label', argumentValueNode('owner')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'owner', type: stringTypeNode('utf8') })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const content1 = getFromRenderMap(
        visit(stringConflict, getRenderMapVisitor()),
        'instructions/create_record.rs',
    ).content;
    // owner is required (direct), owner_arg is a required arg (direct clone).
    codeContains(content1, [`&self.owner,`, `self.owner_arg.clone(),`]);

    // And a Pubkey argument that conflicts — should also get _arg suffix with by-ref.
    const pubkeyConflict = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'delegate' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('delegate')),
                            pdaSeedValueNode('delegate', argumentValueNode('delegate')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'delegate', type: publicKeyTypeNode() })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('delegate', publicKeyTypeNode()),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const content2 = getFromRenderMap(
        visit(pubkeyConflict, getRenderMapVisitor()),
        'instructions/create_record.rs',
    ).content;
    // delegate is required (direct), delegate_arg is a required arg (direct clone).
    codeContains(content2, [`&self.delegate,`, `&self.delegate_arg.clone(),`]);
});

test('it handles argument defaults in PDA seeds', () => {
    // Omitted arguments are inlined as their default value.
    const omittedArg = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('kind', argumentValueNode('kind')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(42),
                        defaultValueStrategy: 'omitted',
                        name: 'kind',
                        type: numberTypeNode('u32'),
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('kind', numberTypeNode('u32')),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const content1 = getFromRenderMap(
        visit(omittedArg, getRenderMapVisitor()),
        'instructions/create_record.rs',
    ).content;
    codeContains(content1, [`42`]);
    expect(content1).not.toContain('self.kind');

    // Non-omitted arguments still use expect (no silent defaulting for PDA seeds).
    const nonOmittedArg = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('version', argumentValueNode('version')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(1),
                        name: 'version',
                        type: numberTypeNode('u32'),
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('version', numberTypeNode('u32')),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const content2 = getFromRenderMap(
        visit(nonOmittedArg, getRenderMapVisitor()),
        'instructions/create_record.rs',
    ).content;
    codeContains(content2, [`self.version.clone().expect("version is needed for record PDA")`]);
});

test('it extracts Pubkey from either-signer tuple for PDA seeds', () => {
    // Given a PDA seed that references an isSigner: 'either' account.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        isOptional: false,
                        isSigner: 'either',
                        isWritable: false,
                        name: 'authority',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('authority', accountValueNode('authority')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // authority is required either-signer — direct .0 extraction, no expect.
    codeContains(content, [`&self.authority.0,`]);
});

test('it extracts Pubkey from either-signer tuple for inline pdaNode seeds', () => {
    // Given an inline pdaNode seed that references an isSigner: 'either' account.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        isOptional: false,
                        isSigner: 'either',
                        isWritable: false,
                        name: 'authority',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [variablePdaSeedNode('authority', publicKeyTypeNode())],
                            }),
                            [pdaSeedValueNode('authority', accountValueNode('authority'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then we expect the seed to extract the Pubkey from the (Pubkey, bool) tuple.
    // authority is a required constructor arg, so the field is (Pubkey, bool) directly.
    codeContains(content, [`self.authority.0.as_ref()`]);
});

test('it renders a builder that auto-derives inline pdaNode accounts', () => {
    // Given an instruction with an inline pdaNode default (constant + variable seeds).
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'guard',
                                seeds: [
                                    constantPdaSeedNode(bytesTypeNode(), bytesValueNode('utf8', 'my_seed')),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'guard',
                    }),
                ],
                name: 'createGuard',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_guard.rs').content;

    // Then the builder should generate inline find_program_address.
    codeContains(content, [
        `unwrap_or_else(|| {`,
        `solana_address::Address::find_program_address(`,
        // Constant seed rendered as byte array reference.
        /&\[109, 121, 95, 115, 101, 101, 100\]/,
        // Variable seed — mint is required, direct .as_ref().
        `self.mint.as_ref()`,
        // Uses default program ID.
        `&crate::TEST_PROGRAM_ID`,
        `.0`,
        `default to PDA derived from 'guard'`,
    ]);
});

test('it renders inline pdaNode with argumentValueNode variable seed using type dispatch', () => {
    // Given an instruction with an argument-valued variable seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    constantPdaSeedNode(bytesTypeNode(), bytesValueNode('utf8', 'rec')),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                                pdaSeedValueNode('label', argumentValueNode('label')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'label', type: stringTypeNode('utf8') })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then argument seeds use .to_string().as_ref() for string types (not bare .as_ref()).
    codeContains(content, [`self.mint.as_ref()`, `self.label.clone().to_string().as_ref()`]);
});

test('it renders numeric inline pdaNode seeds as little-endian bytes', () => {
    // Given a cross-program inline PDA whose variable seed is a u64 instruction argument.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'nonceRecord',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                    variablePdaSeedNode('nonce', numberTypeNode('u64')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                                pdaSeedValueNode('nonce', argumentValueNode('nonce')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'nonceRecord',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'nonce', type: numberTypeNode('u64') })],
                name: 'createNonceRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_nonce_record.rs').content;

    // Then the numeric seed is hashed as raw little-endian bytes, never as decimal ASCII.
    codeContains(content, [`&self.nonce.clone().to_le_bytes()`]);
    codeDoesNotContains(content, [`to_string().as_ref()`]);
});

test('it renders big-endian numeric inline pdaNode seeds with to_be_bytes', () => {
    // Given an inline PDA whose variable seed declares big-endian byte order.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'nonceRecord',
                                seeds: [
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                    variablePdaSeedNode('nonce', numberTypeNode('u64', 'be')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                                pdaSeedValueNode('nonce', argumentValueNode('nonce')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'nonceRecord',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'nonce', type: numberTypeNode('u64') })],
                name: 'createNonceRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_nonce_record.rs').content;

    // Then the seed uses the big-endian conversion.
    codeContains(content, [`&self.nonce.clone().to_be_bytes()`]);
    codeDoesNotContains(content, [`to_le_bytes()`]);
});

test('it keeps rendering string inline pdaNode seeds via to_string', () => {
    // Given an inline PDA mixing a string seed with a numeric one.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                                    variablePdaSeedNode('index', numberTypeNode('u32')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                                pdaSeedValueNode('label', argumentValueNode('label')),
                                pdaSeedValueNode('index', argumentValueNode('index')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({ name: 'label', type: stringTypeNode('utf8') }),
                    instructionArgumentNode({ name: 'index', type: numberTypeNode('u32') }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then only the numeric seed switches to byte conversion; strings keep the fallback.
    codeContains(content, [`self.label.clone().to_string().as_ref()`, `&self.index.clone().to_le_bytes()`]);
});

test('it renders omitted-default numeric seeds with an explicit integer type', () => {
    // Given an inline PDA whose numeric seed comes from an omitted-default argument.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                                    variablePdaSeedNode('kind', numberTypeNode('u32')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('owner', accountValueNode('owner')),
                                pdaSeedValueNode('kind', argumentValueNode('kind')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(42),
                        defaultValueStrategy: 'omitted',
                        name: 'kind',
                        type: numberTypeNode('u32'),
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then the inlined literal is pinned to the seed's format so Rust can infer it.
    codeContains(content, [`&(42 as u32).to_le_bytes()`]);
});

test('it throws when a program has no address', () => {
    // Given a program whose IDL carried no address (e.g. a legacy Anchor v0.x IDL).
    const node = programNode({
        instructions: [instructionNode({ name: 'mintTokens' })],
        name: 'splToken',
        publicKey: '',
    });

    // When we render it, then it fails loudly instead of emitting `address!("")`.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/Program \[splToken\] has no address/);
});

test('it renders inline pdaNode with custom programId', () => {
    // Given an instruction with an inline pdaNode that specifies a custom programId.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'ata',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [variablePdaSeedNode('mint', publicKeyTypeNode())],
                            }),
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'ata',
                    }),
                ],
                name: 'createAta',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_ata.rs').content;

    // Then the custom programId is used instead of the current program's ID.
    codeContains(content, [`&solana_address::address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")`]);
});

test('it resolves upstream account defaults when used as inline PDA seeds', () => {
    // Given an instruction where a PDA seed references an account with its own default.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'tokenProgram',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'ata',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [
                                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                                    variablePdaSeedNode('tokenProgram', publicKeyTypeNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [
                                pdaSeedValueNode('owner', accountValueNode('owner')),
                                pdaSeedValueNode('tokenProgram', accountValueNode('tokenProgram')),
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'ata',
                    }),
                ],
                name: 'createAta',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_ata.rs').content;

    // Then tokenProgram seed uses unwrap_or with its default instead of expect.
    codeContains(content, [
        `self.token_program.unwrap_or(solana_address::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA")).as_ref()`,
    ]);
    // And required accounts without defaults still use expect.
    codeContains(content, [`self.owner.as_ref()`, `self.mint.as_ref()`]);
});

test('it renders inline pdaNode with programIdValueNode constant seed', () => {
    // Given an instruction with a programIdValueNode as a constant seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    constantPdaSeedNode(bytesTypeNode(), programIdValueNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Then the programId is used as a constant seed.
    codeContains(content, [`crate::TEST_PROGRAM_ID.as_ref()`]);
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

test('it resolves cascading PDA defaults via let bindings', () => {
    // Given an instruction where vault (inline PDA) depends on pool (linked PDA).
    // Without let bindings, vault would read self.pool (still None) and panic.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('pool'), [
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'pool',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'vault',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [
                                pdaSeedValueNode('authority', accountValueNode('pool')),
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'vault',
                    }),
                ],
                name: 'swap',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'pool',
                seeds: [variablePdaSeedNode('mint', publicKeyTypeNode())],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/swap.rs').content;

    // Then pool is emitted as a let binding.
    codeContains(content, [`let pool = self.pool.unwrap_or_else(|| {`, `find_pool_pda(`]);
    // And vault is also a let binding that references the local `pool`, not self.pool.
    codeContains(content, [`let vault = self.vault.unwrap_or_else(|| {`, `pool.as_ref()`]);
    // And the struct literal uses shorthand field names.
    codeContains(content, [/Swap \{\s*mint,/]);
    // Verify vault does NOT read self.pool (which would panic).
    expect(content).not.toContain('self.pool.expect');
});

test('it topologically sorts PDA let bindings when dependency is declared after dependent', () => {
    // Given an instruction where vault (inline PDA) references authority (linked PDA),
    // but vault is declared BEFORE authority in the accounts list.
    // This mirrors the real-world claim_airdrop pattern.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    // vault comes first but depends on authority
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'vault',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [
                                pdaSeedValueNode('authority', accountValueNode('authority')),
                                pdaSeedValueNode('mint', accountValueNode('mint')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'vault',
                    }),
                    // authority comes second but is vault's dependency
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('authority'), []),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'authority',
                    }),
                ],
                name: 'claimAirdrop',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'authority', seeds: [] })],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/claim_airdrop.rs').content;

    // Then authority's let binding must appear BEFORE vault's let binding,
    // even though vault is declared first in the accounts list.
    const authorityPos = content.indexOf('let authority =');
    const vaultPos = content.indexOf('let vault =');
    expect(authorityPos).toBeGreaterThan(-1);
    expect(vaultPos).toBeGreaterThan(-1);
    expect(authorityPos).toBeLessThan(vaultPos);

    // And vault references the local `authority`, not self.authority.
    codeContains(content, [`authority.as_ref()`]);
    expect(content).not.toContain('self.authority.expect');
});

test('it handles argument/account name conflicts in inline pdaNode seeds', () => {
    // Given an inline PDA with an argument seed whose name conflicts with an account name.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    variablePdaSeedNode('authority', publicKeyTypeNode()),
                                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('authority', accountValueNode('owner')),
                                pdaSeedValueNode('label', argumentValueNode('owner')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'owner', type: stringTypeNode('utf8') })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // The account seed should reference self.owner (the account field).
    codeContains(content, [`self.owner.as_ref()`]);
    // The argument seed should reference self.owner_arg (the _arg suffixed field).
    codeContains(content, [`self.owner_arg.clone()`]);
});

test('it handles omitted-default argument seeds in inline pdaNode', () => {
    // Given an inline PDA with an omitted-default argument seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'record',
                                seeds: [
                                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                                    variablePdaSeedNode('kind', numberTypeNode('u32')),
                                ],
                            }),
                            [
                                pdaSeedValueNode('owner', accountValueNode('owner')),
                                pdaSeedValueNode('kind', argumentValueNode('kind')),
                            ],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [
                    instructionArgumentNode({
                        defaultValue: numberValueNode(42),
                        defaultValueStrategy: 'omitted',
                        name: 'kind',
                        type: numberTypeNode('u32'),
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // The omitted arg should be inlined as its default value, not read from self.kind.
    codeContains(content, [`42`]);
    expect(content).not.toContain('self.kind');
});

test('it throws on a circular PDA dependency', () => {
    // Given two accounts with circular PDA dependencies (A depends on B, B depends on A).
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'pdaA',
                                seeds: [variablePdaSeedNode('b', publicKeyTypeNode())],
                            }),
                            [pdaSeedValueNode('b', accountValueNode('accountB'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'accountA',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'pdaB',
                                seeds: [variablePdaSeedNode('a', publicKeyTypeNode())],
                            }),
                            [pdaSeedValueNode('a', accountValueNode('accountA'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'accountB',
                    }),
                ],
                name: 'circular',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // Then the native input resolution hard-throws instead of degrading.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/[Cc]ircular dependency/);
});

test('it throws when a variable seed has no binding', () => {
    // Given an inline PDA with a variable seed that has no matching binding.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'vault',
                                seeds: [
                                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            // Only provide binding for 'mint', not 'owner' — incomplete seeds.
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'vault',
                    }),
                ],
                name: 'deposit',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // An unbound variable seed cannot be derived at runtime — hard-throw.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/Missing seed value for variable seed \[owner\]/);
});

test('it renders required args as constructor params', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [instructionAccountNode({ isSigner: false, isWritable: true, name: 'myAccount' })],
                arguments: [instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') })],
                name: 'myInstruction',
            }),
        ],
        name: 'myProgram',
        publicKey: 'Dummy11111111111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'instructions/my_instruction.rs').content;

    codeContains(code, [
        /pub struct MyInstructionBuilder \{[^}]*amount: u64,/,
        /pub fn new\([^)]*amount: u64/,
        `#[derive(Clone, Debug)]`,
    ]);

    codeDoesNotContains(code, [
        `pub fn amount(&mut self`,
        `expect("amount is not set")`,
        `#[derive(Clone, Debug, Default)]`,
    ]);
});

test('it renders required args as constructor params even without required accounts', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                arguments: [instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') })],
                name: 'myInstruction',
            }),
        ],
        name: 'myProgram',
        publicKey: 'Dummy11111111111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'instructions/my_instruction.rs').content;

    codeContains(code, [`#[derive(Clone, Debug)]`, /pub fn new\([^)]*amount: u64/]);

    codeDoesNotContains(code, [`#[derive(Clone, Debug, Default)]`, `Self::default()`]);
});

test('it renders required accounts as constructor params with PDA accounts staying optional', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'realm' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('realm', accountValueNode('realm')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Required accounts in new().
    codeContains(content, [
        `#[derive(Clone, Debug)]`,
        /pub fn new\(\s*realm: solana_address::Address,\s*mint: solana_address::Address,/,
    ]);

    // PDA account is NOT in new(), stays Option.
    codeContains(content, [/record: Option<solana_address::Address>/, `pub fn record(&mut self`]);

    // Required accounts are bare types, not Option.
    codeContains(content, [
        /realm: solana_address::Address,\s*mint: solana_address::Address,\s*record: Option<solana_address::Address>/,
    ]);

    // No setters for required accounts.
    codeDoesNotContains(content, [`pub fn realm(&mut self`, `pub fn mint(&mut self`]);
});

test('it renders required account as pdaLinkNode seed without expect', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Required account used as PDA seed — direct access, no expect.
    codeContains(content, [`&self.owner,`]);
    codeDoesNotContains(content, [`self.owner.expect`]);
});

test('it renders required either-signer account as pdaLinkNode seed with .0 extraction', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        isOptional: false,
                        isSigner: 'either',
                        isWritable: false,
                        name: 'authority',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('authority', accountValueNode('authority')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Required either-signer: bare tuple type, new() param, .0 in seed.
    codeContains(content, [
        /authority: \(solana_address::Address, bool\),/,
        /pub fn new\([^)]*authority: \(solana_address::Address, bool\)/,
        `&self.authority.0,`,
    ]);
    codeDoesNotContains(content, [
        `Option<(solana_address::Address, bool)>`,
        `.map(|(k, _)| k).expect`,
        `pub fn authority(&mut self`,
    ]);
});

test('it renders required account as inline pdaNode seed without expect', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'guard',
                                seeds: [
                                    constantPdaSeedNode(bytesTypeNode(), bytesValueNode('utf8', 'my_seed')),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'guard',
                    }),
                ],
                name: 'createGuard',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_guard.rs').content;

    // Required account as inline PDA seed — direct .as_ref(), no expect.
    codeContains(content, [`self.mint.as_ref()`]);
    codeDoesNotContains(content, [`self.mint.expect`]);
});

test('it renders required arg as pdaLinkNode seed without expect', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('label', argumentValueNode('label')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'label', type: stringTypeNode('utf8') })],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'record',
                seeds: [
                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                    variablePdaSeedNode('label', stringTypeNode('utf8')),
                ],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    // Required arg in new().
    codeContains(content, [/pub fn new\([^)]*label: TrailingStr/]);
    // Required arg as PDA seed — no expect.
    codeContains(content, [`self.label.clone(),`]);
    codeDoesNotContains(content, [`self.label.clone().expect`]);
});

test('it renders mixed required accounts, PDA defaults, and publicKey defaults', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'tokenProgram',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('ata'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('tokenProgram', accountValueNode('tokenProgram')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'ata',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') })],
                name: 'createAta',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_ata.rs').content;

    // Required accounts and args in new().
    codeContains(content, [
        /pub fn new\(\s*owner: solana_address::Address,\s*mint: solana_address::Address,\s*amount: u64,/,
        `#[derive(Clone, Debug)]`,
    ]);

    // publicKey default stays optional with setter.
    codeContains(content, [
        `pub fn token_program(&mut self`,
        `unwrap_or(solana_address::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"))`,
    ]);

    // PDA account stays optional with setter.
    codeContains(content, [`pub fn ata(&mut self`, /ata: Option<solana_address::Address>/]);

    // Required accounts: no setters, no expect.
    codeDoesNotContains(content, [
        `pub fn owner(&mut self`,
        `pub fn mint(&mut self`,
        `pub fn amount(&mut self`,
        `expect("owner is not set")`,
        `expect("mint is not set")`,
        `expect("amount is not set")`,
    ]);

    // PDA seed for required accounts uses direct access.
    codeContains(content, [`&self.owner,`]);
    // PDA seed for publicKey default uses unwrap_or.
    codeContains(content, [
        `&self.token_program.unwrap_or(solana_address::address!("TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"))`,
    ]);
    // PDA seed for required account 'mint' uses direct access.
    codeContains(content, [`&self.mint,`]);
});

test('it binds a programIdValueNode default account to the program ID instead of asking the caller', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: programIdValueNode(),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'selfProgram',
                    }),
                ],
                name: 'myInstruction',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/my_instruction.rs').content;

    const builderSection = content.substring(
        content.indexOf('Instruction builder for `MyInstruction`.'),
        content.indexOf('`my_instruction` CPI accounts.'),
    );

    // The program dispatches to itself, so the builder holds nothing for the account.
    codeDoesNotContains(builderSection, [
        `self_program: Option<solana_address::Address>`,
        `pub fn self_program(&mut self`,
        `self.self_program`,
        /pub fn new\([^)]*self_program/,
    ]);
    codeContains(builderSection, [`let self_program = crate::TEST_PROGRAM_ID;`]);
    codeContains(builderSection, [/pub fn new\([^)]*owner: solana_address::Address/]);
    // The escape hatches still take every account.
    codeContains(content, [/pub struct MyInstruction \{[^}]*pub self_program: solana_address::Address/]);
    codeContains(content.substring(content.indexOf('Instruction builder for `MyInstruction` via CPI')), [
        `pub fn self_program(`,
    ]);
});

test('it renders CPI builder with required accounts, args, and defaults', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: publicKeyValueNode('TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA'),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'tokenProgram',
                    }),
                    instructionAccountNode({
                        defaultValue: programIdValueNode(),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'selfProgram',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') })],
                name: 'myInstruction',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/my_instruction.rs').content;

    const cpiSection = content.substring(content.indexOf('Instruction builder for `MyInstruction` via CPI'));

    codeContains(cpiSection, [
        /MyInstructionCpiBuilder<'a, 'b>/,
        /pub fn new\(\s*__program: &'b solana_account_info::AccountInfo<'a>,\s*owner: &'b solana_account_info::AccountInfo<'a>,\s*token_program: &'b solana_account_info::AccountInfo<'a>,\s*amount: u64,/,
    ]);
    codeContains(cpiSection, [
        /owner: &'b solana_account_info::AccountInfo<'a>,\s*token_program: &'b solana_account_info::AccountInfo<'a>,\s*self_program: Option<&'b solana_account_info::AccountInfo<'a>>,/,
    ]);
    codeContains(cpiSection, [/amount: u64,\s*\/\/\//]);
    codeContains(cpiSection, [`self.instruction.self_program.unwrap_or(self.instruction.__program)`]);
    codeContains(cpiSection, [/token_program: self\.instruction\.token_program,/]);
    codeContains(cpiSection, [/\[signer\].*owner/, /\[optional\].*self_program/]);
    codeDoesNotContains(cpiSection, [/\[optional\].*token_program/]);
    codeDoesNotContains(cpiSection, [`pub fn token_program(`]);
});

test('it renders CPI builder with PDA-defaulted accounts as required constructor params', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'owner' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                    instructionAccountNode({
                        defaultValue: programIdValueNode(),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'selfProgram',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    const cpiSection = content.substring(content.indexOf('Instruction builder for `CreateRecord` via CPI'));

    codeContains(cpiSection, [
        /CreateRecordCpiBuilder<'a, 'b>/,
        /pub fn new\(\s*__program: &'b solana_account_info::AccountInfo<'a>,\s*owner: &'b solana_account_info::AccountInfo<'a>,\s*mint: &'b solana_account_info::AccountInfo<'a>,\s*record: &'b solana_account_info::AccountInfo<'a>,/,
    ]);
    codeContains(cpiSection, [
        /record: &'b solana_account_info::AccountInfo<'a>,\s*self_program: Option<&'b solana_account_info::AccountInfo<'a>>,/,
    ]);
    codeContains(cpiSection, [/record: self\.instruction\.record,/]);
    codeContains(cpiSection, [`self.instruction.self_program.unwrap_or(self.instruction.__program)`]);
    codeDoesNotContains(cpiSection, [`pub fn record(`]);
    codeContains(cpiSection, [`pub fn self_program(`]);
    codeDoesNotContains(cpiSection, [/\[optional\].*record/]);
    codeContains(cpiSection, [/\[optional\].*self_program/]);

    // Regular Builder still has record as optional (PDA auto-derived).
    codeContains(content, [/pub struct CreateRecordBuilder \{[^}]*record: Option<solana_address::Address>/]);
});

test('it avoids CPI builder param name collision when instruction has an account named program', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'user' }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'program' }),
                ],
                name: 'myInstruction',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/my_instruction.rs').content;
    const cpiSection = content.substring(content.indexOf('Instruction builder for `MyInstruction` via CPI'));

    // CPI builder first param is __program (not program) to avoid collision.
    codeContains(cpiSection, [/pub fn new\(\s*__program: &'b solana_account_info::AccountInfo<'a>,/]);
    // The instruction account named 'program' is a separate param.
    codeContains(cpiSection, [/program: &'b solana_account_info::AccountInfo<'a>,/]);
});

test('it binds a zero-variable-seed linked PDA account to the folded address constant', () => {
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('config'), []),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'config',
                    }),
                ],
                name: 'doSomething',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'config',
                seeds: [constantPdaSeedNodeFromString('utf8', 'config')],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/do_something.rs').content;

    // Every seed is constant, so the address is settled here and the builder just binds it.
    codeContains(content, ['let config = crate::pdas::CONFIG_ADDRESS;']);
    codeDoesNotContains(content, ['unwrap_or', 'find_config_pda', 'pub fn config(&mut self']);
});

test('it calls the runtime finder for a constant-only PDA the generator could not fold', () => {
    // Given a constant-only PDA with 16 seeds, one more than `find_program_address` can take,
    // so `pdas/` emits no `_ADDRESS` for the builder to read.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('config'), []),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'config',
                    }),
                ],
                name: 'doSomething',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'config',
                seeds: Array.from({ length: 16 }, (_, i) => constantPdaSeedNodeFromString('utf8', `s${i}`)),
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/do_something.rs').content;

    // Then the builder falls back to the runtime finder rather than a constant that is never emitted.
    codeContains(content, ['unwrap_or_else', 'crate::pdas::find_config_pda(', ').0']);
    codeDoesNotContains(content, ['crate::pdas::CONFIG_ADDRESS']);
    codeDoesNotContains(getFromRenderMap(renderMap, 'pdas/config.rs').content, ['pub const CONFIG_ADDRESS']);
});

test('it derives linked PDAs with a dynamic programId by passing the program to the helper', () => {
    // Given linked PDAs whose deriving program is a runtime account reference.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'ammProgram',
                    }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'market' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaLinkNode('pool'),
                            [pdaSeedValueNode('market', accountValueNode('market'))],
                            accountValueNode('ammProgram'),
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'pool',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('authority'), [], accountValueNode('ammProgram')),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'authority',
                    }),
                ],
                name: 'migrate',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({ name: 'pool', seeds: [variablePdaSeedNode('market', publicKeyTypeNode())] }),
            pdaNode({ name: 'authority', seeds: [constantPdaSeedNodeFromString('utf8', 'authority')] }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/migrate.rs').content;

    // Then the builder calls the helpers with the referenced account as the
    // deriving program.
    codeContains(content, [
        `crate::pdas::find_pool_pda(`,
        `&self.market,`,
        `&self.amm_program,`,
        `crate::pdas::find_authority_pda(`,
    ]);
    // And never through a local-program constant.
    codeDoesNotContains(content, [`AUTHORITY_ADDRESS`, `_with_program`]);

    // And the dynamic-only PDA helpers take the deriving program as a required
    // parameter; the local-program _ADDRESS constant is not emitted.
    const authorityPda = getFromRenderMap(renderMap, 'pdas/authority.rs').content;
    codeContains(authorityPda, [
        /pub fn find_authority_pda\(\s*program_address: &solana_address::Address,/,
        `pub const AUTHORITY_SEED`,
    ]);
    codeDoesNotContains(authorityPda, [`AUTHORITY_ADDRESS`, `_with_program`, `use crate::TEST_PROGRAM_ID`]);
});

test('it keeps the builder and the finder in step for a self-pinned PDA with a variable seed', () => {
    // Given the same shape with both PDAs self-pinned. The finders then take no program parameter, so the builder
    // must pass none — the variable-seed PDA has no folded constant to hide behind, so a mismatch is an E0061.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'ammProgram',
                    }),
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'market' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaLinkNode('pool'),
                            [pdaSeedValueNode('market', accountValueNode('market'))],
                            accountValueNode('ammProgram'),
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'pool',
                    }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('authority'), [], accountValueNode('ammProgram')),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'authority',
                    }),
                ],
                name: 'migrate',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'pool',
                programId: '11111111111111111111111111111111',
                seeds: [variablePdaSeedNode('market', publicKeyTypeNode())],
            }),
            pdaNode({
                name: 'authority',
                programId: '11111111111111111111111111111111',
                seeds: [constantPdaSeedNodeFromString('utf8', 'authority')],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/migrate.rs').content;
    const poolPda = getFromRenderMap(renderMap, 'pdas/pool.rs').content;

    // Then the variable-seed finder and the builder both take the seed alone; the pin already resolved the program.
    codeContains(poolPda, [/pub fn find_pool_pda\(\s*market: &Address,\s*\) -> \(solana_address::Address, u8\)/]);
    codeDoesNotContains(poolPda, ['program_address: &solana_address::Address,']);
    codeContains(content, [/crate::pdas::find_pool_pda\(\s*&self\.market,\s*\)\.0/]);
    codeDoesNotContains(content, ['&self.amm_program,']);

    // And the constant-seed one folds outright, so the builder reads its constant.
    codeContains(content, ['crate::pdas::AUTHORITY_ADDRESS']);
    codeDoesNotContains(content, ['find_authority_pda(']);
});

test('it derives linked PDAs with a dynamic programId from an argument reference', () => {
    // Given a PDA whose deriving program comes from a required instruction argument.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'market' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaLinkNode('pool'),
                            [pdaSeedValueNode('market', accountValueNode('market'))],
                            argumentValueNode('poolProgram'),
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'pool',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'poolProgram', type: publicKeyTypeNode() })],
                name: 'migrate',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'pool', seeds: [variablePdaSeedNode('market', publicKeyTypeNode())] })],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/migrate.rs').content;

    // Required arg — direct field access as the deriving program.
    codeContains(content, [`crate::pdas::find_pool_pda(`, `&self.market,`, `&self.pool_program,`]);
});

test('it throws on a nested argument path in a PDA seed', () => {
    // Given a PDA seed bound to a nested argument path (e.g. account-data field).
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('guard'), [
                            pdaSeedValueNode('mint', argumentValueNode('guardData', ['mint'])),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'guard',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'guardData', type: publicKeyTypeNode() })],
                name: 'execute',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'guard', seeds: [variablePdaSeedNode('mint', publicKeyTypeNode())] })],
        publicKey: '11111111111111111111111111111111',
    });

    // Nested paths have no builder field to read from — hard-throw.
    expect(() => visit(node, getRenderMapVisitor())).toThrow(/nested argument path \[guardData\.mint\]/);
});

test('it renders inline constant string seeds with byte semantics', () => {
    // Given an inline (non-linked) PDA default with a constant string seed.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'ata',
                                programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                                seeds: [
                                    constantPdaSeedNodeFromString('utf8', 'prefix'),
                                    variablePdaSeedNode('owner', publicKeyTypeNode()),
                                ],
                            }),
                            [pdaSeedValueNode('owner', accountValueNode('owner'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'ata',
                    }),
                ],
                name: 'init',
            }),
        ],
        name: 'testProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/init.rs').content;

    // The string seed must be a byte-string literal, not a Rust String.
    codeContains(content, [
        `find_program_address`,
        `b"prefix"`,
        `solana_address::address!("ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL")`,
    ]);
    codeDoesNotContains(content, [`String::from`]);
});

test('it renders extra arguments as required builder inputs', () => {
    // Given an instruction whose PDA seed reads a caller-supplied extra argument.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('guard'), [
                            pdaSeedValueNode('mint', argumentValueNode('guardMint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'guard',
                    }),
                ],
                arguments: [instructionArgumentNode({ name: 'amount', type: numberTypeNode('u64') })],
                extraArguments: [instructionArgumentNode({ name: 'guardMint', type: publicKeyTypeNode() })],
                name: 'execute',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'guard', seeds: [variablePdaSeedNode('mint', publicKeyTypeNode())] })],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/execute.rs').content;

    codeContains(content, [
        // Builder field + constructor param appended after required args.
        /pub fn new\([\s\S]*amount: u64,[\s\S]*guard_mint: Address,[\s\S]*\) -> Self/,
        `guard_mint: Address,`,
        // Read by the PDA derivation.
        `crate::pdas::find_guard_pda(`,
        `&self.guard_mint.clone(),`,
    ]);
    // Never serialized into the instruction data/args structs.
    codeDoesNotContains(content, [`pub guard_mint`]);
});

test('it suffixes extra arguments conflicting with account names', () => {
    // Given an extra argument whose name collides with an account.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('guard'), [
                            pdaSeedValueNode('mint', argumentValueNode('mint')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'guard',
                    }),
                ],
                extraArguments: [instructionArgumentNode({ name: 'mint', type: publicKeyTypeNode() })],
                name: 'execute',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'guard', seeds: [variablePdaSeedNode('mint', publicKeyTypeNode())] })],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/execute.rs').content;

    // The extra-arg field and its seed usage both carry the _arg suffix.
    codeContains(content, [`mint_arg: Address,`, `&self.mint_arg.clone(),`]);
});

// Relies on allowOptionalAccountsAsPdaSeeds; derivation runs inside unwrap_or_else,
// so the expect() only fires when the PDA actually needs deriving.
test('it derives a PDA from an optional account seed via expect', () => {
    // Given a PDA-defaulted account whose seed reads an optional account.
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: true, isSigner: false, isWritable: false, name: 'owner' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(pdaLinkNode('record'), [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                        ]),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'record',
                    }),
                ],
                name: 'createRecord',
            }),
        ],
        name: 'testProgram',
        pdas: [pdaNode({ name: 'record', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] })],
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const renderMap = visit(node, getRenderMapVisitor());
    const content = getFromRenderMap(renderMap, 'instructions/create_record.rs').content;

    codeContains(content, [`crate::pdas::find_record_pda(`, `&self.owner.expect("owner is needed for record PDA")`]);
});

test('it folds constant-seed dynamic PDAs under the canonical program default', () => {
    // Given a constant-seed PDA pinned to a foreign program via pdaNode.programId,
    // while the use-site still passes a runtime program reference.
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
                            pdaLinkNode('vaultAuthority'),
                            [],
                            accountValueNode('cpswapProgram'),
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: false,
                        name: 'vaultAuthority',
                    }),
                ],
                name: 'migrate',
            }),
        ],
        name: 'testProgram',
        pdas: [
            pdaNode({
                name: 'vaultAuthority',
                programId: 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C',
                seeds: [constantPdaSeedNodeFromString('utf8', 'vault_auth')],
            }),
        ],
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    // The pdas page folds the address at codegen time under the pinned program,
    // and the helpers bake that program in — no program parameter.
    const pdaContent = getFromRenderMap(renderMap, 'pdas/vault_authority.rs').content;
    codeContains(pdaContent, [
        `pub const VAULT_AUTHORITY_PROGRAM_ADDRESS: solana_address::Address`,
        `CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C`,
        `pub const VAULT_AUTHORITY_ADDRESS: solana_address::Address`,
    ]);
    codeDoesNotContains(pdaContent, [`program_address:`]);

    // The builder uses the folded constant directly.
    const ixContent = getFromRenderMap(renderMap, 'instructions/migrate.rs').content;
    codeContains(ixContent, [`unwrap_or(`, `crate::pdas::VAULT_AUTHORITY_ADDRESS`]);
    codeDoesNotContains(ixContent, [`find_vault_authority_pda`]);
});

test('it hashes a programIdValueNode seed as the pinned deriving program', () => {
    // Given an inline PDA pinned to a foreign program that seeds on itself (Metaplex metadata).
    const node = programNode({
        instructions: [
            instructionNode({
                accounts: [
                    instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                    instructionAccountNode({
                        defaultValue: pdaValueNode(
                            pdaNode({
                                name: 'metadata',
                                programId: 'metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s',
                                seeds: [
                                    constantPdaSeedNodeFromString('utf8', 'metadata'),
                                    constantPdaSeedNode(bytesTypeNode(), programIdValueNode()),
                                    variablePdaSeedNode('mint', publicKeyTypeNode()),
                                ],
                            }),
                            [pdaSeedValueNode('mint', accountValueNode('mint'))],
                        ),
                        isOptional: false,
                        isSigner: false,
                        isWritable: true,
                        name: 'metadata',
                    }),
                ],
                name: 'createMetadata',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    // When we render it.
    const content = getFromRenderMap(visit(node, getRenderMapVisitor()), 'instructions/create_metadata.rs').content;

    // Then the seed is the same program the address derives under, not this crate's.
    codeContains(content, [
        'solana_address::address!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s").as_ref(),',
        '&solana_address::address!("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"),',
    ]);
    codeDoesNotContains(content, ['crate::MY_PROGRAM_ID.as_ref(),']);
});

const TOKEN_PROGRAM_ADDRESS = 'TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA';
const RENT_SYSVAR_ADDRESS = 'SysvarRent111111111111111111111111111111111';

function renderMyInstruction(instruction: InstructionNode, pdas: PdaNode[] = []): string {
    const node = programNode({
        instructions: [instruction],
        name: 'testProgram',
        pdas,
        publicKey: '11111111111111111111111111111111',
    });
    return getFromRenderMap(visit(node, getRenderMapVisitor()), 'instructions/my_instruction.rs').content;
}

/** The plain builder alone; the accounts struct above it and the CPI page below it keep every account. */
function builderSectionOf(content: string): string {
    return content.substring(
        content.indexOf('Instruction builder for `MyInstruction`.'),
        content.indexOf('`my_instruction` CPI accounts.'),
    );
}

test('it drops an account pinned by an address constraint from the builder', () => {
    // Given `#[account(address = …)]`, which lowers to a publicKeyValueNode identified by the
    // account's own name.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'payer' }),
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const builder = builderSectionOf(content);

    // Then the builder neither holds nor exposes it, and binds the pinned address directly.
    codeDoesNotContains(builder, [
        'token_program: Option<solana_address::Address>',
        'pub fn token_program(&mut self',
        'self.token_program',
        /pub fn new\([^)]*token_program/,
    ]);
    codeContains(builder, [`let token_program = solana_address::address!("${TOKEN_PROGRAM_ADDRESS}");`]);

    // And the escape hatches still take every account.
    codeContains(content, [/pub struct MyInstruction \{[^}]*pub token_program: solana_address::Address/]);
    codeContains(content.substring(content.indexOf('`my_instruction` CPI accounts.')), [
        /pub token_program: &'b solana_account_info::AccountInfo<'a>,/,
    ]);
    codeContains(content.substring(content.indexOf('Instruction builder for `MyInstruction` via CPI')), [
        /pub fn new\(\s*__program: &'b solana_account_info::AccountInfo<'a>,\s*payer: &'b solana_account_info::AccountInfo<'a>,\s*token_program: &'b solana_account_info::AccountInfo<'a>,/,
    ]);
});

test('it documents a fixed account in place rather than leaving a gap in the account list', () => {
    // Given a pinned account sitting between two the caller still supplies. Dropping its doc line
    // would skip an index, reading as an account the transaction omits.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'payer' }),
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: true, name: 'target' }),
            ],
            name: 'myInstruction',
        }),
    );

    // Each assertion carries its `\n`: an annotation that swallowed the line break would weld the
    // doc list into one line.
    codeContains(builderSectionOf(content), [
        '///   0. `[signer]` payer\n',
        `///   1. \`[]\` token_program (fixed to '${TOKEN_PROGRAM_ADDRESS}')\n`,
        '///   2. `[writable]` target\n',
    ]);
});

test('it keeps an account whose publicKey default was synthesised from its name', () => {
    // Given the default `getCommonInstructionAccountDefaultRules` invents for an unconstrained
    // `token_program`: a heuristic identifier rather than the account name.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'splToken'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    // Then the account stays parametric — it may well need to accept Token-2022.
    codeContains(builderSectionOf(content), [
        'token_program: Option<solana_address::Address>',
        'pub fn token_program(&mut self',
        `self.token_program.unwrap_or(solana_address::address!("${TOKEN_PROGRAM_ADDRESS}"))`,
    ]);
});

test('it keeps an account whose program ID default was synthesised from its name', () => {
    // Given the `program_id` heuristic: the one rule yielding a bare `programIdValueNode`, with no
    // identifier to tell it apart by. Nothing pinned the account, so the caller may point it elsewhere.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: programIdValueNode(),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'programId',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    codeContains(builderSectionOf(content), [
        'program_id: Option<solana_address::Address>',
        'pub fn program_id(&mut self',
        'self.program_id.unwrap_or(crate::TEST_PROGRAM_ID)',
    ]);
});

test('it keeps an account whose publicKey default carries no identifier', () => {
    // Given a hand-authored `publicKeyValueNode(addr)` — the shape every sysvar rule produces.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(RENT_SYSVAR_ADDRESS),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'rent',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    // Then nothing proves the address is program-enforced, so the input stays.
    codeContains(builderSectionOf(content), [
        'rent: Option<solana_address::Address>',
        'pub fn rent(&mut self',
        `self.rent.unwrap_or(solana_address::address!("${RENT_SYSVAR_ADDRESS}"))`,
    ]);
});

test('it keeps a signer account even when its address is pinned', () => {
    // Given `#[account(address = ADMIN)] pub admin: Signer<'info>`: pinned, yet still a signature the
    // caller must supply.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'admin'),
                    isOptional: false,
                    isSigner: true,
                    isWritable: false,
                    name: 'admin',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    // Then dropping the input would make the instruction unbuildable, so it stays.
    codeContains(builderSectionOf(content), ['admin: Option<solana_address::Address>', 'pub fn admin(&mut self']);
});

test('it keeps an optional account whose pinned publicKey default the builder never applies', () => {
    // Given an IDL-optional account with a pinned address: `None` reaches the accounts struct, which
    // emits the program id or omits the account per `optionalAccountStrategy`.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: true,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    // Then dropping the input would change the meta, so it stays — along with the pass-through.
    codeContains(builderSectionOf(content), [
        'token_program: Option<solana_address::Address>',
        'pub fn token_program(&mut self',
        'let token_program = self.token_program;',
    ]);
});

test('it passes an IDL-optional account through instead of applying its PDA default', () => {
    // Given an IDL-optional account whose PDA default takes a variable seed, so it cannot fold.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('quoteAta'), [
                        pdaSeedValueNode('owner', accountValueNode('owner')),
                    ]),
                    isOptional: true,
                    isSigner: false,
                    isWritable: true,
                    name: 'userQuoteAta',
                }),
            ],
            name: 'myInstruction',
        }),
        [pdaNode({ name: 'quoteAta', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] })],
    );
    const builder = builderSectionOf(content);

    // Then the `Option` passes through: substituting the PDA would both fail to compile against the
    // struct's `Option<Address>` field and make the account impossible to omit.
    codeContains(builder, ['let user_quote_ata = self.user_quote_ata;']);
    codeDoesNotContains(builder, ['self.user_quote_ata.unwrap_or_else', 'find_quote_ata_pda']);
});

test('it does not promise a default it never applies to an IDL-optional account', () => {
    // The account list must not advertise a default the builder never applies.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('quoteAta'), [
                        pdaSeedValueNode('owner', accountValueNode('owner')),
                    ]),
                    isOptional: true,
                    isSigner: false,
                    isWritable: true,
                    name: 'userQuoteAta',
                }),
            ],
            name: 'myInstruction',
        }),
        [pdaNode({ name: 'quoteAta', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] })],
    );
    const builder = builderSectionOf(content);

    codeContains(builder, ['///   1. `[writable, optional]` user_quote_ata']);
    codeDoesNotContains(builder, ['default to']);
});

test('it reads the field, not the binding, when a later PDA seeds off a pass-through account', () => {
    // Given a second account seeding its PDA off the IDL-optional one. A derivation may name the
    // earlier `let` binding only where it is a bare `Address`; here it is the untouched `Option`.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('vault'), [
                        pdaSeedValueNode('owner', accountValueNode('owner')),
                    ]),
                    isOptional: true,
                    isSigner: false,
                    isWritable: true,
                    name: 'vault',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('receipt'), [
                        pdaSeedValueNode('vault', accountValueNode('vault')),
                    ]),
                    isOptional: false,
                    isSigner: false,
                    isWritable: true,
                    name: 'receipt',
                }),
            ],
            name: 'myInstruction',
        }),
        [
            pdaNode({ name: 'vault', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] }),
            pdaNode({ name: 'receipt', seeds: [variablePdaSeedNode('vault', publicKeyTypeNode())] }),
        ],
    );
    const builder = builderSectionOf(content);

    // Then the seed unwraps the field: `find_receipt_pda` takes `&Address`, so `&vault` would not
    // compile. Omitting the account panics, since `None` is not an address any PDA can derive from.
    codeContains(builder, ['let vault = self.vault;', '&self.vault.expect("vault is needed for receipt PDA")']);
    codeDoesNotContains(builder, [/find_receipt_pda\(\s*&vault,/]);
});

test('it reads the field when a pass-through account is a PDA deriving program', () => {
    // Given the same account named as a PDA's deriving program rather than as a seed: that reference
    // resolves down a separate path, with its own copy of the binding shortcut.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('vault'), [
                        pdaSeedValueNode('owner', accountValueNode('owner')),
                    ]),
                    isOptional: true,
                    isSigner: false,
                    isWritable: true,
                    name: 'vault',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({ name: 'registry', seeds: [constantPdaSeedNodeFromString('utf8', 'registry')] }),
                        [],
                        accountValueNode('vault'),
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'registry',
                }),
            ],
            name: 'myInstruction',
        }),
        [pdaNode({ name: 'vault', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] })],
    );
    const builder = builderSectionOf(content);

    // `find_program_address` wants `&Address` for its program just as the finder did for its seed.
    codeContains(builder, ['&self.vault.expect("vault is needed for registry PDA")']);
    codeDoesNotContains(builder, [/find_program_address\([\s\S]*?&vault,/]);
});

test('it extracts the address half when a pass-through either-signer account seeds a PDA', () => {
    // Given a pass-through either-signer account, whose field is `Option<(Address, bool)>`. The seed
    // wants the address alone, so the flag has to go before the unwrap.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('vault'), [
                        pdaSeedValueNode('owner', accountValueNode('owner')),
                    ]),
                    isOptional: true,
                    isSigner: 'either',
                    isWritable: true,
                    name: 'vault',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('receipt'), [
                        pdaSeedValueNode('vault', accountValueNode('vault')),
                    ]),
                    isOptional: false,
                    isSigner: false,
                    isWritable: true,
                    name: 'receipt',
                }),
            ],
            name: 'myInstruction',
        }),
        [
            pdaNode({ name: 'vault', seeds: [variablePdaSeedNode('owner', publicKeyTypeNode())] }),
            pdaNode({ name: 'receipt', seeds: [variablePdaSeedNode('vault', publicKeyTypeNode())] }),
        ],
    );
    const builder = builderSectionOf(content);

    codeContains(builder, ['&self.vault.map(|(k, _)| k).expect("vault is needed for receipt PDA")']);
});

test('it keeps an optional account whose PDA default folds to a constant', () => {
    // Given an IDL-optional account defaulting to a PDA that folds here. No default is applied to an
    // IDL-optional account, so dropping the input would strip the only way to omit it.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: pdaValueNode(pdaLinkNode('config'), []),
                    isOptional: true,
                    isSigner: false,
                    isWritable: false,
                    name: 'config',
                }),
            ],
            name: 'myInstruction',
        }),
        [pdaNode({ name: 'config', seeds: [constantPdaSeedNodeFromString('utf8', 'config')] })],
    );
    const builder = builderSectionOf(content);

    codeContains(builder, [
        'config: Option<solana_address::Address>',
        'pub fn config(&mut self',
        'let config = self.config;',
    ]);
    codeDoesNotContains(builder, ['crate::pdas::CONFIG_ADDRESS']);
    codeContains(content, [/pub struct MyInstruction \{[^}]*pub config: Option<solana_address::Address>/]);
});

// The two addresses `registry` derives to, computed outside this package: under the pinned program,
// and under the local program the fold falls back on without a pin. They must stay distinct, or
// neither test below can tell which program derived the address.
const REGISTRY_UNDER_PINNED_PROGRAM = 'FjbnipWQFdoFm2h7PRhbHa5JU9tRKGpvYR94eMc9px4s';
const REGISTRY_UNDER_LOCAL_PROGRAM = '7E6A6LLjsXVugHBtQMLvbVigu7N5i9P4i6U8XLZkvKu5';
const CPMM_PROGRAM_ADDRESS = 'CPMMoo8L3F4NbTegBCKVNunggL7H1ZpdTHKxQB5qKP1C';

test('it keeps an account whose PDA names a deriving program the caller chooses', () => {
    // Given a use-site handing the derivation a runtime account as its program, over an unpinned
    // `pdaNode`: the caller picks the program, so no address is settled here.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'ammProgram' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({ name: 'registry', seeds: [constantPdaSeedNodeFromString('utf8', 'registry')] }),
                        [],
                        accountValueNode('ammProgram'),
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'registry',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const builder = builderSectionOf(content);

    // Welding the local program's derivation here would put a wrong address on the wire.
    codeContains(builder, ['pub fn registry(&mut self', 'find_program_address', '&self.amm_program,']);
    codeDoesNotContains(builder, [REGISTRY_UNDER_LOCAL_PROGRAM, REGISTRY_UNDER_PINNED_PROGRAM]);
});

test('it folds a PDA under the program pinned on its pdaNode, not the local one', () => {
    // Given the same use-site over a pinned `pdaNode`: the pin leaves the reference one legal value.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(CPMM_PROGRAM_ADDRESS, 'ammProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'ammProgram',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({
                            name: 'registry',
                            programId: CPMM_PROGRAM_ADDRESS,
                            seeds: [constantPdaSeedNodeFromString('utf8', 'registry')],
                        }),
                        [],
                        accountValueNode('ammProgram'),
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'registry',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const builder = builderSectionOf(content);

    codeContains(builder, [`let registry = solana_address::address!("${REGISTRY_UNDER_PINNED_PROGRAM}");`]);
    codeDoesNotContains(builder, ['pub fn registry(&mut self', REGISTRY_UNDER_LOCAL_PROGRAM]);
});

test('it keeps a pinned account that another account derives its PDA from', () => {
    // Given the associated-token shape: `tokenProgram` seeds the ATA, so Token-2022 yields a
    // different and correct address.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({
                            name: 'associatedToken',
                            programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                            seeds: [
                                variablePdaSeedNode('owner', publicKeyTypeNode()),
                                variablePdaSeedNode('tokenProgram', publicKeyTypeNode()),
                                variablePdaSeedNode('mint', publicKeyTypeNode()),
                            ],
                        }),
                        [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('tokenProgram', accountValueNode('tokenProgram')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ],
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: true,
                    name: 'ata',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    codeContains(builderSectionOf(content), [
        'pub fn token_program(&mut self',
        `self.token_program.unwrap_or(solana_address::address!("${TOKEN_PROGRAM_ADDRESS}"))`,
    ]);
});

test('it drops a pinned account once its address is baked into the PDA seeds', () => {
    // Given the same shape where `stampPinnedAddresses` has inlined the pinned address as a constant
    // seed and dropped the seed binding, so nothing derives from the account.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'mint' }),
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({
                            name: 'associatedToken',
                            programId: 'ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL',
                            seeds: [
                                variablePdaSeedNode('owner', publicKeyTypeNode()),
                                constantPdaSeedNode(publicKeyTypeNode(), publicKeyValueNode(TOKEN_PROGRAM_ADDRESS)),
                                variablePdaSeedNode('mint', publicKeyTypeNode()),
                            ],
                        }),
                        [
                            pdaSeedValueNode('owner', accountValueNode('owner')),
                            pdaSeedValueNode('mint', accountValueNode('mint')),
                        ],
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: true,
                    name: 'ata',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const builder = builderSectionOf(content);

    codeDoesNotContains(builder, ['pub fn token_program(&mut self', 'self.token_program']);
    codeContains(builder, [
        `let token_program = solana_address::address!("${TOKEN_PROGRAM_ADDRESS}");`,
        'pub fn ata(&mut self',
    ]);
});

test('it keeps a pinned account referenced from a conditional branch', () => {
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
                instructionAccountNode({
                    defaultValue: conditionalValueNode({
                        condition: accountValueNode('tokenProgram'),
                        ifFalse: publicKeyValueNode(RENT_SYSVAR_ADDRESS),
                        ifTrue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS),
                    }),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'target',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    // The conditional's own condition reads the account, so the scan has to recurse into it.
    codeContains(builderSectionOf(content), ['pub fn token_program(&mut self']);
});

test('it drops nothing from an instruction with a resolver in its byte deltas', () => {
    // A resolver body is opaque here and may read any account.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            byteDeltas: [instructionByteDeltaNode(resolverValueNode('resolveByteDelta'))],
            name: 'myInstruction',
        }),
    );

    codeContains(builderSectionOf(content), ['pub fn token_program(&mut self']);
});

test('it drops nothing from an instruction with a resolver in its remaining accounts', () => {
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            name: 'myInstruction',
            remainingAccounts: [instructionRemainingAccountsNode(resolverValueNode('resolveRemainingAccounts'))],
        }),
    );

    codeContains(builderSectionOf(content), ['pub fn token_program(&mut self']);
});

test('it drops an account defaulting to a linked program', () => {
    // A `programLinkNode` account is a required builder parameter, so dropping it changes `new()`.
    const node = rootNode(
        programNode({
            instructions: [
                instructionNode({
                    accounts: [
                        instructionAccountNode({
                            isOptional: false,
                            isSigner: true,
                            isWritable: false,
                            name: 'payer',
                        }),
                        instructionAccountNode({
                            defaultValue: programLinkNode('splToken'),
                            isOptional: false,
                            isSigner: false,
                            isWritable: false,
                            name: 'tokenProgram',
                        }),
                    ],
                    name: 'myInstruction',
                }),
            ],
            name: 'testProgram',
            publicKey: '11111111111111111111111111111111',
        }),
        [programNode({ name: 'splToken', publicKey: TOKEN_PROGRAM_ADDRESS })],
    );
    const content = getFromRenderMap(visit(node, getRenderMapVisitor()), 'instructions/my_instruction.rs').content;
    const builder = builderSectionOf(content);

    codeContains(builder, [
        `let token_program = solana_address::address!("${TOKEN_PROGRAM_ADDRESS}");`,
        /pub fn new\([^)]*payer: solana_address::Address/,
    ]);
    codeDoesNotContains(builder, [/pub fn new\([^)]*token_program/, 'self.token_program']);
});

test('it drops an account defaulting to an inline PDA with only constant seeds', () => {
    // Given an inline `pdaNode` — the shape a cross-program derivation keeps — with constant seeds
    // only, which the renderer would otherwise derive at runtime.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'payer' }),
                instructionAccountNode({
                    defaultValue: pdaValueNode(
                        pdaNode({
                            name: 'treasury',
                            programId: TOKEN_PROGRAM_ADDRESS,
                            seeds: [constantPdaSeedNodeFromString('utf8', 'treasury')],
                        }),
                        [],
                    ),
                    isOptional: false,
                    isSigner: false,
                    isWritable: true,
                    name: 'treasury',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const builder = builderSectionOf(content);

    // The address is bound literally: an inline PDA has no `pdas/` page to read a constant from.
    codeContains(builder, ['let treasury = solana_address::address!("']);
    codeDoesNotContains(builder, ['pub fn treasury(&mut self', 'find_program_address', 'self.treasury']);
});

test('it keeps a pinned account on the accounts struct and the CPI builder', () => {
    // Only the plain builder may drop a pinned account: the accounts struct is the escape hatch for
    // callers who must pass a different address, and CPI takes `AccountInfo`s, not constants.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: true, isWritable: false, name: 'payer' }),
                instructionAccountNode({
                    defaultValue: publicKeyValueNode(TOKEN_PROGRAM_ADDRESS, 'tokenProgram'),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'tokenProgram',
                }),
            ],
            name: 'myInstruction',
        }),
    );

    codeDoesNotContains(builderSectionOf(content), ['pub fn token_program(&mut self']);
    codeContains(content, [
        /pub struct MyInstruction \{[^}]*pub token_program: solana_address::Address/,
        /pub struct MyInstructionCpiAccounts<[^{]*\{[^}]*pub token_program: &'b solana_account_info::AccountInfo/,
        /pub struct MyInstructionCpi<[^{]*\{[^}]*pub token_program: &'b solana_account_info::AccountInfo/,
        /struct MyInstructionCpiBuilderInstruction<[^{]*\{[^}]*token_program: &'b solana_account_info::AccountInfo/,
    ]);
});

test('it lets the CPI builder keep offering an account the plain builder fixes', () => {
    // A `programIdValueNode` is the one fixed shape CPI can default for itself, resolving to the
    // `__program` account info it already holds; every other becomes a required CPI parameter.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({ isOptional: false, isSigner: false, isWritable: false, name: 'owner' }),
                instructionAccountNode({
                    defaultValue: programIdValueNode(),
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name: 'selfProgram',
                }),
            ],
            name: 'myInstruction',
        }),
    );
    const cpi = content.substring(content.indexOf('Instruction builder for `MyInstruction` via CPI'));

    // The two builders describe the same account differently on purpose: the plain one says what it
    // bound, the CPI one keeps the setter it can honour.
    codeContains(builderSectionOf(content), [
        "///   1. `[]` self_program (fixed to '11111111111111111111111111111111')",
    ]);
    codeContains(cpi, ['///   1. `[optional]` self_program', 'pub fn self_program(&mut self']);
});

// `hasSyntheticDefault` asserts a fact about a list in another package: which defaults
// `getCommonInstructionAccountDefaultRules` invents from an account's name. Only these two tests tie
// it to that list, so a rule added or reshaped there starts silently dropping guessed accounts.

/** The kinds a fixed address can resolve from. */
const ADDRESS_KINDS = ['pdaValueNode', 'programIdValueNode', 'programLinkNode', 'publicKeyValueNode'];
/** Kinds that name a caller, so they never resolve to an address and can never be dropped. */
const CALLER_KINDS = ['identityValueNode', 'payerValueNode'];

/**
 * An account name the rule matches, derived from its pattern: first branch of every alternation, plus
 * every optional part. Asserted against the rule itself, so a pattern shape this cannot handle fails
 * loudly rather than quietly testing the wrong name.
 */
function accountNameMatching(pattern: RegExp | string): string {
    if (typeof pattern === 'string') return pattern;
    let source = pattern.source.replace(/^\^/, '').replace(/\$$/, '');
    while (source.includes('(')) {
        source = source.replace(/\(([^()]*)\)/, (_, group: string) => group.split('|')[0]);
    }
    const name = source.replace(/\?/g, '');
    expect(pattern.test(name), `derived "${name}" does not match ${pattern}`).toBe(true);
    return name;
}

test('every common account-default rule produces a kind hasSyntheticDefault has been taught about', () => {
    const kinds = [...new Set(getCommonInstructionAccountDefaultRules().map(rule => rule.defaultValue.kind))];

    // A kind outside both sets is new: teach `hasSyntheticDefault` about it before adding it here.
    expect(kinds.filter(kind => !ADDRESS_KINDS.includes(kind) && !CALLER_KINDS.includes(kind))).toEqual([]);
});

test.each(
    getCommonInstructionAccountDefaultRules()
        .filter(rule => ADDRESS_KINDS.includes(rule.defaultValue.kind))
        .map(rule => [accountNameMatching(rule.account), rule] as const),
)('it keeps %s, whose default the common rules invent from its name', (name, rule) => {
    // Given an account as `setInstructionAccountDefaultValuesVisitor` leaves it: unconstrained by the
    // program, so only its name suggested the address.
    const content = renderMyInstruction(
        instructionNode({
            accounts: [
                instructionAccountNode({
                    defaultValue: rule.defaultValue,
                    isOptional: false,
                    isSigner: false,
                    isWritable: false,
                    name,
                }),
            ],
            name: 'myInstruction',
        }),
    );

    codeContains(builderSectionOf(content), [new RegExp(`pub fn ${snakeCase(name)}\\(&mut self`)]);
});
