# Ade's Gadget — Cloudflare Worker + D1

This project includes the storefront, a server-verified admin login, product CRUD API, and Cloudflare D1 storage. Product images uploaded in the admin panel are compressed in the browser and stored as image data in D1; use smaller images and stay within the upload limit.

## Before you launch

- The initial catalogue is demo content with example prices. Replace every product and price with your real stock before sharing the website publicly.
- Orders are sent through WhatsApp only. This version does not process online payments or save orders centrally.
- Never put admin passwords, session secrets, Cloudflare API tokens, or any secret keys in this repository.

## Deploy outline

1. Create a Cloudflare D1 database named `ades-gadget-db`.
2. In that database's SQL console, run `schema.sql`, then run `seed.sql` (seed items are examples).
3. Copy the D1 database ID into `wrangler.toml`, replacing `REPLACE_WITH_D1_DATABASE_ID`.
4. Connect this private GitHub repository to Cloudflare Workers & Pages as a Worker project. Set the deploy command to `npx wrangler deploy` if the dashboard asks for one.
5. In the deployed Worker settings, add secrets `ADMIN_PASSWORD` and `SESSION_SECRET`. Set the variable `ADMIN_EMAIL` to your admin email. Use a long unique password and a separate random session secret (at least 32 random characters). Do not add secrets to GitHub.
6. Ensure the Worker has the D1 binding `DB` pointing to `ades-gadget-db`, and the static assets binding `ASSETS` is configured by `wrangler.toml`.
7. Redeploy after configuration. Test the storefront, then sign in with the admin email/password and update demo items before launch.

## Security notes

- Admin product create/update/delete endpoints require a signed, HttpOnly, Secure, SameSite=Strict session cookie.
- The password is configured as a Cloudflare Worker secret and never stored in source code.
- Public API reads only active products. Admin access requires the configured email and password.
- The site should be tested before public launch. The basic app does not include online payments or centralized order management.
