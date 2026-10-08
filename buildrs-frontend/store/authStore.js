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
        // Never persist a nullish token: setItem would store the literal
        // string "null" and rehydrate a broken session on reload.
        if (!token) {
          if (typeof window !== 'undefined') {
            localStorage.removeItem('authToken');
            localStorage.removeItem('auth-storage');
          }
          set({ token: null, user: user || null, subscription: null, error: null });
          return;
        }
        const current = get();
        const subscription = user && Object.prototype.hasOwnProperty.call(user, 'subscription')
          ? user.subscription
          : token === current.token ? current.subscription : null;
        if (typeof window !== 'undefined') {
          localStorage.setItem('authToken', token);
          localStorage.setItem('user', JSON.stringify(user));
          if (subscription) localStorage.setItem('subscription', JSON.stringify(subscription));
          else localStorage.removeItem('subscription');
        }
        set({ token, user, subscription, error: null });
      },

      updateUser: (userPatch) => {
        const current = get().user;
        const nextUser = current ? { ...current, ...userPatch } : userPatch;
        if (typeof window !== 'undefined') {
          localStorage.setItem('user', JSON.stringify(nextUser));
        }
        set({ user: nextUser });
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
          // Support-agent sessions live beside the user session — a shared
          // device logout must end both.
          localStorage.removeItem('supportAgent');
          localStorage.removeItem('supportAgentToken');
        }
        set({ token: null, user: null, subscription: null, error: null });
        // The zustand persist key MUST go too: persist() rehydrates
        // token/user from 'auth-storage' on the next load, so without this
        // logout → reload (or a shared device) resurrects the session.
        // Removed after set() so even the persist re-write is gone.
        if (typeof window !== 'undefined') {
          localStorage.removeItem('auth-storage');
        }
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
