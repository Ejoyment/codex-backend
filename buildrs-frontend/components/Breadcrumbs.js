import Link from 'next/link';
import { ChevronRight } from 'lucide-react';

/**
 * Location trail for deep pages.
 *
 * items: [{ label, href? }] — the last item is the current page and is never a
 * link. `children` renders after the trail for page-specific chips (status,
 * priority) without duplicating the list markup.
 */
export default function Breadcrumbs({ items = [], children, className = '' }) {
  if (!items.length) return null;

  return (
    <nav aria-label="Breadcrumb" className={className}>
      <ol className="ws-page-crumbs">
        {items.map((item, index) => {
          const isLast = index === items.length - 1;
          return (
            <li key={`${item.label}-${index}`}>
              {item.href && !isLast ? (
                <Link href={item.href}>{item.label}</Link>
              ) : (
                <span aria-current={isLast ? 'page' : undefined}>{item.label}</span>
              )}
              {!isLast && <ChevronRight className="ws-crumb-sep" aria-hidden="true" />}
            </li>
          );
        })}
        {children}
      </ol>
    </nav>
  );
}
