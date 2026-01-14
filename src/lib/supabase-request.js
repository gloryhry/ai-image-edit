import { supabase, refreshSession, ensureValidSession } from './supabase';

/**
 * 带自动 session 刷新的 Supabase 请求包装器
 * 当请求失败且疑似 session 过期时，自动尝试刷新 session 并重试
 * 
 * @param {Function} queryFn - 返回 Supabase query 的函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认 2
 * @returns {Promise<{data: any, error: any}>}
 */
export async function withSessionRefresh(queryFn, { maxRetries = 2 } = {}) {
    // 首先确保 session 有效
    await ensureValidSession();

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            const result = await queryFn();
            const { data, error } = result;

            if (!error) {
                return { data, error: null };
            }

            // 检查是否是认证相关的错误
            const isAuthError = isAuthenticationError(error);

            if (isAuthError && attempt < maxRetries) {
                console.warn(`[Supabase Request] Auth error detected, attempting refresh (${attempt + 1}/${maxRetries})...`);

                const refreshed = await refreshSession();
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
                const refreshed = await refreshSession();
                if (refreshed) {
                    continue;
                }
            }

            return { data: null, error: e };
        }
    }

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
