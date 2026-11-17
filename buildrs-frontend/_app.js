/**
 * Custom Next.js _app.js with Sentry error tracking.
 *
 * Wraps every page with Sentry React error boundary so unhandled React
 * errors are captured before users notice them. DSN-gated: no
 * NEXT_PUBLIC_SENTRY_DSN, no traffic.
 */

import React from 'react';
import Head from 'next/head';

// ============================================================
// Sentry React client SDK — DSN-gated. When NEXT_PUBLIC_SENTRY_DSN
// is absent this module silently does nothing; the app still works.
// ============================================================
let Sentry = null;
if (typeof window !== 'undefined' && process.env.NEXT_PUBLIC_SENTRY_DSN) {
    Sentry = require('@sentry/react');
    Sentry.init({
        dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
        environment: process.env.NEXT_PUBLIC_SENTRY_ENVIRONMENT || 'development',
        release: process.env.NEXT_PUBLIC_SENTRY_RELEASE || undefined,
        tracesSampleRate: parseFloat(process.env.NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE || '0'),
        // Don't send request bodies or query strings that may contain secrets.
        beforeSend(event, hint) {
            if (event.request && event.request.url) {
                try {
                    const url = new URL(event.request.url);
                    url.search = '';
                    event.request.url = url.toString();
                } catch {
                    // leave as-is
                }
            }
            return event;
        },
    });
    // Expose on window so pages/components can call Sentry.captureException directly.
    window.Sentry = Sentry;
    console.log('✓ Sentry React initialized');
} else if (typeof window !== 'undefined') {
    console.log('⚠ NEXT_PUBLIC_SENTRY_DSN not set — frontend error tracking disabled');
}

/**
 * Fallback UI shown when Sentry ErrorBoundary catches an error.
 */
function ErrorFallback({ error, eventId, resetError }) {
    return (
        <div
            style={{
                padding: 20,
                background: '#fee2e2',
                border: '1px solid #ef4444',
                borderRadius: 8,
                color: '#991b1b',
            }}
        >
            <h2>Something went wrong</h2>
            <p>{error.message}</p>
            <p>Event ID: {eventId}</p>
            <button
                onClick={() => {
                    resetError();
                    window.location.reload();
                }}
                style={{
                    background: '#ef4444',
                    color: '#fff',
                    border: 'none',
                    padding: '8px 16px',
                    borderRadius: 4,
                    cursor: 'pointer',
                }}
            >
                Try again
            </button>
        </div>
    );
}

function MyApp({ Component, pageProps }) {
    // Capture unhandled React errors via Sentry ErrorBoundary.
    // If Sentry is not configured, render children directly.
    const WrappedComponent = Sentry
        ? Sentry.ErrorBoundary
            ? ({ children }) => (
                  <Sentry.ErrorBoundary
                      fallback={ErrorFallback}
                      onError={(error, eventId) => {
                          console.error('Sentry captured error:', error.message, 'eventId:', eventId);
                      }}
                  >
                      {children}
                  </Sentry.ErrorBoundary>
              )
            : ({ children }) => <>{children}</>
        : ({ children }) => <>{children}</>;

    return (
        <>
            <Head>
                <title>BuildrsHQ</title>
                <link rel="icon" href="/buildrs.png" />
            </Head>
            <WrappedComponent>
                <Component {...pageProps} />
            </WrappedComponent>
        </>
    );
}

export default MyApp;
