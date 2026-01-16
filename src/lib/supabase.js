import { createClient } from '@supabase/supabase-js';

const supabaseUrl = window.__ENV__?.VITE_SUPABASE_URL || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = window.__ENV__?.VITE_SUPABASE_ANON_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

const FETCH_TIMEOUT_MS = 25000;
const MIN_HIDDEN_DURATION_FOR_RECOVERY = 0; // 0秒：每次页面恢复都进行健康检查
const CONNECTION_TEST_TIMEOUT_MS = 5000; // 连接测试超时

// ============================================
// Cookie 存储适配器
// ============================================
function createCookieStorage() {
  return {
    getItem: (key) => {
      if (typeof document === 'undefined') return null;
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name === key) {
          try {
            return decodeURIComponent(rest.join('='));
          } catch {
            return null;
          }
        }
      }
      return null;
    },
    setItem: (key, value) => {
      if (typeof document === 'undefined') return;
      const isSecure = window.location.protocol === 'https:';
      const maxAge = 60 * 60 * 24 * 365; // 1 年
      document.cookie = `${key}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax${isSecure ? ';Secure' : ''}`;
    },
    removeItem: (key) => {
      if (typeof document === 'undefined') return;
      document.cookie = `${key}=;path=/;max-age=0`;
    },
  };
}

// ============================================
// Supabase 客户端管理
// ============================================
let supabaseInstance = null;
let clientVersion = 0; // 用于追踪客户端重建
let isRecoveryInProgress = false; // 全局恢复锁，防止重复触发
let currentAbortController = null; // 用于中断待处理的请求

function createSupabaseClient() {
  clientVersion++;
  console.log(`[Supabase] Creating client instance v${clientVersion}`);

  return createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      storageKey: 'ai-image-edit-auth',
      flowType: 'pkce',
      storage: createCookieStorage(),
    },
    global: {
      fetch: createFetchWithAbortable(),
    },
  });
}

// 创建可中断的 fetch
function createFetchWithAbortable() {
  return async (url, options = {}) => {
    // 如果有外部传入的 signal，使用它；否则创建新的
    const externalSignal = options.signal;
    const controller = new AbortController();
    currentAbortController = controller; // 追踪当前请求

    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // 如果外部 signal 被中断，也中断我们的 controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  };
}

// 初始化客户端
supabaseInstance = createSupabaseClient();

// 导出的 supabase 对象 - 使用 Proxy 确保始终指向最新实例
export const supabase = new Proxy({}, {
  get: (_, prop) => {
    return supabaseInstance[prop];
  },
});

// ============================================
// 连接健康检查 - 绕过 SDK 使用原生 fetch
// ============================================
async function testConnectionHealth() {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TEST_TIMEOUT_MS);

  try {
    // 使用原生 fetch 直接测试 REST API 可达性
    const response = await fetch(`${supabaseUrl}/rest/v1/`, {
      method: 'HEAD',
      headers: {
        'apikey': supabaseAnonKey,
      },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);
    return response.ok || response.status === 400; // 400 也表示服务器响应了
  } catch (error) {
    clearTimeout(timeoutId);
    console.warn('[Supabase] Connection health check failed:', error.message);
    return false;
  }
}

// ============================================
// 客户端重建
// ============================================
async function rebuildClient() {
  console.log('[Supabase] Rebuilding Supabase client...');

  try {
    // 保存当前 session 数据（从 Cookie 读取）
    const storage = createCookieStorage();
    const sessionData = storage.getItem('ai-image-edit-auth');

    // 清理旧实例的 Realtime 连接
    try {
      await supabaseInstance.removeAllChannels();
    } catch (e) {
      console.warn('[Supabase] Error removing channels:', e.message);
    }

    // 创建新实例
    supabaseInstance = createSupabaseClient();

    // Session 会自动从 Cookie 恢复（通过 storage 适配器）
    console.log('[Supabase] Client rebuilt successfully, version:', clientVersion);

    return true;
  } catch (error) {
    console.error('[Supabase] Failed to rebuild client:', error);
    return false;
  }
}

// ============================================
// Session 管理
// ============================================
async function withTimeout(promise, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('Timeout')), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export async function refreshSession(timeoutMs = 5000) {
  try {
    const { data: { session } } = await withTimeout(
      supabaseInstance.auth.getSession(),
      timeoutMs
    );

    if (!session) {
      return null;
    }

    const expiresAt = session.expires_at * 1000;
    const refreshThreshold = 60 * 1000;

    if (expiresAt - Date.now() < refreshThreshold) {
      const { data, error } = await withTimeout(
        supabaseInstance.auth.refreshSession(),
        timeoutMs
      );
      if (error) {
        console.warn('[Supabase] Session refresh failed:', error.message);
        return session;
      }
      return data?.session || session;
    }

    return session;
  } catch (e) {
    console.warn('[Supabase] refreshSession error:', e.message);
    return null;
  }
}

// ============================================
// Realtime 重连
// ============================================
export async function reconnectRealtime() {
  try {
    const channels = supabaseInstance.getChannels();

    if (channels.length === 0) {
      return;
    }

    await supabaseInstance.removeAllChannels();

    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase:reconnect', {
        detail: { channelCount: channels.length }
      }));
    }
  } catch (e) {
    console.warn('[Supabase] reconnectRealtime error:', e.message);
  }
}

// ============================================
// 连接恢复回调
// ============================================
const recoveryCallbacks = new Set();

export function onConnectionRecovery(callback) {
  recoveryCallbacks.add(callback);
  return () => {
    recoveryCallbacks.delete(callback);
  };
}

function executeRecoveryCallbacks() {
  recoveryCallbacks.forEach(callback => {
    try {
      callback();
    } catch (e) {
      console.error('[Supabase] Recovery callback error:', e);
    }
  });
}

// ============================================
// 快速 SDK 响应测试
// ============================================
async function testSdkResponsiveness() {
  const controller = new AbortController();
  const timeoutMs = 3000; // 3秒快速测试

  return new Promise((resolve) => {
    const timeoutId = setTimeout(() => {
      controller.abort();
      resolve(false);
    }, timeoutMs);

    // 尝试一个轻量级的 SDK 操作
    supabaseInstance.auth.getSession()
      .then(() => {
        clearTimeout(timeoutId);
        resolve(true);
      })
      .catch(() => {
        clearTimeout(timeoutId);
        resolve(false);
      });
  });
}

// ============================================
// 主恢复流程 - 激进策略
// ============================================
export async function recoverConnection(options = {}) {
  const { force = false, quickCheck = false } = options;

  // 防止重复触发恢复流程
  if (isRecoveryInProgress && !force) {
    console.log('[Supabase] Recovery already in progress, skipping...');
    return { success: false, skipped: true };
  }

  isRecoveryInProgress = true;
  console.log('[Supabase] Starting connection recovery...', { quickCheck, force });

  try {
    // 0. 先中断所有待处理的请求，防止阻塞
    if (currentAbortController) {
      try {
        currentAbortController.abort();
        console.log('[Supabase] Aborted pending requests');
      } catch (e) {
        // 忽略中断错误
      }
      currentAbortController = null;
    }

    // 等待一小段时间让中断生效
    await new Promise(resolve => setTimeout(resolve, 100));

    // 1. 快速测试 SDK 是否响应（快速模式下用更短的超时）
    const sdkResponsive = await testSdkResponsiveness();
    console.log('[Supabase] SDK responsiveness:', sdkResponsive ? 'OK' : 'FROZEN');

    // 2. 如果 SDK 无响应，立即重建客户端
    if (!sdkResponsive) {
      console.log('[Supabase] SDK frozen, forcing rebuild...');
      await rebuildClient();
    }

    // 3. 尝试刷新 Session（快速模式下跳过）
    let session = null;
    if (!quickCheck) {
      try {
        session = await refreshSession(3000);
        console.log('[Supabase] Session status:', session ? 'valid' : 'none');
      } catch (e) {
        // Session 刷新失败不再重复重建，避免循环
        console.warn('[Supabase] Session refresh failed, continuing without session');
      }
    }

    // 4. 重连 Realtime（快速模式下跳过）
    if (!quickCheck) {
      try {
        await reconnectRealtime();
      } catch (e) {
        console.warn('[Supabase] Realtime reconnect failed:', e.message);
      }
    }

    // 5. 触发恢复事件
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('supabase:recovered', {
        detail: {
          session: !!session,
          timestamp: Date.now(),
          clientVersion,
          quickCheck
        }
      }));
    }

    // 6. 执行回调
    executeRecoveryCallbacks();

    console.log('[Supabase] Connection recovery completed, client version:', clientVersion);
    return { success: true, session, quickCheck };
  } catch (e) {
    console.error('[Supabase] Connection recovery failed:', e);

    // 最后手段：强制重建客户端
    try {
      await rebuildClient();
      executeRecoveryCallbacks();
      return { success: true, session: null, rebuilt: true };
    } catch (rebuildError) {
      return { success: false, error: e };
    }
  } finally {
    // 确保恢复锁被释放
    isRecoveryInProgress = false;
  }
}

// ============================================
// 页面可见性监听
// ============================================
if (typeof document !== 'undefined') {
  let lastHiddenTime = 0;

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenTime = Date.now();
      console.log('[Supabase] Page hidden');
    } else if (document.visibilityState === 'visible') {
      const hiddenDuration = Date.now() - lastHiddenTime;
      console.log('[Supabase] Page visible after', hiddenDuration, 'ms');

      // 每次页面恢复都进行健康检查
      // 短时间切换（<3秒）使用快速检查，长时间切换使用完整检查
      const quickCheck = hiddenDuration < 3000;
      await recoverConnection({ quickCheck });
    }
  });
}

// 兼容性别名
export const ensureFreshSession = refreshSession;

