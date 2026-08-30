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

    if (user) {
      if (!subscription) {
        subscriptionApi.getCurrent()
          .then((res) => {
            if (res.subscription) useAuthStore.getState().setSubscription(res.subscription);
          })
          .catch(() => {});
      }
      if (!user.onboardingCompleted) {
        router.replace('/onboarding');
      }
      return;
    }

    fetchUser().then((data) => {
      if (data.user && !data.user.onboardingCompleted) {
        router.replace('/onboarding');
      }
    }).catch(() => {
      router.replace('/sign_in');
    });
  }, [token, router, fetchUser, user, subscription]);

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-navy">
        <div className="text-white">Loading...</div>
      </div>
    );
  }

  return <>{children}</>;
}
