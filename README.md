# Gerenciador Fotografia

Generates wedding photography contracts as PDF from a form, stores them, and
keeps an audit trail of every action. Runs on your own machine only.

## Setup

Requires macOS with [Homebrew](https://brew.sh).

```bash
brew install uv pango node@22
make install
cp .env.example .env
cd backend && uv run python -m gerenciador.keygen
```

`make install` installs the backend and the interface. The first time you run the
end-to-end tests, also run `cd frontend && npx playwright install chromium`.

Paste the two generated lines into `.env` and fill in your own details.

On macOS with Homebrew, WeasyPrint needs `DYLD_FALLBACK_LIBRARY_PATH` set to
Homebrew's lib folder. `make run` and `make check` set it for you. When you run
`uv run` by hand, prefix the command with
`DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib"`.

## Run

```bash
make run
```

Open <http://127.0.0.1:8000>. `make run` builds the interface first when its
sources have changed. The API is at <http://127.0.0.1:8000/api/v1>. The server
refuses to start on any address other than `127.0.0.1` or `localhost`, because
it has no login.

The app serves no documentation page and no schema. To get the OpenAPI schema
as a file (the frontend needs it), run:

```bash
make openapi
```

It writes `openapi.json` at the repository root without starting the server or
opening the database.

Writes need an `Origin` header that matches the address you call. Browsers send
it. With curl, add `-H "Origin: http://127.0.0.1:8000"`. Reads work without the
header, but a read that carries an `Origin` for any other address is refused.

## Develop

```bash
make dev
```

Runs the backend and the Vite dev server together. Open <http://localhost:5173>;
Vite reloads the page as you edit and forwards `/api` to the backend.

After changing the backend's routes or models, run `make api-types` and commit
`frontend/src/api/schema.d.ts`. `make check` fails while it is out of date.

`frontend/package.json` overrides `tinypool` to a newer release. That clears a
critical advisory in a dev-only dependency of Vitest 3; remove the override when
you upgrade Vitest.

## Using the API from the terminal

Reading the audit trail and correcting a client's details
(`PATCH /api/v1/clients/{id}`) have no screen, so use `curl` while the server
is running. Exporting and anonymising a person are on the **Clientes** screen;
the commands below do the same from the terminal. Replace `CLIENT_ID` with an
`id` from the first command.

```bash
# List clients (CPFs are masked in lists)
curl http://127.0.0.1:8000/api/v1/clients

# Export everything held about one client
curl http://127.0.0.1:8000/api/v1/clients/CLIENT_ID/export

# Anonymise a client (permanent)
curl -X POST -H "Origin: http://127.0.0.1:8000" \
  http://127.0.0.1:8000/api/v1/clients/CLIENT_ID/anonymise

# List audit events, newest first
curl "http://127.0.0.1:8000/api/v1/audit-events?limit=50"
```

## Check

```bash
make check
```

Runs formatting, lint, types, tests with coverage gates, and a dependency audit.
`make e2e` builds the interface and runs the browser tests against the real
backend on a temporary database.

## Backups

Back up two things, and keep them in different places:

1. `data/gerenciador.db`: every contract, client and audit event.
2. `FIELD_ENCRYPTION_KEY` and `CPF_LOOKUP_KEY` from `.env`.

CPFs and addresses are encrypted with those keys. If you lose the keys, that
data cannot be recovered. Anyone who has both the database and the keys can
read everything.

The database must live in its own folder, because the app restricts that
folder's permissions to the owner.

## Personal data

Client name, CPF and address live only in the `clients` table. On the
**Clientes** screen you can export everything held about a person or anonymise
them. Corrections go through the contract form, or through the API (see "Using
the API from the terminal"). Anonymising is permanent and is refused while the
person has a contract that is not deleted.

How long to keep a finished contract before anonymising is a legal decision.
This software provides the technical measures, not legal advice.

Logs contain no personal data at the default level. Do not turn on DEBUG
logging for `sqlalchemy.engine`: at that level it logs result rows, which
include client names.

## The contract template

`base_contract/contract_template.md` is a Jinja2 template in Markdown. Edit the
clauses there. Keep the `{{ placeholders }}` and the `{% ... %}` lines intact.
