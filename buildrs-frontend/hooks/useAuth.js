import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { authApi, subscriptionApi } from '../lib/api';

export function useAuth() {
  const router = useRouter();
  const { token, user, setAuth, clearAuth, isLoading, setLoading, setError } = useAuthStore();

  const signup = async (fullName, email, password) => {
    setLoading(true);
    setError(null);
    try {
      const data = await authApi.signup(fullName, email, password);
      return data;
    } catch (err) {
      if (err.data?.message) {
        setError(err.data.message);
      } else {
        setError(err.message);
      }
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
        if (data.user?.onboardingCompleted) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
        return data;
      }
      if (data.requiresVerification) {
        return data;
      }
      setError(data.message || 'Sign in failed');
      return data;
    } catch (err) {
      if (err.status === 401) {
        setError('Invalid email or password');
      } else if (err.data?.message) {
        setError(err.data.message);
      } else {
        setError(err.message);
      }
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
      try {
        const subRes = await subscriptionApi.getCurrent();
        if (subRes.subscription) {
          useAuthStore.getState().setSubscription(subRes.subscription);
        }
      } catch {
        // non-fatal — keep existing subscription
      }
      return data;
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
      }
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
