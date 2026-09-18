# State Machine Knowledge Base

## Decision Index

| id | status | scope | patterns | file | commit |
| --- | --- | --- | --- | --- | --- |
| SKMB-2026-09-18-001 | accepted | PR #1 web downloader review fixes | A, B, C, D, E, F, G | [decision](decisions/2026-09-18-001-web-downloader-review.md) | See the Git history of this file |

## Invariants

- Download GET requests never acquire account entitlements.
- Acquisition requires an explicit user action and a same-origin POST.
- A failed logout does not imply that the server session was revoked.
- Download links and verification metadata belong to the current app and account.
- Range responses must respect the validator exposed by this service.

## Open Decisions

None for this fix. Git hooks are outside this change; no hooks are installed.
