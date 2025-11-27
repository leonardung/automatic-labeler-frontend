import React from 'react';
import { Routes, Route } from 'react-router-dom';
import { AuthProvider } from './AuthContext';
import LoginPage from './pages/LoginPage';
import ProjectPage from './pages/ProjectPage';
import ProjectDetailPage from './pages/ProjectDetailPage';
import PrivateRoute from './PrivateRoute';

function App() {
  return (
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={
          <PrivateRoute>
            <ProjectPage />
          </PrivateRoute>
        }
        />
        <Route path="/projects/:projectId" element={
          <PrivateRoute>
            <ProjectDetailPage />
          </PrivateRoute>
        }
        />
      </Routes>
    </AuthProvider>
  );
}

export default App;