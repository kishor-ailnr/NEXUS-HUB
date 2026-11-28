import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { isValidOrgMode, OrgMode, UserRole } from '@nexus-ways/shared';
import { useAuthStore } from '../store/authStore';
import { PageLoadingSkeleton } from './PageLoadingSkeleton';
import { NotFound } from '../pages/NotFound';

interface ProtectedRouteProps {
  children: React.ReactNode;
  allowedRoles?: UserRole[];
}

export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, allowedRoles }) => {
  const { mode } = useParams<{ mode: string }>();
  const { user, isAuthenticated, isLoading } = useAuthStore();
  const location = useLocation();

  if (mode && !isValidOrgMode(mode)) {
    return <NotFound />;
  }

  const currentMode = (mode || 'roadways') as OrgMode;

  if (isLoading) {
    return <PageLoadingSkeleton />;
  }

  if (!isAuthenticated) {
    return <Navigate to={`/${currentMode}/login`} state={{ from: location }} replace />;
  }

  // Frontend Mode Isolation: Check that user's org mode matches the requested route mode
  if (user && user.organization.mode !== currentMode) {
    return <Navigate to={`/${currentMode}/login`} state={{ from: location }} replace />;
  }

  // Strict Role Isolation: redirect unauthorized roles (e.g. driver opening admin URL)
  if (allowedRoles && user && !allowedRoles.includes(user.role)) {
    return <Navigate to={`/${user.organization.mode}/dashboard`} replace />;
  }

  return <>{children}</>;
};
