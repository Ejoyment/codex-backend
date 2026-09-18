import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set, get) => ({
      token: typeof window !== 'undefined' ? localStorage.getItem('authToken') : null,
      user: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || 'null') : null,
      subscription: typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('subscription') || 'null') : null,
      isLoading: false,
      error: null,

      setAuth: (token, user) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('authToken', token);
          localStorage.setItem('user', JSON.stringify(user));
        }
        set({ token, user, error: null });
      },

      setSubscription: (subscription) => {
        if (typeof window !== 'undefined') {
          localStorage.setItem('subscription', JSON.stringify(subscription));
        }
        set({ subscription });
      },

      clearAuth: () => {
        if (typeof window !== 'undefined') {
          localStorage.removeItem('authToken');
          localStorage.removeItem('user');
          localStorage.removeItem('subscription');
        }
        set({ token: null, user: null, subscription: null, error: null });
      },

      setLoading: (isLoading) => set({ isLoading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        token: state.token,
        user: state.user,
        subscription: state.subscription,
      }),
    }
  )
);

export default useAuthStore;
