# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Tenant administrators, schedulers, staff, and location managers operate appointments, customers, services, exclusive resources, and schedules. Customers book through the separate Client application. Platform operators use the private Platform Admin application.

## Product Purpose

A business launches a branded booking website and operational workspace without building scheduling infrastructure. Success is a persisted, authorized workflow whose result agrees across related pages.

## Operating Context

The Dashboard is used throughout the working day on desktop and mobile. English and Arabic have equivalent functionality. The authoritative product record remains `docs/product-vision.md`, `docs/release-scope.md`, and the Accepted ADRs.

## Capabilities and Constraints

First release includes one-to-one appointments, capacity-one exclusive resources, request-to-book, built-in roles, optional payments, Resend mail, one-way calendar exports, and basic reports/CSV. Database transactions own booking, capacity, eligibility, price, policies, and snapshots. Current membership and location scope authorize every protected operation. Runtime entitlements override local configuration. Tenant, Brand, and Instance remain distinct.

## Brand Commitments

Preserve tenant-configured identity, validated PNG assets, semantic tokens, and locally pinned Arabic-capable fonts. Extend the incumbent product interface as required by the dashboard-completion plan.

## Evidence on Hand

Existing shared UI packages, brand fixtures, visual baselines, versioned RPCs, synthetic local booking, and the ordered completion plan. Provider delivery and human assistive-technology acceptance require actual evidence.

## Product Principles

- A visible result follows an authoritative commit.
- Related pages agree about the same record.
- Authorization is live database state.
- Communication and payment outcomes remain separate from booking state.

## Accessibility & Inclusion

WCAG 2.2 AA is a release gate. Preserve semantic RTL, keyboard operation, persistent focus, error announcements, reduced motion, and calendar list alternatives.
