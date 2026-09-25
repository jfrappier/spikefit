# Coach Module Setup

Setup steps for turning on pickup sign-out (ADR-014) for a team on the
hosted instance. This only applies if you're running the Cloudflare Worker —
a local fork needs none of this.

Nothing here ships to the browser. `generate-ids.py` is a standalone script
you run on your own machine when printing cards for a team.

---

## 1. Google Cloud service account

1. Create (or reuse) a Google Cloud project.
2. Enable the **Google Sheets API** for that project.
3. Create a **service account** and generate a JSON key for it.
4. Store the key as a Worker secret — paste the *entire* JSON file contents when prompted:

   ```bash
   wrangler secret put GOOGLE_SA_KEY
   ```

   The Worker only reads `client_email` and `private_key` from it. Never commit this file or log its contents.

## 2. Create the team's Google Sheet

1. Create a new Google Sheet for the team (one Sheet per team).
2. Add five tabs with these exact names and header rows (see `coach-module-plan.md` §3 for the full column list) — **tab names are case-sensitive**, the Worker reads/writes `Kids`, `Parents`, `Log`, `Overrides`, `Rejected` literally:
   - **Kids** — `KidID | KidName | AuthorizedParentIDs | Active | Notes`
   - **Parents** — `ParentID | Name | Email | Phone | Active`
   - **Log** — `EventID | ScannedAt | ReceivedAt | Kid | KidID | Adult | ParentID | Status | Coach | OverrideReason | OverrideNote | OfflineQueued`
   - **Overrides** — same columns as Log (yellow rows only)
   - **Rejected** — `EventID | ScannedAt | ReceivedAt | ScannedID | Reason | Coach | OfflineQueued`

   **The fastest way to do this** — `tools/coach/sheet-templates/` has one ready-made CSV per tab (`Kids.csv`, `Parents.csv`, `Log.csv`, `Overrides.csv`, `Rejected.csv`), header row plus two obviously-fake example rows in `Kids`/`Parents` for a coach to see the format and overwrite. Give the whole `sheet-templates/` folder to whoever's setting up a team's Sheet (or hand them the individual files) and have them, for **each** of the five files:
   1. In the new Sheet, right-click any tab at the bottom → **Insert sheet** (skip this for the very first one — a blank Sheet already has one tab to use).
   2. **File → Import → Upload**, pick the CSV, choose **Insert new sheet** as the import location, click **Import data**.
   3. Double-click the new tab's name and rename it to match the CSV exactly (`Kids`, `Parents`, `Log`, `Overrides`, `Rejected`) — Google names the imported tab after the file, so if the upload picker doesn't already show the right name, this is the step to catch it.
   4. Delete the original blank "Sheet1" tab once all five are in and correctly named.
   5. In `Kids` and `Parents`, replace the two example rows with the team's real roster (or delete them and start adding real rows) — `Log`, `Overrides`, and `Rejected` should stay empty below the header; the Worker appends to those itself.
3. Share the Sheet with the service account's email address (`client_email` from the JSON key) as **Editor**.
4. Copy the Sheet ID from its URL (`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`) — you'll need it in step 3 below.

## 3. Create the TEAMS KV namespace and add the team config

```bash
wrangler kv namespace create TEAMS
```

Add the binding it prints to `cloudflare/wrangler.toml` (see `cloudflare/wrangler.example.toml`), then write the team's config:

```bash
wrangler kv key put --binding=TEAMS "team:tigers" '{
  "name": "Tigers",
  "timezone": "America/New_York",
  "sheetId": "<SHEET_ID from step 2.4>",
  "features": { "pickup": true, "pickupOverrideAlerts": true },
  "overrideReasons": [
    "Verified by phone with an authorized parent",
    "Written or text note from an authorized parent",
    "Other (note required)"
  ],
  "adminEmails": ["coach@example.com"]
}'
```

`team:tigers` must match a slug already registered in `js/team.js`'s `TEAMS` object (that's the client-side theme registry — the two lists have to stay in sync). A feature flag that's missing or not `true`/`false` counts as off.

No `wrangler` CLI required for any of this — every KV write above can be done from the Cloudflare dashboard instead: **Workers & Pages → KV → `TEAMS`** (create the namespace there too, if it doesn't exist yet, and bind it to the Worker under the Worker's **Settings → Variables and Secrets**), then **Add entry** with the key and JSON value shown above. Same for `ALLOWLIST` in step 4 below.

**If `sheetId` is left blank or wrong:** coaches don't get a silent failure. The hub shows the Pickup tile as "Setup Needed" (no scan attempted yet), and if a coach tries to scan anyway, they get an immediate "contact your admin" message instead of the app treating it like a connectivity issue and queuing forever offline. See `docs/architecture.md`'s Coach Module section, "Team setup problems are a distinct error."

## 4. Grant a coach access

Coaches are granted per-team, on top of the existing hosted-instance allowlist. This adds a `coach` field to their existing `ALLOWLIST` record **without disturbing the fields already there** (ToS acceptance, guardian consent, etc.):

```bash
# Read the existing record first so you don't clobber it:
wrangler kv key get --binding=ALLOWLIST "coach@example.com"

# Then write it back with `coach.teams` added, e.g. if the existing value was
# {"allowed":true,"tosAcceptedAt":"...","tosVersion":"0.0.723"}:
wrangler kv key put --binding=ALLOWLIST "coach@example.com" '{
  "allowed": true,
  "tosAcceptedAt": "...",
  "tosVersion": "0.0.723",
  "coach": { "teams": ["tigers"] }
}'
```

A user is a coach for team X only when both are true: `coach.teams` includes `X`, **and** `team:X` exists in the `TEAMS` KV namespace. Removing the `coach` field (or emptying `teams`) revokes access immediately — coach routes re-read `ALLOWLIST` on every request rather than trusting the session.

## 5. Print QR cards

Generate the IDs locally:

```bash
python3 tools/coach/generate-ids.py --kind parent --count 20 > parent-ids.txt
python3 tools/coach/generate-ids.py --kind kid --count 40 > kid-ids.txt
```

Add each ID (with the matching name/email/phone/authorized-adult info) as a row in the Sheet's `Kids`/`Parents` tabs, with `Active` set to `TRUE`.

**Generate the actual printable QR cards outside SpikeFit** — there's no print page in the app (v1 deliberately doesn't build one). Any web-based QR generator receives the IDs you paste into it, so prefer a local, offline tool. One option that keeps IDs off third-party servers entirely: [`qrencode`](https://fukuchi.org/works/qrencode/) (`brew install qrencode` on macOS), looped over the ID list:

```bash
mkdir -p qr-out
while read -r id; do
  qrencode -o "qr-out/${id}.png" -s 10 "$id"
done < parent-ids.txt
```

Lay the resulting PNGs out in whatever document/label tool you like for printing.

## 6. One card only proves someone is holding it

The card is not identity verification — it just proves the bearer has a card that maps to a roster row. **The coach still has to recognize the adult** before treating a green result as a real match; the app can't do that part.

If a card is lost or given away, set that row's `Active` to `FALSE` in the Sheet immediately and issue a new ID (`generate-ids.py`) for a replacement card. The old ID stops working the next time the roster cache refreshes (up to 60 seconds).
