import { supabase, ensureFreshSession, recoverConnection } from './supabase';

// 超时包装器，使用 AbortController 确保可以中断
function withTimeout(promise, timeoutMs = 30000, errorMessage = '请求超时') {
    const controller = new AbortController();
    let timeoutId;

    const timeoutPromise = new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
            controller.abort();
            reject(new Error(errorMessage));
        }, timeoutMs);
    });

    return {
        promise: Promise.race([promise, timeoutPromise]).finally(() => {
            clearTimeout(timeoutId);
        }),
        abort: () => controller.abort(),
    };
}

/**
 * 带自动恢复的 Supabase 请求包装器
 * 直接执行请求，失败时尝试刷新 session 或重建连接并重试
 * 
 * @param {Function} queryFn - 返回 Supabase query 的函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认 2
 * @param {number} options.timeoutMs - 超时时间，默认 15 秒（降低以更快检测冻结）
 * @returns {Promise<{data: any, error: any}>}
 */
export async function withSessionRefresh(queryFn, { maxRetries = 2, timeoutMs = 15000 } = {}) {
    let lastError = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            // 使用 withTimeout 包装查询
            const { promise } = withTimeout(queryFn(), timeoutMs, '查询超时');
            const result = await promise;
            const { data, error } = result;

            if (!error) {
                return { data, error: null };
            }

            lastError = error;
            const isAuthError = isAuthenticationError(error);
            const isAbortError = error.name === 'AbortError' ||
                error.message?.includes('aborted') ||
                error.message?.includes('The operation was aborted');

            // AbortError 可能是冻结导致的
            if (isAbortError && attempt < maxRetries) {
                console.log(`[SupabaseRequest] AbortError on attempt ${attempt + 1}, triggering recovery...`);
                await recoverConnection();
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            // Auth 错误，刷新 session
            if (isAuthError && attempt < maxRetries) {
                console.log(`[SupabaseRequest] Auth error on attempt ${attempt + 1}, refreshing session...`);
                await ensureFreshSession(5000);
                continue;
            }

            return { data, error };

        } catch (e) {
            lastError = e;

            // 超时错误 - 可能是 SDK 冻结
            if (e.message === '查询超时' && attempt < maxRetries) {
                console.log(`[SupabaseRequest] Timeout on attempt ${attempt + 1}, triggering full recovery...`);
                // 超时很可能是 SDK 冻结，触发完整恢复流程
                await recoverConnection();
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            // AbortError
            if ((e.name === 'AbortError' || e.message?.includes('aborted')) && attempt < maxRetries) {
                console.log(`[SupabaseRequest] AbortError (catch) on attempt ${attempt + 1}, triggering recovery...`);
                await recoverConnection();
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            // 网络错误也可能需要恢复
            if (isNetworkError(e) && attempt < maxRetries) {
                console.log(`[SupabaseRequest] Network error on attempt ${attempt + 1}, waiting...`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            return { data: null, error: e };
        }
    }

    return { data: null, error: lastError || new Error('Max retries exceeded') };
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

