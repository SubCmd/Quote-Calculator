# Architecture

## Frontend
Next.js + TypeScript

## Backend
Next.js API Routes

## Database
PostgreSQL + Prisma

---

## Layers

UI
 ↓
API
 ↓
Service
 ↓
Repository
 ↓
Database

---

## Pricing

User Selection
 ↓
Estimate API
 ↓
Pricing Service
 ↓
Pricing Rules
 ↓
Database
 ↓
Total Price

---

## Dependency Rules

UI는 Database를 직접 호출하지 않는다.

UI
→ API

API
→ Service

Service
→ Repository

Repository
→ Database