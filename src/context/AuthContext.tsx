import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import type { AuthUser, SchoolSettings, UserRole } from '../types';
import { apiRequest, setAuthToken } from '../utils/api';

interface DbStatus {
  dbConfigured: boolean;
  dbConnected: boolean;
  dbError: string | null;
  needsSetup: boolean;
}

interface AuthContextValue {
  user: AuthUser | null;
  settings: SchoolSettings | null;
  dbStatus: DbStatus | null;
  checkingStatus: boolean;
  checkStatus: () => Promise<void>;
  login: (identifier: string, password: string, expectedRole?: UserRole) => Promise<void>;
  setupAdmin: (payload: {
    schoolName: string;
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  logout: () => void;
  updateSettingsState: (settings: SchoolSettings) => void;
  updateUserState: (user: AuthUser) => void;
  refreshMe: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [settings, setSettings] = useState<SchoolSettings | null>(null);
  const [dbStatus, setDbStatus] = useState<DbStatus | null>(null);
  const [checkingStatus, setCheckingStatus] = useState(true);

  const checkStatus = useCallback(async () => {
    setCheckingStatus(true);
    try {
      const status = await apiRequest<DbStatus>('/api/auth/status');
      setDbStatus(status);
    } catch (err) {
      setDbStatus({
        dbConfigured: false,
        dbConnected: false,
        dbError: err instanceof Error ? err.message : 'Unable to reach backend server.',
        needsSetup: false,
      });
    } finally {
      setCheckingStatus(false);
    }
  }, []);

  useEffect(() => {
    void checkStatus();
  }, [checkStatus]);

  const login = async (identifier: string, password: string, expectedRole?: UserRole) => {
    const res = await apiRequest<{
      token: string;
      user: AuthUser;
      settings: SchoolSettings;
    }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, expectedRole }),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setSettings(res.settings);
  };

  const setupAdmin = async (payload: {
    schoolName: string;
    name: string;
    email: string;
    password: string;
  }) => {
    const res = await apiRequest<{
      token: string;
      user: AuthUser;
      settings: SchoolSettings;
    }>('/api/auth/setup', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    setAuthToken(res.token);
    setUser(res.user);
    setSettings(res.settings);
    setDbStatus((prev) => (prev ? { ...prev, needsSetup: false } : prev));
  };

  const logout = () => {
    setAuthToken(null);
    setUser(null);
  };

  const updateSettingsState = (next: SchoolSettings) => {
    setSettings(next);
  };

  const updateUserState = (next: AuthUser) => {
    setUser(next);
  };

  const refreshMe = useCallback(async () => {
    const res = await apiRequest<{ user: AuthUser; settings: SchoolSettings }>('/api/auth/me');
    setUser(res.user);
    setSettings(res.settings);
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        settings,
        dbStatus,
        checkingStatus,
        checkStatus,
        login,
        setupAdmin,
        logout,
        updateSettingsState,
        updateUserState,
        refreshMe,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}
