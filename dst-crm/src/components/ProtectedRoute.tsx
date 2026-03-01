import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import type { UserRole } from '../context/AuthContext';
import { useAuth } from '../context/AuthContext';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredRole?: UserRole;
}

export const ProtectedRoute = ({ children, requiredRole }: ProtectedRouteProps) => {
  // Custom hook + Context pattern: central source of truth for auth state and role.
  const { user, role, loading } = useAuth();

  // Guard 1: while auth is loading, do not redirect to avoid flashing the wrong page.
  if (loading) {
    return <div className="loading">Načítavanie...</div>;
  }

  // Guard 2: unauthenticated users are always redirected to login.
  if (!user) {
    return <Navigate to="/login" replace />;
  }

  // Guard 3: role-based authorization (RBAC - Role Based Access Control).
  if (requiredRole && role !== requiredRole) {
    return <Navigate to="/unauthorized" replace />;
  }

  return <>{children}</>;
};
