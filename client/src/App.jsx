// src/App.jsx
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';

import Layout        from './components/Layout';
import ProtectedRoute from './components/ProtectedRoute';

import Landing     from './pages/Landing';
import Auth        from './pages/Auth';
import Dashboard   from './pages/Dashboard';
import Education   from './pages/Education';
import AIKeys      from './pages/AIKeys';
import Preferences from './pages/Preferences';
import Profile     from './pages/Profile';

export default function App() {
  const { loading } = useAuth();

  if (loading) {
    return (
      <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh' }}>
        <div className="spinner spinner-lg" />
      </div>
    );
  }

  return (
    <Routes>
      {/* Public */}
      <Route path="/"     element={<Landing />} />
      <Route path="/auth" element={<Auth />} />

      {/* Protected */}
      <Route element={<ProtectedRoute />}>
        <Route element={<Layout />}>
          <Route path="/dashboard"   element={<Dashboard />} />
          <Route path="/education"   element={<Education />} />
          <Route path="/ai-keys"     element={<AIKeys />} />
          <Route path="/preferences" element={<Preferences />} />
          <Route path="/profile"     element={<Profile />} />
        </Route>
      </Route>

      {/* Fallback */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
