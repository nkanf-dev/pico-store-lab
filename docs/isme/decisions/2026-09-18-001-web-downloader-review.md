# SKMB-2026-09-18-001: Web Downloader Review Fixes

- status: accepted
- decided_by: designer
- approval_source: After the review proposed seven concrete fixes, the repository owner replied "修一下吧修一下吧" (please fix them), then added "顺便也检查一下 copilot 的 reviews" (also check Copilot's reviews).
- date: 2026-09-18
- commit: See the Git history of this file
- patterns: A_async_wait, B_state_persistence, C_concurrent_operations, D_external_dependency, E_security_boundary, F_fail_semantics, G_irreversible_action
- scope: PR #1 website account and download workflows

## Context

The reviewed commit restricted email codes to digits, ignored upstream send-code
rejection, represented failed logout as success, acquired entitlements from GET,
ignored If-Range, rejected local same-origin account requests, and retained old
download links during app changes. All seven cases were reproduced offline or
against the local development server.

## Decision

1. Accept letters and digits in email codes in both the browser and Worker.
2. Report a verification email as sent only after upstream business success.
3. On logout failure retain the authenticated state, report failure, and allow retry.
4. Keep GET metadata/download requests read-only with respect to account rights.
   Expose free acquisition through an explicit, same-origin POST action; paid
   unowned applications still require the official Store.
5. Evaluate If-Range against the service's MD5 ETag before forwarding Range. An
   unsupported or mismatched validator requests the complete representation.
6. Preserve the actual local request origin when adapting Node requests.
7. Clear old download links and verification state immediately when selection or
   account context changes, and ignore asynchronous results from earlier contexts.
8. Preserve the existing distinction between upstream unavailability (502) and
   rejected credentials (401), including body read and JSON parse failures. Match
   the documented `direct=1` flag exactly, align fallback copy with the existing
   paid-owned download behavior, and remove the unreachable duplicate logout branch.

## Applies To

- Website public assets, Worker handlers, delivery helpers, and development adapter.
- Regression tests, bilingual user-facing documentation, and PR fix submission.

## Rationale

Implement the concrete recommendations accepted in the review follow-up.

## Alternatives

The rejected behaviors are documented in the review; no unrelated account policy,
session lifetime, persistence schema, or deployment changes are included.

## Supersedes

None.
