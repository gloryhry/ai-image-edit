import { createClient } from '@supabase/supabase-js';

const supabaseUrl = (typeof window !== 'undefined' && window.__ENV__?.VITE_SUPABASE_URL) || import.meta.env.VITE_SUPABASE_URL || '';
const supabaseAnonKey = (typeof window !== 'undefined' && window.__ENV__?.VITE_SUPABASE_ANON_KEY) || import.meta.env.VITE_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Supabase URL or Anon Key not configured. Please set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in your .env file.');
}

// 注意：认证相关的请求使用更长的超时，因为可能涉及复杂的验证流程
// 数据库查询超时由 supabase-request.js 中的 withTimeout 控制
const FETCH_TIMEOUT_MS = 60000; // 60秒，给 auth API 足够的响应时间
const CONNECTION_TEST_TIMEOUT_MS = 30000; // 连接测试超时：30秒（页面冻结期间需要更长时间）
const SESSION_REFRESH_TIMEOUT_MS = 8000;
const SESSION_EXPIRY_BUFFER_SECONDS = 60;

// ============================================
// Cookie 存储适配器
// ============================================
function createCookieStorage() {
  return {
    getItem: (key) => {
      if (typeof document === 'undefined') {
        console.log('[CookieStorage] getItem: document undefined, returning null');
        return null;
      }
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, ...rest] = cookie.trim().split('=');
        if (name === key) {
          try {
            const value = decodeURIComponent(rest.join('='));
            console.log('[CookieStorage] getItem success:', key, 'value length:', value.length);
            return value;
          } catch {
            console.log('[CookieStorage] getItem decode error:', key);
            return null;
          }
        }
      }
      console.log('[CookieStorage] getItem not found:', key);
      return null;
    },
    setItem: (key, value) => {
      if (typeof document === 'undefined') {
        console.log('[CookieStorage] setItem: document undefined, skipping');
        return;
      }
      const isSecure = window.location.protocol === 'https:';
      const maxAge = 60 * 60 * 24 * 365; // 1 年
      const cookieString = `${key}=${encodeURIComponent(value)};path=/;max-age=${maxAge};SameSite=Lax${isSecure ? ';Secure' : ''}`;
      document.cookie = cookieString;
      console.log('[CookieStorage] setItem:', key, 'value length:', value.length, 'isSecure:', isSecure);
    },
    removeItem: (key) => {
      if (typeof document === 'undefined') {
        console.log('[CookieStorage] removeItem: document undefined, skipping');
        return;
      }
      document.cookie = `${key}=;path=/;max-age=0`;
      console.log('[CookieStorage] removeItem:', key);
    },
  };
}

// ============================================
// Supabase 客户端管理
// ============================================
let supabaseInstance = null;
let clientVersion = 0; // 用于追踪客户端重建
let isRecoveryInProgress = false; // 全局恢复锁，防止重复触发
const activeAbortControllers = new Set(); // 追踪所有活跃的 AbortController
let lastRecoveryTime = 0; // 上次恢复时间
const MIN_RECOVERY_INTERVAL = 3000; // 最小恢复间隔 3 秒
let recoveryCooldown = false; // 恢复冷却期
let lastHiddenTime = 0; // 页面最后隐藏时间，供 recoverConnection 使用
let cachedSession = null;
let cachedUser = null;
let sessionUpdatedAt = 0;
let sessionRefreshPromise = null;

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
  // Supabase URL 用于判断是否是 Supabase 发出的请求
  const isSupabaseRequest = (url) => url.includes(supabaseUrl);

  return async (url, options = {}) => {
    // 如果有外部传入的 signal，使用它；否则创建新的
    const externalSignal = options.signal;
    const controller = new AbortController();
    activeAbortControllers.add(controller); // 追踪所有活跃请求

    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    // 如果外部 signal 被中断，也中断我们的 controller
    if (externalSignal) {
      externalSignal.addEventListener('abort', () => controller.abort());
    }

    try {
      const response = await fetch(url, {
        ...options,
        // Supabase 请求：使用 same-origin（同源，自动携带 cookies）
        // 外部请求（如 API 服务器）：使用 include 以支持跨域 cookies
        credentials: isSupabaseRequest(url)
          ? (options.credentials || 'same-origin')
          : (options.credentials || 'include'),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      activeAbortControllers.delete(controller);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      activeAbortControllers.delete(controller);
      throw error;
    }
  };
}

// 初始化客户端
supabaseInstance = createSupabaseClient();

function updateCachedSession(session) {
  cachedSession = session || null;
  cachedUser = session?.user ?? null;
  sessionUpdatedAt = Date.now();
}

// 初始化 session 缓存
supabaseInstance.auth.onAuthStateChange((event, session) => {
  console.log('[Supabase] Auth state changed:', event);
  updateCachedSession(session);
});

// 尽量在启动时预热 session，避免首次请求卡顿
setTimeout(async () => {
  try {
    const { data } = await withTimeout(
      supabaseInstance.auth.getSession(),
      SESSION_REFRESH_TIMEOUT_MS
    );
    updateCachedSession(data?.session || null);
  } catch (e) {
    console.warn('[Supabase] Session preheat failed:', e.message);
  }
}, 0);

// 导出的 supabase 对象 - 使用 Proxy 确保始终指向最新实例
export const supabase = new Proxy({}, {
  get: (_, prop) => {
    // 如果实例需要更新，先更新再返回
    if (clientInstanceNeedsUpdate) {
      console.log('[Supabase] Updating Proxy to new client instance v' + clientVersion);
      clientInstanceNeedsUpdate = false;
    }
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
// 客户端重建（仅作为最后手段，保留但不推荐使用）
// ============================================
let clientInstanceNeedsUpdate = false; // 标记是否需要更新实例引用

async function rebuildClient() {
  console.log('[Supabase] Rebuilding Supabase client...');

  try {
    // 保存当前 session 数据（从 Cookie 读取）
    const storage = createCookieStorage();
        // 清理旧实例的 Realtime 连接
    try {
      await supabaseInstance.removeAllChannels();
    } catch (e) {
      console.warn('[Supabase] Error removing channels:', e.message);
    }

    // 创建新实例
    supabaseInstance = createSupabaseClient();
    clientInstanceNeedsUpdate = true;

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

function isSessionExpiring(session) {
  if (!session?.expires_at) return true;
  const now = Math.floor(Date.now() / 1000);
  return session.expires_at - now <= SESSION_EXPIRY_BUFFER_SECONDS;
}

async function getSessionWithTimeout(timeoutMs) {
  const { data } = await withTimeout(
    supabaseInstance.auth.getSession(),
    timeoutMs
  );
  return data?.session || null;
}

async function refreshSessionInternal(timeoutMs) {
  console.log('[Supabase] Calling auth.refreshSession()...');
  const { data, error } = await withTimeout(
    supabaseInstance.auth.refreshSession(),
    timeoutMs
  );
  if (error) {
    console.warn('[Supabase] Session refresh error:', error.message);
    return null;
  }
  if (data?.session) {
    updateCachedSession(data.session);
    return data.session;
  }
  return null;
}

export async function refreshSession(options = {}) {
  const { timeoutMs = SESSION_REFRESH_TIMEOUT_MS } = options;
  try {
    const session = await refreshSessionInternal(timeoutMs);
    if (session) {
      return session;
    }
    const existing = await getSessionWithTimeout(timeoutMs);
    if (existing) {
      updateCachedSession(existing);
    }
    return existing;
  } catch (e) {
    console.warn('[Supabase] refreshSession exception:', e.message);
    try {
      const fallback = await getSessionWithTimeout(timeoutMs);
      if (fallback) {
        updateCachedSession(fallback);
      }
      return fallback;
    } catch (fallbackError) {
      console.warn('[Supabase] refreshSession fallback failed:', fallbackError.message);
      return null;
    }
  }
}

export async function ensureFreshSession(options = {}) {
  const opts = typeof options === 'number' ? { timeoutMs: options } : options;
  const {
    timeoutMs = SESSION_REFRESH_TIMEOUT_MS,
    force = false,
  } = opts;

  if (sessionRefreshPromise) {
    return sessionRefreshPromise;
  }

  if (!force && cachedSession && !isSessionExpiring(cachedSession)) {
    return cachedSession;
  }

  sessionRefreshPromise = (async () => {
    const refreshed = await refreshSession({ timeoutMs });
    if (!refreshed) {
      try {
        const current = await getSessionWithTimeout(timeoutMs);
        if (current) {
          updateCachedSession(current);
          return current;
        }
      } catch (e) {
        console.warn('[Supabase] ensureFreshSession getSession failed:', e.message);
      }
    }
    return refreshed || null;
  })();

  try {
    return await sessionRefreshPromise;
  } finally {
    sessionRefreshPromise = null;
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
  // 使用原生 fetch 测试 REST API 可达性（绕过可能冻结的 SDK）
  return await testConnectionHealth();
}

// ============================================
// 主恢复流程 - 等待 SDK 自动恢复，不再重建客户端
// ============================================
export async function recoverConnection(options = {}) {
  const { force = false, quickCheck = false } = options;

  // 检查是否在冷却期
  if (recoveryCooldown && !force) {
    const timeSinceLastRecovery = Date.now() - lastRecoveryTime;
    if (timeSinceLastRecovery < MIN_RECOVERY_INTERVAL) {
      console.log(`[Supabase] Recovery in cooldown (${timeSinceLastRecovery}ms), skipping...`);
      return { success: false, skipped: true, cooldown: true };
    }
    recoveryCooldown = false;
  }

  // 防止重复触发恢复流程
  if (isRecoveryInProgress && !force) {
    console.log('[Supabase] Recovery already in progress, skipping...');
    return { success: false, skipped: true };
  }

  isRecoveryInProgress = true;
  lastRecoveryTime = Date.now();
  const hiddenDuration = Date.now() - lastHiddenTime;
  console.log('[Supabase] Starting connection recovery...', { quickCheck, force, hiddenDuration });

  try {
    // 0. 清除活跃请求列表（页面冻结期间这些请求可能已失效）
    // 不再中止它们，因为浏览器已经处理了这些请求
    const pendingCount = activeAbortControllers.size;
    if (pendingCount > 0) {
      console.log(`[Supabase] Clearing ${pendingCount} pending requests (may be stale from freeze)`);
      activeAbortControllers.clear();
    }

    // 1. 等待 SDK 自动恢复
    // 浏览器冻结页面后，需要更长时间让 JavaScript 运行时和 SDK 内部状态恢复
    // 页面长时间隐藏后需要更长的恢复时间
    const recoveryWaitTime = hiddenDuration > 60000 ? 10000 : (hiddenDuration > 30000 ? 5000 : 3000);
    console.log(`[Supabase] Hidden for ${hiddenDuration}ms, waiting ${recoveryWaitTime}ms for SDK recovery...`);
    await new Promise(resolve => setTimeout(resolve, recoveryWaitTime));

    // 2. 测试 API 连通性（使用原生 fetch，绕过可能冻结的 SDK）
    const apiReachable = await testConnectionHealth();
    console.log('[Supabase] API reachable:', apiReachable ? 'YES' : 'NO');

    // 3. 如果 API 不可达，等待更长时间
    if (!apiReachable) {
      console.log('[Supabase] API not reachable, waiting longer for network recovery...');
      await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 4. 尝试刷新 Session（快速模式下跳过）
    let session = null;
    if (!quickCheck) {
      let retryCount = 0;
      const maxRetries = hiddenDuration > 60000 ? 3 : 2;

      while (retryCount < maxRetries) {
        try {
          console.log(`[Supabase] Session refresh attempt ${retryCount + 1}/${maxRetries}...`);
          session = await ensureFreshSession({ timeoutMs: SESSION_REFRESH_TIMEOUT_MS, force: retryCount > 0 });
          if (session) {
            console.log('[Supabase] Session status: valid');
            break;
          }
        } catch (e) {
          console.warn(`[Supabase] Session refresh attempt ${retryCount + 1} failed:`, e.message);
        }

        retryCount++;
        if (retryCount < maxRetries) {
          // 等待更长时间让 SDK 完全恢复
          const waitTime = hiddenDuration > 60000 ? 3000 : 2000;
          console.log(`[Supabase] Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }

      if (!session) {
        console.log('[Supabase] Session status: none (after all retries)');
      }
    }

    // 5. 重连 Realtime（快速模式下跳过）
    if (!quickCheck) {
      try {
        await reconnectRealtime();
      } catch (e) {
        console.warn('[Supabase] Realtime reconnect failed:', e.message);
      }
    }

    // 6. 触发恢复事件
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

    // 7. 执行回调
    executeRecoveryCallbacks();

    console.log('[Supabase] Connection recovery completed, client version:', clientVersion);
    return { success: true, session, quickCheck };
  } catch (e) {
    console.error('[Supabase] Connection recovery error:', e);

    // 即使出错也不再重建客户端
    return { success: false, error: e };
  } finally {
    // 确保恢复锁被释放
    isRecoveryInProgress = false;
  }
}

// ============================================
// 页面可见性监听
// ============================================
if (typeof document !== 'undefined') {
  let pendingVisibilityCheck = null; // 待处理的可见性检查

  document.addEventListener('visibilitychange', async () => {
    if (document.visibilityState === 'hidden') {
      lastHiddenTime = Date.now();
      console.log('[Supabase] Page hidden');
      // 取消待处理的检查
      if (pendingVisibilityCheck) {
        clearTimeout(pendingVisibilityCheck);
        pendingVisibilityCheck = null;
      }
    } else if (document.visibilityState === 'visible') {
      const hiddenDuration = Date.now() - lastHiddenTime;
      console.log('[Supabase] Page visible after', hiddenDuration, 'ms');

      // 取消之前的待处理检查
      if (pendingVisibilityCheck) {
        clearTimeout(pendingVisibilityCheck);
      }

      // 延迟执行检查，确保不会在页面切换时立即触发
      pendingVisibilityCheck = setTimeout(async () => {
        pendingVisibilityCheck = null;

        // 短时间切换（<3秒）使用快速检查，长时间切换使用完整检查
        const quickCheck = hiddenDuration < 3000;
        await recoverConnection({ quickCheck });
        if (!quickCheck) {
          await ensureFreshSession({ timeoutMs: SESSION_REFRESH_TIMEOUT_MS });
        }
      }, 100);
    }
  });
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    console.log('[Supabase] Network back online, running recovery...');
    recoverConnection({ quickCheck: false });
  });
}


export function getSessionSnapshot() {
  return {
    session: cachedSession,
    user: cachedUser,
    updatedAt: sessionUpdatedAt,
  };
}

export function getCachedUser() {
  return cachedUser;
}

export function getCachedSession() {
  return cachedSession;
}

// 兼容性别名
export async function getAccessToken(options = {}) {
  const session = await ensureFreshSession(options);
  return session?.access_token || null;
}
