# Hart Dental Task Communicator — Deployment Guide
## From zero to live URL in ~45 minutes

---

## What you'll have when done
A real website at `https://hart-dental-tasks.vercel.app` (or your custom domain)
that every staff member opens on their phone or computer. All tasks sync live
across every device the moment they're created or updated.

---

## Step 1 — Supabase (the database) — 10 min

1. Go to **supabase.com** → Sign Up (free)
2. Click **New Project** → name it `hart-dental` → choose a region close to you → Create
3. Wait ~2 min for it to spin up
4. In the left sidebar go to **SQL Editor** → click **New query**
5. Open the file `supabase-schema.sql` from this folder, copy everything, paste it into the editor → click **Run**
   - You should see "Success. No rows returned"
6. Go to **Project Settings** (gear icon) → **API**
7. Copy these two values — you'll need them shortly:
   - **Project URL** (looks like `https://abcdefghijk.supabase.co`)
   - **anon public** key (long string starting with `eyJ...`)

---

## Step 2 — Anthropic API Key — 5 min

1. Go to **console.anthropic.com** → Sign Up / Log In
2. Click **API Keys** → **Create Key** → name it `hart-dental`
3. Copy the key (starts with `sk-ant-...`) — you only see it once, save it

**Cost:** The AI task clarification uses ~$0.003 per task created. For a dental office creating 10 tasks/day that's about **$1/month**.

---

## Step 3 — GitHub (one-time setup) — 5 min

Vercel deploys from GitHub, so you need to put the project there.

1. Go to **github.com** → Sign Up (free)
2. Click **+** → **New repository** → name it `hart-dental-tasks` → **Create repository**
3. Download **GitHub Desktop** from desktop.github.com (easiest option)
4. In GitHub Desktop: File → Add local repository → browse to the `hart-dental-vercel` folder
5. Click **Publish repository** → uncheck "Keep this code private" if you want free Vercel tier → Publish

---

## Step 4 — Vercel (deploy the site) — 10 min

1. Go to **vercel.com** → Sign Up with your GitHub account
2. Click **Add New Project** → Import your `hart-dental-tasks` repo
3. Leave all settings as default → click **Deploy**
4. It'll build for ~1 minute then show a green checkmark
5. Click **Continue to Dashboard**

**Now add your environment variables:**
6. Go to **Settings** → **Environment Variables**
7. Add these three (click Add for each):

   | Name | Value |
   |------|-------|
   | `ANTHROPIC_API_KEY` | `sk-ant-xxxxx` (your Anthropic key) |
   | `NEXT_PUBLIC_SUPABASE_URL` | `https://xxxxx.supabase.co` (from Step 1) |
   | `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `eyJxxx...` (from Step 1) |

8. Go to **Deployments** → click the three dots on your latest deployment → **Redeploy**
9. Once done, click **Visit** — your app is live!

---

## Step 5 — Customize staff names and phones — 5 min

Open `pages/index.js` in any text editor and find the STAFF section near the top.
Replace the names and add real phone numbers:

```js
const STAFF = [
  { id:"mgr",  name:"Your Manager Name", role:"manager",  ..., phone:"+13051234567" },
  { id:"emp1", name:"Employee 1 Name",   role:"employee", title:"Their Title", ..., phone:"+17861234567" },
  // etc.
];
```

Save the file → GitHub Desktop will show the change → click **Commit** → **Push origin**
Vercel auto-deploys within 60 seconds.

---

## Step 6 — Share with your team

Send everyone the Vercel URL (e.g. `https://hart-dental-tasks.vercel.app`).

On **iPhone:** Open in Safari → Share button → "Add to Home Screen" → it becomes an app icon.
On **Android:** Open in Chrome → three dots menu → "Add to Home Screen".

---

## Custom domain (optional, ~5 min)

If you want `tasks.hartdentalcare.com` instead of the Vercel URL:
- In Vercel → Settings → Domains → Add your domain
- Follow the DNS instructions (usually just adding a CNAME record in your domain registrar)

---

## Monthly costs

| Service | Cost |
|---------|------|
| Vercel (hosting) | Free |
| Supabase (database) | Free up to 500MB |
| Anthropic API (~10 tasks/day) | ~$1/month |
| **Total** | **~$1/month** |

---

## If you get stuck

The most common issues:
1. **Blank white page after deploy** → check that all 3 environment variables are set and you redeployed after adding them
2. **Tasks not syncing across devices** → check Supabase SQL was run correctly (Step 1 point 5)
3. **AI questions not loading** → check your Anthropic API key is correct and has credits
