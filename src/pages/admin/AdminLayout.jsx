import React from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Box,
  Ticket,
  Users,
  FileText,
  Wallet,
  Settings,
  LogOut,
  ArrowLeft,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const adminNavItems = [
  { path: '/admin/models', icon: Box, label: '模型管理' },
  { path: '/admin/codes', icon: Ticket, label: '兑换码管理' },
  { path: '/admin/users', icon: Users, label: '用户管理' },
  { path: '/admin/logs', icon: FileText, label: '使用日志' },
  { path: '/admin/wallet', icon: Wallet, label: '钱包管理' },
  { path: '/admin/settings', icon: Settings, label: '系统管理' },
];

const userNavItems = [
  { path: '/admin/logs', icon: FileText, label: '使用日志' },
  { path: '/admin/wallet', icon: Wallet, label: '钱包管理' },
];

export const AdminLayout = () => {
  const { profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();

  const navItems = isAdmin ? adminNavItems : userNavItems;

  const handleSignOut = async () => {
    await signOut();
    navigate('/login');
  };

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside className="w-64 bg-white border-r border-slate-200 flex flex-col">
        <div className="p-4 border-b border-slate-200">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6" />
            {isAdmin ? '管理后台' : '用户中心'}
          </h1>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {navItems.map((item) => (
            <NavLink
              key={item.path}
              to={item.path}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-100'
                }`
              }
            >
              <item.icon className="w-5 h-5" />
              {item.label}
            </NavLink>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-200 space-y-2">
          <div className="px-3 py-2 text-sm text-slate-500">
            <p className="font-medium text-slate-700">{profile?.username || profile?.email}</p>
            <p className="text-xs">余额: ¥{Number(profile?.balance || 0).toFixed(4)}</p>
          </div>
          
          <button
            onClick={() => navigate('/')}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-slate-600 hover:bg-slate-100 w-full transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            返回应用
          </button>
          
          <button
            onClick={handleSignOut}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 hover:bg-red-50 w-full transition-colors"
          >
            <LogOut className="w-5 h-5" />
            退出登录
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-auto">
        <Outlet />
      </main>
    </div>
  );
};
