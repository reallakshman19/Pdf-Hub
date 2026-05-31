# Dependency Graph

- **Wave 0:** A0 (Scaffolding & Policies)
- **Wave 1:** A1 (Command Bus & History) -> *Depends on A0 Contracts*
- **Wave 2:** A2, A3, A4, A5, A6, A7 (Parallel Work) -> *Depends on A1 Contracts*
- **Wave 3:** A8 (Hardening & Testing) -> *Depends on A2-A7 Integration*
- **Wave 4:** A0 (Final Integration & Gate) -> *Depends on A8 Completion*
