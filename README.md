# Mini B2B RFQ Marketplace

A marketplace where buyers post requests for quotation (RFQs) and suppliers respond with quotations.

## Features

- Secure signup and login for Buyer and Supplier accounts.
- Buyers create, view, edit and delete their own RFQs, and view received quotations.
- RFQs include product/service name, description, quantity, delivery location and deadline.
- Suppliers browse open RFQs, search by keyword or location, and view full details.
- Quotations include price, estimated delivery time and optional message/notes.
- Suppliers view their own quotation history.
- Backend role/ownership checks, input validation, error handling and responsive pages with loading, empty and error states.

## Technology stack

React, React Router and Vite for the frontend; Node.js and Express for the backend; PostgreSQL through `pg` for persistence. Zod validates input on both the frontend and backend. The UI uses custom CSS, Lucide icons and locally hosted fonts.

## Run locally

Use Node.js 24 and npm. From the project directory:

```powershell
npm ci
```

If `.env` does not already exist, copy the example:

```powershell
Copy-Item .env.example .env
```

On macOS/Linux use `cp .env.example .env`. Do not overwrite an existing `.env`.

Set `DATABASE_URL` in the root `.env` to your PostgreSQL connection string. For Neon, copy the direct connection URL from the project's Connect dialog, preserving its SSL parameters. Copy only the URL, not a surrounding `psql` command.

```dotenv
DATABASE_URL="YOUR_POSTGRESQL_CONNECTION_STRING"
PORT=3000
APP_ORIGIN=http://localhost:5173
NODE_ENV=development
TRUST_PROXY=0
```

Then initialize the database and start both servers:

```powershell
npm run db:migrate
npm run dev
```

Open **http://localhost:5173**. The frontend runs on 5173 and proxies `/api` requests to the backend on 3000. The schema command creates tables and indexes in your existing PostgreSQL database. Stop the app with Ctrl+C.

To run separately, use `npm run dev:api` and `npm run dev:web` in two terminals.

Register a Buyer account and create an RFQ. In a private browser window, register a Supplier account, find the RFQ and submit a quotation. Refresh the buyer's detail page to see it.

Development also accepts `http://127.0.0.1:5173`. Vite stops if 5173 is occupied instead of switching ports. If you change ports, update `APP_ORIGIN` and the proxy in `vite.config.js` accordingly. Database credentials stay on the backend; `.env` is excluded from Git.

## Architecture

```text
src/                  React pages, navigation, API calls and responsive styles
server/app.js         Express middleware, API routes and built frontend serving
server/auth.js        Password hashing, sessions and role checks
server/routes.js      RFQ/quotation queries and ownership checks
server/database.js    PostgreSQL connection and schema initialization
server/schema.sql     Tables, relationships, indexes and constraints
server/origin.js       Local-origin aliases and production origin restrictions
server/errors.js      Validation and API error responses
server/index.js       Backend startup
server/migrate.js     Database setup command
shared/validation.js  Shared input validation schemas
tests/                API and browser tests
```

React calls `/api`. Express authenticates the session, checks the user's role and resource ownership, validates input, then runs parameterized SQL. In production, Express also serves the built frontend, so only one web service is needed.

The database has four tables:

- `users`: name, unique email, password hash, role and creation time.
- `rfqs`: buyer reference and the five required RFQ fields.
- `quotations`: RFQ/supplier references, price, delivery time, notes and creation time.
- `sessions`: hashed session token, user reference and expiry.

A buyer owns many RFQs; an RFQ receives many quotations; a supplier submits many quotations. Foreign keys preserve these relationships. A unique RFQ/supplier pair prevents duplicate submissions.

Passwords use salted scrypt hashes. Login sets an HttpOnly, SameSite session cookie; production also enables Secure. Logout deletes the session. Buyer ownership and supplier permissions are enforced on the backend. JSON/origin checks, authentication throttling and security headers protect the API.

## API

| Method      | Route                                   | Purpose                         |
| ----------- | --------------------------------------- | ------------------------------- |
| POST        | `/api/auth/register`, `/api/auth/login` | Signup and login                |
| GET         | `/api/auth/me`                          | Current user                    |
| POST        | `/api/auth/logout`                      | End session                     |
| POST        | `/api/rfqs`                             | Buyer creates an RFQ            |
| GET         | `/api/rfqs/my`                          | Buyer's own RFQs                |
| GET         | `/api/rfqs?q=keyword&location=city`     | Supplier searches open RFQs     |
| GET         | `/api/rfqs/:id`                         | RFQ details                     |
| PUT, DELETE | `/api/rfqs/:id`                         | Owner edits/deletes an RFQ      |
| GET         | `/api/rfqs/:id/quotations`              | Owner views received quotations |
| POST        | `/api/rfqs/:id/quotations`              | Supplier submits a quotation    |
| GET         | `/api/quotations/my`                    | Supplier's quotation history    |
| GET         | `/api/health`                           | Database health check           |

Mutations use JSON. Errors return an `error` message, optional field errors, and an appropriate HTTP status. The client displays validation and request failures without discarding form input.

## Checks

```powershell
npm run check
npm test
npm run build
npx playwright install chromium
npm run test:e2e
```

API and browser tests use an isolated PostgreSQL engine (PGlite), a development-only dependency. They never use your `.env` database. Browser tests cover buyer/supplier flows and loading/error states at desktop, tablet and mobile sizes. Build before running browser tests. Test reports and databases are excluded from Git.

## Deployment and submission

Use one Node web service with a hosted PostgreSQL database. No container setup is needed.

- Build command: `npm ci --include=dev && npm run build`
- Start command: `npm run db:migrate && npm start`
- Health check: `/api/health`
- Environment: `DATABASE_URL`, `NODE_ENV=production`, and `APP_ORIGIN` set to the exact public HTTPS origin, without a trailing slash.
- Use the host's `PORT`. Set `TRUST_PROXY=1` only when behind a trusted single reverse proxy.

The host must provide HTTPS for production session cookies. After deployment, verify signup, both roles' workflows and persistence against the hosted database.

**Live application URL:** https://rfq-marketplace-1bu7.onrender.com

**GitHub repository URL:** Pending publication.

The public service is deployed. Verify the authentication checklist below after updating production settings and redeploying. Add the GitHub repository URL before submitting.

## Assumptions and limitations

- Quoted prices are total amounts in USD, with up to two decimal places.
- Quantities allow up to three decimal places; units belong in the description.
- Deadlines close at the start of the selected UTC date. Expired RFQs accept no new quotations.
- Each supplier submits one quotation per RFQ. Submitted quotations cannot be edited; notes are optional.
- Deleting an RFQ also deletes its quotations, as stated in the confirmation dialog.
- Buyer edits preserve existing quotations. Suppliers retain access to their quotes on expired RFQs.
- No email verification, password reset or additional marketplace features are included.
- Automated browser tests use Chromium. Public HTTPS deployment still needs verification.

## Common setup errors

- **PowerShell blocks npm:** use `npm.cmd` and `npx.cmd`.
- **Missing database tables:** run `npm run db:migrate` against the configured URL.
- **Cross-site request rejected:** check the browser port and `APP_ORIGIN`, then restart the app.
- **Port already in use:** stop the earlier dev process before starting another.
- **Database connection fails:** check your provider's URL, SSL settings and network access. Never put the URL in frontend code.

### Render authentication configuration

Set these values in Render's Environment settings (changing the local .env does not update Render):

```dotenv
NODE_ENV=production
APP_ORIGIN=https://rfq-marketplace-1bu7.onrender.com
TRUST_PROXY=1
```

Save and redeploy. Keep DATABASE_URL in Render's private environment settings.
The app treats RENDER=true as a production deployment even if NODE_ENV was accidentally copied from local development. When APP_ORIGIN is omitted on Render, the app uses Render's trusted RENDER_EXTERNAL_URL. An explicit APP_ORIGIN takes precedence (for example, for a custom domain). Localhost or malformed production origins cause an actionable startup failure instead of a silently broken login. Startup logs show only the effective authentication mode and public origin.

The frontend calls relative /api URLs with credentials: same-origin. Frontend and backend share an origin, so cross-origin CORS permissions are unnecessary. Mutation requests remain subject to exact-origin and cross-site request checks. Origins are never inferred from untrusted Host or X-Forwarded-Host headers.

Production session cookies use the __Host-rfq_session name, HttpOnly, Secure, SameSite=Lax and Path=/, with no Domain attribute. Local development uses a non-Secure cookie and allows equivalent loopback names on the configured port.

After deployment, verify login returns 200, the browser stores the secure session cookie, /api/auth/me returns 200, refresh restores the user, and logout returns 204 and clears the session. A /api/auth/me 401 before login is expected.

The production browser test uses an isolated database and intercepts HTTPS-origin requests into a local production-mode backend, modeling Render's proxy. It verifies real API/session behavior and browser cookie handling without accessing the live service. It does not replace verification on the deployed host.
