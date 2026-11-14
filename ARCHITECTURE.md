# Logistics Dispatch Service

# Architecture Guide

**Version:** 1.0

**Status:** Active

**Architecture Style:** Modular Monolith with Lightweight Clean Architecture

---

# Purpose

This document defines the engineering standards, architectural decisions, and development rules for the Logistics Dispatch Service backend.

It serves as the single source of truth for the project's architecture.

Every new feature, refactor, module, endpoint, or infrastructure component must comply with the rules defined in this document.

When a conflict exists between existing code and this guide, this guide takes precedence.

---

# Goals

The objectives of this architecture are:

- Maintainability
- Scalability
- Simplicity
- Testability
- Readability
- Predictability
- Low Coupling
- High Cohesion
- Production Readiness

The project favors clear and pragmatic engineering decisions over unnecessary architectural complexity.

Patterns are adopted only when they solve a real problem.

---

# Scope

This document applies to the entire backend codebase, including:

- Business Logic
- API Design
- Database Access
- Infrastructure
- Background Jobs
- Real-Time Communication
- Testing
- Security
- Performance
- Future Modules

---

# Audience

This document is intended for:

- Developers
- Software Architects
- Code Reviewers
- AI Coding Assistants
- Future Contributors

All contributors are expected to understand and follow these rules before modifying the project.

---

# Guiding Principle

The architecture must remain understandable by a developer reading the project for the first time.

Readability is preferred over cleverness.

Consistency is preferred over personal preference.

Simple solutions are preferred over complex abstractions unless complexity provides measurable value.

# 1. Vision

## Mission

Logistics Dispatch Service (LDS) aims to be a production-ready backend platform for managing logistics operations, dispatch workflows, package tracking, fleet management, and real-time delivery monitoring.

The project is designed to demonstrate professional backend engineering practices while remaining practical, maintainable, and easy to evolve.

Every architectural decision must support long-term maintainability without introducing unnecessary complexity.

---

## Philosophy

This project values pragmatic engineering.

Technology, patterns, and abstractions are tools, not goals.

Every abstraction must solve a real problem.

If a design pattern increases complexity without providing measurable value, it should not be introduced.

The codebase should remain understandable by a developer who has never seen the project before.

---

## Long-Term Vision

The backend should evolve into a complete logistics platform capable of supporting:

- Multi-company (Multi-Tenant) environments
- Fleet management
- Drivers
- Packages
- Routes
- Geographic zones
- Real-time tracking
- Dispatch operations
- Notifications
- Analytics
- Reporting
- Future integrations with external services

The architecture should allow these capabilities to be added without requiring major structural changes.

---

## Architectural Goals

Every decision should improve one or more of the following characteristics:

- Simplicity
- Readability
- Maintainability
- Scalability
- Testability
- Reliability
- Security
- Performance
- Extensibility

Whenever two solutions solve the same problem, the simpler one should be preferred.

---

## Engineering Mindset

The project is intended to resemble a professional production codebase rather than an academic exercise.

The objective is not to demonstrate knowledge of every design pattern.

The objective is to build software that is:

- Easy to understand
- Easy to modify
- Easy to debug
- Easy to test
- Easy to deploy
- Easy to scale

---

## What This Project Is

LDS is:

- A Modular Monolith
- API-first
- Domain-oriented
- Production-focused
- Testable
- Observable
- Incrementally scalable

---

## What This Project Is Not

LDS is not intended to be:

- A microservices architecture
- An Event Sourcing system
- A CQRS implementation
- A Domain-Driven Design showcase
- A framework demonstration
- A collection of unnecessary abstractions

Complexity should appear only when justified by real business needs.

---

## Decision-Making Principles

When making architectural decisions, prioritize the following order:

1. Correctness
2. Security
3. Maintainability
4. Readability
5. Simplicity
6. Performance
7. Scalability

Premature optimization should always be avoided.

---

## Success Criteria

The architecture is considered successful if:

- New features can be implemented without large refactors.
- Modules remain independent.
- Business rules stay isolated from infrastructure.
- Controllers remain thin.
- Infrastructure can evolve with minimal impact on business logic.
- Developers can understand any module in isolation.
- Unit testing is straightforward.
- The system can scale progressively without architectural rewrites.

---

## Architectural Promise

This project will prioritize consistency over individual coding preferences.

Every module should feel like it was written by the same engineer following the same architectural principles.

The architecture must remain coherent as the project grows.

# 2. Engineering Principles

This chapter defines the engineering principles that govern every architectural and implementation decision within the project.

These principles are mandatory.

Whenever an implementation conflicts with these principles, the implementation should be reconsidered.

---

# 2.1 Simplicity First

The simplest solution that correctly solves the problem should always be preferred.

Complexity is introduced only when it provides measurable long-term value.

Avoid abstractions created "just in case."

Prefer straightforward code over clever code.

---

# 2.2 Readability Over Cleverness

Code is written for humans first.

Every class, function, and module should communicate its purpose immediately.

Developers should understand code without reading multiple files.

Prefer explicit code over implicit behavior.

---

# 2.3 Separation of Concerns

Each component must have one clearly defined responsibility.

Responsibilities must not leak between layers.

Examples:

- Controllers handle HTTP.
- Use Cases execute business logic.
- Repositories access persistence.
- Infrastructure communicates with external systems.

A component should never assume responsibilities belonging to another layer.

---

# 2.4 Single Responsibility

Every class, function, or module should have exactly one reason to change.

Large "God Classes" and "God Services" are prohibited.

Business operations should be decomposed into focused Use Cases.

---

# 2.5 Low Coupling

Modules should know as little as possible about each other.

Dependencies should remain minimal and intentional.

Changing one module should not require changes in unrelated modules.

---

# 2.6 High Cohesion

Everything inside a module should belong together.

A module should represent one business capability.

Files that frequently change together should live together.

---

# 2.7 Explicit Dependencies

Dependencies must always be visible.

Avoid hidden global state.

Avoid implicit initialization.

A component should clearly declare everything it depends on.

---

# 2.8 Composition Over Inheritance

Prefer composing small objects over building inheritance hierarchies.

Inheritance should only be used when an actual "is-a" relationship exists.

Favor small reusable components.

---

# 2.9 Business Logic First

Business rules are the most valuable part of the system.

Infrastructure exists to support business logic.

Business logic must never depend directly on infrastructure implementation details.

The business layer should remain understandable without knowing how data is stored.

---

# 2.10 Infrastructure Is Replaceable

Databases, Redis, file storage, external APIs, queues, and third-party services are implementation details.

Replacing infrastructure should require minimal changes to business logic.

---

# 2.11 Fail Fast

Errors should be detected as early as possible.

Invalid input should never propagate through the application.

Configuration problems should prevent the application from starting.

Unexpected states should never be silently ignored.

---

# 2.12 Defensive Programming

Validate assumptions.

Never trust:

- HTTP requests
- External APIs
- User input
- Environment variables
- Database contents

Every external input must be validated before use.

---

# 2.13 Predictability

The project should behave consistently.

Similar operations should follow similar patterns.

Developers should be able to predict where code belongs before searching for it.

Consistency is preferred over personal coding style.

---

# 2.14 Explicit Errors

Errors must clearly communicate what happened.

Avoid string comparisons.

Avoid generic exceptions.

Errors should be represented by dedicated exception types whenever appropriate.

---

# 2.15 No Hidden Side Effects

Functions should do exactly what their names suggest.

Calling a method should not unexpectedly:

- write files
- send notifications
- publish events
- modify unrelated entities

Side effects should remain explicit.

---

# 2.16 Modular Thinking

Every new feature should strengthen the module it belongs to.

Avoid creating shared utilities prematurely.

Prefer local abstractions until reuse becomes obvious.

---

# 2.17 Progressive Scalability

The architecture should support growth without requiring complete rewrites.

Scalability should emerge naturally from good modular design.

Do not optimize for hypothetical future requirements.

---

# 2.18 Testability

Code should be easy to test.

Business logic should not require:

- HTTP servers
- PostgreSQL
- Redis
- Socket.IO

Unit testing should be possible by replacing infrastructure dependencies.

---

# 2.19 Consistency Over Personal Preference

Individual coding preferences must never override architectural consistency.

Every module should feel as though it was written by the same engineer.

Consistency reduces cognitive load.

---

# 2.20 Engineering Philosophy

When facing multiple valid solutions, prioritize them in the following order:

1. Correctness
2. Security
3. Maintainability
4. Readability
5. Simplicity
6. Testability
7. Performance
8. Scalability

Performance optimizations should only be introduced after identifying measurable bottlenecks.

Premature optimization is discouraged.

# 2.21 Multi-Tenant Safety

Tenant isolation is mandatory.

Every database operation involving tenant-owned data must be scoped by company ownership.

No query may expose resources belonging to another tenant.

Multi-tenant isolation is considered a security requirement rather than a business rule.

# 2.22 Feature-Oriented Development

New functionality should be implemented inside the module that owns the business capability.

Avoid creating generic shared code unless duplication has been observed multiple times.

Business capabilities should remain cohesive and self-contained.

---

# Golden Rule

Before introducing a new abstraction, ask:

- Does it solve a real problem?
- Does it reduce future complexity?
- Will it likely be reused?
- Is it easier to understand than the existing solution?

If the answer is "no", the abstraction should not be introduced.

# 3. Architectural Style

## Overview

Logistics Dispatch Service adopts a **Modular Monolith** architecture combined with a **Lightweight Clean Architecture** approach.

The objective is to provide clear separation of concerns while avoiding unnecessary complexity.

The system is designed so that modules remain independent, business logic stays isolated from infrastructure, and future extraction into microservices remains possible if business requirements justify it.

At the current stage, a Modular Monolith provides the best balance between simplicity, maintainability, deployment, and scalability.

---

# Why a Modular Monolith?

The project intentionally avoids microservices.

Microservices introduce distributed complexity including:

- Network communication
- Distributed transactions
- Service discovery
- Event consistency
- Deployment complexity
- Monitoring overhead

These costs are not justified by the current business requirements.

Instead, LDS focuses on building well-defined modules inside a single deployable application.

Strong internal boundaries are preferred over premature distribution.

---

# Architectural Layers

Every business module follows the same internal architecture.

```

```

Presentation
│
▼
Application
│
▼
Domain
│
▼
Infrastructure

````

```markdown
The dependency flow is always top-down.

Outer layers may depend on inner layers.

Inner layers must never depend on outer layers.

---

# Layer Responsibilities

## Presentation

Responsible for:

- HTTP
- Routes
- Controllers
- Request parsing
- Authentication
- Authorization
- DTO mapping
- HTTP responses

Presentation never contains business rules.

---

## Application

Responsible for:

- Use Cases
- Business orchestration
- Transactions
- Calling repositories
- Calling external services through abstractions

Application coordinates business operations.

Application does not know implementation details.

---

## Domain

The Domain layer represents the business.

It contains:

- Entities
- Business rules
- Invariants
- Domain Services (when necessary)
- Domain Events (only when justified)

The Domain layer must remain independent of:

- Express
- Prisma
- Redis
- PostgreSQL
- HTTP
- Socket.IO

---

## Infrastructure

Infrastructure contains implementation details.

Examples:

- Prisma
- PostgreSQL
- Redis
- File Storage
- Queue Workers
- External APIs
- Email Providers
- Socket.IO

Infrastructure exists to support the business.

It never defines business rules.

---

# Shared Layer

Shared components contain reusable technical utilities.

Examples:

- Configuration
- Logger
- Middleware
- Custom Errors
- Utilities
- Validation Helpers

Shared must never become a dumping ground.

Business-specific code does not belong in Shared.

---

# Module Isolation

Each module owns its business capability.

Examples:

- Auth
- Packages
- Drivers
- Zones
- Tracking
- Fleet

Modules communicate through explicit interfaces.

Direct access to another module's internal implementation is prohibited.

---

# Use Case Oriented Design

Business operations are represented as individual Use Cases.

Examples:

- CreatePackageUseCase
- AssignDriverUseCase
- DeliverPackageUseCase
- CreateZoneUseCase

Each Use Case represents one business action.

Use Cases replace large service classes.

---

# Repository Abstraction

Application code communicates with persistence through repositories.

Repositories abstract data access.

Repositories are responsible only for persistence.

Repositories do not contain business rules.

---

# Infrastructure Independence

The application should not depend directly on specific technologies.

Examples:

Today:

- Prisma

Tomorrow:

- Drizzle

or

- TypeORM

Business logic should remain unaffected by this change.

The same principle applies to:

- Redis
- File Storage
- Message Queues
- External APIs

---

# Explicit Dependencies

Dependencies should always flow in one direction.

Presentation
→ Application
→ Domain
→ Infrastructure

Circular dependencies are forbidden.

Modules should remain independently understandable.

---

# Communication Rules

Allowed:

Presentation → Application

Application → Domain

Application → Repository

Repository → Prisma

Infrastructure → External Services

Forbidden:

Controller → Prisma

Controller → Redis

Controller → File System

Controller → Socket.IO

Domain → Prisma

Domain → Express

Domain → HTTP

Repository → Business Logic

Infrastructure → Business Rules

---

# Architectural Boundaries

Every layer has a clearly defined purpose.

Whenever responsibilities begin to overlap, the design should be reconsidered.

The objective is not to maximize abstraction.

The objective is to maximize clarity.

---

# Scalability Strategy

The architecture should support incremental growth.

Future capabilities may include:

- Orders
- Vehicles
- Companies
- Warehouses
- Dispatch Planning
- Notifications
- Billing
- Analytics

These features should be implemented by introducing new modules rather than modifying existing ones whenever possible.

---

# Evolution Strategy

The architecture is expected to evolve.

However, evolution should preserve:

- Layer boundaries
- Module isolation
- Dependency direction
- Simplicity
- Consistency

Major architectural changes require updating this document before implementation.

# 4. Project Structure

## Overview

The repository is organized around business capabilities rather than technical layers.

Business modules are the primary organizational unit of the project.

Every feature belongs to exactly one module.

The project follows a Modular Monolith architecture where each module internally follows the same layered structure.

The repository must remain predictable.

A developer should always know where new code belongs before creating it.

---

# Root Structure

````

src/
│
├── bootstrap/
├── modules/
├── shared/
├── server.ts
└── app.ts

```

Outside of src:

```

prisma/
tests/
scripts/
docs/

```

The root directory should remain small.

Every folder must have a clearly defined responsibility.

---

# Bootstrap

```

src/bootstrap/

```

Responsible for application startup.

Contains:

- Dependency registration
- Express initialization
- Middleware registration
- Route registration
- Server startup
- Database startup
- Redis startup
- Socket initialization

Bootstrap never contains business logic.

---

# Modules

```

src/modules/

```

This directory contains every business capability.

Each module owns:

- business logic
- API
- persistence
- validation
- entities

No module may own another module.

Modules communicate only through public interfaces.

---

# Shared

```

src/shared/

```

Contains reusable technical infrastructure.

Allowed:

- config
- env
- logger
- middleware
- errors
- utils
- cache
- auth helpers
- common interfaces

Forbidden:

Business rules

Business services

Business calculations

Business validation

Package-specific code

Driver-specific code

Zone-specific code

Tracking-specific code

Shared exists for technical reuse only.

---

# Standard Module Structure

Every module follows exactly the same layout.

```

modules/

packages/

    presentation/

    application/

    domain/

    infrastructure/

    index.ts

```

Every module in the project follows this structure.

No exceptions.

---

# Presentation Layer

```

presentation/

controllers/

routes/

dto/

validators/

mappers/

```

Responsibilities:

Receive HTTP requests.

Validate input.

Call Use Cases.

Transform responses.

Nothing else.

Presentation never:

talks to Prisma

talks to Redis

contains business logic

contains SQL

contains filesystem operations

contains external API calls

---

# Application Layer

```

application/

use-cases/

interfaces/

services/

ports/

```

Contains application orchestration.

Examples:

CreatePackageUseCase

AssignDriverUseCase

UpdatePackageStatusUseCase

GenerateTrackingLinkUseCase

Each use case performs exactly one business action.

Application coordinates.

It does not implement infrastructure.

---

# Domain Layer

```

domain/

entities/

value-objects/

events/

exceptions/

repositories/

services/

```

Contains the business model.

Entities

Business Rules

Invariants

Domain Services

Repository Contracts

Business Exceptions

No framework code belongs here.

Domain should compile without Express.

---

# Infrastructure Layer

```

infrastructure/

database/

repositories/

cache/

storage/

messaging/

realtime/

external/

workers/

```

Contains implementations.

Examples:

Prisma repositories

Redis cache

Socket.IO

BullMQ

AWS S3

Email providers

Google Maps API

Filesystem

Infrastructure never defines business decisions.

---

# Shared Folder Structure

```

shared/

config/

constants/

env/

errors/

middleware/

logger/

database/

cache/

utils/

types/

validators/

```

Everything here should be reusable across multiple modules.

---

# Tests

Tests are organized independently.

```

tests/

unit/

integration/

e2e/

fixtures/

helpers/

```

Production code never imports tests.

Tests may import production code.

---

# Documentation

```

docs/

```

Contains:

Architecture

ADRs

API documentation

Deployment

Runbooks

Future RFCs

Documentation should never be mixed with source code.

---

# Scripts

```

scripts/

```

Contains development automation.

Examples:

seed.ts

generate-test-data.ts

cleanup-storage.ts

migration helpers

Scripts are isolated from business modules.

---

# Prisma

```

prisma/

schema.prisma

migrations/

seed/

```

Prisma schema never belongs inside src.

---

# Public Module API

Every module exposes only one public entry point.

Example:

```

modules/packages/index.ts

```

Other modules may only import through this file.

Internal folders remain private.

Forbidden:

```

import "../../packages/application/use-cases/..."

```

Allowed:

```

import { PackageService } from "@/modules/packages";

```

---

# File Size Guidelines

Maximum recommendations:

Controller

< 200 lines

Use Case

< 250 lines

Repository

< 300 lines

Entity

< 250 lines

DTO

< 150 lines

Validation

< 150 lines

Large files should be decomposed.

---

# Folder Ownership

Every file belongs to exactly one layer.

A file must never have mixed responsibilities.

If a file requires responsibilities from multiple layers, it should be split.

---

# Naming Conventions

Folders

lowercase

```

packages
drivers
tracking

```

Classes

PascalCase

```

CreatePackageUseCase

```

Interfaces

PascalCase

```

PackageRepository

```

Files

kebab-case

```

create-package.use-case.ts

assign-driver.use-case.ts

package.repository.ts

```

---

# Forbidden Structure

The following folders are prohibited:

```

helpers/

misc/

common/

temp/

new/

old/

legacy/

utils-business/

```

Folders with vague purposes eventually become dumping grounds.

Every folder must communicate its purpose immediately.

---

# Architecture Rule

The repository should scale by adding modules, not by increasing the size of existing ones.

Growth is horizontal, never vertical.

When a module becomes too large, it should be decomposed internally rather than creating generic shared code.

# 5. Dependency Rules

## Overview

Dependencies define how information flows through the application.

A correct dependency graph prevents tight coupling, circular references, and architectural decay.

Every dependency introduced into the project must respect the rules defined in this chapter.

Violating these rules requires explicit architectural justification.

---

# Core Rule

Dependencies always point inward.

Business logic never depends on implementation details.

The dependency graph is intentional and must remain stable throughout the lifetime of the project.

---

# Allowed Dependency Flow

```

```
Presentation
        │
        ▼
Application
        │
        ▼
Domain
        │
        ▼
Repository Contracts
        │
        ▼
Infrastructure
```

```markdown
Each layer may only communicate with the layer immediately below it unless explicitly stated otherwise.

---

# Layer Dependency Matrix

| Layer          | Can Depend On                        |
| -------------- | ------------------------------------ |
| Presentation   | Application, Shared                  |
| Application    | Domain, Repository Contracts, Shared |
| Domain         | Domain, Shared Types                 |
| Infrastructure | Repository Contracts, Shared         |
| Shared         | Nothing business-specific            |

No other dependency direction is allowed.

---

# Presentation Rules

Presentation may import:

- Controllers
- DTOs
- Validators
- Mappers
- Use Cases
- Shared utilities

Presentation must never import:

- Prisma
- Redis
- PostgreSQL
- Socket.IO
- BullMQ
- File System
- External APIs
- Repository Implementations

Controllers must remain infrastructure-agnostic.

---

# Application Rules

Application coordinates business operations.

Application may import:

- Domain
- Repository Interfaces
- Shared
- Ports

Application must never import:

- Prisma Client
- Express
- Redis Client
- Socket.IO
- HTTP Request
- HTTP Response
- SQL
- Filesystem

Application should not know how persistence works.

---

# Domain Rules

Domain represents business knowledge.

Domain may import:

- Domain
- Shared Types
- Shared Errors

Domain must never import:

- Express
- Prisma
- Redis
- PostgreSQL
- Axios
- HTTP
- Socket.IO
- Environment Variables
- Configuration

The Domain layer must be framework-independent.

---

# Infrastructure Rules

Infrastructure implements interfaces.

Infrastructure may import:

- Prisma
- Redis
- BullMQ
- Socket.IO
- AWS SDK
- Google APIs
- PostgreSQL
- External SDKs

Infrastructure may implement repository interfaces.

Infrastructure never contains business decisions.

---

# Shared Rules

Shared contains reusable technical code.

Allowed:

Logger

Configuration

Middleware

Utility Functions

Authentication Helpers

Custom Errors

Environment

Constants

Forbidden:

Package Rules

Driver Logic

Zone Logic

Tracking Logic

Dispatch Algorithms

Business Validation

Shared must never evolve into a second business layer.

---

# Repository Rules

Repositories exist to abstract persistence.

Repositories may:

Read data

Persist data

Execute transactions

Map persistence models

Repositories must never:

Validate business rules

Send notifications

Call external APIs

Calculate business decisions

Repositories are persistence adapters.

Nothing more.

---

# Controller Rules

Controllers have one responsibility:

Translate HTTP into Use Cases.

Controllers must never:

Contain business rules

Contain calculations

Call Prisma

Read Redis

Write files

Publish events

Controllers should remain thin.

---

# Use Case Rules

A Use Case represents one business action.

One Use Case.

One responsibility.

Examples:

CreatePackage

AssignDriver

DeliverPackage

CreateZone

CancelOrder

If a Use Case grows beyond a single business action, it should be split.

---

# Entity Rules

Entities own business rules.

Entities may:

Validate invariants

Protect consistency

Expose business behavior

Entities never:

Access databases

Read environment variables

Send HTTP requests

Call Redis

Publish WebSockets

---

# External Services

External services are Infrastructure.

Examples:

Google Maps

AWS

SMTP

Twilio

Stripe

Mapbox

Firebase

Business logic communicates with them only through ports or interfaces.

---

# Cross-Module Communication

Modules communicate only through public interfaces.

Forbidden:
```

packages/application/internal.ts

```

Allowed:

```

modules/packages/index.ts

```

Internal implementation remains private.

---

# Circular Dependencies

Circular dependencies are strictly prohibited.

Example:

```

Package
↓

Driver

↓

Tracking

↓

Package

```

This dependency graph is invalid.

Circular dependencies indicate poor modular design.

---

# Dependency Direction

The following graph summarizes the entire architecture.

```

HTTP

↓

Presentation

↓

Application

↓

Domain

↓

Repository Contracts

↓

Infrastructure

↓

Database

```

Dependencies never move upward.

---

# Framework Independence

Business logic must remain independent of:

Express

Prisma

Redis

Socket.IO

BullMQ

Axios

Node.js APIs

Frameworks should be replaceable.

Business rules should survive technology changes.

---

# Configuration Dependency

Configuration is read once during application startup.

Business logic must never access:

process.env

Configuration should be injected from the bootstrap layer.

---

# Event Rules

Events flow outward.

Business logic emits events.

Infrastructure delivers them.

Business logic never knows who consumes the events.

---

# Import Rules

Allowed:

```

Presentation

↓

Application

```

Allowed:

```

Application

↓

Repository Interface

```

Allowed:

```

Infrastructure

↓

Prisma

```

Forbidden:

```

Presentation

↓

Prisma

```

Forbidden:

```

Domain

↓

Redis

```

Forbidden:

```

Domain

↓

Express

```

Forbidden:

```

Application

↓

Socket.IO

```

Forbidden:

```

Repository

↓

Business Services

```

---

# Dependency Injection

Dependencies are injected explicitly.

Constructor Injection is the default strategy.

The project intentionally avoids Dependency Injection Containers.

Dependencies must remain visible in constructors.

Magic dependency resolution is prohibited.

---

# Architectural Integrity

Every Pull Request should preserve the dependency graph.

Breaking architectural boundaries for short-term convenience creates long-term technical debt.

When in doubt:

Move the dependency downward.

Never upward.

---

# Final Rule

Every dependency must answer one question:

"Does this dependency belong in this layer?"

If the answer is uncertain, the dependency probably belongs somewhere else.

```
