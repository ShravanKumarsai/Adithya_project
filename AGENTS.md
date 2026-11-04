# Project instructions

This project is an AI-powered project-building, collaboration, and learning platform built with React, Vite, TypeScript, Tailwind, and Supabase.

## Core principles
- Keep the product focused on a real project lifecycle: discovery, collaboration, AI-guided planning, execution, learning, and portfolio-building.
- Use a dark Midnight Glass aesthetic with cyan/violet accents and strong readability.
- Prefer reusable UI sections over one-off mockups.
- Keep the frontend production-oriented and responsive across mobile, tablet, and desktop.
- Use Supabase environment variables and placeholder setup when credentials are unavailable; never fake successful connections.
- Keep AI integrations behind secure server or edge-function patterns and avoid exposing secrets in frontend code.

## Workflow
1. Define the user journey and architecture before large additions.
2. Build the essential app shell and shared data model.
3. Add interactive UI sections and mock data to validate product behavior.
4. Wire the UI to environment-driven configuration and mark any placeholder integrations clearly.
5. Validate with a production build before summarizing progress.

## Quality bar
- Type-checking must succeed.
- Build output should run without runtime-breaking errors.
- Avoid unrelated styling or feature churn.
- Respect accessibility and responsive behavior.
