import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { useAuth } from '../hooks/useAuth';
import { subscriptionApi } from '../lib/api';

export default function AuthGuard({ children }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const { fetchUser } = useAuth();

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

      if (!current?.onboardingCompleted) {
        router.replace('/onboarding');
      }
    };

    ensureUserAndRoute();
  }, [token, router, fetchUser, user]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
