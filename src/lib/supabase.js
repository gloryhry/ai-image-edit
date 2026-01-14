import { createClient } from '@supabase/supabase-js';

const supabaseUrl = window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = window.__ENV__?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storageKey: 'ai-image-edit-auth',
    flowType: 'pkce',
  },
});

// 页面可见性变化时尝试刷新 session，解决后台 tab 长时间不活跃导致 session 过期的问题
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (session && !error) {
          // 主动刷新 session 以确保 token 有效
          await supabase.auth.refreshSession();
        }
      } catch (e) {
        console.warn('Session refresh on visibility change failed:', e);
      }
    }
  });
}

// 定期检查并刷新 session（每 4 分钟），防止长时间使用时 token 过期
if (typeof window !== 'undefined') {
  setInterval(async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // 检查 token 是否即将过期（剩余时间 < 5 分钟）
        const expiresAt = session.expires_at;
        const now = Math.floor(Date.now() / 1000);
        if (expiresAt && expiresAt - now < 300) {
          await supabase.auth.refreshSession();
        }
      }
    } catch (e) {
      console.warn('Periodic session refresh failed:', e);
    }
  }, 4 * 60 * 1000); // 4 分钟
}
