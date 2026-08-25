import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { authApi } from '../lib/api';

export function useAuth() {
  const router = useRouter();
  const { token, user, setAuth, clearAuth, isLoading, setLoading, setError } = useAuthStore();

  const signup = async (fullName, email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.signup(fullName, email, password);
      if (data.token) {
        setAuth(data.token, data.user);
        router.push('/onboarding');
        return data;
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const signin = async (email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.signin(email, password);
      if (data.token) {
        setAuth(data.token, data.user);
        router.push('/dashboard');
        return data;
      }
      return data;
    } catch (err) {
      setError(err.message);
      throw err;
    } finally {
      setLoading(false);
    }
  };

  const logout = () => {
    clearAuth();
    router.push('/sign_in');
  };

  const fetchUser = async () => {
    if (!token) return null;
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.getMe();
      if (data.user) {
        useAuthStore.setState({ user: data.user });
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(data.user));
        }
      }
      return data;
    } catch (err) {
      clearAuth();
      throw err;
    } finally {
      setLoading(false);
    }
  };

  return {
    token,
    user,
    isLoading,
    error: useAuthStore((s) => s.error),
    signup,
    signin,
    logout,
    fetchUser,
    clearAuth,
  };
}
