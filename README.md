# مواعيد — Mawid

نظام حجز مواعيد ذكي للمشاريع الصغيرة والمتوسطة، مع CRM مدمج وتذكيرات واتساب تلقائية.

A smart appointment booking system for small/medium businesses — with built-in CRM, waitlist, WhatsApp reminders, and real-time notifications.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 19 + Vite |
| Styling | Tailwind CSS v3 + Tajawal font |
| State / Data | TanStack React Query v5 |
| Auth & DB | Supabase (PostgreSQL + RLS) |
| Realtime | Supabase Realtime |
| Forms | React Hook Form + Zod |
| Scheduling | Supabase pg_cron (Edge Functions) |
| WhatsApp | Meta WhatsApp Cloud API |
| Icons | react-icons (HeroIcons v2 + FontAwesome) |
| Notifications | react-hot-toast |
| Deploy | Vercel |

---

## Local Setup

```bash
# 1. Clone the repo
git clone <repo-url>
cd mawid

# 2. Install dependencies
npm install

# 3. Copy and fill environment variables
cp .env.example .env
# Edit .env with your Supabase credentials

# 4. Start dev server
npm run dev
```

---

## Supabase Setup

1. Create a new project at [supabase.com](https://supabase.com)
2. Go to **Settings → API** and copy your `Project URL` and `anon/public` key into `.env`
3. Go to **SQL Editor** and run migrations in order:

```sql
-- Run each file in order:
supabase/migrations/001_initial_schema.sql
supabase/migrations/002_pg_cron.sql
supabase/migrations/003_fix_rls.sql
supabase/migrations/004_clients.sql
```

4. Enable **Realtime** on the `appointments` table:
   - Go to **Database → Replication → Supabase Realtime**
   - Toggle on the `appointments` table

---

## Meta WhatsApp Business API Setup

1. Go to [developers.facebook.com](https://developers.facebook.com) → **My Apps → Create App**
2. Choose **Business** type and add **WhatsApp** product
3. Go to **WhatsApp → API Setup**:
   - Copy **Temporary Access Token** (or generate a permanent one)
   - Copy **Phone Number ID**
4. After creating your business in the app, go to **Settings** and paste these values

---

## Deploy to Vercel

1. Push your code to GitHub
2. Go to [vercel.com](https://vercel.com) → **New Project** → Import your repo
3. Add Environment Variables:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. Click **Deploy**

The `vercel.json` file already handles SPA routing rewrites and security headers.

---

## Features

- **Multi-vertical onboarding** — clinic, salon, gym, education, facilities, other
- **Smart booking page** — public URL per business, date/time picker, slot management
- **Waitlist** — clients join a waitlist when slots are full; notify first in line on cancellation
- **CRM module** — auto-populated from bookings, client status (regular/cooling/lost)
- **Client profiles** — appointment history timeline, notes with auto-save, re-targeting
- **WhatsApp bulk retargeting** — send personalized campaigns to cooling/lost clients
- **Monthly loss card** — shows revenue lost from no-shows vs. saved by reminders
- **Realtime notifications** — toast alerts for new bookings via Supabase Realtime
- **Responsive** — mobile (bottom nav), tablet (icon sidebar), desktop (full sidebar)
- **RTL Arabic** — Tajawal font, full Arabic UI

---

## Project Structure

```
src/
├── components/
│   ├── appointments/     # AppointmentModal, StatusBadge
│   ├── layout/           # Sidebar (responsive), TopBar, PageWrapper
│   ├── reports/          # MonthlyLossCard
│   └── ui/               # Button, Card, Input, Modal, Badge, Skeleton
├── hooks/
│   ├── useAppointments.js
│   ├── useBusiness.js
│   ├── useClients.js
│   └── useWhatsApp.js
├── lib/
│   ├── supabase.js
│   ├── validators.js
│   └── whatsapp.js
├── pages/
│   ├── auth/             # Login, Register
│   ├── booking/          # Public BookingPage
│   ├── crm/              # ClientsPage, ClientProfileDrawer, RetargetModal
│   ├── dashboard/        # Dashboard, AppointmentList
│   ├── onboarding/       # OnboardingFlow (5 steps)
│   ├── reports/          # Reports
│   └── settings/         # Settings
└── utils/
    ├── constants.js
    └── dateHelpers.js
supabase/
├── functions/send-reminders/
└── migrations/001–004
```
