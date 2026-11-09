import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import { useAuth } from '../hooks/useAuth';
import { isDemoTourActive, subscriptionApi, SOCKET_URL } from '../lib/api';

export default function AuthGuard({ children }) {
  const router = useRouter();
  const [hasHydrated, setHasHydrated] = useState(false);
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { fetchUser } = useAuth();
  const demoTour = isDemoTourActive();
  const socketRef = useRef(null);
  const subscriptionLoadedForToken = useRef(null);

  useEffect(() => {
    setHasHydrated(true);
  }, []);

  useEffect(() => {
    if (!hasHydrated) return;
    if (demoTour) return;
    if (!token) {
      router.replace('/sign_in');
      return;
    }

    const ensureUserAndRoute = async () => {
      let current = user;
      if (!current) {
        try {
          const data = await fetchUser();
          current = data.user;
        } catch (err) {
          if (err.status === 401) {
            router.replace('/sign_in');
          }
          return;
        }
      }

      if (subscriptionLoadedForToken.current !== token) {
        subscriptionLoadedForToken.current = token;
        try {
          const subRes = await subscriptionApi.getCurrent();
          if (subRes.subscription) {
            useAuthStore.getState().setSubscription(subRes.subscription);
          }
        } catch (err) {
          // non-fatal — keep existing subscription
        }
      }

      // Redirecting to the route we are already on re-triggers a route change on
      // every render, and Next's head commit resets window scroll each time —
      // which made /onboarding impossible to scroll. Only bounce from elsewhere.
      if (current && !current.onboardingCompleted && router.pathname !== '/onboarding') {
        router.replace('/onboarding');
      }
    };

    ensureUserAndRoute();
  }, [demoTour, token, router, fetchUser, user, subscription]);

  useEffect(() => {
    if (!token || demoTour || typeof window === 'undefined') return;

    const socket = io(SOCKET_URL, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socketRef.current = socket;

    const handleProfileUpdate = ({ userId, ...profileData }) => {
      const currentUser = useAuthStore.getState().user;
      const currentUserId = String(currentUser?._id || currentUser?.id || currentUser?.userId || '');
      if (!currentUserId || String(userId) !== currentUserId) return;

      const nextUser = { ...currentUser, ...profileData };
      useAuthStore.getState().updateUser(nextUser);
    };

    socket.on('profile-updated', handleProfileUpdate);

    return () => {
      socket.off('profile-updated', handleProfileUpdate);
      socket.disconnect();
      socketRef.current = null;
    };
  }, [demoTour, token]);

  if (!hasHydrated || (!token && !demoTour)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
