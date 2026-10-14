# Gerenciador Fotografia

Generates wedding photography contracts as PDF from a form, stores them, and
keeps an audit trail of every action. Runs on your own machine only.

## Setup

Requires macOS with [Homebrew](https://brew.sh).

```bash
brew install uv pango
make install
cp .env.example .env
cd backend && uv run python -m gerenciador.keygen
```

Paste the two generated lines into `.env` and fill in your own details.

On macOS with Homebrew, WeasyPrint needs `DYLD_FALLBACK_LIBRARY_PATH` set to
Homebrew's lib folder. `make run` and `make check` set it for you. When you run
`uv run` by hand, prefix the command with
`DYLD_FALLBACK_LIBRARY_PATH="$(brew --prefix)/lib"`.

## Run

```bash
make run
```

The API is at <http://127.0.0.1:8000/api/v1> and its documentation at
<http://127.0.0.1:8000/docs>. The server refuses to start on any address other
than `127.0.0.1` or `localhost`, because it has no login.

Writes need an `Origin` header that matches the address you call. Browsers send
it. With curl, add `-H "Origin: http://127.0.0.1:8000"`.

## Check

```bash
make check
```

Runs formatting, lint, types, tests with coverage gates, and a dependency audit.

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

Client name, CPF and address live only in the `clients` table. Through the API
you can export everything held about a person, correct it, or anonymise it
(`/docs`, under "clients"). Anonymising is permanent and is refused while the
person has a contract that is not deleted.

How long to keep a finished contract before anonymising is a legal decision.
This software provides the technical measures, not legal advice.

Logs contain no personal data at the default level. Do not turn on DEBUG
logging for `sqlalchemy.engine`: at that level it logs result rows, which
include client names.

## The contract template

`base_contract/contract_template.md` is a Jinja2 template in Markdown. Edit the
clauses there. Keep the `{{ placeholders }}` and the `{% ... %}` lines intact.
