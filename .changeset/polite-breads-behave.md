---
'@codama/renderers-rust': major
---

Refactor `renderVisitor` to use `crateFolder` as its primary argument instead of the generated output path. The generated folder is now derived internally using a new `generatedFolder` option (defaults to `'src/generated'`). Remove the `crateFolder` option as it is no longer needed.

**BREAKING CHANGES**

**First argument of `renderVisitor` changed from output path to crate folder.** The function now takes the crate folder (where `Cargo.toml` lives) and derives the generated output path internally.

```diff
- const visitor = renderVisitor('clients/rust/src/generated', {
-     crateFolder: 'clients/rust',
- });
+ const visitor = renderVisitor('clients/rust');
```

**`crateFolder` option removed.** It is replaced by the first argument of `renderVisitor`.

**New `generatedFolder` option.** Defaults to `'src/generated'` and can be customized to change the output path relative to the crate folder.

```diff
- const visitor = renderVisitor('clients/rust/my/custom/path', {
-     crateFolder: 'clients/rust',
- });
+ const visitor = renderVisitor('clients/rust', {
+     generatedFolder: 'my/custom/path',
+ });
```
