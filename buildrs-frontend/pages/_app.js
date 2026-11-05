import 'xterm/css/xterm.css';
import '../styles/design-tokens.css';
import '../styles/globals.css';
import '../styles/workspace.css';
import '../styles/figma.css';
import '../styles/marketing.css';
import '../styles/auth.css';
import { Inter, Roboto_Mono } from 'next/font/google';
import ErrorBoundary from '../components/ErrorBoundary';
import { ToastContainer } from '../components/Toast';
import NotificationProvider from '../components/NotificationProvider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const robotoMono = Roboto_Mono({ subsets: ['latin'], variable: '--font-roboto-mono', display: 'swap' });

function MyApp({ Component, pageProps }) {
  return (
    <ErrorBoundary>
      <div className={`${inter.variable} ${robotoMono.variable} ${inter.className}`}>
        <NotificationProvider>
          <Component {...pageProps} />
          <ToastContainer />
        </NotificationProvider>
      </div>
    </ErrorBoundary>
  );
}

export default MyApp;
