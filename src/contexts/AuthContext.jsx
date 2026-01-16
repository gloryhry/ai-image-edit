import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { supabase, onConnectionRecovery } from '../lib/supabase';

const AuthContext = createContext({});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (userId) => {
    if (!userId) return null;
    
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) throw error;
      setProfile(data);
      return data;
    } catch (error) {
      console.error('Error fetching profile:', error);
      return null;
    }
  }, []);

  // 刷新当前用户状态和数据
  const refreshAuthState = useCallback(async () => {
    console.log('[AuthContext] Refreshing auth state...');
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const currentUser = session?.user ?? null;
      setUser(currentUser);
      
      if (currentUser) {
        await fetchProfile(currentUser.id);
      } else {
        setProfile(null);
      }
      
      console.log('[AuthContext] Auth state refreshed, user:', currentUser?.id ?? 'none');
    } catch (error) {
      console.error('[AuthContext] Error refreshing auth state:', error);
    }
  }, [fetchProfile]);

  useEffect(() => {
    let subscription = null;

    const initAuth = async () => {
      // 获取当前 Session
      const { data: { session } } = await supabase.auth.getSession();
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      }
      setLoading(false);

      // 设置监听器
      const { data } = supabase.auth.onAuthStateChange(
        async (event, session) => {
          console.log('[AuthContext] Auth state changed:', event);
          setUser(session?.user ?? null);
          if (session?.user) {
            await fetchProfile(session.user.id);
          } else {
            setProfile(null);
          }
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

    // 监听 supabase:recovered 事件作为备用
    const handleRecovered = () => {
      console.log('[AuthContext] Received supabase:recovered event');
      refreshAuthState();
    };
    window.addEventListener('supabase:recovered', handleRecovered);

    return () => {
      if (subscription) subscription.unsubscribe();
      unsubscribeRecovery();
      window.removeEventListener('supabase:recovered', handleRecovered);
    };
  }, [fetchProfile, refreshAuthState]);

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
    refreshAuthState, // 暴露刷新方法，供外部调用
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
