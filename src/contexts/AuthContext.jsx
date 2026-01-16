import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { supabase, ensureFreshSession, onConnectionRecovery, getSessionSnapshot } from '../lib/supabase';
import { withSessionRefresh } from '../lib/supabase-request';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(() => getSessionSnapshot().user);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const refreshInFlightRef = useRef(null);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;

    try {
      const { data, error } = await withSessionRefresh(() => (
        supabase
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single()
      ), { timeoutMs: 8000 });

      if (error) throw error;
      setProfile(data);
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }, []);

  const applySession = useCallback(async (session) => {
    const nextUser = session?.user ?? null;
    setUser(nextUser);

    if (nextUser) {
      await fetchProfile(nextUser.id);
    } else {
      setProfile(null);
    }
  }, [fetchProfile]);

  // 刷新当前用户状态和数据
  const refreshAuthState = useCallback(async () => {
    if (refreshInFlightRef.current) {
      return refreshInFlightRef.current;
    }

    console.log('[AuthContext] Refreshing auth state...');
    refreshInFlightRef.current = (async () => {
      try {
        const session = await ensureFreshSession({ timeoutMs: 6000 });
        const fallbackSession = session || getSessionSnapshot().session;
        await applySession(fallbackSession);
        console.log('[AuthContext] Auth state refreshed, user:', fallbackSession?.user?.id ?? 'none');
      } catch (error) {
        console.error('[AuthContext] Error refreshing auth state:', error);
      }
    })().finally(() => {
      refreshInFlightRef.current = null;
    });

    return refreshInFlightRef.current;
  }, [applySession]);

  useEffect(() => {
    let subscription = null;

    const initAuth = async () => {
      const snapshot = getSessionSnapshot();
      if (snapshot.user) {
        setUser(snapshot.user);
      }

      try {
        const session = await ensureFreshSession({ timeoutMs: 6000 });
        await applySession(session || snapshot.session);
      } catch (error) {
        console.error('[AuthContext] Initial auth check failed:', error);
        await applySession(snapshot.session);
      }

      setLoading(false);

      // 设置监听器
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('[AuthContext] Auth state changed:', event);
          await applySession(session);
          setLoading(false);
        }
      );
      subscription = data.subscription;
    };

    initAuth();

    // 注册连接恢复回调 - 浏览器冻结恢复后重新拉取数据
    const unsubscribeRecovery = onConnectionRecovery(() => {
      console.log('[AuthContext] Connection recovered, refreshing auth state...');
      refreshAuthState();
    });

    return () => {
      if (subscription) subscription.unsubscribe();
      unsubscribeRecovery();
    };
  }, [applySession, refreshAuthState]);

  const signInWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    return { data, error };
  };

  const signUpWithEmail = async (email, password) => {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
    });
    return { data, error };
  };

  const signInWithGitHub = async () => {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'github',
      options: {
        redirectTo: `${window.location.origin}/`,
      },
    });
    return { data, error };
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (!error) {
      setUser(null);
      setProfile(null);
    }
    return { error };
  };

  const refreshProfile = async () => {
    if (user) {
      return await fetchProfile(user.id);
    }
    return null;
  };

  const value = {
    user,
    profile,
    loading,
    isAdmin: profile?.is_admin ?? false,
    isBanned: profile?.is_banned ?? false,
    signInWithEmail,
    signUpWithEmail,
    signInWithGitHub,
    signOut,
    refreshProfile,
    refreshAuthState,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
