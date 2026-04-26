// src/context/AuthContext.jsx
import { createContext, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { auth } from '../firebase';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser]     = useState(undefined); // undefined = loading
  const [token, setToken]   = useState(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const idToken = await firebaseUser.getIdToken();
        setToken(idToken);
        setUser(firebaseUser);

        // Refresh token every 55 minutes
        const interval = setInterval(async () => {
          const fresh = await firebaseUser.getIdToken(true);
          setToken(fresh);
        }, 55 * 60 * 1000);

        return () => clearInterval(interval);
      } else {
        setUser(null);
        setToken(null);
      }
    });
    return unsub;
  }, []);

  async function logout() {
    await signOut(auth);
  }

  return (
    <AuthContext.Provider value={{ user, token, logout, loading: user === undefined }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
