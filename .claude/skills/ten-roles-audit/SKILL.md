---
name: ten-roles-audit
description: Full Kalmea app audit through 10 professional roles, then implement all fixes on a branch. Use when Maayan asks for the ten roles audit, a pre-release audit, or types /ten-roles-audit.
---
# Ten Roles Audit
Audit the whole Kalmea app through these roles, one after another:
1. Strict security & privacy auditor - multi-tenant isolation, RLS, API routes, client data incl. health/skin notes, Israeli privacy law.
2. QA tester who tries to break everything - double clicks, empty fields, slow network, empty states, errors.
3. Accountant & payments expert - receipts, Grow payments, refunds, Israeli tax requirements.
4. A brand-new cosmetician who is not Maayan, signing up on her phone between treatments.
5. A nail technician (new audience) - does the app feel like hers too?
6. Support agent - what questions and complaints arrive in week one, and prevent them.
7. UX/UI designer - match the Kalmea Instagram look (cream, deep green, pink), calm, consistent, mobile-first, RTL.
8. Conversion & marketing expert - signup to paid: drop-off points, converting the free month to paying.
9. Hebrew copy editor - every text short, warm, clear, in cosmeticians' language.
10. Performance engineer - fast loading on phones.

## Rules
- Work on a new branch audit/ten-roles-<date>. Never merge or push to main.
- Never run SQL on production. Never touch tenant 448e9e45-2251-4572-b665-886c5bc7a4c8 or any real client data.
- Never delete features. Hide behind default-off flags only if truly needed.
- For every finding: role, severity (critical/high/medium/low), file, fix.
- Implement ALL your own fixes yourself, critical first. Do not ask which items to do.
- Anything needing SQL or a production change: write the SQL file and explain it, do not run it.
- Run tests and type checks after each group of fixes.
- Run straight through without stops or questions.
- If the user names roles (e.g. "/ten-roles-audit 1 4 7"), run only those.

## Final report (simple English, short)
Top 10 findings, what you fixed, what still needs Maayan, how to test on the branch preview.
