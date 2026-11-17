# Lereng Rinjani — Redesign Motion V2 (review branch)

This branch is a **separate preview**. It does not replace `main` or the real order database.

## Interface
- React 19 / Vite 7 / TypeScript / Tailwind 4
- Motion for React transitions and reveal animations (respects reduced-motion setting)
- shadcn/ui structure and local `components/ui` source (Radix Dialog, CVA, Lucide icons)
- 60% ivory, 30% charcoal, 10% brass
- Original eight photographs from the initial Lereng Rinjani website

## Preview transactions
`preview-server.mjs` runs a **separate in-memory SQLite demo database**. Test orders, prices, inventory, and admin credentials cannot affect the production database. The demo database resets after a server restart; never use it for real customer orders. No real WhatsApp message is automatically sent from the preview checkout.

## Run
```sh
npm install
npm run build
PREVIEW_ADMIN_PASSWORD='your-local-secret' npm start
```
Visit http://localhost:10000/ . For frontend hot reload use `npm run dev` (the dev server proxies `/api` to port 10000).

## Tests
```sh
npm run test:api
npx playwright install chromium
npm run test:browser
```
Browser checks cover five responsive widths, horizontal overflow, navigation, cart, and end-to-end demo checkout. GitHub Actions runs these on each push to this branch.

## Production handoff checklist
- Maintain the existing production `server.mjs` and PostgreSQL data.
- Build React using `npm run build`, serve `dist/` as production static root.
- Preserve real `ADMIN_PASSWORD`, `SESSION_SECRET`, `DATABASE_URL` only in Render environment variables (never commit them).
- Change `robots.txt` to a production policy; remove preview ribbon and demo-mode references.
- Verify admin workflows, order price consistency, stock, security, and accessibility on production after owner approval.
- Plan a durable database before accepting real business orders; existing Render free Postgres expires after 30 days.
