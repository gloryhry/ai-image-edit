import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { withSessionRefresh } from './supabase-request';
import { supabase, markRequestSuccess, isClientPossiblyUnhealthy } from './supabase';

/**
 * 自定义 Hook：安全地执行 Supabase 查询
 * 
 * 特性：
 * 1. 等待认证完成后再发起请求
 * 2. 防止重复请求
 * 3. 页面从后台恢复时自动刷新数据
 * 4. 自动处理错误和加载状态
 * 
 * @param {Function} queryBuilder - 返回 Supabase 查询的函数
 * @param {Array} dependencies - 依赖项数组，变化时触发重新获取
 * @param {Object} options - 配置选项
 * @returns {Object} { data, loading, error, refetch }
 */
export function useSupabaseQuery(queryBuilder, dependencies = [], options = {}) {
    const {
        enabled = true,  // 是否启用查询
        refreshOnVisibility = true,  // 页面恢复可见时是否刷新
        skipAuthCheck = false,  // 是否跳过认证检查
    } = options;

    const { loading: authLoading } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchingRef = useRef(false);
    const needsRefreshRef = useRef(false);
    const mountedRef = useRef(true);
    const lastVisibleTimeRef = useRef(Date.now());

    const fetchData = useCallback(async (force = false) => {
        // 防止重复请求
        if (fetchingRef.current && !force) {
            console.log('[useSupabaseQuery] Skipped - already fetching');
            return;
        }

        // 检查是否启用
        if (!enabled) {
            console.log('[useSupabaseQuery] Skipped - not enabled');
            return;
        }

        // 检查认证状态
        if (!skipAuthCheck && authLoading) {
            console.log('[useSupabaseQuery] Skipped - auth loading');
            needsRefreshRef.current = true;
            return;
        }

        // 检查客户端健康状态
        if (isClientPossiblyUnhealthy()) {
            console.log('[useSupabaseQuery] Client unhealthy, waiting...');
            await new Promise(resolve => setTimeout(resolve, 500));
            markRequestSuccess();
        }

        console.log('[useSupabaseQuery] Starting fetch...');
        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            const { data: result, error: fetchError } = await withSessionRefresh(queryBuilder);

            if (!mountedRef.current) {
                console.log('[useSupabaseQuery] Component unmounted, discarding result');
                return;
            }

            if (fetchError) {
                console.error('[useSupabaseQuery] Error:', fetchError);
                setError(fetchError.message || '加载失败');
            } else {
                setData(result);
                setError(null);
            }
        } catch (e) {
            console.error('[useSupabaseQuery] Exception:', e);
            if (mountedRef.current) {
                setError(e.message || '加载失败');
            }
        }

        if (mountedRef.current) {
            setLoading(false);
            fetchingRef.current = false;
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [queryBuilder, enabled, skipAuthCheck, authLoading, ...dependencies]);

    // 主要的数据获取 effect
    useEffect(() => {
        if (!authLoading && enabled) {
            fetchData();
        }
    }, [fetchData, authLoading, enabled]);

    // 认证完成后检查是否需要刷新
    useEffect(() => {
        if (!authLoading && needsRefreshRef.current) {
            console.log('[useSupabaseQuery] Auth completed, triggering fetch');
            needsRefreshRef.current = false;
            fetchData();
        }
    }, [authLoading, fetchData]);

    // 页面可见性变化处理
    useEffect(() => {
        if (!refreshOnVisibility) return;

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                const hiddenDuration = Date.now() - lastVisibleTimeRef.current;
                console.log(`[useSupabaseQuery] Page visible after ${hiddenDuration}ms`);

                // 如果隐藏时间超过 5 秒，刷新数据
                if (hiddenDuration > 5000) {
                    setTimeout(() => {
                        if (!authLoading && mountedRef.current) {
                            console.log('[useSupabaseQuery] Refreshing after visibility change');
                            fetchData(true);
                        }
                    }, 300);
                }
            } else {
                lastVisibleTimeRef.current = Date.now();
            }
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [refreshOnVisibility, authLoading, fetchData]);

    // 组件卸载处理
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
        };
    }, []);

    const refetch = useCallback((force = true) => {
        return fetchData(force);
    }, [fetchData]);

    return { data, loading, error, refetch };
}

/**
 * 简化的直接查询函数
 * 用于不需要 hook 的场景（如事件处理器中）
 */
export async function safeSupabaseQuery(queryBuilder) {
    try {
        const { data, error } = await withSessionRefresh(queryBuilder);
        if (error) {
            throw new Error(error.message || '查询失败');
        }
        return { data, error: null };
    } catch (e) {
        console.error('[safeSupabaseQuery] Error:', e);
        return { data: null, error: e };
    }
}

export default useSupabaseQuery;
