# Connecting the site to your Supabase project

> **This has been done.** The database, the two storage buckets and the
> security policies are all in place on project `xebcikryasdgiwqexvaq`, applied
> and verified on 23 September 2026. Nothing below needs doing again. It is
> kept as the record of how it was set up, and as the procedure for standing up
> a second project — a staging one, or a replacement.
>
> What is still outstanding is in `DEPLOYMENT.md`: real package prices, the
> first administrator, backups, and the Razorpay, email and WhatsApp accounts.

Your project is already created (`xebcikryasdgiwqexvaq`). What is left is to put
the database tables into it, create two folders for images, and make yourself
the administrator.

There are two ways to do this. **Pick one.**

---

## Why I could not just do it for you

This container is only allowed to reach GitHub. Every other address on the
internet is refused before the request leaves the machine — I tested
`example.com` and it was refused in exactly the same way as Supabase. So this
is not a problem with your keys, your project, or anything you did.

If you want me to do it, see Way 1. If you would rather it were just finished,
see Way 2 — it is about fifteen minutes of copying and pasting.

---

## Way 1 — let me do it (you change one setting)

1. Look at the **title bar at the top of this session**. There is a menu there
   for the cloud environment.
2. Open it and choose **Edit**.
3. Find **Network access**.
4. Either choose a wider access level, or add this address to the allowed list:

   ```
   xebcikryasdgiwqexvaq.supabase.co
   ```

5. Save it.
6. **Start a new session** — the setting often only takes effect in a fresh
   one — and tell me to carry on.

I will then apply everything below myself and show you the result.

**One thing this still will not cover.** Creating the tables needs a direct
database connection on port 5432, which is a different kind of connection from
a web address and may stay closed even after the above. If it does, I will tell
you, and we fall back to Way 2 for that one step only.

**I also still need the database password** for that step. It is not the same
as the keys you sent me. It is the one you chose when you created the project.
Put it into the environment's settings as a variable called `SUPABASE_DB_URL`
rather than typing it into the chat.

---

## Way 2 — do it yourself (about fifteen minutes)

Nothing here needs any technical knowledge. It is copying text from a file into
a box and pressing a button.

### Step 1 — create the database tables

Open <https://supabase.com/dashboard/project/xebcikryasdgiwqexvaq/sql/new>

In this repository there is a folder called **`supabase/bundles`** holding five
files. You will paste each one in turn.

| Order | File | What it does |
| --- | --- | --- |
| 1 | `bundle_1.sql` | The main tables — users, advertisements, categories, payments |
| 2 | `bundle_2.sql` | One small change that must be on its own |
| 3 | `bundle_3.sql` | Moderation and renewals |
| 4 | `bundle_4.sql` | One small change that must be on its own |
| 5 | `bundle_5.sql` | Prices, notifications, reports |

For each file, in order:

1. Open the file and select all of it, then copy.
2. Paste it into the SQL box on the Supabase page.
3. Press **Run** (or Ctrl+Enter).
4. Wait for it to say **Success**.
5. Clear the box, then do the next file.

**They must go in this order, and each must finish before you start the next.**
Bundles 2 and 4 look almost empty — that is correct. They each add one new value
to the database, and PostgreSQL will not let that value be used in the same
breath it is created. That is the only reason there are five files instead of
one.

If a bundle reports an error, stop and send me the message. Do not run the
later ones.

I have already run all five, in this order, against an empty database in this
container. The result was identical to applying the sixteen original migration
files one at a time — same 20 tables, same 20 with row-level security on, same
37 security policies, same 114 functions — and all 386 database tests passed
against it.

### Step 2 — create the two image folders

Open <https://supabase.com/dashboard/project/xebcikryasdgiwqexvaq/storage/buckets>

Press **New bucket** twice and create exactly these two:

| Name | Public? |
| --- | --- |
| `ad-images` | **Yes** — tick "Public bucket" |
| `ad-artwork` | **No** — leave it unticked |

The names must match exactly, lowercase, with the hyphen. `ad-images` holds the
photographs that appear on the website, so it is public. `ad-artwork` holds the
files advertisers upload for the printed paper, so it is private — only the
person who uploaded a file, and the office, can open it.

The rules controlling who may read and write in these folders were already
installed by bundle 1. You do not need to add any.

### Step 3 — make yourself the administrator

First, **sign up on the website itself** with your own email, the ordinary way,
as though you were a customer. This has to happen first: the next command
promotes an account that already exists.

Then open the SQL editor again and run this, with your email in place of the
one shown:

```sql
update public.profiles
   set role = 'admin'
 where email = 'your-email@example.com';
```

It should say `UPDATE 1`. If it says `UPDATE 0`, the sign-up did not complete or
the email differs — check before going further.

Sign out and back in. The admin pages will then be available.

### Step 4 — set real prices

Until you do this, placing an advertisement is free and goes straight to the
moderation queue. Set your real rates at **Admin → Packages** once you can see
the admin pages.

Do **not** run `supabase/seed/dev_package_prices.sql`. Those are made-up figures
for local development.

---

## After either way — tell me, and I will check it

Once the database is set up, tell me and I will go through the things that have
never been tested against a real database. They are listed as finding **H2** in
`AUDIT.md`, and they are the honest reason I have not called this site ready:

- signing up, placing an advertisement, and it being published
- uploading a photograph and it landing in the right folder
- a list with more than one page of real rows in it
- an advertisement that does not exist returning a proper "not found"

Everything else in `DEPLOYMENT.md` — the domain, Razorpay's live keys, email —
is separate from this and comes after.

---

## What is in this repository, for reference

| Path | What it is |
| --- | --- |
| `supabase/bundles/*.sql` | The five files for Step 1 |
| `supabase/migrations/*.sql` | The original sixteen files the bundles are built from |
| `scripts/setup-supabase.sh` | Does Steps 1 and 2 automatically, if you run it on your own computer with the database password set |
| `DEPLOYMENT.md` | Everything else needed before a real launch |
| `AUDIT.md` | What has been verified and what has not |
