import React, { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

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

  const fetchProfile = async (userId) => {
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
  };

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

    // 初始化
    initAuth();

    // 防抖：记录上次初始化时间
    let lastInitTime = 0;
    const MIN_INIT_INTERVAL = 3000; // 最小初始化间隔 3 秒

    // 监听客户端重建事件
    const handleClientRecreated = () => {
      const now = Date.now();
      if (now - lastInitTime < MIN_INIT_INTERVAL) {
        console.log('[AuthContext] Skipping re-init, too soon after last init');
        return;
      }
      lastInitTime = now;

      console.log('[AuthContext] Client recreated, re-subscribing...');
      if (subscription) {
        subscription.unsubscribe();
      }
      // 使用 setTimeout 延迟初始化，让其他操作有机会完成
      setTimeout(() => {
        initAuth();
      }, 500);
    };

    window.addEventListener('supabase:client-recreated', handleClientRecreated);

    return () => {
      if (subscription) subscription.unsubscribe();
      window.removeEventListener('supabase:client-recreated', handleClientRecreated);
    };
  }, []);

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
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};
