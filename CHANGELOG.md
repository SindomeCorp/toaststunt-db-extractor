# Changelog

## 0.1.4 - 2026-06-11

- Fix native ToastStunt property value name alignment by ordering effective properties like ToastStunt: object-defined properties first, followed by inherited ancestor properties.

## 0.1.3 - 2026-06-11

- Add stable public TypeScript schema exports for extractor output records.
- Add a package-root entrypoint at `dist/index.js` with declarations at `dist/index.d.ts`.
- Export downstream-facing types including `ExtractedVerbRecord`, `ExtractedObjectRecord`, `ExtractedPropertyValueRecord`, `CoreCandidateRecord`, `ExtractManifest`, and `ObjectRef`.
- Add declaration maps and a compile/runtime smoke test for package-root type imports.
- Add stable `ExtractStats` counter names while preserving existing legacy counter fields.
- Document TypeScript type imports in the README.

## 0.1.2 - 2026-06-10

- Normalize npm package root metadata and release packaging.

## 0.1.1 - 2026-06-10

- Normalize npm CLI binary paths.

## 0.1.0 - 2026-06-10

- Initial ToastStunt checkpoint database extractor.
