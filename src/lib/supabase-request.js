import { supabase, ensureFreshSession, recoverConnection, waitForConnectionRecovery } from './supabase';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function attachAbortSignalIfSupported(query, signal) {
    if (query && typeof query.abortSignal === 'function') {
        return query.abortSignal(signal);
    }
    return query;
}

// 超时包装器：尽可能将 AbortSignal 注入到 Postgrest 查询中，避免“僵尸请求”占用连接池
function withTimeoutQuery(queryFn, timeoutMs = 30000, errorMessage = '请求超时') {
    const controller = new AbortController();
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(errorMessage));
        }, timeoutMs);
    });

    return {
        promise: Promise.race([
            Promise.resolve(attachAbortSignalIfSupported(queryFn({ signal: controller.signal }), controller.signal)),
            timeoutPromise,
        ]).finally(() => {
            clearTimeout(timeoutId);
        }),
        abort: () => controller.abort(),
    };
}

/**
 * 带自动恢复的 Supabase 请求包装器
 * 直接执行请求，超时/失败时等待 SDK 自动恢复
 *
 * @param {Function} queryFn - 返回 Supabase query 的函数
 * @param {Object} options - 配置选项
 * @param {number} options.timeoutMs - 超时时间，默认 20 秒
 * @returns {Promise<{data: any, error: any}>}
 */
export async function withSessionRefresh(queryFn, { timeoutMs = 20000, refreshOnStart = true } = {}) {
    try {
        // 如果正在执行恢复流程，先等它跑完，避免在恢复中发起查询导致长时间悬挂
        await waitForConnectionRecovery({ timeoutMs: 5000 });

        if (refreshOnStart) {
            await ensureFreshSession({ timeoutMs: 2500 });
        }
        // 使用 withTimeout 包装查询
        const { promise } = withTimeoutQuery(queryFn, timeoutMs, '查询超时');
        const result = await promise;
        const { data, error } = result;

        if (!error) {
            return { data, error: null };
        }

        // 检查是否是认证错误
        if (isAuthenticationError(error)) {
            console.log('[SupabaseRequest] Auth error, refreshing session...');
            await ensureFreshSession({ timeoutMs: 5000, force: true });
            // 刷新 session 后重试一次
            const { promise: retryPromise } = withTimeoutQuery(queryFn, timeoutMs, '查询超时');
            return retryPromise;
        }

        return { data, error };

    } catch (e) {
        // 超时或 AbortError - SDK 可能被冻结
        if (e.message === '查询超时' || e.name === 'AbortError' || e.message?.includes('aborted')) {
            console.log('[SupabaseRequest] Request aborted/timeout, waiting for SDK/JS recovery...');
            // 主动触发恢复流程；比固定 sleep 更快更可控
            await recoverConnection({ force: true, quickCheck: false });
            await ensureFreshSession({ timeoutMs: 5000 });

            // 重试一次
            try {
                // 恢复后通常应快速返回，避免再次卡住太久
                const retryTimeoutMs = Math.min(timeoutMs, 12000);
                const { promise: retryPromise } = withTimeoutQuery(queryFn, retryTimeoutMs, '查询超时');
                const result = await retryPromise;
                return result;
            } catch (retryError) {
                // 重试也失败，返回错误
                return { data: null, error: retryError };
            }
        }

        // 网络错误 - 等待后重试
        if (isNetworkError(e)) {
            console.log('[SupabaseRequest] Network error, waiting and retrying...');
            await sleep(1000);
            await recoverConnection({ force: true, quickCheck: false });
            await ensureFreshSession({ timeoutMs: 5000 });

            try {
                const retryTimeoutMs = Math.min(timeoutMs, 12000);
                const { promise: retryPromise } = withTimeoutQuery(queryFn, retryTimeoutMs, '查询超时');
                const result = await retryPromise;
                return result;
            } catch (retryError) {
                return { data: null, error: retryError };
            }
        }

        return { data: null, error: e };
    }
}

function isAuthenticationError(error) {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';

    const authErrorPatterns = [
        'jwt',
        'token',
        'auth',
        'unauthorized',
        'not authenticated',
        'session',
        'pgrst301',
        '401',
    ];

    return authErrorPatterns.some(pattern =>
        errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
}

function isNetworkError(error) {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const networkPatterns = [
        'network',
        'failed to fetch',
        'load failed',
        'connection',
        'econnrefused',
        'timeout',
    ];

    return networkPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * 执行 RPC 调用，带自动刷新
 */
export async function rpcWithRefresh(rpcName, params, options = {}) {
    return withSessionRefresh(() => supabase.rpc(rpcName, params), options);
}
