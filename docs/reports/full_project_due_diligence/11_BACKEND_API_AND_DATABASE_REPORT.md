# Backend API and Database Report

Claim: Backend API is a custom Node HTTP server with domain-module services
Evidence: apps/api/src/server.ts; modules/*/src
Analysis: Server dispatches many authenticated/public/internal route groups into services.
Risk: Single large route file may become hard to audit.
Recommendation: Split route modules and generate OpenAPI.
Confidence: High

Database: 4 control-plane migrations and 29 tenant migrations. See DATABASE_INVENTORY and DATABASE_ERD.
