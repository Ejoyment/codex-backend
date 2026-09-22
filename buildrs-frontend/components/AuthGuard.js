import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { io } from 'socket.io-client';
import useAuthStore from '../store/authStore';
import { useAuth } from '../hooks/useAuth';
import { subscriptionApi } from '../lib/api';

export default function AuthGuard({ children }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { fetchUser } = useAuth();
  const socketRef = useRef(null);

  useEffect(() => {
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

      if (!subscription) {
        try {
          const subRes = await subscriptionApi.getCurrent();
          if (subRes.subscription) {
            useAuthStore.getState().setSubscription(subRes.subscription);
          }
        } catch (err) {
          // non-fatal — keep existing subscription
        }
      }

      if (!current?.onboardingCompleted) {
        router.replace('/onboarding');
      }
    };

    ensureUserAndRoute();
  }, [token, router, fetchUser, user, subscription]);

  useEffect(() => {
    if (!token || typeof window === 'undefined') return;

    const socket = io(process.env.NEXT_PUBLIC_SOCKET_URL || 'http://localhost:3000', {
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
  }, [token]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
