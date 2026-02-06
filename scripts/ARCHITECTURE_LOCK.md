## Sensihi Copilot – Architecture Lock

These components are production-locked:

Backend:
- api/copilot.ts
- api/_mvp/orchestrator.ts
- api/_mvp/tools.ts

Frontend:
- SensihiCopilot.tsx

Data:
- sensihi_documents (schema locked)
- match_sensihi_documents RPC

Rules:
- No breaking changes
- Additive-only enhancements
- Version new behavior explicitly

Owner: Akshay
