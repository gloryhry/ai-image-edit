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

// 创建初始客户端
let _supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: AUTH_OPTIONS });

// Session 刷新状态
let _isRefreshing = false;
let _refreshPromise = null;

// 网络连通性检查
async function isNetworkHealthy() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': supabaseAnonKey,
      },
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 400;
  } catch {
    return false;
  }
}

// Session 有效性检查并自动刷新
async function ensureValidSession() {
  try {
    const { data: { session }, error } = await _supabase.auth.getSession();
    
    if (error) {
      console.warn('[Supabase] Failed to get session:', error);
      return false;
    }
    
    if (!session) {
      // 没有 session，可能未登录
      return true; // 不视为错误
    }
    
    // 检查 token 是否即将过期（提前5分钟刷新）
    if (session.expires_at) {
      const expiresAt = session.expires_at * 1000;
      const fiveMinutes = 5 * 60 * 1000;
      
      if (Date.now() > expiresAt - fiveMinutes) {
        console.log('[Supabase] Session expiring soon, refreshing...');
        return await refreshSession();
      }
    }
    
    return true;
  } catch (e) {
    console.warn('[Supabase] Session check failed:', e);
    return false;
  }
}

// 刷新 session（带重试机制）
async function refreshSession(maxRetries = 3) {
  // 如果已经在刷新中，等待当前刷新完成
  if (_isRefreshing && _refreshPromise) {
    return _refreshPromise;
  }
  
  _isRefreshing = true;
  _refreshPromise = (async () => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`[Supabase] Refreshing session (attempt ${attempt}/${maxRetries})...`);
        const { data, error } = await _supabase.auth.refreshSession();
        
        if (!error && data.session) {
          console.log('[Supabase] Session refreshed successfully');
          return true;
        }
        
        if (error) {
          console.warn(`[Supabase] Refresh attempt ${attempt} failed:`, error.message);
          
          // 如果是 refresh_token 无效的错误，不再重试
          if (error.message?.includes('refresh_token') || 
              error.message?.includes('Invalid Refresh Token') ||
              error.message?.includes('already used')) {
            console.error('[Supabase] Refresh token invalid, cannot recover automatically');
            return false;
          }
        }
        
        // 在重试前等待一小段时间
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      } catch (e) {
        console.warn(`[Supabase] Refresh attempt ${attempt} error:`, e);
        if (attempt < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }
    
    console.error('[Supabase] All refresh attempts failed');
    return false;
  })();
  
  try {
    return await _refreshPromise;
  } finally {
    _isRefreshing = false;
    _refreshPromise = null;
  }
}

// 重建客户端
function recreateClient() {
  console.warn('[Supabase] Recreating client...');
  _supabase = createClient(supabaseUrl, supabaseAnonKey, { auth: AUTH_OPTIONS });
  return _supabase;
}

// 导出代理对象，自动处理客户端健康状态
export const supabase = new Proxy({}, {
  get(_, prop) {
    return _supabase[prop];
  },
});

// 暴露方法供组件调用
export function resetSupabaseClient() {
  return recreateClient();
}

// 导出 session 刷新方法供组件使用
export { refreshSession, ensureValidSession };

// 页面可见性变化时检查并恢复
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Supabase] Page visible, checking session...');
      
      // 先检查网络
      const networkOk = await isNetworkHealthy();
      if (!networkOk) {
        console.warn('[Supabase] Network unhealthy, recreating client...');
        recreateClient();
      }
      
      // 检查并刷新 session
      await ensureValidSession();
    }
  });
}

// 定期 session 检查（每分钟）
if (typeof window !== 'undefined') {
  setInterval(async () => {
    await ensureValidSession();
  }, 60 * 1000);
  
  // 网络健康检查（每 2 分钟）
  setInterval(async () => {
    const healthy = await isNetworkHealthy();
    if (!healthy) {
      console.warn('[Supabase] Periodic health check failed, recreating client...');
      recreateClient();
    }
  }, 2 * 60 * 1000);
}
