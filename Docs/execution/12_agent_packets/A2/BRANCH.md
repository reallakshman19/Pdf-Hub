# A2 Branch Assignment

- Branch: $(System.Collections.Hashtable.Branch)
- Work item: $(System.Collections.Hashtable.Title)
- Scope: thumbnail context menu, selection strip, drag indicators
- Base dependency: A1 contracts for command dispatch + mutation history where applicable.
- Integration rule: Do not bypass command layer for page/document mutations.
