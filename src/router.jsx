import React from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import App from './App';
import { LoginPage } from './pages/LoginPage';
import { ResetPasswordPage } from './pages/ResetPasswordPage';
import { ProtectedRoute } from './components/ProtectedRoute';
import {
  AdminLayout,
  ModelsPage,
  CodesPage,
  UsersPage,
  LogsPage,
  WalletPage,
  SettingsPage,
} from './pages/admin';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <ProtectedRoute>
        <App />
      </ProtectedRoute>
    ),
  },
  {
    path: '/login',
    element: <LoginPage />,
  },
  {
    path: '/reset-password',
    element: <ResetPasswordPage />,
  },
  {
    path: '/admin',
    element: (
      <ProtectedRoute>
        <AdminLayout />
      </ProtectedRoute>
    ),
    children: [
      {
        index: true,
        element: <Navigate to="/admin/wallet" replace />,
      },
      {
        path: 'models',
        element: (
          <ProtectedRoute requireAdmin>
            <ModelsPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'codes',
        element: (
          <ProtectedRoute requireAdmin>
            <CodesPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'users',
        element: (
          <ProtectedRoute requireAdmin>
            <UsersPage />
          </ProtectedRoute>
        ),
      },
      {
        path: 'logs',
        element: <LogsPage />,
      },
      {
        path: 'wallet',
        element: <WalletPage />,
      },
      {
        path: 'settings',
        element: (
          <ProtectedRoute requireAdmin>
            <SettingsPage />
          </ProtectedRoute>
        ),
      },
    ],
  },
]);
