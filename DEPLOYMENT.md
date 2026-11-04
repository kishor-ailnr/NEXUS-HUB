# NEXUS WAYS – Production Deployment Guide (Render & Supabase)

This guide walks you through deploying the **NEXUS WAYS** platform:
- **Database & Auth**: Supabase PostgreSQL with Row Level Security (RLS)
- **Backend API**: Render Web Service (NestJS, WebSockets, Sentry)
- **Frontend SPA**: Firebase Hosting or Render Static Site (React, Vite, TailwindCSS)

---

## Part 1: Supabase Setup (Database & Authentication)

### Step 1.1: Create or Open Your Supabase Project
1. Log in to [Supabase](https://supabase.com/dashboard) and create a new project (e.g., `nexus-ways-prod`).
2. Note your database password and choose your nearest region.

### Step 1.2: Apply Full Database Schema (All 14 Migrations)
A pre-compiled single schema file containing all 14 migrations (tables, RLS policies, indexing, and triggers) has been generated at:
📂 [`supabase/full_schema.sql`](file:///c:/Music/Smart%20Supply%20Chain/supabase/full_schema.sql)

1. In your Supabase Dashboard, open the **SQL Editor** (from the left menu).
2. Click **New query**.
3. Copy the entire contents of [`supabase/full_schema.sql`](file:///c:/Music/Smart%20Supply%20Chain/supabase/full_schema.sql) and paste it into the editor.
4. Click **Run** (or `Ctrl + Enter`).
5. Verify that all tables (`organizations`, `users`, `vehicles`, `trips`, `trains`, `flights`, `vessels`, etc.) appear under **Table Editor**.

### Step 1.3: Retrieve Supabase API Credentials
Navigate to **Project Settings** ➔ **API**:
- **Project URL**: e.g., `https://<project-ref>.supabase.co`
- **Anon Public Key**: `eyJhbGciOiJIUzI1NiIsIn...`
- **service_role Secret**: Click "Reveal" and copy the secret key.
- **JWT Secret**: Under **Project Settings** ➔ **API** ➔ **JWT Settings**, copy your JWT Secret.

### Step 1.4: Seed Initial Demo Data (Optional)
To populate demo organizations (`Roadways`, `Railways`, `Airways`, `Seaways`) and default fleet accounts:
```bash
# In your project root terminal:
npm run seed
```
*Default manager accounts created: `demo.roadways@nexusways.com`, `demo.railways@nexusways.com`, `demo.airways@nexusways.com`, `demo.seaways@nexusways.com` with password `NexusPassword123!`.*

---

## Part 2: Backend API Deployment on Render

### Option A: Automatic Blueprint Deployment (Recommended)
This repository includes a production-ready [`render.yaml`](file:///c:/Music/Smart%20Supply%20Chain/render.yaml) blueprint.

1. Go to your [Render Dashboard](https://dashboard.render.com).
2. Click **New +** ➔ **Blueprint**.
3. Connect your GitHub repository: `kishor-ailnr/NEXUS-HUB-`.
4. Render will detect [`render.yaml`](file:///c:/Music/Smart%20Supply%20Chain/render.yaml) and automatically configure the `nexus-ways-api` service.
5. In the prompted fields, paste your secret keys (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_JWT_SECRET`, and optional `GEMINI_API_KEY`).
6. Click **Apply**.

---

### Option B: Manual Web Service Setup on Render
If you prefer creating the Web Service manually:

1. In Render Dashboard, click **New +** ➔ **Web Service**.
2. Connect your GitHub repository: `kishor-ailnr/NEXUS-HUB-`.
3. Configure the following fields:
   - **Name**: `nexus-ways-api` (or custom name)
   - **Language**: `Node`
   - **Branch**: `main`
   - **Root Directory**: *(Leave empty / root)*
   - **Build Command**:
     ```bash
     npm ci && npm run build:api
     ```
   - **Start Command**:
     ```bash
     npm run start:prod --workspace=@nexus-ways/api
     ```
   - **Instance Type**: `Free` (or higher)
   - **Health Check Path**: `/health`

4. Click **Advanced** ➔ **Add Environment Variable** and add:

| Environment Variable | Value | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Enforces production security & cookies |
| `PORT` | `10000` | Port listened to by Render |
| `FRONTEND_ORIGIN` | `https://smart-supply-chain-v3.web.app,https://smart-supply-chain-v3.firebaseapp.com` | Allowed CORS origins (comma-separated) |
| `SUPABASE_URL` | `https://<your-project-ref>.supabase.co` | From Supabase Project Settings |
| `SUPABASE_SERVICE_ROLE_KEY` | `eyJhbGciOi...` | Supabase Service Role Secret |
| `SUPABASE_JWT_SECRET` | `<your-jwt-secret>` | Supabase JWT Secret |
| `GEMINI_API_KEY` | *(Optional)* | Google AI Gemini API Key for NL2SQL |

5. Click **Create Web Service**.
6. Once deployed, Render will provide your public API URL:
   `https://<your-service-name>.onrender.com`

---

## Part 3: Connecting the Frontend to Your Deployed Backend

Once your backend is live on Render:

1. Update the backend URL in [`apps/web/.env.production`](file:///c:/Music/Smart%20Supply%20Chain/apps/web/.env.production):
   ```ini
   VITE_SUPABASE_URL=https://<your-project-ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<your-anon-public-key>
   VITE_API_URL=https://<your-service-name>.onrender.com
   VITE_SOCKET_URL=https://<your-service-name>.onrender.com
   ```

2. Rebuild and deploy the frontend:
   ```bash
   # Rebuild production bundle
   npm run build:web

   # Deploy to Firebase Hosting:
   npx firebase deploy --only hosting
   ```

3. If hosting the frontend on Render instead of Firebase:
   Render will automatically deploy the frontend via the `nexus-ways-web` service defined in [`render.yaml`](file:///c:/Music/Smart%20Supply%20Chain/render.yaml).

---

## Part 4: Verification Checklist

- [ ] `GET https://<your-service-name>.onrender.com/health` returns `{"status":"ok"}`.
- [ ] `GET https://<your-service-name>.onrender.com/platform/hub-stats` returns active movement telemetry.
- [ ] Opening the frontend loads the 4 multimodal cards (`Roadways`, `Railways`, `Airways`, `Seaways`).
- [ ] Logging in with `demo.roadways@nexusways.com` / `NexusPassword123!` opens the operational dashboard.

