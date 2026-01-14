import { supabase, refreshSession, ensureValidSession } from './supabase';

// 带超时的 Promise 包装器
function withTimeout(promise, timeoutMs = 30000, errorMessage = '请求超时') {
    return Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(errorMessage)), timeoutMs);
        })
    ]);
}

/**
 * 带自动 session 刷新的 Supabase 请求包装器
 * 当请求失败且疑似 session 过期时，自动尝试刷新 session 并重试
 * 
 * @param {Function} queryFn - 返回 Supabase query 的函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认 2
 * @param {number} options.timeoutMs - 超时时间，默认 30 秒
 * @returns {Promise<{data: any, error: any}>}
 */
export async function withSessionRefresh(queryFn, { maxRetries = 2, timeoutMs = 30000 } = {}) {
    console.log('[Supabase Request] Starting request...');

    // 首先确保 session 有效（带超时）
    try {
        console.log('[Supabase Request] Checking session validity...');
        await withTimeout(ensureValidSession(), 10000, 'Session 检查超时');
        console.log('[Supabase Request] Session check completed');
    } catch (e) {
        console.warn('[Supabase Request] Session check failed:', e.message);
        // 继续执行请求，不阻塞
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Supabase Request] Executing query (attempt ${attempt + 1}/${maxRetries + 1})...`);
            const result = await withTimeout(queryFn(), timeoutMs, '查询超时');
            const { data, error } = result;
            console.log('[Supabase Request] Query completed, error:', error ? error.message : 'none');

            if (!error) {
                return { data, error: null };
            }

            // 检查是否是认证相关的错误
            const isAuthError = isAuthenticationError(error);
            console.log('[Supabase Request] Is auth error:', isAuthError);

            if (isAuthError && attempt < maxRetries) {
                console.warn(`[Supabase Request] Auth error detected, attempting refresh (${attempt + 1}/${maxRetries})...`);

                const refreshed = await withTimeout(refreshSession(), 10000, 'Session 刷新超时');
                if (!refreshed) {
                    // 无法刷新 session，返回原始错误
                    return { data: null, error };
                }

                // 刷新成功，继续重试
                continue;
            }

            // 非认证错误或已达最大重试次数
            return { data, error };

        } catch (e) {
            console.error('[Supabase Request] Unexpected error:', e);

            if (attempt < maxRetries) {
                try {
                    const refreshed = await withTimeout(refreshSession(), 10000, 'Session 刷新超时');
                    if (refreshed) {
                        continue;
                    }
                } catch (refreshError) {
                    console.warn('[Supabase Request] Refresh failed:', refreshError.message);
                }
            }

            return { data: null, error: e };
        }
    }

    console.log('[Supabase Request] Max retries exceeded');
    // 兜底
    return { data: null, error: new Error('Max retries exceeded') };
}

/**
 * 检查错误是否是认证相关的错误
 */
function isAuthenticationError(error) {
    if (!error) return false;

    const errorMessage = error.message?.toLowerCase() || '';
    const errorCode = error.code || '';

    // 常见的认证错误模式
    const authErrorPatterns = [
        'jwt',
        'token',
        'auth',
        'unauthorized',
        'not authenticated',
        'session',
        'pgrst301',  // PostgREST JWT 过期错误
        '401',
    ];

    return authErrorPatterns.some(pattern =>
        errorMessage.includes(pattern) || errorCode.includes(pattern)
    );
}

/**
 * 执行 RPC 调用，带自动刷新
 */
export async function rpcWithRefresh(rpcName, params, options = {}) {
    return withSessionRefresh(() => supabase.rpc(rpcName, params), options);
}

export { ensureValidSession, refreshSession };
