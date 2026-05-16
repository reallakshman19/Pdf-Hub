# Global doctrine for all agents

Every WI below assumes these rules are binding.

## Product doctrine

* Do not add “feature-shaped UI” without runtime behavior.
* Do not add alternate execution paths for the same document action.
* Do not patch symptoms where a contract is missing. Add the contract first.
* Do not ship hidden destructive actions.
* Do not leave silent failure paths.
* Do not leave debug-only or placeholder UX in shipped flows.

## Engineering doctrine

* Typed contracts first.
* One command bus for page/document actions.
* One document-mutation history model.
* One save/export/session semantics model.
* One annotation interaction matrix.
* One feedback system.
* One accessibility standard.
* One evidence format.

## UX doctrine

* Every visible control must change behavior.
* Every state-changing action must provide feedback.
* Every destructive action must be previewable, undoable, or explicitly confirmed.
* Every panel must be keyboard-usable.
* Every large-document workflow must degrade gracefully.

## Non-negotiable global constraints

* Static-mode safe only.
* No backend required for this program.
* No new `window.prompt`, `window.confirm`, or placeholder panels in shipped flows.
* No direct UI mutation of document bytes after A1 lands.
* No unresolved package-lock / install drift.
* No regression in current working flows while upgrading the shell.
