import { createClient } from '@supabase/supabase-js';

const supabaseUrl = window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = window.__ENV__?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// 自定义 fetch 包装器：使用 AbortController 强制超时
// 解决浏览器后台标签页冻结 fetch 请求的问题
const FETCH_TIMEOUT_MS = 25000; // 25 秒超时（比 withSessionRefresh 的 30 秒短）

function createFetchWithTimeout(timeoutMs = FETCH_TIMEOUT_MS) {
  return async (url, options = {}) => {
    console.log('[Supabase Fetch] Starting request to:', url.substring(0, 80) + '...');

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      console.warn('[Supabase Fetch] Request timeout after', timeoutMs, 'ms, aborting...', url.substring(0, 50));
      controller.abort();
    }, timeoutMs);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      console.log('[Supabase Fetch] Request completed:', response.status);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('[Supabase Fetch] Request failed:', error.name, error.message);
      if (error.name === 'AbortError') {
        console.warn('[Supabase Fetch] Request aborted due to timeout');
      }
      throw error;
    }
  };
}

const AUTH_OPTIONS = {
  persistSession: true,
  autoRefreshToken: false, //  禁用自动刷新，由应用层控制
  detectSessionInUrl: true,
  storageKey: 'ai-image-edit-auth',
  flowType: 'pkce',
  // 禁用 Web Locks，避免页面后台时 Lock 超时导致 AbortError
  // 参考: https://github.com/supabase/gotrue-js/issues/540
  lock: false,
  // 如果使用 lock: false 不生效，尝试增加超时时间
  debug: false,
};

// Supabase 客户端配置
const CLIENT_OPTIONS = {
  auth: AUTH_OPTIONS,
  global: {
    fetch: createFetchWithTimeout(FETCH_TIMEOUT_MS),
  },
};

// 认证状态监听器引用
let _authListener = null;

// 设置认证监听器
function setupAuthListener(client) {
  if (_authListener) {
    _authListener.unsubscribe();
    _authListener = null;
  }

  const { data: { subscription } } = client.auth.onAuthStateChange((event, session) => {
    console.log('[Supabase] Auth state changed:', event);

    if (event === 'TOKEN_REFRESHED') {
      console.log('[Supabase] Token was refreshed automatically');
      markRequestSuccess();
    }

    if (event === 'SIGNED_OUT') {
      console.log('[Supabase] User signed out');
    }
  });

  _authListener = subscription;
  console.log('[Supabase] Auth listener attached');
}

// 创建 Supabase 客户端（使用自定义 fetch）
let _supabase = createClient(supabaseUrl, supabaseAnonKey, CLIENT_OPTIONS);
setupAuthListener(_supabase);

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
    _supabase = createClient(supabaseUrl, supabaseAnonKey, CLIENT_OPTIONS);
    setupAuthListener(_supabase);
    _clientHealthy = true;
    console.log('[Supabase] Client recreated successfully');

    // 派发事件通知客户端已重建，需要重新绑定监听器
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new Event('supabase:client-recreated'));
    }
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

// 添加页面可见性变化处理，优化页面从后台恢复时的连接恢复
if (typeof document !== 'undefined') {
  let lastHiddenTime = 0;

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      // 记录页面隐藏时间
      lastHiddenTime = Date.now();
      console.log('[Supabase] Page hidden');
    } else if (document.visibilityState === 'visible') {
      // 页面恢复可见
      const hiddenDuration = Date.now() - lastHiddenTime;
      console.log('[Supabase] Page became visible after', hiddenDuration, 'ms');

      // 如果页面隐藏时间超过 10 秒，需要静默重建客户端
      // 因为 Supabase 客户端内部状态可能被浏览器冻结
      if (hiddenDuration > 10000) {
        console.log('[Supabase] Long idle detected, silently recreating client...');

        try {
          // 先清理旧的监听器
          if (_authListener) {
            try {
              _authListener.unsubscribe();
            } catch (e) {
              // 忽略取消订阅时的错误
            }
            _authListener = null;
          }

          // 创建新客户端
          _supabase = createClient(supabaseUrl, supabaseAnonKey, CLIENT_OPTIONS);
          _clientHealthy = true;
          _lastSuccessfulRequest = Date.now();

          // 延迟设置 auth listener 和派发事件
          setTimeout(() => {
            setupAuthListener(_supabase);

            // 派发事件通知 AuthContext 重新订阅（延迟派发，避免立即触发）
            if (typeof window !== 'undefined') {
              window.dispatchEvent(new Event('supabase:client-recreated'));
            }
          }, 200);

          console.log('[Supabase] Client silently recreated');
        } catch (e) {
          console.error('[Supabase] Failed to recreate client on visibility change:', e);
        }
      }
    }
  });
}

// 监听逻辑已移至 setupAuthListener
if (typeof window !== 'undefined') {
  // 初始监听已在创建客户端时设置
}

