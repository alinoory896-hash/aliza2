import React, { useEffect, useState } from 'react';
import { createClient } from '@supabase/supabase-js';
import dayjs from 'dayjs';
import relativeTime from 'dayjs/plugin/relativeTime';
import clsx from 'clsx';
import './index.css';

dayjs.extend(relativeTime);
import jalaliday from 'jalaliday';

dayjs.extend(relativeTime);
dayjs.extend(jalaliday);
dayjs.calendar('persian');


const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

// اگر کلیدها تنظیم نشده بودند، هشدار نشون بدیم (به‌جای crash)
if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('Supabase env vars missing: VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY');
}

const supabase = createClient(SUPABASE_URL ?? '', SUPABASE_ANON_KEY ?? '');

export default function App() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [reports, setReports] = useState([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({ report_at: '', amount: '', description: '' });
  const [editing, setEditing] = useState(null);
  const [alert, setAlert] = useState(null);

  // ----- init: خواندن session اولیه و subscribe به تغییرات auth -----
  useEffect(() => {
    let mounted = true;

    async function init() {
      try {
        const { data: { session: initialSession } } = await supabase.auth.getSession();
        if (!mounted) return;
        setSession(initialSession);
        setUser(initialSession?.user ?? null);
        if (initialSession?.user) {
          // فقط اگر session وجود داشت، گزارش‌ها رو بخوان
          fetchReports(initialSession?.user);
        } else {
          setReports([]);
        }
      } catch (err) {
        console.error('getSession error', err);
      }
    }
    init();

    // ثبت listener با destructuring صحیح و unsubscribe درست
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, newSession) => {
      // newSession ممکنه null بشه هنگام signOut
      setSession(newSession ?? null);
      setUser(newSession?.user ?? null);

      if (newSession?.user) {
        // کاربر لاگین شده -> بگیر گزارش‌ها (اگر لازم بود)
        fetchReports(newSession.user);
      } else {
        // کاربر خارج شد -> گزارش‌ها را پاک کن
        setReports([]);
      }
    });

    return () => {
      mounted = false;
      // unsubscribe اگر subscription موجود است
      try { subscription.unsubscribe(); } catch (e) { /* ignore */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // اگر user تغییر کرد (برای اطمینان) => هماهنگ‌سازی گزارش‌ها
  useEffect(() => {
    if (user) fetchReports(user);
    else setReports([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // ----- helper: تشخیص اکانت ادمین -----
  function isAdminUser(u) {
  if (!u) return false;
  return (
    u?.app_metadata?.role === 'admin' ||
    u?.user_metadata?.is_admin === true ||
    u?.email === 'admin@example.com' // ✅ اضافه شود
  );
}


  // ----- خواندن گزارش‌ها، اکنون از user پارامتر می‌پذیرد تا بسته به caller از closure استفاده نشود -----
  async function fetchReports(forUser = user) {
    if (!forUser) {
      setReports([]);
      return;
    }
    setLoading(true);
    try {
      const admin = isAdminUser(forUser);
      let query = supabase
        .from('reports')
        .select('*')
        .order('created_at', { ascending: false });

      if (!admin) {
        // فقط گزارش‌های خودِ کاربر
        query = query.eq('user_id', forUser.id);
      }

      const { data, error } = await query;
      setLoading(false);
      if (error) {
        setAlert({ type: 'error', message: error.message });
        return;
      }
      setReports(data ?? []);
    } catch (err) {
      setLoading(false);
      console.error('fetchReports error', err);
      setAlert({ type: 'error', message: 'خطا در بارگذاری گزارش‌ها' });
    }
  }

  // ----- auth actions -----
  async function signUp(email, password) {
    setLoading(true);
    const { error } = await supabase.auth.signUp({ email, password });
    setLoading(false);
    if (error) return setAlert({ type: 'error', message: error.message });
    setAlert({ type: 'success', message: 'حساب ساخته شد. ایمیل تأیید (در صورت فعال بودن) ارسال می‌شود.' });
  }

  async function signIn(email, password) {
    setLoading(true);
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) return setAlert({ type: 'error', message: error.message });
    // data.session و data.user معمولاً موجود هستند
    setSession(data?.session ?? null);
    setUser(data?.user ?? null);
    setAlert({ type: 'success', message: 'وارد شدید.' });
    // fetchReports صدا زده می‌شه از listener یا از useEffect بالا، ولی برای پاسخ سریع می‌خوانیم:
    if (data?.user) fetchReports(data.user);
  }

  async function signOut() {
    setLoading(true);
    const { error } = await supabase.auth.signOut();
    setLoading(false);
    if (error) {
      setAlert({ type: 'error', message: error.message });
      return;
    }
    // پاکسازی صریح state بعد از خروج
    setSession(null);
    setUser(null);
    setReports([]);
    setEditing(null);
    setForm({ report_at: '', amount: '', description: '' });
    setAlert({ type: 'success', message: 'خروج انجام شد.' });
  }

  // ----- فرم و CRUD گزارش‌ها -----
  function handleChange(e) {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  }

  async function createOrUpdate(e) {
    e.preventDefault();
    if (!user) return setAlert({ type: 'error', message: 'ابتدا وارد شوید.' });

    // مقدار عددی برای amount
    const parsedAmount = Number(form.amount);
    const amountValue = Number.isFinite(parsedAmount) ? parsedAmount : 0;

    const payload = {
      user_id: user.id,
      report_at: form.report_at ? new Date(form.report_at).toISOString() : new Date().toISOString(),
      amount: amountValue,
      description: form.description || ''
    };

    setLoading(true);
    try {
      if (editing) {
        const { error } = await supabase
          .from('reports')
          .update({
            report_at: payload.report_at,
            amount: payload.amount,
            description: payload.description
          })
          .eq('id', editing.id);

        setLoading(false);
        if (error) return setAlert({ type: 'error', message: error.message });

        setAlert({ type: 'success', message: 'بروزرسانی شد.' });
        setEditing(null);
        // به‌روزرسانی لیست از سرگیری
        fetchReports();
      } else {
        const { data, error } = await supabase
          .from('reports')
          .insert(payload)
          .select()
          .single();

        setLoading(false);
        if (error) return setAlert({ type: 'error', message: error.message });

        setAlert({ type: 'success', message: 'ثبت شد.' });
        // prepend به لیست برای UX بهتر
        setReports(prev => [data, ...prev]);
      }
      setForm({ report_at: '', amount: '', description: '' });
    } catch (err) {
      setLoading(false);
      console.error('createOrUpdate error', err);
      setAlert({ type: 'error', message: 'خطا در ثبت/بروزرسانی' });
    }
  }

  function startEdit(item) {
    setEditing(item);
    // فرمت مناسب برای input datetime-local
    setForm({
      report_at: item.report_at ? dayjs(item.report_at).format('YYYY-MM-DDTHH:mm') : '',
      amount: item.amount ?? '',
      description: item.description ?? ''
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  async function remove(id) {
    if (!confirm('آیا مطمئن هستید؟')) return;
    setLoading(true);
    const { error } = await supabase.from('reports').delete().eq('id', id);
    setLoading(false);
    if (error) return setAlert({ type: 'error', message: error.message });
    setReports(prev => prev.filter(r => r.id !== id));
    setAlert({ type: 'success', message: 'حذف شد.' });
  }

  // ----- UI -----
  return (
    <div className="min-h-screen bg-gradient-to-br from-yellow-400 via-blue-500 to-blue-800 text-slate-900 p-6">
      <div className="max-w-4xl mx-auto">
        <header className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-extrabold tracking-tight">سامانه گزارش‌ها</h1>
          <div>
            {user ? (
              <div className="flex items-center gap-3">
                <div className="text-sm">{user.email}</div>
                <button onClick={signOut} className="px-3 py-1 bg-red-600 text-white rounded hover:opacity-90">خروج</button>
              </div>
            ) : (
              <AuthPanel onSignUp={signUp} onSignIn={signIn} loading={loading} />
            )}
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <section className="md:col-span-1 bg-white/80 p-4 rounded-2xl shadow-lg backdrop-blur-sm">
            <h2 className="text-lg font-semibold mb-3">ثبت گزارش</h2>
            <form onSubmit={createOrUpdate} className="space-y-3">
              <div>
                <label className="block text-sm">تاریخ و ساعت</label>
                <input
                  required
                  name="report_at"
                  value={form.report_at}
                  onChange={handleChange}
                  type="datetime-local"
                  className="mt-1 w-full rounded p-2 bg-gray-100 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm">مبلغ</label>
                <input
                  required
                  name="amount"
                  value={form.amount}
                  onChange={handleChange}
                  type="number"
                  step="0.01"
                  className="mt-1 w-full rounded p-2 bg-gray-100 text-slate-900"
                />
              </div>
              <div>
                <label className="block text-sm">شرح کالا</label>
                <textarea
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  className="mt-1 w-full rounded p-2 bg-gray-100 text-slate-900"
                />
              </div>
              <div className="flex gap-2">
                <button className="flex-1 py-2 rounded bg-blue-700 text-white hover:scale-[1.01] transition">{editing ? 'بروزرسانی' : 'ثبت'}</button>
                {editing && (
                  <button type="button" onClick={() => { setEditing(null); setForm({ report_at: '', amount: '', description: '' }); }} className="py-2 px-3 rounded bg-gray-300">لغو</button>
                )}
              </div>
            </form>
            {alert && (
              <div className={clsx('mt-3 p-2 rounded', alert.type === 'error' ? 'bg-red-700 text-white' : 'bg-emerald-700 text-white')}>{alert.message}</div>
            )}
          </section>

          <section className="md:col-span-2 bg-white/10 p-4 rounded-2xl shadow-lg">
            <h2 className="text-lg font-semibold mb-3 text-white">گزارش‌ها</h2>
            {loading ? (
              <div>در حال بارگذاری...</div>
            ) : reports.length === 0 ? (
              <div className="text-sm text-white/70">هیچ گزارشی وجود ندارد.</div>
            ) : (
              <ul className="space-y-3">
                {reports.map(r => (
                  <li key={r.id} className="bg-white/20 p-3 rounded flex items-start justify-between">
                    <div>
                      <div className="text-sm font-medium text-white">{r.description || 'بدون شرح'}</div>
                      <div className="text-xs text-white/80">{dayjs(r.report_at).calendar('persian').locale('fa').format('YYYY/MM/DD - HH:mm')}
 • {Number(r.amount).toLocaleString()} تومان</div>
                      <div className="text-xs text-white/70 mt-1">ثبت‌شده: {dayjs(r.created_at).calendar('persian').locale('fa').fromNow()}
</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {user && (user.id === r.user_id || isAdminUser(user)) ? (
                        <>
                          <button onClick={() => startEdit(r)} className="px-3 py-1 bg-white/10 text-white rounded">ویرایش</button>
                          <button onClick={() => remove(r.id)} className="px-3 py-1 bg-red-600 text-white rounded">حذف</button>
                        </>
                      ) : (
                        <div className="text-xs text-white/60">غیر قابل تغییر</div>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

/* AuthPanel */
function AuthPanel({ onSignUp, onSignIn, loading }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [mode, setMode] = useState('signin');

  return (
    <div className="bg-white/10 p-3 rounded-lg">
      <div className="mb-2 text-sm text-white">{mode === 'signin' ? 'ورود' : 'ثبت‌نام'}</div>
      <input className="w-full rounded p-2 mb-2 bg-gray-100 text-slate-900" placeholder="ایمیل" value={email} onChange={e => setEmail(e.target.value)} />
      <input className="w-full rounded p-2 mb-2 bg-gray-100 text-slate-900" placeholder="رمزعبور" type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={() => mode === 'signin' ? onSignIn(email, password) : onSignUp(email, password)} className="px-3 py-1 bg-emerald-500 rounded text-white">{mode === 'signin' ? 'ورود' : 'ثبت'}</button>
        <button onClick={() => setMode(m => m === 'signin' ? 'signup' : 'signin')} className="px-3 py-1 bg-gray-300 rounded">{mode === 'signin' ? 'ثبت نام' : 'بازگشت'}</button>
      </div>
      {loading && <div className="text-xs mt-2 text-white">در حال پردازش...</div>}
    </div>
  );
}
