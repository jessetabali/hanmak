import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import AuthGuard from './components/layout/AuthGuard';
import Spinner from './components/ui/Spinner';

// SettingsLayout is a shared wrapper — keep static so nav renders immediately
import SettingsLayout from './pages/settings/SettingsLayout';

// ── Lazy page imports ─────────────────────────────────────────────────────────
// Each page becomes its own chunk. FormBuilder is the most important: it
// statically imports pdfjs-dist (~1.2 MB), so making it lazy removes pdfjs
// from the initial bundle entirely.

const Login          = lazy(() => import('./pages/Login'));
const PublicSigning  = lazy(() => import('./pages/signing/PublicSigning'));
const AccountSetup   = lazy(() => import('./pages/AccountSetup'));
const AcceptInvite   = lazy(() => import('./pages/AcceptInvite'));

const Dashboard      = lazy(() => import('./pages/Dashboard'));
const Inbox          = lazy(() => import('./pages/Inbox'));
const Search         = lazy(() => import('./pages/Search'));
const Profile        = lazy(() => import('./pages/Profile'));

const EnvelopeList   = lazy(() => import('./pages/envelopes/EnvelopeList'));
const EnvelopeDetail = lazy(() => import('./pages/envelopes/EnvelopeDetail'));

const TemplateList   = lazy(() => import('./pages/templates/TemplateList'));
const FormBuilder    = lazy(() => import('./pages/templates/FormBuilder'));

const Documents      = lazy(() => import('./pages/documents/Documents'));
const Signing        = lazy(() => import('./pages/signing/Signing'));
const WorkflowBuilder = lazy(() => import('./pages/workflow/WorkflowBuilder'));
const Approvals      = lazy(() => import('./pages/approvals/Approvals'));

const AuditTrail     = lazy(() => import('./pages/audit/AuditTrail'));
const EvidenceBundles = lazy(() => import('./pages/audit/EvidenceBundles'));

const Users          = lazy(() => import('./pages/admin/Users'));
const Organizations  = lazy(() => import('./pages/admin/Organizations'));
const Teams          = lazy(() => import('./pages/admin/Teams'));
const Roles          = lazy(() => import('./pages/admin/Roles'));

const General        = lazy(() => import('./pages/settings/General'));
const Branding       = lazy(() => import('./pages/settings/Branding'));
const Email          = lazy(() => import('./pages/settings/Email'));
const Storage        = lazy(() => import('./pages/settings/Storage'));
const Security       = lazy(() => import('./pages/settings/Security'));
const Notifications  = lazy(() => import('./pages/settings/Notifications'));
const SSO            = lazy(() => import('./pages/settings/SSO'));

const SystemHealth   = lazy(() => import('./pages/system/SystemHealth'));
const BackgroundTasks = lazy(() => import('./pages/system/BackgroundTasks'));
const ErrorLog       = lazy(() => import('./pages/system/ErrorLog'));

const LegalHolds     = lazy(() => import('./pages/compliance/LegalHolds'));
const Retention      = lazy(() => import('./pages/compliance/Retention'));
const DataResidency  = lazy(() => import('./pages/compliance/DataResidency'));
const ComplianceExports = lazy(() => import('./pages/compliance/ComplianceExports'));

const Billing        = lazy(() => import('./pages/billing/Billing'));
const License        = lazy(() => import('./pages/billing/License'));

const ApiKeys        = lazy(() => import('./pages/developer/ApiKeys'));
const OAuthApps      = lazy(() => import('./pages/developer/OAuthApps'));
const Webhooks       = lazy(() => import('./pages/developer/Webhooks'));
const ApiDocs        = lazy(() => import('./pages/developer/ApiDocs'));
const TestLab        = lazy(() => import('./pages/developer/TestLab'));
const EmailMessages  = lazy(() => import('./pages/developer/EmailMessages'));
const OperationsConsole = lazy(() => import('./pages/developer/OperationsConsole'));
const ReleaseControl = lazy(() => import('./pages/developer/ReleaseControl'));

// ── Suspense fallback ─────────────────────────────────────────────────────────

function PageLoader() {
  return (
    <div style={{ minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </div>
  );
}

function S({ children }) {
  return <Suspense fallback={<PageLoader />}>{children}</Suspense>;
}

// ── Router ────────────────────────────────────────────────────────────────────

export const router = createBrowserRouter([
  // Public routes
  { path: '/login',         element: <S><Login /></S> },
  { path: '/sign/:token',   element: <S><PublicSigning /></S> },
  { path: '/account-setup', element: <S><AccountSetup /></S> },
  { path: '/accept-invite', element: <S><AcceptInvite /></S> },

  // Authenticated app shell
  {
    path: '/',
    element: (
      <AuthGuard>
        <AppShell />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard',  element: <S><Dashboard /></S> },
      { path: 'inbox',      element: <S><Inbox /></S> },
      { path: 'search',     element: <S><Search /></S> },
      { path: 'profile',    element: <S><Profile /></S> },

      { path: 'envelopes',     element: <S><EnvelopeList /></S> },
      { path: 'envelopes/:id', element: <S><EnvelopeDetail /></S> },

      { path: 'templates',               element: <S><TemplateList /></S> },
      { path: 'form-builder/:templateId?', element: <S><FormBuilder /></S> },

      { path: 'documents', element: <S><Documents /></S> },
      { path: 'signing',   element: <S><Signing /></S> },
      { path: 'workflow',  element: <S><WorkflowBuilder /></S> },
      { path: 'approvals', element: <S><Approvals /></S> },

      { path: 'audit',            element: <S><AuditTrail /></S> },
      { path: 'evidence-bundles', element: <S><EvidenceBundles /></S> },

      // Admin
      { path: 'admin/users',         element: <S><Users /></S> },
      { path: 'admin/organizations',  element: <S><Organizations /></S> },
      { path: 'admin/teams',          element: <S><Teams /></S> },
      { path: 'admin/roles',          element: <S><Roles /></S> },

      // Settings (nested under SettingsLayout for shared sub-nav)
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general',       element: <S><General /></S> },
          { path: 'branding',      element: <S><Branding /></S> },
          { path: 'email',         element: <S><Email /></S> },
          { path: 'storage',       element: <S><Storage /></S> },
          { path: 'security',      element: <S><Security /></S> },
          { path: 'notifications', element: <S><Notifications /></S> },
          { path: 'sso',           element: <S><SSO /></S> },
        ],
      },

      // System
      { path: 'system/health',     element: <S><SystemHealth /></S> },
      { path: 'system/tasks',      element: <S><BackgroundTasks /></S> },
      { path: 'system/error-log',  element: <S><ErrorLog /></S> },

      // Compliance
      { path: 'compliance/legal-holds',    element: <S><LegalHolds /></S> },
      { path: 'compliance/retention',      element: <S><Retention /></S> },
      { path: 'compliance/data-residency', element: <S><DataResidency /></S> },
      { path: 'compliance/exports',        element: <S><ComplianceExports /></S> },

      // Billing
      { path: 'billing', element: <S><Billing /></S> },
      { path: 'license', element: <S><License /></S> },

      // Developer
      { path: 'developer/api-keys',        element: <S><ApiKeys /></S> },
      { path: 'developer/oauth-apps',      element: <S><OAuthApps /></S> },
      { path: 'developer/webhooks',        element: <S><Webhooks /></S> },
      { path: 'developer/api-docs',        element: <S><ApiDocs /></S> },
      { path: 'developer/test-lab',        element: <S><TestLab /></S> },
      { path: 'developer/email-messages',  element: <S><EmailMessages /></S> },
      { path: 'developer/operations',      element: <S><OperationsConsole /></S> },
      { path: 'developer/release-control', element: <S><ReleaseControl /></S> },
    ],
  },

  // Catch-all
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
