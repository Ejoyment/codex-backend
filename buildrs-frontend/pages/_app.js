import 'xterm/css/xterm.css';
import '../styles/globals.css';
import '../styles/workspace.css';
import '../styles/marketing.css';
import '../styles/auth.css';
import { Inter } from 'next/font/google';
import ErrorBoundary from '../components/ErrorBoundary';
import { ToastContainer } from '../components/Toast';
import NotificationProvider from '../components/NotificationProvider';

const inter = Inter({ subsets: ['latin'] });

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <div className={inter.className}>
        <NotificationProvider>
          <Component {...pageProps} />
          <ToastContainer />
        </NotificationProvider>
      </div>
    </ErrorBoundary>
  );
}

export default MyApp;
