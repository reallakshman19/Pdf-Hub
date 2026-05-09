# ENH2 Conflict Resolution

## Status

This file must be updated during integration.

## Shared conflict areas

| Area | Writer requirement | Macro requirement | Final decision | Status |
|---|---|---|---|---|
| PDF bytes | Writer export/commit may update bytes | Successful macro run updates bytes | TBD | Open |
| Dirty state | Writer edit marks dirty | Successful macro run marks dirty | TBD | Open |
| Dry-run | Not applicable | Must not mutate bytes | Dry-run never calls byte-update function | Open |
| Save/export | Writer overlay must persist/export | Macro changes must not erase uncommitted overlays | TBD | Open |
| Selected pages | Writer usually page-local | Macro uses selected/current/all pages | TBD | Open |
| Render cache | Writer overlay render separate | Macro byte update requires PDF reload | TBD | Open |
| Paste events | Writer captures paste/drop | Macro builder text fields need normal paste | Editable targets must bypass WriterOverlay paste | Open |
| Side panels | WriterSidePanel | MacroPanel | z-index/layout decision required | Open |

## Final decisions

### PDF byte update path

TBD

### Dirty-state path

TBD

### Save/export path

TBD

### Writer + macro sequencing

Required final rule:

1. Macro dry-run must never mutate PDF bytes.
2. Failed macro run must never mutate PDF bytes.
3. Successful macro run may mutate PDF bytes only through the shared byte-update function.
4. If writer overlays are uncommitted, either prompt/commit them first, or clearly preserve overlays after PDF byte replacement.

## Open issues

| ID | Severity | Issue | File | Owner | Status |
|---|---|---|---|---|---|
| ENH2-CONFLICT-001 | High | Shared PDF byte update path not selected | TBD | Integration Agent | Open |
| ENH2-CONFLICT-002 | High | Writer overlay vs macro byte mutation policy not selected | TBD | Integration Agent | Open |
| ENH2-CONFLICT-003 | Medium | Side panel z-index/layout not verified | TBD | Integration Agent | Open |
