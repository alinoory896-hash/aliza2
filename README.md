# گزارش یار (Reports-Yar)

نسخهٔ آمادهٔ پروژه: React + Vite + Tailwind + Supabase PWA

## راه‌اندازی سریع

1. فایل را از zip استخراج کن.
2. در پوشه پروژه:
   ```bash
   npm install
   ```
3. فایل `.env` بساز و مقدارها را قرار بده:
   ```
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   ```
4. در Supabase → SQL Editor این دستورات را اجرا کن (برای جدول و RLS):
   ```sql
   create extension if not exists "uuid-ossp";

   create table if not exists public.reports (
     id uuid default uuid_generate_v4() primary key,
     user_id uuid references auth.users(id) not null,
     report_at timestamptz not null,
     amount numeric not null,
     description text,
     created_at timestamptz default now()
   );

   alter table public.reports enable row level security;

   create policy "select_own" on public.reports
     for select using (auth.uid() = user_id);

   create policy "insert_own" on public.reports
     for insert with check (auth.uid() = user_id);

   create policy "update_own" on public.reports
     for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

   create policy "delete_own" on public.reports
     for delete using (auth.uid() = user_id);
   ```

5. اجرای پروژه:
   ```bash
   npm run dev
   ```

## نکات
- Site URL در Supabase Authentication Settings را روی `http://localhost:5173` بگذار.
- برای production کلیدها را در پلتفرم deploy قرار بده و RLS را بررسی کن.
