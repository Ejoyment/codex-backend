import Link from 'next/link';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';

export default function ModernHeader({ navigation = [], ctaButtons = [] }) {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <header className="modern-header">
      <div className="max-w-7xl mx-auto px-6 sm:px-8 lg:px-10">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="flex items-center space-x-3 group">
            <div className="w-20 h-10 flex items-center justify-center">
              <img src="/buildrs.png" alt="BuildrsHQ" className="w-20 h-16" />
            </div>
            <span className="text-xl font-bold bg-gradient-to-r from-white to-gray-300 bg-clip-text text-transparent">
              BuildrsHQ
            </span>
          </Link>

          <nav className="hidden lg:flex items-center space-x-1">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="nav-link px-4 py-2 rounded-lg text-gray-300 hover:text-white hover:bg-white/5"
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="hidden lg:flex items-center space-x-3">
            {ctaButtons.map((btn) => (
              <Link
                key={btn.href}
                href={btn.href}
                className={btn.primary ? 'cta-button px-6 py-2.5 rounded-lg text-white font-medium' : 'px-6 py-2.5 rounded-lg text-white hover:bg-white/5 transition-all duration-200 font-medium'}
              >
                {btn.label}
              </Link>
            ))}
          </div>

          <button
            type="button"
            className="lg:hidden p-2 rounded-lg hover:bg-white/5 transition-colors"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle mobile menu"
          >
            {mobileMenuOpen ? <X className="w-6 h-6 text-white" /> : <Menu className="w-6 h-6 text-white" />}
          </button>
        </div>
      </div>

      {mobileMenuOpen && (
        <div className="lg:hidden border-t border-white/10 bg-navy-dark/95 backdrop-blur-lg">
          <div className="max-w-7xl mx-auto px-4 py-4 space-y-2">
            {navigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className="block px-4 py-3 rounded-lg text-gray-300 hover:text-white hover:bg-white/5 transition-all"
                onClick={() => setMobileMenuOpen(false)}
              >
                {item.label}
              </Link>
            ))}
            <div className="pt-4 space-y-2">
              {ctaButtons.map((btn) => (
                <Link
                  key={btn.href}
                  href={btn.href}
                  className={btn.primary ? 'cta-button block px-4 py-3 rounded-lg text-center text-white font-medium' : 'block px-4 py-3 rounded-lg text-center text-white hover:bg-white/5 transition-all font-medium'}
                  onClick={() => setMobileMenuOpen(false)}
                >
                  {btn.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
