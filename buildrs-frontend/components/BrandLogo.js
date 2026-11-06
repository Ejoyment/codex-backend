export default function BrandLogo({
  className = '',
  imageClassName = 'h-6 w-6 rounded',
  textClassName = 'text-[15px] font-semibold tracking-tight text-white',
  showHq = true,
}) {
  return (
    <span className={`flex items-center gap-2.5 ${className}`.trim()}>
      <img src="/buildrs.png" alt="BuildrsHQ" className={imageClassName} />
      <span className={textClassName}>Buildrs</span>
      {showHq && (
        <span className="mkt-mono text-[10px] uppercase tracking-widest text-[#748194]">
          · hq
        </span>
      )}
    </span>
  );
}
