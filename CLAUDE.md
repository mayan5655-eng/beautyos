@AGENTS.md

# Standing rules from the owner (apply every session, survive compaction)

- Implement your own report recommendations straight away, in priority order. Do not stop to ask which numbers to do;
  make reasonable decisions and list them in the final report.
- SQL / migrations: write them as files only (supabase/migrations + a copy on her Desktop as kalmea-sql-*.txt) and never
  run them. List them in the order she must run them.
- Never touch her real tenant 448e9e45-2251-4572-b665-886c5bc7a4c8 and never send real messages to clients. Test on the
  demo tenant or a dedicated test tenant, and clean up what you create.
- Anything that costs money (paid APIs beyond normal usage, Grow charges) needs her approval first.
- Nothing gets deleted from the product (hide behind a flag instead).
- Merging to main and pushing is allowed only after build and all tests pass and the change was checked on the branch's
  Vercel preview, unless she says otherwise. If a push is blocked, tell her and she runs it.
- Text for her terminal is in English (Hebrew renders reversed there); product copy stays Hebrew.
