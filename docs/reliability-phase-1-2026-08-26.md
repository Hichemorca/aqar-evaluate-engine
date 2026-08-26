# Reliability Phase 1 — 2026-08-26

## Scope

This phase addressed only portability, repository hygiene, and CI verification. No valuation formula, calibration value, evidence threshold, fallback rule, shadow multiplier, official data artifact, or public UI behavior was changed.

## Baseline

The baseline was recorded on branch `feature/v2.1-property-fields` at commit `1f95e32`. Before the changes, `npm test` passed 78 of 78 tests. The repository had 1,615 tracked files under `node_modules`, and `scripts/run-fallback-policy-experiment.js` contained machine-specific absolute paths.

## Changes

The fallback experiment now uses module-relative imports and resolves its project root from `__dirname`. Git tracking for `node_modules` was removed while the local dependency directory remains available for testing; `package.json`, `package-lock.json`, and the `@netlify/blobs` dependency remain unchanged. The scheduled Accuracy workflow now uses `npm ci` and runs `npm test` before data-fetching and artifact-generation steps.

## Verification

The post-change checks passed: `git diff --check`, inline JavaScript syntax validation, Node syntax validation for the edited fallback script and `dld-lookup.js`, and `npm test` with 78 passing tests and zero failures. The current index contains no tracked `node_modules` files. The diff contains only the fallback script, the Accuracy workflow, and documentation files; no valuation or calibration source files were changed.

## Follow-up

The next safe phase is performance optimization: create small derived summary artifacts for district names and Accuracy metadata so the homepage does not download the full DLD and Accuracy files. This should be validated by comparing the generated summaries with the authoritative full artifacts before changing the frontend fetch paths.
