import React, { createContext, useState, ReactNode } from "react";
import axiosInstance from "./axiosInstance";

interface AuthTokens {
  access: string | null;
  refresh: string | null;
}

interface AuthContextValue {
  authTokens: AuthTokens | null;
  loginUser: (username: string, password: string) => Promise<boolean>;
  logoutUser: () => void;
}

export const AuthContext = createContext<AuthContextValue>({
  authTokens: {
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  },
  loginUser: async () => false,
  logoutUser: () => {},
});

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [authTokens, setAuthTokens] = useState<AuthTokens | null>(() => ({
    access: localStorage.getItem("access_token"),
    refresh: localStorage.getItem("refresh_token"),
  }));

  const loginUser = async (username: string, password: string) => {
    try {
      const response = await axiosInstance.post<AuthTokens>("token/", { username, password });
      localStorage.setItem("access_token", response.data.access ?? "");
      localStorage.setItem("refresh_token", response.data.refresh ?? "");
      setAuthTokens(response.data);
      return true;
    } catch {
      return false;
    }
  };

  const logoutUser = () => {
    localStorage.removeItem("access_token");
    localStorage.removeItem("refresh_token");
    setAuthTokens(null);
  };

  return (
    <AuthContext.Provider value={{ authTokens, loginUser, logoutUser }}>
      {children}
    </AuthContext.Provider>
  );
};
