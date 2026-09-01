import '../styles/globals.css';
import '../styles/workspace.css';
import { Inter } from 'next/font/google';
import ErrorBoundary from '../components/ErrorBoundary';
import { ToastContainer } from '../components/Toast';

const inter = Inter({ subsets: ['latin'] });

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <div className={inter.className}>
        <Component {...pageProps} />
        <ToastContainer />
      </div>
    </ErrorBoundary>
  );
}

export default MyApp;
