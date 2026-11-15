import Breadcrumbs from './Breadcrumbs';

/**
 * Standard page header: location trail, title, one-line description, primary
 * action. `className` carries the page's existing layout wrapper (sticky bar,
 * max width) so only the content structure is shared.
 */
export default function PageHeader({
  breadcrumbs,
  title,
  description,
  actions,
  meta,
  className = '',
  titleId,
}) {
  return (
    <header className={`ws-page-head ${className}`.trim()}>
      <div className="ws-page-head-text">
        {breadcrumbs?.length ? <Breadcrumbs items={breadcrumbs} /> : null}
        <h1 className="ws-page-title" id={titleId}>{title}</h1>
        {description ? <p className="ws-page-desc">{description}</p> : null}
        {meta ? <div className="ws-page-meta">{meta}</div> : null}
      </div>
      {actions ? <div className="ws-page-actions">{actions}</div> : null}
    </header>
  );
}
