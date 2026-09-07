import SiteHeader from './SiteHeader';
import SiteFooter from './SiteFooter';

export default function SiteShell({ children, footer = true }) {
  return (
    <div className="mkt min-h-screen overflow-x-hidden">
      <SiteHeader />
      {children}
      {footer && <SiteFooter />}
    </div>
  );
}