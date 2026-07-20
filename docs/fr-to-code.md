# FR → Code Traceability

Living tracker. Update the Status/Files/Tests columns as each requirement is implemented. Reference the ID in commits and prompts instead of re-pasting requirement text.

`T-##` = Section 4 Testing Engine item number (as numbered in the requirements doc, not prefixed with FR-).

| ID | Requirement (short) | Phase | Status | Files | Tests |
|---|---|---|---|---|---|
| FR-01 | Login via phone/email + OTP | - | Not started | | |
| FR-02 | Login via company Google Workspace account (SSO / OAuth 2.0), restrict | - | Done | src/auth.ts, src/lib/auth/domain.ts | src/lib/auth/domain.test.ts |
| FR-03 | Google login used to authenticate and persist each employee's profile/ | - | Done | src/auth.ts, prisma/schema.prisma | src/auth.session-expiry.test.ts |
| FR-04 | Redirect to Knowledge Library home immediately after login | - | Stub (redirects to placeholder home; content is modeled server-side as of slice 2 but not yet rendered in UI) | src/app/page.tsx | manual (dev server smoke test) |
| FR-05 | Top-level Sectors: Services, Retail, Restaurants & Cafés | - | Stub schema + fixture data (not the authoritative list — owned by content system) | prisma/schema.prisma, prisma/seed.ts | src/lib/content/taxonomy.test.ts |
| FR-06 | Sectors broken into sub-sectors: Services (10), F&B (4–5), Retail (gro | - | Stub schema + fixture data (same caveat as FR-05) | prisma/schema.prisma, prisma/seed.ts | src/lib/content/taxonomy.test.ts |
| FR-07 | Employee assigned to a sector by Admin | - | Done | src/lib/admin/assign-sector.ts, src/app/api/admin/trainees/[id]/sector/route.ts | src/lib/admin/assign-sector.test.ts |
| FR-08 | Two fixed categories per sector: Soft Skills and Hard Skills | - | Done (SkillType enum on Unit) | prisma/schema.prisma | src/lib/content/taxonomy.test.ts |
| FR-09 | Soft Skills path = “Calls Handling” with subcategories: First Call, Ob | - | Not modeled — stub collapses this into the generic Unit level; real path/subcategory structure is owned by the content system | | |
| FR-10 | Hard Skills subcategories/topics defined per sector (mirrors Soft Skil | - | Not modeled (see FR-09) | | |
| FR-11 | Journey: select sector → select skill type → watch video + read text → | - | Not started (content-team UI) | | |
| FR-12 | Admin uploads/manages content items per subcategory (video, PDF, artic | - | Stub (Lesson row is a title-only placeholder; real content authoring is Ibrahim's system) | prisma/schema.prisma | src/lib/content/taxonomy.test.ts |
| FR-13 | Search/browse content within assigned sector only | - | Done (browse; no search yet — not needed until content UI exists) | src/lib/content/taxonomy.ts, src/app/api/content/route.ts | src/lib/content/taxonomy.test.ts |
| FR-14 | Reassign an employee's sector on role/department change | - | Done — touches open item #2 (quiz-progress-on-reassignment), left as a TODO since no attempt model exists yet | src/lib/admin/assign-sector.ts | src/lib/admin/assign-sector.test.ts |
| FR-18 | Flexible admin panel to add/edit sectors, sub-sectors, and paths witho | - | Partial (Admin read of full taxonomy only; no create/edit/delete yet) | src/lib/content/taxonomy.ts, src/app/api/admin/sectors/route.ts | src/lib/content/taxonomy.test.ts |
| FR-21 | Progress bars, today's lesson/task, trainee lists & status, enrollment | - | Not started | | |
| FR-22 | Weekly video/PDF/slide upload | - | Not started | | |
| FR-25 | Daily reminders, pre-session alerts, “behind” alerts, trainer alerts | - | Not started | | |
| FR-26 | Successful/failed call library, written feedback, final rating (commun | - | Not started | | |
| FR-27 | Trainee progress, attendance, trainer performance, department reports | - | Not started | | |
| T-1 | A pop quiz appears after each lesson and is graded under the same rule | Phase 1 | Not started | | |
| T-2 | Passing grade is 95% per quiz | Phase 1 | Not started | | |
| T-3 | 2 attempts per quiz | Phase 1 | Not started | | |
| T-4 | Certificate auto-generated once all required quizzes are passed (name, | Phase 1 | Not started | | |
| T-5 | Quizzes are sector-dependent, following each sector's own content layo | Phase 1 | Not started | | |
| T-6 | Supported question types: multiple choice, true/false, sales scenarios | Phase 1 | Not started | | |
| T-7 | A quiz unlocks only after its associated lesson is marked complete | Phase 1 | Not started | | |
| T-8 | Quiz surfaces to the trainee without requiring manual notification fro | Phase 1 | Not started | | |
| T-9 | Trainee can start a quiz only when prior required content/quizzes are  | Phase 1 | Not started | | |
| T-10 | AI drafts candidate questions per lesson/topic | Phase 1 | Not started | | |
| T-11 | Every AI-drafted question requires human review | Phase 1 | Not started | | |
| T-12 | Only approved questions are eligible to be served in a live quiz | Phase 1 | Not started | | |
| T-13 | Trainer/Training Manager can manually add, edit, or retire questions | Phase 1 | Not started | | |
| T-14 | Questions tagged by sector, skill type, unit, and question type | Phase 1 | Not started | | |
| T-15 | Question bank supports versioning without altering historical results | Phase 1 | Not started | | |
| T-16 | Engine assembles a quiz from approved questions matching the trainee's | Phase 1 | Not started | | |
| T-17 | Objective question types (MCQ, true/false) are auto-graded | Phase 1 | Not started | | |
| T-18 | Scenario / free-text items are routed to the Trainer for manual gradin | Phase 1 | Not started | | |
| T-19 | Engine records trainee ID, quiz ID, timestamp, answers, score, and out | Phase 1 | Not started | | |
| T-20 | 2-attempt cap enforced; higher score is the trainee's final result | Phase 1 | Not started | | |
| T-21 | Shows which trainees have/haven't completed each quiz, and who's on at | Phase 1 | Not started | | |
| T-22 | Shows average scores across a cohort | Phase 1 | Not started | | |
| T-23 | Flags trainees who failed both attempts | Phase 1 | Not started | | |
| T-24 | Per-trainee performance reports and training-level trends | Phase 2 | Not started | | |
| T-25 | Trainer can view submitted assignments/mock calls and enter a grade wi | Phase 1 | Not started | | |
| T-26 | Manually graded items follow the same 95% / 2-attempt logic as auto-gr | Phase 1 | Not started | | |
| T-27 | Every attempt is attributed to a trainee via the existing Google SSO s | Phase 1 | Partial (session carries user id/role; attempt records land in slice 4) | src/auth.ts, src/lib/auth/types.d.ts | src/auth.session-expiry.test.ts |
| T-28 | Certificate generation pulls trainee name and completion date from the | Phase 1 | Not started | | |
| T-29 | Practical/video test: trainee performs steps in-platform, AI grades th | Phase 2 | Not started | | |
| T-30 | Voice-simulation test: AI plays a customer/lead, scores the trainee's  | Phase 2 | Not started | | |
| T-31 | Voice quiz: AI agent asks the trainee a question aloud; trainee replie | Phase 2 | Not started | | |
| T-32 | Pop quiz includes a visible countdown timer per attempt; quiz auto-sub | Phase 1 | Not started | | |
| T-33 | Quiz does not auto-launch when a lesson is marked complete | Phase 1 | Not started | | |
| T-34 | AI Voice Call Training: AI agent conducts a simulated sales call with  | Phase 2 | Not started | | |
| T-35 | AI Video Grader: trainee uploads a video (e.g. recorded mock call or p | Phase 2 | Not started | | |
| T-36 | Question bank versioning (see #15) is mirrored at the content level: c | Phase 1 | Not started | | |
| NFR-01 | OAuth 2.0 via Google Workspace SSO | - | Done | src/auth.ts | src/lib/auth/domain.test.ts |
| NFR-02 | Sector-based and role-based access control enforced server-side, not j | - | Done | src/lib/auth/rbac.ts, src/proxy.ts, src/lib/content/taxonomy.ts | src/lib/auth/rbac.test.ts, src/lib/content/taxonomy.test.ts |
| NFR-03 | HTTPS/TLS everywhere | - | Not started (deployment concern) | | |
| NFR-04 | Session timeout and re-authentication after prolonged inactivity | - | Done | src/auth.ts, src/lib/auth/session-policy.ts | src/auth.session-expiry.test.ts |
| NFR-05 | Audit trail of Admin actions (user creation, sector/role assignment, c | - | Started (sector reassignment audited; other admin actions add their own call sites as built) | src/lib/audit/log.ts, prisma/schema.prisma | src/lib/admin/assign-sector.test.ts |
| NFR-06 | Any AI-generated content — quiz questions, future AI evaluations — pas | - | Not started | | |
| NFR-07 | Video streams smoothly on standard office bandwidth without significan | - | Not started | | |
| NFR-08 | Dashboards, reports, auto-grading, and aggregate views load within a f | - | Not started | | |
| NFR-09 | Arabic-only interface, consistent terminology across the LMS, Knowledg | - | Partial (base RTL layout + login/home stub; full coverage grows with each slice) | src/app/layout.tsx, src/app/login/page.tsx, src/app/page.tsx | manual (dev server smoke test) |
| NFR-10 | Consistent, intuitive navigation across Sector → Sub-sector → Skill Ty | - | Partial (schema follows this hierarchy; no navigation UI built yet) | prisma/schema.prisma | src/lib/content/taxonomy.test.ts |
| NFR-11 | Responsive layout usable on both desktop and mobile browsers | - | Not started | | |
| NFR-12 | Test-taking flow requires zero manual explanation to the trainee | - | Not started | | |
| NFR-13 | Editing a question does not retroactively change scores of completed a | - | Not started | | |
| NFR-14 | High uptime targeted during business hours | - | Not started | | |
| NFR-15 | Regular backups of user data, content, test results, question bank, an | - | Not started | | |
| NFR-16 | Architecture supports adding sectors, sub-sectors, and content volume  | - | Partial (schema imposes no fixed limits; no load testing done) | prisma/schema.prisma | |
| NFR-17 | Admins manage the full taxonomy (sectors, sub-sectors, paths) and Trai | - | Partial (Admin read-only taxonomy access; create/edit is FR-18's remaining gap) | src/lib/content/taxonomy.ts | src/lib/content/taxonomy.test.ts |
| NFR-18 | Verifiable digital signature on certificates | - | Not started | | |
| NFR-19 | Google Workspace SSO | - | Done | src/auth.ts | src/lib/auth/domain.test.ts |
