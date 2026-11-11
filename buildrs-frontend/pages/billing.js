import Head from 'next/head';
import { useRouter } from 'next/router';
import Sidebar from '../components/Sidebar';
import AuthGuard from '../components/AuthGuard';
import BillingPanel from '../components/BillingPanel';
import useAuthStore from '../store/authStore';
import useToastStore from '../store/toastStore';

export default function Billing() {
  const router = useRouter();
  const user = useAuthStore((s) => s.user);
  const subscription = useAuthStore((s) => s.subscription);
  const toast = useToastStore();

  return (
    <AuthGuard>
      <Head>
        <title>Billing &amp; Plans - BuildrsHQ</title>
        <link rel="icon" href="/buildrs.png" />
      </Head>

      <div className="workspace-container">
        <Sidebar user={user} subscription={subscription} />

        <main className="workspace-main">
          <div className="workspace-content set-page">
            <header className="set-page-head bill-page-head">
              <div>
                <p className="set-breadcrumb">Manage <span>/</span> Billing &amp; Plans</p>
                <h1 className="set-title">Billing &amp; Plans</h1>
                <p className="set-subtitle">Manage your subscriptions, statements, and payment method</p>
              </div>
            </header>

            <div className="set-body">
              <BillingPanel router={router} toast={toast} />
            </div>
          </div>
        </main>
      </div>
    </AuthGuard>
  );
}
