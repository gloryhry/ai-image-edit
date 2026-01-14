import { createClient } from '@supabase/supabase-js';

const supabaseUrl = window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = window.__ENV__?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

const AUTH_OPTIONS = {
  persistSession: true,
  autoRefreshToken: true,
  detectSessionInUrl: true,
  storageKey: 'ai-image-edit-auth',
  flowType: 'pkce',
};

// 创建 Supabase 客户端
let _supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: AUTH_OPTIONS });

// 客户端健康状态标记
let _clientHealthy = true;
let _lastSuccessfulRequest = Date.now();

// 标记客户端为不健康
export function markClientUnhealthy() {
  console.warn('[Supabase] Client marked as unhealthy');
  _clientHealthy = false;
}

// 标记请求成功
export function markRequestSuccess() {
  _lastSuccessfulRequest = Date.now();
  _clientHealthy = true;
}

// 检查客户端是否可能不健康（超过 5 分钟没有成功请求）
export function isClientPossiblyUnhealthy() {
  const fiveMinutes = 5 * 60 * 1000;
  return !_clientHealthy || (Date.now() - _lastSuccessfulRequest > fiveMinutes);
}

// 重建客户端（非阻塞）
export function recreateClient() {
  console.warn('[Supabase] Recreating client...');
  try {
    _supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: AUTH_OPTIONS });
    _clientHealthy = true;
    console.log('[Supabase] Client recreated successfully');
  } catch (e) {
    console.error('[Supabase] Failed to recreate client:', e);
  }
  return _supabase;
}

// 尝试刷新 Session（非阻塞，带超时）
export async function tryRefreshSession(timeoutMs = 5000) {
  console.log('[Supabase] Attempting to refresh session...');

  try {
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Refresh timeout')), timeoutMs)
    );

    const refreshPromise = _supabase.auth.refreshSession();

    const { data, error } = await Promise.race([refreshPromise, timeoutPromise]);

    if (error) {
      console.warn('[Supabase] Session refresh failed:', error.message);
      return false;
    }

    if (data?.session) {
      console.log('[Supabase] Session refreshed successfully');
      markRequestSuccess();
      return true;
    }

    return false;
  } catch (e) {
    console.warn('[Supabase] Session refresh error:', e.message);
    return false;
  }
}

// 导出 Supabase 客户端（使用 Proxy 确保始终获取最新实例）
export const supabase = new Proxy({}, {
  get(_, prop) {
    return _supabase[prop];
  },
});

// 导出别名
export function resetSupabaseClient() {
  return recreateClient();
}

// 仅在页面变为可见时尝试刷新（非阻塞）
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('[Supabase] Page became visible');

      // 如果客户端可能不健康，尝试刷新（但不阻塞）
      if (isClientPossiblyUnhealthy()) {
        // 使用 setTimeout 确保不阻塞 UI
        setTimeout(() => {
          tryRefreshSession().catch(() => {
            // 刷新失败，重建客户端
            recreateClient();
          });
        }, 100);
      }
    }
  });
}

// 监听 auth 状态变化（被动监听，不主动轮询）
if (typeof window !== 'undefined') {
  _supabase.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth state changed:', event);

    if (event === 'TOKEN_REFRESHED') {
      console.log('[Supabase] Token was refreshed automatically');
      markRequestSuccess();
    }

    if (event === 'SIGNED_OUT') {
      console.log('[Supabase] User signed out');
    }
  });
}

