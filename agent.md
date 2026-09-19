# Repository methodology

The authoritative repository instructions are in [AGENTS.md](./AGENTS.md).
All future work must follow that file. In particular, frontend code is UI-only,
all business decisions/effects live behind backend interfaces, shared contracts
are additive and type-only, and backend responsibilities communicate through
explicit module boundaries. Do not maintain a divergent copy of these rules.
