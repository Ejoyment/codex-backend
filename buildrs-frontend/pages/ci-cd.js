import DeploymentPage from '../components/DeploymentPage';

// Legacy route kept for backward compatibility (dashboard / tour links).
// The Deployment UI now lives in components/DeploymentPage and is served
// canonically at /deploy. This file renders the same page at /ci-cd.
export default function CiCd() {
  return <DeploymentPage />;
}
