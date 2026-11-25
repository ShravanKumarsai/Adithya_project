# DraftDeck

DraftDeck is a workspace for hackathon teams. It connects rulebooks, project planning, team collaboration, build activity, and submission evidence.

**Hackathon submission** · [Live DraftDeck workspace](https://adithya-project.vercel.app/shared) · [Application and setup guide](aithya-studio/README.md)

The live application is in [`aithya-studio/`](aithya-studio/). Its deployed application source is [`aa2c669`](https://github.com/ShravanKumarsai/Adithya_project/commit/aa2c669efd99e00d8dbcc065ec34bd893d1b4c78). The root frontend and earlier documents record preceding versions of the project.

## Local preview

Use Node.js 24 and npm.

```sh
cd aithya-studio
npm ci
npm run dev
```

Open http://localhost:4173/shared. The local server serves the interface, while server-side integrations run on the hosted deployment. See the [setup guide](aithya-studio/README.md) for deployment configuration and verification.
