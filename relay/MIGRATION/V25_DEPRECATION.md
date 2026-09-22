# Engineering Relay V2.5 deprecation notice

Status: **READ_ONLY_HISTORY**

V3 became the selected relay protocol at 2026-09-22T11:18:30Z.

The preserved V2.5 tree remains at `agents/relay/**` with cutover digest:

```text
sha256:ee453b02ca19c540c63fbc1fc86dd7a5382035c1d64ab2d265142300224fb82a
```

After cutover:
- existing V2.5 files remain inspectable as migration/history evidence;
- new relay authority must be written through V3 objects and commands;
- do not append new DISC/QSET/QUAL/TC/checkpoint/projection authority to the legacy tree;
- any change to the preserved legacy tree invalidates V3 cutover conformance until explicitly reconciled.
