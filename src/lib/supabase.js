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

// 健康检查：测试客户端是否能正常发请求
async function isClientHealthy() {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 3000);
    
    // 发一个简单的请求测试连通性
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      signal: controller.signal,
      headers: {
        'apikey': supabaseAnonKey,
      },
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 400; // 400 也说明网络通
  } catch {
    return false;
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

// 暴露重建方法供手动调用
export function resetSupabaseClient() {
  return recreateClient();
}

// 页面可见性变化时检查并恢复客户端
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'visible') {
      console.log('[Supabase] Page visible, checking client health...');
      const healthy = await isClientHealthy();
      if (!healthy) {
        console.warn('[Supabase] Client unhealthy, recreating...');
        recreateClient();
      }
      
      // 尝试刷新 session
      try {
        const { data: { session } } = await _supabase.auth.getSession();
        if (session) {
          await _supabase.auth.refreshSession();
        }
      } catch (e) {
        console.warn('[Supabase] Session refresh failed:', e);
      }
    }
  });
}

// 定期健康检查（每 2 分钟）
if (typeof window !== 'undefined') {
  setInterval(async () => {
    const healthy = await isClientHealthy();
    if (!healthy) {
      console.warn('[Supabase] Periodic health check failed, recreating client...');
      recreateClient();
    }
  }, 2 * 60 * 1000);
}
