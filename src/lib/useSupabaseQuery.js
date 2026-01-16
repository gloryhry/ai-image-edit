import { useState, useEffect, useRef, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { withSessionRefresh } from './supabase-request';
import { onConnectionRecovery, ensureFreshSession } from './supabase';

/**
 * 自定义 Hook：安全地执行 Supabase 查询
 * 
 * 特性：
 * 1. 等待认证完成后再发起请求
 * 2. 防止重复请求
 * 3. 页面从后台恢复时自动刷新数据（监听 supabase:recovered 事件）
 * 4. 自动处理错误和加载状态
 * 
 * @param {Function} queryBuilder - 返回 Supabase 查询的函数
 * @param {Array} dependencies - 依赖项数组，变化时触发重新获取
 * @param {Object} options - 配置选项
 * @returns {Object} { data, loading, error, refetch }
 */
export function useSupabaseQuery(queryBuilder, dependencies = [], options = {}) {
    const {
        enabled = true,
        refreshOnRecovery = true,  // 连接恢复时是否刷新
        skipAuthCheck = false,
    } = options;

    const { loading: authLoading } = useAuth();

    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    const fetchingRef = useRef(false);
    const needsRefreshRef = useRef(false);
    const mountedRef = useRef(true);

    const fetchData = useCallback(async (force = false) => {
        if (fetchingRef.current && !force) {
            return;
        }

        if (!enabled) {
            return;
        }

        if (!skipAuthCheck && authLoading) {
            needsRefreshRef.current = true;
            return;
        }

        fetchingRef.current = true;
        setLoading(true);
        setError(null);

        try {
            await ensureFreshSession({ timeoutMs: 5000 });
            const { data: result, error: fetchError } = await withSessionRefresh(queryBuilder);

            if (!mountedRef.current) {
                return;
            }

            if (fetchError) {
                setError(fetchError.message || '加载失败');
            } else {
                setData(result);
                setError(null);
            }
        } catch (e) {
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

    // 初始数据获取
    useEffect(() => {
        if (!authLoading && enabled) {
            fetchData();
        }
    }, [fetchData, authLoading, enabled]);

    // 认证完成后检查是否需要刷新
    useEffect(() => {
        if (!authLoading && needsRefreshRef.current) {
            needsRefreshRef.current = false;
            fetchData();
        }
    }, [authLoading, fetchData]);

    // 连接恢复时自动刷新数据
    useEffect(() => {
        if (!refreshOnRecovery) return;

        // 使用 onConnectionRecovery 注册回调
        const unsubscribe = onConnectionRecovery(() => {
            console.log('[useSupabaseQuery] Connection recovered, refreshing data...');
            if (!authLoading && mountedRef.current) {
                // 延迟一点执行，确保 session 已刷新
                setTimeout(() => {
                    fetchData(true);
                }, 100);
            }
        });

        return unsubscribe;
    }, [refreshOnRecovery, authLoading, fetchData]);

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
        return { data: null, error: e };
    }
}

export default useSupabaseQuery;
