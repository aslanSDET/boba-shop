---
name: amplify-ops
description: Use when working on this project's AWS backend — anything under amplify/, the Stripe webhook function, the Amplify Data schema, or running/deploying the Amplify sandbox. Keeps changes consistent with the architecture decisions already made in PLAN.md instead of re-deriving or drifting from them.
---

# Amplify Backend Ops (boba-shop)

This is a **thin, project-specific** skill. It does not replace AWS's official `aws-amplify` Claude Code plugin — it exists to keep that plugin's general-purpose work aligned with decisions already made for *this* project. If the plugin isn't installed yet, tell the user to run:

```
/plugin marketplace add awslabs/agent-plugins
/plugin install aws-amplify@agent-plugins-for-aws
```

That plugin provides the real AWS API access, credential handling, and its own 4-phase workflow (Backend → Sandbox → Frontend → Production). Use it for the actual scaffolding, `npx ampx sandbox` runs, and deploys. This skill supplies the project context that plugin doesn't have.

## Before touching anything, read `PLAN.md`

Specifically §4 (Tech Stack, with the decision log) and §6 Phase 3 (the Amplify Data schema sketch). Architecture decisions are already made there — don't re-derive them from scratch or propose alternatives unless the user explicitly asks you to reconsider.

## Decisions already made — don't re-litigate these

- **Backend = AWS Amplify Gen 2**, not raw CDK + hand-written Lambda + DynamoDB. Reasoning is logged in `PLAN.md` §4 — schema-driven Data layer, declarative authorization rules instead of hand-written IAM policies.
- **Auth = Clerk** (phone/SMS), *not* Cognito. Amplify Data authorization rules need to work against an externally-issued identity (Clerk's `userId`), not Amplify's own Cognito user pool. Don't introduce Cognito auth unless the user asks to reconsider this.
- **Payments = Stripe Checkout + webhook.** The webhook is the one piece of custom backend logic — implement it as a single Amplify Function (signature verification + `Order.status` update via the generated data client), not as a hand-written API Gateway route.

## Data model source of truth

`src/types/boba.ts` is canonical. When writing or editing `amplify/data/resource.ts`, mirror those field names and shapes exactly — don't invent new field names or reshape data that already has a defined TypeScript type. If the schema and the types drift, that's a bug to fix, not a reason to pick one arbitrarily.

## Local dev loop

- `npx ampx sandbox` — live per-developer cloud backend, watches `amplify/` and redeploys on save. This is the default way to iterate; no separate manual deploy step needed during development.
- Generated output (typed client, `amplify_outputs.json`) is generated — never hand-edit it. If it looks wrong, fix the schema, not the generated file.

## Guardrails

- Never commit real Stripe keys, AWS credentials, or `amplify_outputs.json` secrets. `.env.local` is gitignored — keep it that way.
- A **production** deploy (`npx ampx pipeline-deploy` or equivalent CI path) needs explicit user confirmation before running. Sandbox deploys are fine to iterate on freely — they're the whole point of the sandbox workflow.
- Prefer schema authorization rules (`allow.owner()`, `allow.publicApiKey().to([...])`) over any hand-written IAM policy or Lambda-side permission check. If a task seems to need a custom IAM policy, stop and check whether an authorization rule on the model would cover it instead — that's the reason Amplify Gen 2 was chosen.

## When a change lands

Update `PLAN.md` — tick off the relevant checkbox in §6 (Roadmap) and update §5 (Current Status) so the plan file stays an accurate description of what's actually built, not just what was intended.
