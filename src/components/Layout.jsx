import React from 'react';
import { Link } from 'react-router-dom';
import { User, LogOut } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

export function Layout({ children, sidebar, properties }) {
    const { profile, signOut } = useAuth();

    return (
        <div className="flex h-screen w-full overflow-hidden bg-ios-gray p-4 gap-4">
            {/* Left Sidebar - Tools */}
            <aside className="w-20 flex-shrink-0 flex flex-col items-center py-6 bg-white/60 backdrop-blur-glass-40 rounded-ios-lg shadow-soft-spread border border-white/60">
                {sidebar}

                <div className="mt-auto pt-4 border-t border-slate-200 w-full flex flex-col items-center gap-2">
                    <Link
                        to="/admin"
                        className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-slate-600 hover:bg-slate-50 transition-colors"
                        title="用户中心"
                    >
                        <User size={20} />
                    </Link>
                    <button
                        onClick={signOut}
                        className="w-12 h-12 rounded-full bg-white shadow-sm flex items-center justify-center text-red-500 hover:bg-red-50 transition-colors"
                        title="退出登录"
                    >
                        <LogOut size={20} />
                    </button>
                    {profile && (
                        <div className="text-xs text-center text-slate-500 px-2">
                            <p className="truncate w-16" title={profile.username || profile.email}>
                                {profile.username || profile.email?.split('@')[0]}
                            </p>
                            <p className="text-green-600 font-medium">¥{Number(profile.balance || 0).toFixed(2)}</p>
                        </div>
                    )}
                </div>
            </aside>

            {/* Main Content - Canvas */}
            <main className="flex-1 relative flex flex-col bg-white/40 backdrop-blur-glass-40 rounded-ios-lg shadow-soft-spread border border-white/60 overflow-hidden">
                {children}
            </main>

            {/* Right Sidebar - Properties */}
            <aside className="w-96 flex-shrink-0 flex flex-col bg-white/60 backdrop-blur-glass-40 rounded-ios-lg shadow-soft-spread border border-white/60 overflow-y-auto">
                {properties}
            </aside>
        </div>
    );
}
