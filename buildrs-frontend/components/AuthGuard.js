import { useEffect } from 'react';
import { useRouter } from 'next/router';
import useAuthStore from '../store/authStore';
import { useAuth } from '../hooks/useAuth';

export default function AuthGuard({ children }) {
  const router = useRouter();
  const token = useAuthStore((s) => s.token);
  const user = useAuthStore((s) => s.user);
  const { fetchUser } = useAuth();

  useEffect(() => {
    if (!token) {
      router.replace('/sign_in');
      return;
    }

    if (user) {
      return;
    }

    fetchUser().catch(() => {
      router.replace('/sign_in');
    });
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
