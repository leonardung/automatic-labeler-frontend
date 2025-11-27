import React, { useContext, ReactElement } from "react";
import { Navigate } from "react-router-dom";
import { AuthContext } from "./AuthContext";

interface PrivateRouteProps {
  children: ReactElement;
}

const PrivateRoute: React.FC<PrivateRouteProps> = ({ children }) => {
  const { authTokens } = useContext(AuthContext);
  return authTokens?.access ? children : <Navigate to="/login" />;
};

export default PrivateRoute;
