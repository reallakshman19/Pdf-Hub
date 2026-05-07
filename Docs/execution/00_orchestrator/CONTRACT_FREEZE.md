# Contract Freeze

This document outlines the strict public contracts that are frozen prior to parallel agent execution. No parallel agent (A1-A8) may alter these contracts without explicit approval from A0.

## Frozen Contracts

1. **Command Bus Types**
   - The execution entrypoint and dispatch model.
   - Associated types: `DocumentCommand`, `CommandSource`, `CommandResult`, `CommandContext`.
2. **Command Result/Error Model**
   - Standardized format for success, failure, and execution metadata.
3. **Document History Transaction Shape**
   - The structure for undo/redo mutation transactions.
4. **Save/Export/Session Action Taxonomy**
   - Explicit action types and metadata structure for last operations.
5. **Search Result Shape**
   - Text hit geometry and active result model definitions.
6. **Review Metadata Shape**
   - Thread metadata and review summary export model structure.
7. **Macro Run Report Shape**
   - Result reports from macro dry-runs and execution queues.
8. **Shared UI Feedback Contract**
   - Consistent user feedback channels and error rendering models.
