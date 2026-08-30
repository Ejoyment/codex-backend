import { useState, useEffect, useCallback } from 'react';
import { apiFetch } from '../lib/api';
import { Building2 } from 'lucide-react';

/**
 * Shared hook for Bug 5 — single pattern for workspace/company membership checks.
 * Reuses /api/company/my-companies (same call teams.js already makes).
 * Returns stable shape so every workspace page can render a consistent
 * "no workspace" empty state.
 */
export function useCurrentCompany() {
  const [companies, setCompanies] = useState(null); // null = not yet loaded
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchCompanies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch('/api/company/my-companies');
      setCompanies(res.companies || []);
    } catch (err) {
      setError(err.message || 'Failed to load workspace');
      setCompanies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCompanies();
  }, [fetchCompanies]);

  const hasCompany = Array.isArray(companies) && companies.length > 0;
  const selectedCompany = hasCompany ? companies[0] : null;

  return {
    companies: companies || [],
    selectedCompany,
    hasCompany,
    loading,
    error,
    refetch: fetchCompanies,
  };
}

export function NoWorkspaceEmptyState({ onCreateClick, message } = {}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center">
      <div className="w-16 h-16 rounded-2xl bg-blue-500/20 flex items-center justify-center mb-6">
        <Building2 className="w-8 h-8 text-blue-400" />
      </div>
      <h2 className="text-xl font-bold text-white mb-2">You&apos;re not part of a workspace yet</h2>
      <p className="text-gray-400 max-w-sm mb-6">
        {message || 'Create or join a workspace to access this feature.'}
      </p>
      {onCreateClick && (
        <button type="button" onClick={onCreateClick} className="cta-button px-6 py-3 rounded-lg text-white font-medium">
          Create Workspace
        </button>
      )}
    </div>
  );
}
