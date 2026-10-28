
# AmbuRoute Project Status

> **Project:** AmbuRoute  
> **Project Stage:** Hackathon MVP  
> **Document Purpose:** Track actual implementation and verification progress  
> **Status:** Initial baseline, pending repository inspection

---

## 1. Purpose

This document is the central progress tracker for AmbuRoute.

It records the current implementation state of the project, including:

- Completed features.
- Features currently being implemented.
- Outstanding tasks.
- Blockers.
- Test and build results.
- Documentation status.
- Security and design verification.
- The next permitted implementation task.

AI coding agents must consult this document before starting work and update it after meaningful implementation or verification changes.

The purpose is to prevent unfinished features from being incorrectly marked complete and to allow development to resume without repeatedly rebuilding existing functionality.

**Important:** This document is an initial tracking template. Its contents must be reconciled with the actual repository before being treated as a verified report of project status.

The existence of a document, folder, component, endpoint, or test file does not prove that the associated functionality works.

---

## 2. Product Scope

AmbuRoute has exactly two core MVP features.

### Feature 1: Route-Aware Ambulance Alerts

The system identifies participating users near an ambulance's upcoming route and sends relevant notifications through supported notification channels.

The feature includes:

- Authorized emergency-trip creation.
- Ambulance location updates.
- Route-aware recipient selection.
- Push-subscription management.
- Notification generation and delivery attempts.
- Duplicate prevention.
- Expiry and trip-completion handling.

### Feature 2: Community Traffic Intelligence and Voice Route Assistance

The system collects road-condition reports, validates their relevance, compares suitable traffic-aware routes, and provides concise voice recommendations for driver review.

The feature includes:

- One-tap road-condition reports.
- Traffic-report validation.
- Freshness and duplicate checks.
- Routing-provider integration.
- Current-route and alternative-route comparison.
- Route-recommendation records.
- Voice-message generation.
- Driver acceptance or rejection.

All remaining capabilities are supporting infrastructure, not additional product features.

Do not add major features outside this scope without explicit approval.

---

## 3. Status Definitions

Use only the following status values for implementation work.

| Status | Meaning |
|---|---|
| `NOT_STARTED` | Work has not begun. |
| `IN_PROGRESS` | Implementation is actively underway. |
| `BLOCKED` | Progress cannot continue because of an unresolved dependency or issue. |
| `IMPLEMENTED` | Code has been written, but required verification is incomplete. |
| `VERIFIED` | Defined acceptance criteria and required verification checks have passed, with evidence recorded. |

### Status Rules

**NOT_STARTED**

Use this when implementation has not begun.

**IN_PROGRESS**

Use this when work is being actively implemented or investigated.

**BLOCKED**

Use this when a documented issue prevents progress. Include the reason and the required resolution.

**IMPLEMENTED**

Use this when the relevant code has been written but required tests, build checks, manual checks, or acceptance criteria have not all been verified.

**VERIFIED**

Use this only when the applicable acceptance criteria have been checked and the evidence is recorded.

Do not confuse implementation with verification.

Do not mark a complete phase as `VERIFIED` if only one component has passed its tests.

When different parts of a feature have different statuses, track them separately.

---

## 4. Initial Project Baseline

The initial documentation drafts define the proposed architecture, design system, database, API, security requirements, testing strategy, and implementation roadmap.

However, the actual repository contents and implementation state must be inspected before a definitive status can be assigned.

| Area | Initial Status | Required Next Action |
|---|---|---|
| Repository inspection | `NOT_STARTED` | Inspect actual project files, scripts, dependencies, and existing functionality |
| Architecture alignment | `NOT_STARTED` | Compare the implemented architecture against `docs/ARCHITECTURE.md` |
| Product specification | `NOT_STARTED` | Verify that the scope and acceptance criteria are reflected in the repository |
| Design system | `NOT_STARTED` | Inspect existing UI styles and align them with `docs/DESIGN.md` |
| API contracts | `NOT_STARTED` | Compare actual endpoints with `docs/API.md` |
| Database schemas | `NOT_STARTED` | Inspect existing models and indexes against `docs/DATABASE.md` |
| Security controls | `NOT_STARTED` | Review actual authentication, authorization, validation, and secrets handling |
| Testing setup | `NOT_STARTED` | Inspect existing test tools, commands, fixtures, and test coverage |
| Emergency-trip management | `NOT_STARTED` | Verify implementation and tests |
| Route-aware alerts | `NOT_STARTED` | Verify subscription, recipient selection, and notification handling |
| Community traffic reporting | `NOT_STARTED` | Verify reporting, validation, and freshness handling |
| Route comparison | `NOT_STARTED` | Verify routing-provider integration and recommendation rules |
| Voice assistance | `NOT_STARTED` | Verify factual message generation and playback |
| End-to-end demonstration | `NOT_STARTED` | Verify the integrated workflow using controlled test data |

These are provisional baseline entries, not findings that the repository is empty or that existing code is missing.

Update each entry after inspecting the actual implementation.

Do not preserve a `NOT_STARTED` status if valid evidence demonstrates that the relevant work has already begun or is complete.

---

## 5. Phase Progress Tracker

The following phases follow the implementation order defined in `docs/PHASES.md`.

| Phase | Description | Initial Status |
|---|---|---|
| Phase 0 | Repository inspection and planning | `NOT_STARTED` |
| Phase 1 | Project and design-system foundation | `NOT_STARTED` |
| Phase 2 | Emergency trips and location handling | `NOT_STARTED` |
| Phase 3 | Route-Aware Ambulance Alerts | `NOT_STARTED` |
| Phase 4 | Traffic reporting and validation | `NOT_STARTED` |
| Phase 5 | Traffic-aware route comparison | `NOT_STARTED` |
| Phase 6 | Voice assistance and optional AI | `NOT_STARTED` |
| Phase 7 | End-to-end integration and demonstration | `NOT_STARTED` |

### Phase Completion Requirements

A phase must not be marked `IMPLEMENTED` until its intended implementation work is complete.

A phase must not be marked `VERIFIED` until its documented exit criteria have been checked.

For each completed phase, record:

- Implementation summary.
- Relevant files.
- Acceptance criteria checked.
- Tests executed.
- Build and lint results where applicable.
- Remaining limitations.
- Any unresolved security or design concerns.

If a phase is partially complete, retain its appropriate status and describe the completed and outstanding work separately.

---

## 6. Feature One: Route-Aware Ambulance Alerts

### 6.1 Feature Status

**Overall status:** `NOT_STARTED`

This is the initial baseline and must be reconciled with the actual repository.

### 6.2 Subtask Tracker

| Task | Status | Verification Requirement |
|---|---|---|
| Driver authentication and authorization | `NOT_STARTED` | Verify authorized and unauthorized driver operations |
| Emergency-trip creation | `NOT_STARTED` | Verify valid trip creation and invalid request handling |
| Trip termination | `NOT_STARTED` | Verify trip state transitions and alert shutdown |
| Location update processing | `NOT_STARTED` | Verify coordinates, timestamps, and stale-update handling |
| Current route retrieval | `NOT_STARTED` | Verify actual provider results and unavailable states |
| Push-subscription registration | `NOT_STARTED` | Verify registration, ownership, and invalid subscriptions |
| Recipient-selection logic | `NOT_STARTED` | Verify geographical and route relevance |
| Notification generation | `NOT_STARTED` | Verify content is based on validated route data |
| Notification deduplication | `NOT_STARTED` | Verify repeated processing does not create prohibited duplicates |
| Notification expiry | `NOT_STARTED` | Verify irrelevant and trip-ended alerts are not newly generated |
| Notification failure handling | `NOT_STARTED` | Verify failure states and delivery evidence |
| Driver interface integration | `NOT_STARTED` | Verify the driver workflow and design requirements |
| Road-user interface integration | `NOT_STARTED` | Verify subscription and alert experience |

### 6.3 Required Acceptance Checks

Before this feature can be marked `VERIFIED`, confirm that:

- An authorized driver can start and end a simulated trip.
- Unauthorized users cannot start verified emergency trips.
- Location updates are validated.
- Relevant subscribed test devices can be selected for route-aware alerts.
- Unrelated recipients are excluded when the available route information supports that determination.
- Push subscriptions are managed securely.
- Duplicate alerts are prevented according to the documented rules.
- The backend distinguishes send attempts from confirmed delivery.
- Ending a trip prevents further trip-related alert generation.
- Missing location or route data does not result in fabricated information.
- Relevant automated tests pass.
- The interface follows `docs/DESIGN.md`.

Record test names and results before changing the feature's overall status.

---

## 7. Feature Two: Community Traffic Intelligence and Voice Route Assistance

### 7.1 Feature Status

**Overall status:** `NOT_STARTED`

This is the initial baseline and must be reconciled with the actual repository.

### 7.2 Subtask Tracker

| Task | Status | Verification Requirement |
|---|---|---|
| Traffic-report interface | `NOT_STARTED` | Verify all supported report types and accessible interactions |
| Report submission API | `NOT_STARTED` | Verify request validation and persistence |
| Geographical relevance checks | `NOT_STARTED` | Verify that unrelated reports do not affect the route |
| Report freshness policy | `NOT_STARTED` | Verify stale-report handling |
| Duplicate-report handling | `NOT_STARTED` | Verify repeated submissions are not treated as independent evidence |
| Conflicting-report handling | `NOT_STARTED` | Verify uncertainty is represented correctly |
| Routing-provider adapter | `NOT_STARTED` | Verify provider response normalization and errors |
| Alternative-route retrieval | `NOT_STARTED` | Verify the provider returns usable route alternatives |
| Route comparison | `NOT_STARTED` | Verify ETA comparisons against controlled expected results |
| Recommendation policy | `NOT_STARTED` | Verify decisions follow documented backend rules |
| Recommendation persistence | `NOT_STARTED` | Verify lifecycle and driver decisions |
| Driver review interface | `NOT_STARTED` | Verify alternative route presentation and confirmation |
| Voice-message generation | `NOT_STARTED` | Verify messages contain only supported information |
| Text-to-speech integration | `NOT_STARTED` | Verify message playback and failure handling |
| Optional AI summarization | `NOT_STARTED` | Verify output validation and fallback behaviour |
| Recommendation failure handling | `NOT_STARTED` | Verify missing or stale route data does not generate fake recommendations |

### 7.3 Required Acceptance Checks

Before this feature can be marked `VERIFIED`, confirm that:

- Supported road-condition reports can be submitted.
- Invalid input is rejected.
- Stale reports are not treated as fresh evidence.
- Duplicate submissions do not automatically increase independent evidence.
- Reports are associated with the relevant route when the information is available.
- Conflicting reports are handled conservatively.
- The current route and alternatives come from a configured routing provider or explicitly labelled simulation.
- ETA differences are calculated deterministically.
- Missing ETA values do not generate invented time savings.
- Recommendations follow the documented decision policy.
- The driver can accept or reject an alternative.
- The route is not silently changed by an AI model.
- Voice messages match the validated routing information.
- AI failure does not invent facts or disable unrelated core functionality.
- Relevant automated tests pass.
- The interface follows `docs/DESIGN.md`.

Record test names and results before changing the feature's overall status.

---

## 8. Documentation Status

The following files define the project's expected behaviour and development process.

| Document | Responsibility | Initial Status |
|---|---|---|
| `AGENTS.md` | AI coding instructions | `NOT_STARTED` |
| `docs/ARCHITECTURE.md` | System architecture | `NOT_STARTED` |
| `docs/SPEC.md` | Product requirements | `NOT_STARTED` |
| `docs/DESIGN.md` | Visual identity and UI rules | `NOT_STARTED` |
| `docs/API.md` | API endpoints and event contracts | `NOT_STARTED` |
| `docs/DATABASE.md` | Collection schemas and indexes | `NOT_STARTED` |
| `docs/SECURITY.md` | Security and privacy requirements | `NOT_STARTED` |
| `docs/TESTING.md` | Testing strategy and acceptance checks | `NOT_STARTED` |
| `docs/PHASES.md` | Implementation roadmap | `NOT_STARTED` |
| `docs/PROJECT_STATUS.md` | Progress tracker | `IN_PROGRESS` |

These initial statuses describe the baseline before the repository is inspected.

The documentation drafts have been provided in the development conversation, but their actual presence in the project directory has not been verified by this file.

After copying the documents into the repository:

1. Check that each required file exists at the correct path.
2. Check for incomplete or conflicting requirements.
3. Confirm that the referenced filenames match the actual repository structure.
4. Reconcile conflicting values, especially the alert-radius setting.
5. Update the status of each document based on review.

Use `VERIFIED` for a document only after checking that it is present, internally consistent, and aligned with the relevant requirements.

---

## 9. Test and Build Results

Record only commands that have actually been executed.

| Check | Status | Last Result | Notes |
|---|---|---|---|
| Frontend tests | `NOT_STARTED` | Not run | Inspect available frontend test scripts |
| Backend unit tests | `NOT_STARTED` | Not run | Inspect backend test scripts |
| API integration tests | `NOT_STARTED` | Not run | Verify authentication and endpoint behaviour |
| Database tests | `NOT_STARTED` | Not run | Verify schemas, indexes, and data integrity |
| Notification tests | `NOT_STARTED` | Not run | Verify subscriptions, eligibility, and failure handling |
| Routing tests | `NOT_STARTED` | Not run | Use controlled provider responses |
| Traffic-report tests | `NOT_STARTED` | Not run | Verify validation, freshness, and duplicate handling |
| Voice and AI tests | `NOT_STARTED` | Not run | Verify output validation and fallback behaviour |
| Lint checks | `NOT_STARTED` | Not run | Inspect available scripts |
| Type checks | `NOT_STARTED` | Not run | Run if configured |
| Production build | `NOT_STARTED` | Not run | Verify the actual frontend and backend build process |
| Browser E2E tests | `NOT_STARTED` | Not run | Inspect the available browser testing environment |
| Responsive design review | `NOT_STARTED` | Not reviewed | Review relevant mobile and desktop viewports |
| Accessibility review | `NOT_STARTED` | Not reviewed | Run automated checks and manual key-flow checks |
| End-to-end demo | `NOT_STARTED` | Not run | Test the complete simulated journey |

Do not update a result from `Not run` to `Passed` without actually executing the relevant command or check.

A successful build does not establish that all features work.

A test suite that does not cover a particular behaviour is not evidence that the behaviour is correct.

If a command fails, record the command, relevant failure, and whether the issue blocks the current phase.

---

## 10. Blockers and Known Limitations

Use this section to record issues that affect progress or confidence in the implementation.

Initially, the repository must be inspected before implementation blockers can be confirmed.

Known project-level decisions that must be resolved or documented include:

### 10.1 Notification Radius

Resolved in Phase 0.2:
- Initial configurable MVP default is established at **500 metres**, preserving the original project concept.
- The parameter must be configurable rather than hard-coded across components.
- Route-aware targeting along the travel path takes precedence over a circular radius alone.
- This is a prototype setting, not a validated real-world safety threshold.

### 10.2 Routing Provider

The selected routing provider, authentication method, required API capabilities, rate limits, and error handling must be verified.

If an alternative-route response is unavailable, the system must not generate a fabricated alternative.

### 10.3 Notification Delivery

Browser and operating-system support must be tested in the actual demonstration environment.

The application cannot directly notify arbitrary unregistered devices without a supported delivery mechanism.

### 10.4 AI Provider

The selected AI provider and actual API access must be verified before implementation.

AI is optional for the core routing decision.

The system must remain capable of using deterministic messages when AI is unavailable and validated route data exists.

### 10.5 Operational Readiness

The hackathon prototype is not automatically ready for real emergency deployment.

Real-world use requires appropriate operational validation, suitable ambulance-provider coordination, security review, and testing with relevant stakeholders.

Add additional blockers as they are discovered.

For each blocker, record:

- Description.
- Impact.
- Affected feature or phase.
- Required resolution.
- Current status.

Do not report a suspected issue as a confirmed defect without evidence.

---

## 11. Current Implementation Task

Maintain one clearly identified primary task at a time unless the approved roadmap explicitly permits parallel work.

Use the following template.

**Current phase:** Phase 0, subject to repository inspection.

**Current task:** Inspect the repository and reconcile the implementation state with the documented requirements.

**Expected output:**

- Actual repository structure.
- Existing frontend and backend configuration.
- Current authentication and database implementation.
- Existing tests and available scripts.
- Implemented functionality relevant to the two MVP features.
- Missing requirements and blockers.
- An evidence-based implementation plan.

**Completion requirements:**

- The repository has been inspected.
- Existing functionality has been identified accurately.
- Relevant documentation conflicts are recorded.
- The implementation roadmap reflects the actual project state.
- No unnecessary code changes have been made.

Do not advance the phase merely because repository-inspection notes have been written. Verify the required checks before changing its status.

---

## 12. Progress Update Rules for AI Coding Agents

After every meaningful development task, the AI agent must update this document.

### When starting a task

- Confirm the current phase.
- Set the relevant task to `IN_PROGRESS`.
- Identify the acceptance criteria.
- Record any blocker that prevents implementation.

### After writing code

- Record the changed files.
- Set the relevant task to `IMPLEMENTED` if coding is complete but verification remains.
- Record unfinished work and known defects.
- Do not mark the feature as verified.

### After testing

- Record the actual test commands.
- Record whether each command passed or failed.
- Record any tests that could not be run.
- Link the result to the relevant acceptance criteria when practical.
- Set the task or phase to `VERIFIED` only when the applicable requirements have passed.

### When blocked

- Set the relevant task to `BLOCKED`.
- Describe the specific blocker.
- Record the required resolution.
- Avoid changing unrelated project areas merely to show progress.

### When requirements change

- Identify the approved change.
- Update the relevant specification first.
- Reconcile dependent architecture, API, database, design, and test documentation.
- Update the implementation roadmap.
- Record the change here.

Never silently change product requirements to make an implementation appear complete.

---

## 13. Change History

Record important updates to the project status.

| Date | Change | Evidence or Reason |
|---|---|---|
| 2026-10-27 | Initial status-tracking baseline defined | Initial AmbuRoute project documentation |

Use actual dates for future entries.

When a change affects feature status, record the relevant tests or inspection that support the update.

Avoid adding an entry for every trivial code edit. Record changes that materially affect scope, completion, verification, blockers, or architecture.

---

## 14. Definition of Project Completion

The hackathon MVP is ready for final review when:

- The repository and design system have been checked.
- Emergency trips can be started and ended by authorized demonstration drivers.
- Location and route information are handled correctly.
- Route-aware alerts work for eligible subscribed test devices.
- Community traffic reports are validated and stored.
- Stale and duplicate reports are handled appropriately.
- Route comparisons use valid provider results or clearly identified simulated data.
- Route recommendations follow deterministic backend rules.
- Drivers can accept or reject suggested alternatives.
- Voice guidance reflects validated route information.
- AI cannot independently invent authoritative routing facts or execute route changes.
- Security and privacy requirements have been tested to the documented extent.
- Relevant automated tests and build checks have been executed.
- The main demonstration workflow completes successfully.
- The interface follows the approved AmbuRoute design system.
- Remaining limitations are recorded honestly.

A project should not be marked fully verified merely because the frontend loads or the backend starts.

Readiness for a hackathon demonstration is not equivalent to readiness for real emergency operations.

---

## 15. Final Instruction

Keep this document accurate and evidence-based.

The purpose of `PROJECT_STATUS.md` is to tell developers what the project can actually do today, not what it is intended to do eventually.

Update task and phase statuses only when their meanings are satisfied.

Keep unfinished work visible, record real test results, document blockers, and choose the next task based on the approved implementation roadmap.

**Build incrementally, verify explicitly, and never confuse generated code with completed functionality.**