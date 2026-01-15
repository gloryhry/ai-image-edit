import { supabase, tryRefreshSession, recreateClient, markRequestSuccess, markClientUnhealthy, isClientPossiblyUnhealthy } from './supabase';

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
 * 带自动恢复的 Supabase 请求包装器
 * 直接执行请求，失败时尝试刷新 session 并重试
 * 
 * @param {Function} queryFn - 返回 Supabase query 的函数
 * @param {Object} options - 配置选项
 * @param {number} options.maxRetries - 最大重试次数，默认 1
 * @param {number} options.timeoutMs - 超时时间，默认 30 秒
 * @returns {Promise<{data: any, error: any}>}
 */
export async function withSessionRefresh(queryFn, { maxRetries = 2, timeoutMs = 30000 } = {}) {
    console.log('[Supabase Request] Starting request...');

    // 在发起请求前检查客户端健康状态，如果不健康则先等待网络恢复
    if (isClientPossiblyUnhealthy()) {
        console.log('[Supabase Request] Client possibly unhealthy, waiting for recovery...');
        await new Promise(resolve => setTimeout(resolve, 1000));
        // 给予一次机会标记为健康
        markRequestSuccess();
    }

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            console.log(`[Supabase Request] Executing query (attempt ${attempt + 1}/${maxRetries + 1})...`);

            const result = await withTimeout(queryFn(), timeoutMs, '查询超时');
            const { data, error } = result;

            console.log('[Supabase Request] Query completed, error:', error ? error.message : 'none');

            if (!error) {
                // 请求成功，标记健康状态
                markRequestSuccess();
                return { data, error: null };
            }

            // 检查是否是认证相关的错误
            const isAuthError = isAuthenticationError(error);
            console.log('[Supabase Request] Is auth error:', isAuthError);

            // 检查是否是 AbortError（通常发生在客户端重建时）
            const isAbortError = error.name === 'AbortError' ||
                error.message?.includes('aborted') ||
                error.message?.includes('The operation was aborted');

            if (isAbortError && attempt < maxRetries) {
                console.warn('[Supabase Request] AbortError detected in result, waiting and retrying...');
                // 等待客户端稳定
                await new Promise(resolve => setTimeout(resolve, 1000));
                // 标记为健康，给新客户端一个机会
                markRequestSuccess();
                continue;
            }

            if (isAuthError && attempt < maxRetries) {
                console.warn(`[Supabase Request] Auth error detected, attempting recovery...`);
                markClientUnhealthy();

                // 尝试刷新 session（非阻塞，带超时）
                const refreshed = await tryRefreshSession(5000);

                if (!refreshed) {
                    // 刷新失败，尝试重建客户端
                    console.warn('[Supabase Request] Refresh failed, recreating client...');
                    recreateClient();
                }

                // 继续重试
                continue;
            }

            // 非认证错误或已达最大重试次数
            return { data, error };

        } catch (e) {
            console.error('[Supabase Request] Error:', e.message);

            if (e.message === '查询超时') {
                markClientUnhealthy();

                if (attempt < maxRetries) {
                    console.warn('[Supabase Request] Query timeout detected, waiting for recovery...');

                    // 等待网络恢复
                    await new Promise(resolve => setTimeout(resolve, 2000));

                    // 标记为健康，给下次查询一个机会
                    // 不要重建客户端，因为这会导致 AbortError
                    markRequestSuccess();
                    console.log('[Supabase Request] Retrying after timeout...');

                    continue;
                }
            }

            // 处理 AbortError (通常发生在客户端重建时或网络不稳定)
            if ((e.name === 'AbortError' || e.message?.includes('aborted')) && attempt < maxRetries) {
                console.warn('[Supabase Request] Request aborted (likely due to client recreation), retrying in 500ms...');
                await new Promise(resolve => setTimeout(resolve, 500));
                continue;
            }

            return { data: null, error: e };
        }
    }

    console.log('[Supabase Request] Max retries exceeded');
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
