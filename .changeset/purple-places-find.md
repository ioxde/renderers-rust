---
'@codama/renderers-rust': minor
---

Count every nesting level of an event's hidden prefix

`getHiddenPrefixSkip` and `getCpiFramedSkip` read `event.data.prefix` one level deep, but the generated decoder is built from the fully resolved inner type, so every leading byte from every level precedes the body's first one. An event whose data nested one hidden prefix inside another sliced past only the outer level: `hiddenPrefixTypeNode(hiddenPrefixTypeNode(body, [const4]), [const8])` rendered `&data[8..]` where the body starts at 12, deserializing the inner prefix into the first field. Borsh does not require full consumption, so that decoded into a well-typed wrong value rather than an error, and the guard in front proved 8 bytes, so nothing caught it.

Both paths now source their entries from one walker that flattens the whole chain, so the per-event `matches` and the aggregate `identify_<program>_event` arm cannot derive different offsets for the same event. The aggregate's unframed branch previously bypassed that function entirely for data that was not a hidden prefix at the top level, which is exactly the case this fixes, and now calls it unconditionally.

An event whose body sits behind any other wrapper the decoder resolves through — a size prefix, an offset, a sentinel — drops its `matches` and `try_parse` helpers with a warning and is excluded from the program's identify and parse helpers, rather than emitting a slice that lands inside bytes nothing counted. The test is whether the chain bottoms out at `resolveNestedTypeNode`'s result, so it needs no list of node kinds and cannot fall behind one added upstream. That is deliberately conservative: a trailing wrapper such as a hidden suffix adds no leading bytes and loses its helpers anyway, which costs coverage on shapes no Anchor IDL produces and buys immunity from a kind list going stale.

This is a minor rather than a patch bump because an event reaching either case loses generated exports a call site may reference, and a nested-prefix event decodes from a different offset than before. The previous output was wrong in both cases, but neither change is source-compatible. IDLs extracted from Anchor wrap events in a single hidden prefix carrying the CPI tag and the event discriminator, so they are unaffected, and every existing e2e fixture regenerates byte-identical.
