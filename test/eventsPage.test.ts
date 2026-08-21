import {
    arrayTypeNode,
    arrayValueNode,
    bytesTypeNode,
    bytesValueNode,
    CamelCaseString,
    constantDiscriminatorNode,
    constantValueNode,
    definedTypeLinkNode,
    definedTypeNode,
    eventNode,
    fieldDiscriminatorNode,
    fixedCountNode,
    fixedSizeTypeNode,
    hiddenPrefixTypeNode,
    numberTypeNode,
    numberValueNode,
    programNode,
    rootNode,
    sizeDiscriminatorNode,
    sizePrefixTypeNode,
    structFieldTypeNode,
    structTypeNode,
} from '@codama/nodes';
import { getFromRenderMap } from '@codama/renderers-core';
import { visit } from '@codama/visitors-core';
import { expect, test, vi } from 'vitest';

import { getRenderMapVisitor } from '../src';
import { codeContains, codeDoesNotContains } from './_setup';

test('it renders an event with discriminator as a struct with matches and try_parse', () => {
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([
                        structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') }),
                        structFieldTypeNode({ name: 'price', type: numberTypeNode('u64') }),
                    ]),
                    [
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'bddB7fd34ee661ee'),
                        ),
                    ],
                ),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'bddB7fd34ee661ee'),
                        ),
                    ),
                ],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    codeContains(getFromRenderMap(renderMap, 'events/trade_event.rs').content, [
        '#[derive(',
        'BorshSerialize',
        'BorshDeserialize',
        'pub struct TradeEvent',
        'pub amount: u64,',
        'pub price: u64,',
        'TRADE_EVENT_DISCRIMINATOR',
        'pub fn matches(program_id: &solana_address::Address, data: &[u8]) -> bool',
        'data.get(..TRADE_EVENT_DISCRIMINATOR.len()) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        'pub fn try_parse(program_id: &solana_address::Address, data: &[u8]) -> Option<Result<Self, std::io::Error>>',
        'program_id == &crate::MY_PROGRAM_ID && data.get(..TRADE_EVENT_DISCRIMINATOR.len())',
        'if !Self::matches(program_id, data)',
        'Some(Self::deserialize(&mut data))',
    ]);
    codeDoesNotContains(getFromRenderMap(renderMap, 'events/trade_event.rs').content, ['from_bytes']);
});

test('it renders an event without discriminator as a plain struct', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                name: 'simpleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    codeContains(getFromRenderMap(renderMap, 'events/simple_event.rs').content, [
        'pub struct SimpleEvent',
        'pub value: u32,',
    ]);
    codeDoesNotContains(getFromRenderMap(renderMap, 'events/simple_event.rs').content, ['DISCRIMINATOR', 'try_parse']);
});

test('it does not render events module for programs without events', () => {
    const node = rootNode(
        programNode({
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());

    codeDoesNotContains(getFromRenderMap(renderMap, 'mod.rs').content, 'pub mod events;');
});

test('it renders events in the events module', () => {
    const node = rootNode(
        programNode({
            events: [
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    name: 'transferEvent',
                }),
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'delegate', type: numberTypeNode('u64') })]),
                    name: 'approveEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());
    codeContains(getFromRenderMap(renderMap, 'events/mod.rs').content, [
        'pub(crate) mod r#approve_event;',
        'pub use self::r#approve_event::*;',
        'pub(crate) mod r#transfer_event;',
        'pub use self::r#transfer_event::*;',
    ]);

    codeContains(getFromRenderMap(renderMap, 'mod.rs').content, 'pub mod events;');
});

test('it renders an event with an empty struct', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([]),
                name: 'emptyEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    codeContains(getFromRenderMap(renderMap, 'events/empty_event.rs').content, ['pub struct EmptyEvent']);
    codeDoesNotContains(getFromRenderMap(renderMap, 'events/empty_event.rs').content, ['try_parse', 'DISCRIMINATOR']);
});

test('it renders event docs', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                docs: ['Some documentation.', 'Second line.'],
                name: 'documentedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    codeContains(getFromRenderMap(renderMap, 'events/documented_event.rs').content, [
        '/// Some documentation.',
        '/// Second line.',
        'pub struct DocumentedEvent',
    ]);
});

test('it renders an event with a nested struct field', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') }),
                    structFieldTypeNode({
                        name: 'metadata',
                        type: structTypeNode([
                            structFieldTypeNode({ name: 'label', type: numberTypeNode('u8') }),
                            structFieldTypeNode({ name: 'version', type: numberTypeNode('u16') }),
                        ]),
                    }),
                ]),
                name: 'complexEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    codeContains(getFromRenderMap(renderMap, 'events/complex_event.rs').content, [
        'pub struct ComplexEvent',
        'pub amount: u64,',
        'pub metadata: ComplexEventMetadata,',
        'pub struct ComplexEventMetadata',
        'pub label: u8,',
        'pub version: u16,',
    ]);
});

test('it renders field discriminator constants and skips try_parse without hidden prefix', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(7),
                        name: 'eventType',
                        type: numberTypeNode('u8'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [
                    fieldDiscriminatorNode('eventType'),
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'mixedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/mixed_event.rs').content;

    codeContains(code, ['MIXED_EVENT_EVENT_TYPE: u8 = 7']);
    codeContains(code, ['MIXED_EVENT_DISCRIMINATOR']);
    codeDoesNotContains(code, ['try_parse']);
});

test('it validates all constant discriminators in matches for multi-disc events', () => {
    const disc1 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const disc2 = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'eeff0011'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [disc1],
                ),
                discriminators: [constantDiscriminatorNode(disc1, 0), constantDiscriminatorNode(disc2, 12)],
                name: 'multiDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/multi_disc_event.rs').content;

    codeContains(code, [
        // matches ANDs the positive form of every discriminator check.
        'pub fn matches(program_id: &solana_address::Address, data: &[u8]) -> bool',
        'data.get(..MULTI_DISC_EVENT_DISCRIMINATOR.len()) == Some(&MULTI_DISC_EVENT_DISCRIMINATOR[..]) && data.get(12..16) == Some(&MULTI_DISC_EVENT_DISCRIMINATOR2[..])',
        // try_parse delegates the program and discriminator checks to matches.
        'pub fn try_parse(program_id: &solana_address::Address, data: &[u8]) -> Option<Result<Self, std::io::Error>>',
        'if !Self::matches(program_id, data)',
        'return None;',
        'Some(Self::deserialize(&mut data))',
    ]);
    codeDoesNotContains(code, ['from_bytes', 'Err(std::io::Error::new']);
});

test('it uses a literal range in matches for u8-array constant discriminators at non-zero offset', () => {
    const prefix = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    // u8-array constant: no fixedSizeTypeNode, but the fixed count gives a static size of 3.
    const arrayDisc = constantValueNode(
        arrayTypeNode(numberTypeNode('u8'), fixedCountNode(3)),
        arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix],
                ),
                discriminators: [constantDiscriminatorNode(prefix, 0), constantDiscriminatorNode(arrayDisc, 8)],
                name: 'tailEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/tail_event.rs').content;

    codeContains(code, [
        'pub const TAIL_EVENT_DISCRIMINATOR2: [u8; 3] = [1, 2, 3];',
        'data.get(8..11) == Some(&TAIL_EVENT_DISCRIMINATOR2[..])',
        'let mut data = &data[8..];',
    ]);
});

test('it falls back to starts_with in matches when a non-zero-offset discriminator size is unknown', () => {
    const prefix = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    // Link-typed constant: byte size not resolvable at the discriminator site.
    const linkDisc = constantValueNode(
        definedTypeLinkNode('discAlias'),
        arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
    );
    const node = programNode({
        definedTypes: [definedTypeNode({ name: 'discAlias', type: fixedSizeTypeNode(bytesTypeNode(), 3) })],
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix],
                ),
                discriminators: [constantDiscriminatorNode(prefix, 0), constantDiscriminatorNode(linkDisc, 8)],
                name: 'tailEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/tail_event.rs').content;

    codeContains(code, [
        'pub const TAIL_EVENT_DISCRIMINATOR2: DiscAlias = [1, 2, 3];',
        'data.get(8..).is_some_and(|tail| tail.starts_with(&TAIL_EVENT_DISCRIMINATOR2[..]))',
        'let mut data = &data[8..];',
    ]);
});

test('it compares number constant discriminators via to_le_bytes in matches', () => {
    // Number constants render as scalar Rust constants (`pub const X: u32`),
    // so matches must compare their byte encoding, not slice the constant.
    const numDisc = constantValueNode(numberTypeNode('u32'), numberValueNode(42));
    const node = programNode({
        events: [
            // Number discriminator at offset 0.
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', '2a000000'))],
                ),
                discriminators: [constantDiscriminatorNode(numDisc, 0)],
                name: 'numHeadEvent',
            }),
            // Number discriminator at non-zero offset.
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ],
                ),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                        0,
                    ),
                    constantDiscriminatorNode(numDisc, 8),
                ],
                name: 'numTailEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    const headCode = getFromRenderMap(renderMap, 'events/num_head_event.rs').content;
    codeContains(headCode, [
        'pub const NUM_HEAD_EVENT_DISCRIMINATOR: u32 = 42;',
        'data.get(..4) == Some(&NUM_HEAD_EVENT_DISCRIMINATOR.to_le_bytes())',
        'let mut data = &data[4..];',
    ]);

    const tailCode = getFromRenderMap(renderMap, 'events/num_tail_event.rs').content;
    codeContains(tailCode, [
        'pub const NUM_TAIL_EVENT_DISCRIMINATOR2: u32 = 42;',
        'data.get(8..12) == Some(&NUM_TAIL_EVENT_DISCRIMINATOR2.to_le_bytes())',
        'let mut data = &data[8..];',
    ]);
});

test('it uses literal byte count in try_parse for multi-prefix hidden prefix', () => {
    const prefix1 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const prefix2 = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'eeff0011'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix1, prefix2],
                ),
                discriminators: [constantDiscriminatorNode(prefix1, 0)],
                name: 'multiPrefixEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/multi_prefix_event.rs').content;

    codeContains(code, ['let mut data = &data[12..];']);
    codeDoesNotContains(code, ['.len()..']);
});

test('it uses literal byte count in try_parse when constant disc is not at offset 0', () => {
    const prefix = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix],
                ),
                discriminators: [constantDiscriminatorNode(prefix, 8)],
                name: 'offsetPrefixEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/offset_prefix_event.rs').content;

    codeContains(code, ['let mut data = &data[8..];']);
    codeDoesNotContains(code, ['.len()..']);
});

test('it does not render try_parse when hidden prefix has a non-fixed-size entry', () => {
    const prefix1 = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const prefix2 = constantValueNode(numberTypeNode('u32'), numberValueNode(42));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [prefix1, prefix2],
                ),
                discriminators: [constantDiscriminatorNode(prefix1)],
                name: 'dynamicPrefixEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/dynamic_prefix_event.rs').content;

    codeContains(code, ['pub struct DynamicPrefixEvent', 'DYNAMIC_PREFIX_EVENT_DISCRIMINATOR']);
    codeDoesNotContains(code, ['try_parse']);
});

test('it guards matches on the program id and gates try_parse solely on matches', () => {
    const disc = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 8), bytesValueNode('base16', 'aabbccdd11223344'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [disc],
                ),
                discriminators: [constantDiscriminatorNode(disc)],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/trade_event.rs').content;

    codeContains(code, [
        // The program compare is ANDed onto the existing condition, never a replacement for it,
        // so the length proof the raw skip below depends on is preserved.
        'pub fn matches(program_id: &solana_address::Address, data: &[u8]) -> bool',
        'program_id == &crate::MY_PROGRAM_ID && data.get(..TRADE_EVENT_DISCRIMINATOR.len()) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        // try_parse keeps a single early return driven by the whole of matches.
        /pub fn try_parse\(program_id: &solana_address::Address, data: &\[u8\]\) -> Option<Result<Self, std::io::Error>> \{\s*if !Self::matches\(program_id, data\) \{\s*return None;\s*\}/,
    ]);
    // No unguarded sibling: every path into the parse helpers carries a program id.
    codeDoesNotContains(code, ['_unchecked', 'expected_program_id', 'try_into', 'unwrap', 'expect(']);
});

test('it does not guard events rendered without parse helpers', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                name: 'simpleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/simple_event.rs').content;

    codeContains(code, ['pub struct SimpleEvent']);
    codeDoesNotContains(code, ['program_id', 'MY_PROGRAM_ID']);
});

// --- Program-level event codegen tests ---

test('it does not render program events file when no events have discriminators', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                name: 'transferEvent',
            }),
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'delegate', type: numberTypeNode('u64') })]),
                name: 'approveEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const keys = [...renderMap.keys()];
    const programEventsFiles = keys.filter(k => k.includes('my_program_events'));
    expect(programEventsFiles).toHaveLength(0);
});

test('it renders identify and try_parse for events with constant discriminators', () => {
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ],
                ),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'tradeEvent',
            }),
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'price', type: numberTypeNode('u64') })]),
                    [
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', '1122334455667788'),
                        ),
                    ],
                ),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', '1122334455667788'),
                        ),
                    ),
                ],
                name: 'settleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'pub fn identify_my_program_event(program_id: &solana_address::Address, data: &[u8]) -> Option<MyProgramEventKind>',
        'if program_id != &crate::MY_PROGRAM_ID',
        // Every event inlines its discriminator checks, mirroring the JS renderer.
        'if data.get(..SETTLE_EVENT_DISCRIMINATOR.len()) == Some(&SETTLE_EVENT_DISCRIMINATOR[..])',
        'return Some(MyProgramEventKind::SettleEvent)',
        'if data.get(..TRADE_EVENT_DISCRIMINATOR.len()) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        'return Some(MyProgramEventKind::TradeEvent)',
        'pub fn try_parse_my_program_event(program_id: &solana_address::Address, data: &[u8]) -> Option<Result<MyProgramEvent, std::io::Error>>',
        'identify_my_program_event(program_id, data)?',
        // Skips are numeric literals (8-byte prefix), so match each arm to keep them distinct.
        /MyProgramEventKind::SettleEvent => \{\s*let mut data = &data\[8\.\.\];\s*SettleEvent::deserialize\(&mut data\)/,
        /MyProgramEventKind::TradeEvent => \{\s*let mut data = &data\[8\.\.\];\s*TradeEvent::deserialize\(&mut data\)/,
    ]);
    codeDoesNotContains(code, ['from_bytes', 'Err(std::io::Error::new', '::matches(data)']);
});

test('it uses BorshDeserialize for events without matches helpers in try_parse', () => {
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ],
                ),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'tradeEvent',
            }),
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', '5566778899aabbcc'),
                        ),
                    ),
                ],
                name: 'simpleEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        /MyProgramEventKind::TradeEvent => \{\s*let mut data = &data\[8\.\.\];\s*TradeEvent::deserialize\(&mut data\)/,
    ]);
    codeContains(code, ['SimpleEvent::deserialize(&mut data)']);
    // Both events inline their discriminator checks, whether or not a matches helper exists.
    codeContains(code, [
        'data.get(..TRADE_EVENT_DISCRIMINATOR.len()) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        'data.get(..SIMPLE_EVENT_DISCRIMINATOR.len()) == Some(&SIMPLE_EVENT_DISCRIMINATOR[..])',
    ]);
    codeDoesNotContains(code, ['from_bytes', '::matches(data)']);
});

test('it excludes non-fixed-size prefix events from program-level try_parse', () => {
    const fixedPrefix = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const nonFixedPrefix = constantValueNode(numberTypeNode('u32'), numberValueNode(42));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [fixedPrefix],
                ),
                discriminators: [constantDiscriminatorNode(fixedPrefix)],
                name: 'goodEvent',
            }),
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                    [fixedPrefix, nonFixedPrefix],
                ),
                discriminators: [constantDiscriminatorNode(fixedPrefix)],
                name: 'dynamicEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, ['GoodEvent', 'GoodEvent::deserialize']);
    codeDoesNotContains(code, ['DynamicEvent']);
});

test('it does not render program events file when program has no events', () => {
    const node = programNode({
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const keys = [...renderMap.keys()];
    const programEventsFiles = keys.filter(k => k.includes('_events.rs'));
    expect(programEventsFiles).toHaveLength(0);
});

test('it includes program events module in events mod.rs', () => {
    const node = rootNode(
        programNode({
            events: [
                eventNode({
                    data: hiddenPrefixTypeNode(
                        structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                        [
                            constantValueNode(
                                fixedSizeTypeNode(bytesTypeNode(), 8),
                                bytesValueNode('base16', 'aabbccdd11223344'),
                            ),
                        ],
                    ),
                    discriminators: [
                        constantDiscriminatorNode(
                            constantValueNode(
                                fixedSizeTypeNode(bytesTypeNode(), 8),
                                bytesValueNode('base16', 'aabbccdd11223344'),
                            ),
                        ),
                    ],
                    name: 'transferEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());
    expect(renderMap.has('events/my_program_events.rs')).toBe(true);
    codeContains(getFromRenderMap(renderMap, 'events/mod.rs').content, [
        'pub(crate) mod r#my_program_events;',
        'pub use self::r#my_program_events::*;',
    ]);
});

test('it excludes program events module from events mod.rs when no events have discriminators', () => {
    const node = rootNode(
        programNode({
            events: [
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    name: 'transferEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        }),
    );

    const renderMap = visit(node, getRenderMapVisitor());
    codeDoesNotContains(getFromRenderMap(renderMap, 'events/mod.rs').content, ['my_program_events']);
});

test('it renders identify and try_parse for events with field discriminators', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(7),
                        name: 'eventType',
                        type: numberTypeNode('u8'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('eventType')],
                name: 'typedEvent',
            }),
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(1.0),
                        name: 'version',
                        type: numberTypeNode('f32'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('version')],
                name: 'floatDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'pub fn identify_my_program_event',
        'data.get(..1) == Some(&TYPED_EVENT_EVENT_TYPE.to_le_bytes())',
        'return Some(MyProgramEventKind::TypedEvent)',
        'data.get(..4) == Some(&FLOAT_DISC_EVENT_VERSION.to_le_bytes())',
        'return Some(MyProgramEventKind::FloatDiscEvent)',
        'pub fn try_parse_my_program_event',
    ]);
});

test('it renders identify and try_parse for events with size discriminators', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [sizeDiscriminatorNode(8)],
                name: 'fixedSizeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'pub fn identify_my_program_event',
        'data.len() == 8',
        'return Some(MyProgramEventKind::FixedSizeEvent)',
        'pub fn try_parse_my_program_event',
    ]);
});

test('it AND-s multiple discriminators for the same event in identify', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: numberValueNode(3),
                        name: 'eventType',
                        type: numberTypeNode('u8'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [sizeDiscriminatorNode(9), fieldDiscriminatorNode('eventType')],
                name: 'mixedDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'data.len() == 9 && data.get(..1) == Some(&MIXED_DISC_EVENT_EVENT_TYPE.to_le_bytes())',
        'return Some(MyProgramEventKind::MixedDiscEvent)',
    ]);
});

test('it renders identify for events with byte-array field discriminators', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({
                        defaultValue: arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
                        name: 'disc',
                        type: arrayTypeNode(numberTypeNode('u8'), fixedCountNode(3)),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('disc')],
                name: 'arrayDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'pub fn identify_my_program_event',
        'data.get(..ARRAY_DISC_EVENT_DISC.len()) == Some(&ARRAY_DISC_EVENT_DISC[..])',
        'return Some(MyProgramEventKind::ArrayDiscEvent)',
    ]);
    codeDoesNotContains(code, ['to_le_bytes']);

    const eventCode = getFromRenderMap(renderMap, 'events/array_disc_event.rs').content;
    codeContains(eventCode, ['ARRAY_DISC_EVENT_DISC: [u8; 3] = [1, 2, 3]']);
});

test('it handles non-zero offset in constant discriminator conditions', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'aabbccdd')),
                        8,
                    ),
                ],
                name: 'offsetEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'pub fn identify_my_program_event',
        'data.get(8..12) == Some(&OFFSET_EVENT_DISCRIMINATOR[..])',
        'return Some(MyProgramEventKind::OffsetEvent)',
        'pub fn try_parse_my_program_event',
        'OffsetEvent::deserialize(&mut data)',
    ]);
});

test('it uses a literal range in identify for u8-array constant discriminators at non-zero offset', () => {
    // u8-array constant: no fixedSizeTypeNode, but the fixed count gives a static size of 3.
    const arrayDisc = constantValueNode(
        arrayTypeNode(numberTypeNode('u8'), fixedCountNode(3)),
        arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
    );
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [constantDiscriminatorNode(arrayDisc, 4)],
                name: 'tailDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'data.get(4..7) == Some(&TAIL_DISC_EVENT_DISCRIMINATOR[..])',
        'return Some(MyProgramEventKind::TailDiscEvent)',
    ]);
});

test('it falls back to starts_with in identify when a non-zero-offset discriminator size is unknown', () => {
    // Link-typed constant: byte size not resolvable at the discriminator site.
    const linkDisc = constantValueNode(
        definedTypeLinkNode('discAlias'),
        arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
    );
    const node = programNode({
        definedTypes: [definedTypeNode({ name: 'discAlias', type: fixedSizeTypeNode(bytesTypeNode(), 3) })],
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [constantDiscriminatorNode(linkDisc, 4)],
                name: 'tailDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'data.get(4..).is_some_and(|tail| tail.starts_with(&TAIL_DISC_EVENT_DISCRIMINATOR[..]))',
        'return Some(MyProgramEventKind::TailDiscEvent)',
    ]);
});

test('it compares number constant discriminators via to_le_bytes in identify', () => {
    // Scalar number constants can't be sliced, so identify compares their byte encoding.
    // Only LE is reachable: the type manifest visitor rejects big-endian numbers for Borsh.
    const numDisc = constantValueNode(numberTypeNode('u32'), numberValueNode(42));
    const shortDisc = constantValueNode(numberTypeNode('u16'), numberValueNode(7));
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [constantDiscriminatorNode(numDisc, 0), constantDiscriminatorNode(shortDisc, 8)],
                name: 'numDiscEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    const eventCode = getFromRenderMap(renderMap, 'events/num_disc_event.rs').content;
    codeContains(eventCode, [
        'pub const NUM_DISC_EVENT_DISCRIMINATOR: u32 = 42;',
        'pub const NUM_DISC_EVENT_DISCRIMINATOR2: u16 = 7;',
    ]);

    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;
    codeContains(code, [
        'data.get(..4) == Some(&NUM_DISC_EVENT_DISCRIMINATOR.to_le_bytes())',
        'data.get(8..10) == Some(&NUM_DISC_EVENT_DISCRIMINATOR2.to_le_bytes())',
        'return Some(MyProgramEventKind::NumDiscEvent)',
    ]);
});

test('it uses a literal range for fixed-size field discriminators at non-zero offset', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'header', type: numberTypeNode('u32') }),
                    structFieldTypeNode({
                        defaultValue: arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
                        name: 'disc',
                        type: arrayTypeNode(numberTypeNode('u8'), fixedCountNode(3)),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('disc', 4)],
                name: 'offsetFieldEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'data.get(4..7) == Some(&OFFSET_FIELD_EVENT_DISC[..])',
        'return Some(MyProgramEventKind::OffsetFieldEvent)',
    ]);
});

test('it falls back to starts_with for field discriminators with unknown size at non-zero offset', () => {
    const node = programNode({
        definedTypes: [definedTypeNode({ name: 'discAlias', type: fixedSizeTypeNode(bytesTypeNode(), 3) })],
        events: [
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'header', type: numberTypeNode('u32') }),
                    structFieldTypeNode({
                        defaultValue: arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
                        name: 'disc',
                        // Link-typed field: byte size not resolvable at the discriminator site.
                        type: definedTypeLinkNode('discAlias'),
                    }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('disc', 4)],
                name: 'offsetFieldEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'data.get(4..).is_some_and(|tail| tail.starts_with(&OFFSET_FIELD_EVENT_DISC[..]))',
        'return Some(MyProgramEventKind::OffsetFieldEvent)',
    ]);
});

test('it handles multiple constant discriminators and excludes events with unresolvable field discriminators', () => {
    const disc1 = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'aabbccdd'));
    const disc2 = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 2), bytesValueNode('base16', 'eeff'));
    const node = programNode({
        events: [
            // Event with two constant discriminators — tests _2 suffix naming and AND-ing.
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') })]),
                discriminators: [constantDiscriminatorNode(disc1, 0), constantDiscriminatorNode(disc2, 4)],
                name: 'multiDiscEvent',
            }),
            // Event with field discriminator that has no defaultValue — should be excluded.
            eventNode({
                data: structTypeNode([
                    structFieldTypeNode({ name: 'eventType', type: numberTypeNode('u8') }),
                    structFieldTypeNode({ name: 'value', type: numberTypeNode('u64') }),
                ]),
                discriminators: [fieldDiscriminatorNode('eventType')],
                name: 'noDefaultEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        'MULTI_DISC_EVENT_DISCRIMINATOR.len()) == Some(&MULTI_DISC_EVENT_DISCRIMINATOR[..])',
        'data.get(4..6) == Some(&MULTI_DISC_EVENT_DISCRIMINATOR2[..])',
        'return Some(MyProgramEventKind::MultiDiscEvent)',
    ]);
    codeContains(code, ['pub enum MyProgramEventKind']);
    codeDoesNotContains(code, ['NoDefaultEvent']);
});

test('it derives Eq on the aggregate event enum when all variants derive it', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [/#\[derive\(Clone, Debug, Eq, PartialEq\)\]\s*pub enum MyProgramEvent \{/]);
});

test('it omits Eq on the aggregate event enum when a variant does not derive it', () => {
    const node = programNode({
        events: [
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                discriminators: [
                    constantDiscriminatorNode(
                        constantValueNode(
                            fixedSizeTypeNode(bytesTypeNode(), 8),
                            bytesValueNode('base16', 'aabbccdd11223344'),
                        ),
                    ),
                ],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(
        node,
        getRenderMapVisitor({
            traitOptions: {
                overrides: {
                    tradeEvent: ['borsh::BorshSerialize', 'borsh::BorshDeserialize', 'Clone', 'Debug', 'PartialEq'],
                },
            },
        }),
    );
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [/#\[derive\(Clone, Debug, PartialEq\)\]\s*pub enum MyProgramEvent \{/]);
});

test('it guards the aggregate inside identify, which owns every byte comparison', () => {
    const disc = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 8), bytesValueNode('base16', 'aabbccdd11223344'));
    const node = programNode({
        events: [
            eventNode({
                // No framing: the guard is independent of the CPI framing check.
                data: structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                discriminators: [constantDiscriminatorNode(disc)],
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const code = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(code, [
        // The guard sits in identify, ahead of the discriminator comparisons it owns.
        /pub fn identify_my_program_event\(program_id: &solana_address::Address, data: &\[u8\]\) -> Option<MyProgramEventKind> \{\s*if program_id != &crate::MY_PROGRAM_ID \{\s*return None;\s*\}\s*if data\.get\(\.\.TRADE_EVENT_DISCRIMINATOR\.len\(\)\)/,
        // The aggregate parse guards once, through identify, so the two cannot disagree.
        'pub fn try_parse_my_program_event(program_id: &solana_address::Address, data: &[u8]) -> Option<Result<MyProgramEvent, std::io::Error>>',
        'let event_kind = identify_my_program_event(program_id, data)?;',
    ]);
    // A foreign program is ordinary when iterating a transaction, so the guard returns a value.
    codeDoesNotContains(code, ['Err(std::io::Error::new', '_unchecked', 'expected_program_id']);
});

// --- Event framing (CPI-framed) tests ---

const cpiFraming = { kind: 'anchorEventCpi', sharedConstantName: 'eventCpiPrefix' as CamelCaseString };
const framingPrefix = constantValueNode(
    fixedSizeTypeNode(bytesTypeNode(), 8),
    bytesValueNode('base16', 'aabbccdd11223344'),
);
const tradeDisc = constantValueNode(
    fixedSizeTypeNode(bytesTypeNode(), 8),
    bytesValueNode('base16', '1122334455667788'),
);
const settleDisc = constantValueNode(
    fixedSizeTypeNode(bytesTypeNode(), 8),
    bytesValueNode('base16', '99aabbccddeeff00'),
);

function framedEvent(name: string, eventDisc: ReturnType<typeof constantValueNode>) {
    return eventNode({
        data: hiddenPrefixTypeNode(
            structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
            [framingPrefix, eventDisc],
        ),
        discriminators: [constantDiscriminatorNode(framingPrefix, 0), constantDiscriminatorNode(eventDisc, 8)],
        framing: cpiFraming,
        name,
    });
}

test('it hoists the shared framing constant to the program-events file', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc), framedEvent('settleEvent', settleDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(programEventsCode, [
        'pub const EVENT_CPI_PREFIX: [u8; 8] = [170, 187, 204, 221, 17, 34, 51, 68];',
        // identify hoists the shared framing check and inlines each event's own
        // discriminator checks inside the framed block.
        /if data\.get\(\.\.EVENT_CPI_PREFIX\.len\(\)\) == Some\(&EVENT_CPI_PREFIX\[\.\.\]\) \{\s*if data\.get\(8\.\.16\) == Some\(&SETTLE_EVENT_DISCRIMINATOR\[\.\.\]\) \{\s*return Some\(MyProgramEventKind::SettleEvent\);\s*\}\s*if data\.get\(8\.\.16\) == Some\(&TRADE_EVENT_DISCRIMINATOR\[\.\.\]\) \{\s*return Some\(MyProgramEventKind::TradeEvent\);\s*\}\s*\}/,
    ]);
    expect(programEventsCode.match(/pub const EVENT_CPI_PREFIX/g)).toHaveLength(1);
});

test('it renders per-event _DISCRIMINATOR with IDL bytes, not framing bytes', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const tradeEventCode = getFromRenderMap(renderMap, 'events/trade_event.rs').content;

    codeContains(tradeEventCode, ['TRADE_EVENT_DISCRIMINATOR: [u8; 8] = [17, 34, 51, 68, 85, 102, 119, 136]']);
    codeDoesNotContains(tradeEventCode, ['[170, 187, 204, 221, 17, 34, 51, 68]', 'pub const EVENT_CPI_PREFIX']);
});

test('it generates try_parse that delegates framing and discriminator validation to matches', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const tradeEventCode = getFromRenderMap(renderMap, 'events/trade_event.rs').content;

    codeContains(tradeEventCode, [
        // matches validates the program, the CPI framing prefix and the event discriminator
        // together; the framing compare is what proves data is long enough for the skip below.
        'pub fn matches(program_id: &solana_address::Address, data: &[u8]) -> bool',
        'program_id == &crate::MY_PROGRAM_ID && data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..]) && data.get(8..16) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        // try_parse signals mismatch as a value instead of an error.
        'pub fn try_parse(program_id: &solana_address::Address, data: &[u8]) -> Option<Result<Self, std::io::Error>>',
        'if !Self::matches(program_id, data)',
        'return None;',
        // Both discriminator sizes are known, so the skip folds to a literal
        // with an explanatory comment on the line above.
        /\/\/ EVENT_CPI_PREFIX \(8\) \+ TRADE_EVENT_DISCRIMINATOR \(8\)\n\s*let mut data = &data\[16\.\.\];\n\s*Some\(Self::deserialize\(&mut data\)\)/,
    ]);
    codeDoesNotContains(tradeEventCode, ['from_bytes', 'Err(std::io::Error::new']);
});

test('it folds the framed skip to a literal for u8-array discriminators', () => {
    // u8-array discriminator: the fixed count gives a static size of 8, so the skip folds to 16.
    const arrayEventDisc = constantValueNode(
        arrayTypeNode(numberTypeNode('u8'), fixedCountNode(8)),
        arrayValueNode([
            numberValueNode(1),
            numberValueNode(2),
            numberValueNode(3),
            numberValueNode(4),
            numberValueNode(5),
            numberValueNode(6),
            numberValueNode(7),
            numberValueNode(8),
        ]),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [framingPrefix, arrayEventDisc],
                ),
                discriminators: [
                    constantDiscriminatorNode(framingPrefix, 0),
                    constantDiscriminatorNode(arrayEventDisc, 8),
                ],
                framing: cpiFraming,
                name: 'mixedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const eventCode = getFromRenderMap(renderMap, 'events/mixed_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(eventCode, [
        'data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..])',
        'data.get(8..16) == Some(&MIXED_EVENT_DISCRIMINATOR[..])',
        'let mut data = &data[16..];',
    ]);
    codeContains(programEventsCode, [
        /MyProgramEventKind::MixedEvent => \{\s*\/\/ EVENT_CPI_PREFIX \(8\) \+ MIXED_EVENT_DISCRIMINATOR \(8\)\n\s*let mut data = &data\[16\.\.\];\n\s*MixedEvent::deserialize\(&mut data\)/,
    ]);
});

test('it compares number constant discriminators via to_le_bytes in framed matches', () => {
    const numEventDisc = constantValueNode(numberTypeNode('u32'), numberValueNode(42));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [framingPrefix, numEventDisc],
                ),
                discriminators: [
                    constantDiscriminatorNode(framingPrefix, 0),
                    constantDiscriminatorNode(numEventDisc, 8),
                ],
                framing: cpiFraming,
                name: 'numFramedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const eventCode = getFromRenderMap(renderMap, 'events/num_framed_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(eventCode, [
        'pub const NUM_FRAMED_EVENT_DISCRIMINATOR: u32 = 42;',
        'data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..])',
        'data.get(8..12) == Some(&NUM_FRAMED_EVENT_DISCRIMINATOR.to_le_bytes())',
        // Both sizes are known (8 framing + 4 number), so the skip folds to a literal.
        'let mut data = &data[12..];',
    ]);
    codeContains(programEventsCode, [
        'data.get(8..12) == Some(&NUM_FRAMED_EVENT_DISCRIMINATOR.to_le_bytes())',
        /MyProgramEventKind::NumFramedEvent => \{\s*\/\/ EVENT_CPI_PREFIX \(8\) \+ NUM_FRAMED_EVENT_DISCRIMINATOR \(4\)\n\s*let mut data = &data\[12\.\.\];\n\s*NumFramedEvent::deserialize\(&mut data\)/,
    ]);
});

test('it falls back to a chained .len() slice skip when a framed discriminator size is unknown', () => {
    // Link-typed discriminator: the aliased type's byte size is not resolvable
    // at the discriminator site, so the framed skip can't fold to a literal.
    const linkEventDisc = constantValueNode(
        definedTypeLinkNode('discAlias'),
        arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
    );
    const node = programNode({
        definedTypes: [definedTypeNode({ name: 'discAlias', type: fixedSizeTypeNode(bytesTypeNode(), 3) })],
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [framingPrefix, linkEventDisc],
                ),
                discriminators: [
                    constantDiscriminatorNode(framingPrefix, 0),
                    constantDiscriminatorNode(linkEventDisc, 8),
                ],
                framing: cpiFraming,
                name: 'mixedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const eventCode = getFromRenderMap(renderMap, 'events/mixed_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(eventCode, [
        'data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..])',
        'data.get(8..).is_some_and(|tail| tail.starts_with(&MIXED_EVENT_DISCRIMINATOR[..]))',
        // The framing size (8) is known and folds to a literal; the unknown-size
        // discriminator chains a `[.len()..]` slice so no `+` arithmetic is emitted.
        /\/\/ EVENT_CPI_PREFIX \(8\) \+ MIXED_EVENT_DISCRIMINATOR\n\s*let mut data = &data\[8\.\.\]\[MIXED_EVENT_DISCRIMINATOR\.len\(\)\.\.\];/,
    ]);
    // identify inlines the own-discriminator check inside the hoisted framing block,
    // and the try_parse skip references the same unknown-size constant.
    codeContains(programEventsCode, [
        'use crate::generated::events::MIXED_EVENT_DISCRIMINATOR;',
        'data.get(8..).is_some_and(|tail| tail.starts_with(&MIXED_EVENT_DISCRIMINATOR[..]))',
        'let mut data = &data[8..][MIXED_EVENT_DISCRIMINATOR.len()..];',
    ]);
});

test('it hoists a single framing check in identify for framed events', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc), framedEvent('settleEvent', settleDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(programEventsCode, [
        'pub fn identify_my_program_event',
        // The aggregate imports the per-event discriminator constants for the inlined checks.
        'use crate::generated::events::TRADE_EVENT_DISCRIMINATOR;',
        'use crate::generated::events::SETTLE_EVENT_DISCRIMINATOR;',
        'if data.get(8..16) == Some(&TRADE_EVENT_DISCRIMINATOR[..])',
        'if data.get(8..16) == Some(&SETTLE_EVENT_DISCRIMINATOR[..])',
        'pub fn try_parse_my_program_event',
        // Skips are numeric literals (8 framing + 8 event disc), so match each arm to keep them distinct.
        /MyProgramEventKind::TradeEvent => \{\s*\/\/ EVENT_CPI_PREFIX \(8\) \+ TRADE_EVENT_DISCRIMINATOR \(8\)\n\s*let mut data = &data\[16\.\.\];\n\s*TradeEvent::deserialize\(&mut data\)/,
        /MyProgramEventKind::SettleEvent => \{\s*\/\/ EVENT_CPI_PREFIX \(8\) \+ SETTLE_EVENT_DISCRIMINATOR \(8\)\n\s*let mut data = &data\[16\.\.\];\n\s*SettleEvent::deserialize\(&mut data\)/,
    ]);
    // Foreign data is rejected with a single framing compare: the framing bytes
    // appear once in identify, and no arm re-checks them via matches.
    expect(programEventsCode.match(/data\.get\(\.\.EVENT_CPI_PREFIX\.len\(\)\)/g)).toHaveLength(1);
    codeDoesNotContains(programEventsCode, ['TradeEvent::matches', 'SettleEvent::matches']);
});

test('it does not hoist a shared constant when no event has framing', () => {
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [framingPrefix],
                ),
                discriminators: [constantDiscriminatorNode(framingPrefix, 0)],
                name: 'plainEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;
    const plainEventCode = getFromRenderMap(renderMap, 'events/plain_event.rs').content;

    codeDoesNotContains(programEventsCode, ['EVENT_CPI_PREFIX']);
    codeDoesNotContains(plainEventCode, ['EVENT_CPI_PREFIX']);
    codeContains(plainEventCode, ['PLAIN_EVENT_DISCRIMINATOR: [u8; 8] = [170, 187, 204, 221, 17, 34, 51, 68]']);
});

test('it renders framed and non-framed events side-by-side without cross-contamination', () => {
    const node = programNode({
        events: [
            framedEvent('tradeEvent', tradeDisc),
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                discriminators: [constantDiscriminatorNode(settleDisc, 0)],
                name: 'plainEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const tradeEventCode = getFromRenderMap(renderMap, 'events/trade_event.rs').content;
    const plainEventCode = getFromRenderMap(renderMap, 'events/plain_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(tradeEventCode, [
        'use crate::generated::events::EVENT_CPI_PREFIX;',
        'data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..])',
    ]);
    codeDoesNotContains(plainEventCode, ['EVENT_CPI_PREFIX']);
    codeContains(programEventsCode, [
        'pub const EVENT_CPI_PREFIX: [u8; 8] = [170, 187, 204, 221, 17, 34, 51, 68];',
        'return Some(MyProgramEventKind::TradeEvent)',
        'return Some(MyProgramEventKind::PlainEvent)',
        // The framed event sits inside the hoisted framing block; the unframed
        // event's check comes after the block closes.
        /return Some\(MyProgramEventKind::TradeEvent\);\s*\}\s*\}\s*if data\.get\(\.\.PLAIN_EVENT_DISCRIMINATOR\.len\(\)\) == Some\(&PLAIN_EVENT_DISCRIMINATOR\[\.\.\]\)/,
    ]);
});

test('it fails fast when an event file path collides with the program events file', () => {
    const node = programNode({
        events: [
            framedEvent('tradeEvent', tradeDisc),
            // snake_case file name collides with the aggregate `my_program_events.rs`,
            // which would otherwise silently overwrite it in the render map.
            eventNode({
                data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                discriminators: [constantDiscriminatorNode(settleDisc, 0)],
                name: 'myProgramEvents',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        /Naming conflict in program \[myProgram\].*event \[myProgramEvents\].*my_program_events\.rs/,
    );
});

test('it fails fast when an event struct name collides with the aggregate event enums', () => {
    const makeNode = (eventName: string) =>
        programNode({
            events: [
                framedEvent('tradeEvent', tradeDisc),
                eventNode({
                    data: structTypeNode([structFieldTypeNode({ name: 'value', type: numberTypeNode('u32') })]),
                    discriminators: [constantDiscriminatorNode(settleDisc, 0)],
                    name: eventName as CamelCaseString,
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

    // Glob re-exports make these only a rustc warning, so fail at generation time instead.
    expect(() => visit(makeNode('myProgramEvent'), getRenderMapVisitor())).toThrow(
        /Naming conflict in program \[myProgram\].*MyProgramEvent/,
    );
    expect(() => visit(makeNode('myProgramEventKind'), getRenderMapVisitor())).toThrow(
        /Naming conflict in program \[myProgram\].*MyProgramEventKind/,
    );
});

test('it fails fast on duplicate event names', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc), framedEvent('tradeEvent', settleDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    expect(() => visit(node, getRenderMapVisitor())).toThrow(
        /Naming conflict in program \[myProgram\].*event \[tradeEvent\]/,
    );
});

test('it warns and excludes framing-only events from the per-event helpers', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        // Its ONLY discriminator is the shared CPI framing, which matches every framed event.
        const bareEvent = eventNode({
            data: hiddenPrefixTypeNode(
                structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                [framingPrefix],
            ),
            discriminators: [constantDiscriminatorNode(framingPrefix, 0)],
            framing: cpiFraming,
            name: 'bareEvent',
        });
        const node = programNode({
            events: [bareEvent, framedEvent('tradeEvent', tradeDisc)],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());
        const bareEventCode = getFromRenderMap(renderMap, 'events/bare_event.rs').content;

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toMatch(
            /Event \[bareEvent\] has no usable discriminator beyond the shared CPI framing/,
        );

        // The struct still renders with a doc note explaining the missing helpers,
        // but the helpers that would match every framed event do not.
        codeContains(bareEventCode, [
            'pub struct BareEvent',
            "/// This event has no usable discriminator beyond the program's shared CPI framing, so",
        ]);
        codeDoesNotContains(bareEventCode, ['pub fn matches', 'pub fn try_parse', 'EVENT_CPI_PREFIX']);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it excludes framing-only events from identify and try_parse', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const bareEvent = eventNode({
            data: hiddenPrefixTypeNode(
                structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                [framingPrefix],
            ),
            discriminators: [constantDiscriminatorNode(framingPrefix, 0)],
            framing: cpiFraming,
            name: 'bareEvent',
        });
        const node = programNode({
            events: [bareEvent, framedEvent('tradeEvent', tradeDisc)],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());
        const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

        // BareEvent would shadow every framed event (it sorts first), so it is excluded entirely.
        codeDoesNotContains(programEventsCode, ['BareEvent']);
        // Knowing the program does not make it identifiable: the framing tag is shared by every
        // Anchor program and by every framed sibling within this one.
        codeDoesNotContains(getFromRenderMap(renderMap, 'events/bare_event.rs').content, [
            'pub fn matches',
            'pub fn try_parse',
            'program_id',
        ]);
        codeContains(programEventsCode, [
            'pub enum MyProgramEventKind',
            'return Some(MyProgramEventKind::TradeEvent)',
            'TradeEvent::deserialize(&mut data)',
        ]);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it does not render the program events file when all events are framing-only', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const bareEvent = eventNode({
            data: hiddenPrefixTypeNode(
                structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                [framingPrefix],
            ),
            discriminators: [constantDiscriminatorNode(framingPrefix, 0)],
            framing: cpiFraming,
            name: 'bareEvent',
        });
        const node = programNode({
            events: [bareEvent],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());
        expect(renderMap.has('events/my_program_events.rs')).toBe(false);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it warns and hoists only the first framing when events have conflicting sharedConstantName', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        const altFraming = { kind: 'anchorEventCpi', sharedConstantName: 'altPrefix' as CamelCaseString };
        const altPrefix = constantValueNode(
            fixedSizeTypeNode(bytesTypeNode(), 8),
            bytesValueNode('base16', 'deadbeefcafebabe'),
        );
        const altEvent = eventNode({
            data: hiddenPrefixTypeNode(
                structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                [altPrefix, settleDisc],
            ),
            discriminators: [constantDiscriminatorNode(altPrefix, 0), constantDiscriminatorNode(settleDisc, 8)],
            framing: altFraming,
            name: 'settleEvent',
        });

        const node = programNode({
            events: [framedEvent('tradeEvent', tradeDisc), altEvent],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());
        const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toMatch(/conflicting event framings.*'eventCpiPrefix' vs 'altPrefix'/);

        codeContains(programEventsCode, ['pub const EVENT_CPI_PREFIX']);
        codeDoesNotContains(programEventsCode, ['pub const ALT_PREFIX']);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it includes field discriminator checks in matches, identically to identify', () => {
    // CPI-framed event whose only post-framing discriminator is a field discriminator:
    // matches() must check the field bytes, not just the shared framing.
    const fieldEvent = eventNode({
        data: hiddenPrefixTypeNode(
            structTypeNode([
                structFieldTypeNode({
                    defaultValue: numberValueNode(3),
                    name: 'eventType',
                    type: numberTypeNode('u8'),
                }),
                structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') }),
            ]),
            [framingPrefix],
        ),
        discriminators: [constantDiscriminatorNode(framingPrefix, 0), fieldDiscriminatorNode('eventType', 8)],
        framing: cpiFraming,
        name: 'fieldEvent',
    });
    const node = programNode({
        events: [fieldEvent, framedEvent('tradeEvent', tradeDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const fieldEventCode = getFromRenderMap(renderMap, 'events/field_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(fieldEventCode, [
        'pub const FIELD_EVENT_EVENT_TYPE: u8 = 3;',
        // matches checks the framing AND the field discriminator bytes.
        'data.get(..EVENT_CPI_PREFIX.len()) == Some(&EVENT_CPI_PREFIX[..]) && data.get(8..9) == Some(&FIELD_EVENT_EVENT_TYPE.to_le_bytes())',
        // The field is part of the body, so only the framing prefix is skipped.
        'let mut data = &data[8..];',
    ]);
    // identify uses the exact same field check inside the hoisted framing block.
    codeContains(programEventsCode, [
        'use crate::generated::events::FIELD_EVENT_EVENT_TYPE;',
        'data.get(8..9) == Some(&FIELD_EVENT_EVENT_TYPE.to_le_bytes())',
        'return Some(MyProgramEventKind::FieldEvent)',
    ]);
});

test('it excludes framed events whose field discriminator has no default value everywhere', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        // The field discriminator has no defaultValue, so no byte check can be derived:
        // without one, matches() would match every framed event of the program.
        const noDefaultEvent = eventNode({
            data: hiddenPrefixTypeNode(
                structTypeNode([
                    structFieldTypeNode({ name: 'eventType', type: numberTypeNode('u8') }),
                    structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') }),
                ]),
                [framingPrefix],
            ),
            discriminators: [constantDiscriminatorNode(framingPrefix, 0), fieldDiscriminatorNode('eventType', 8)],
            framing: cpiFraming,
            name: 'noDefaultEvent',
        });
        const node = programNode({
            events: [noDefaultEvent],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());
        const eventCode = getFromRenderMap(renderMap, 'events/no_default_event.rs').content;

        expect(warnSpy).toHaveBeenCalledTimes(1);
        expect(warnSpy.mock.calls[0][0]).toMatch(
            /Event \[noDefaultEvent\] has no usable discriminator beyond the shared CPI framing/,
        );

        // No helpers and no import of the framing constant: the aggregate file
        // that would declare it is never rendered.
        codeDoesNotContains(eventCode, ['pub fn matches', 'pub fn try_parse', 'EVENT_CPI_PREFIX']);
        expect(renderMap.has('events/my_program_events.rs')).toBe(false);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it skips the full hidden prefix even when discriminators do not cover it', () => {
    // The hidden prefix carries a third constant that no discriminator references: the
    // body starts after the whole prefix (8 + 8 + 4), not the discriminators' 16 bytes.
    const extraConst = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'deadbeef'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [framingPrefix, tradeDisc, extraConst],
                ),
                discriminators: [constantDiscriminatorNode(framingPrefix, 0), constantDiscriminatorNode(tradeDisc, 8)],
                framing: cpiFraming,
                name: 'paddedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const eventCode = getFromRenderMap(renderMap, 'events/padded_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(eventCode, [
        '// EVENT_CPI_PREFIX (8) + PADDED_EVENT_DISCRIMINATOR (8) + hidden prefix entry (4)',
        'let mut data = &data[20..];',
        // The discriminators prove 16 bytes; the skip consumes 20, so matches proves the rest.
        'data.get(8..16) == Some(&PADDED_EVENT_DISCRIMINATOR[..]) && data.len() >= 20',
    ]);
    codeContains(programEventsCode, [
        'let mut data = &data[20..];',
        'if data.get(8..16) == Some(&PADDED_EVENT_DISCRIMINATOR[..]) && data.len() >= 20 {',
    ]);
});

test('it proves the full hidden prefix in matches for an unframed event', () => {
    // Prefix [A(8), B(8)] with a single discriminator on A: matches proves 8 bytes while
    // try_parse indexes at 16, so a 9-byte buffer starting with A used to panic.
    const headConst = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const tailConst = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', '1122334455667788'),
    );
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                    [headConst, tailConst],
                ),
                discriminators: [constantDiscriminatorNode(headConst, 0)],
                name: 'skewedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const eventCode = getFromRenderMap(renderMap, 'events/skewed_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    codeContains(eventCode, [
        'data.get(..SKEWED_EVENT_DISCRIMINATOR.len()) == Some(&SKEWED_EVENT_DISCRIMINATOR[..]) && data.len() >= 16',
        'let mut data = &data[16..];',
    ]);
    codeContains(programEventsCode, [
        'if data.get(..SKEWED_EVENT_DISCRIMINATOR.len()) == Some(&SKEWED_EVENT_DISCRIMINATOR[..]) && data.len() >= 16 {',
        'let mut data = &data[16..];',
    ]);
});

test('it counts every level of a nested hidden prefix', () => {
    // Both prefix levels precede the body: the skip is 8 + 4, not the outer level's 8.
    const outerConst = constantValueNode(
        fixedSizeTypeNode(bytesTypeNode(), 8),
        bytesValueNode('base16', 'aabbccdd11223344'),
    );
    const innerConst = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'deadbeef'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    hiddenPrefixTypeNode(
                        structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                        [innerConst],
                    ),
                    [outerConst],
                ),
                discriminators: [constantDiscriminatorNode(outerConst, 0)],
                name: 'nestedEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    codeContains(getFromRenderMap(renderMap, 'events/nested_event.rs').content, [
        'data.get(..NESTED_EVENT_DISCRIMINATOR.len()) == Some(&NESTED_EVENT_DISCRIMINATOR[..]) && data.len() >= 12',
        'let mut data = &data[12..];',
    ]);
    codeContains(getFromRenderMap(renderMap, 'events/my_program_events.rs').content, [
        'if data.get(..NESTED_EVENT_DISCRIMINATOR.len()) == Some(&NESTED_EVENT_DISCRIMINATOR[..]) && data.len() >= 12 {',
        'let mut data = &data[12..];',
    ]);
});

test('it counts a nested hidden prefix under the CPI framing', () => {
    const innerConst = constantValueNode(fixedSizeTypeNode(bytesTypeNode(), 4), bytesValueNode('base16', 'deadbeef'));
    const node = programNode({
        events: [
            eventNode({
                data: hiddenPrefixTypeNode(
                    hiddenPrefixTypeNode(
                        structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                        [innerConst],
                    ),
                    [framingPrefix, tradeDisc],
                ),
                discriminators: [constantDiscriminatorNode(framingPrefix, 0), constantDiscriminatorNode(tradeDisc, 8)],
                framing: cpiFraming,
                name: 'tradeEvent',
            }),
        ],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    codeContains(getFromRenderMap(renderMap, 'events/trade_event.rs').content, [
        '// EVENT_CPI_PREFIX (8) + TRADE_EVENT_DISCRIMINATOR (8) + hidden prefix entry (4)',
        'let mut data = &data[20..];',
        // The discriminators prove 16 bytes; the inner level pushes the skip to 20.
        'data.get(8..16) == Some(&TRADE_EVENT_DISCRIMINATOR[..]) && data.len() >= 20',
    ]);
    codeContains(getFromRenderMap(renderMap, 'events/my_program_events.rs').content, [
        'if data.get(8..16) == Some(&TRADE_EVENT_DISCRIMINATOR[..]) && data.len() >= 20 {',
        'let mut data = &data[20..];',
    ]);
});

test('it drops the parse helpers when another wrapper hides leading bytes', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        // The decoder resolves through the size prefix, so no hidden-prefix offset reaches the body.
        const node = programNode({
            events: [
                eventNode({
                    data: hiddenPrefixTypeNode(
                        sizePrefixTypeNode(
                            structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                            numberTypeNode('u32'),
                        ),
                        [framingPrefix],
                    ),
                    discriminators: [constantDiscriminatorNode(framingPrefix, 0)],
                    name: 'sizedEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());

        expect(warnSpy.mock.calls[0][0]).toMatch(/Event \[sizedEvent\] wraps its data in a \[sizePrefixTypeNode\]/);
        codeDoesNotContains(getFromRenderMap(renderMap, 'events/sized_event.rs').content, [
            'pub fn matches',
            'pub fn try_parse',
        ]);
        expect(renderMap.has('events/my_program_events.rs')).toBe(false);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it drops the parse helpers when the skip width cannot be stated as a length check', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
        // The link-typed discriminator makes the skip a `[.len()..]` chain, and the trailing
        // unreferenced constant pushes the literal part past what any single check proves.
        const linkEventDisc = constantValueNode(
            definedTypeLinkNode('discAlias'),
            arrayValueNode([numberValueNode(1), numberValueNode(2), numberValueNode(3)]),
        );
        const extraConst = constantValueNode(
            fixedSizeTypeNode(bytesTypeNode(), 4),
            bytesValueNode('base16', 'deadbeef'),
        );
        const node = programNode({
            definedTypes: [definedTypeNode({ name: 'discAlias', type: fixedSizeTypeNode(bytesTypeNode(), 3) })],
            events: [
                eventNode({
                    data: hiddenPrefixTypeNode(
                        structTypeNode([structFieldTypeNode({ name: 'amount', type: numberTypeNode('u64') })]),
                        [framingPrefix, linkEventDisc, extraConst],
                    ),
                    discriminators: [
                        constantDiscriminatorNode(framingPrefix, 0),
                        constantDiscriminatorNode(linkEventDisc, 8),
                    ],
                    framing: cpiFraming,
                    name: 'unprovableEvent',
                }),
            ],
            name: 'myProgram',
            publicKey: '11111111111111111111111111111111',
        });

        const renderMap = visit(node, getRenderMapVisitor());

        expect(warnSpy.mock.calls[0][0]).toMatch(
            /Event \[unprovableEvent\] has a hidden prefix whose width its discriminators do not prove/,
        );
        codeDoesNotContains(getFromRenderMap(renderMap, 'events/unprovable_event.rs').content, [
            'pub fn matches',
            'pub fn try_parse',
        ]);
        expect(renderMap.has('events/my_program_events.rs')).toBe(false);
    } finally {
        warnSpy.mockRestore();
    }
});

test('it adds no length check when the discriminators already prove the skip', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());

    codeDoesNotContains(getFromRenderMap(renderMap, 'events/trade_event.rs').content, ['data.len() >=']);
    codeDoesNotContains(getFromRenderMap(renderMap, 'events/my_program_events.rs').content, ['data.len() >=']);
});

test('it documents the transpose hint and the program-level filter_map example', () => {
    const node = programNode({
        events: [framedEvent('tradeEvent', tradeDisc)],
        name: 'myProgram',
        publicKey: '11111111111111111111111111111111',
    });

    const renderMap = visit(node, getRenderMapVisitor());
    const tradeEventCode = getFromRenderMap(renderMap, 'events/trade_event.rs').content;
    const programEventsCode = getFromRenderMap(renderMap, 'events/my_program_events.rs').content;

    // Per-event docs carry the transpose hint but no code example.
    codeContains(tradeEventCode, ['to propagate the failure with `?`.']);
    codeDoesNotContains(tradeEventCode, ['```ignore']);
    codeContains(programEventsCode, [
        '[`Option::transpose`] to propagate failures',
        '/// let events: Vec<MyProgramEvent> = datas',
        '///     .filter_map(|data| try_parse_my_program_event(program_id, data))',
        '///     .collect::<Result<_, _>>()?;',
    ]);
});
