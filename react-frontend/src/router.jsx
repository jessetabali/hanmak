import { createBrowserRouter, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell';
import AuthGuard from './components/layout/AuthGuard';

// Auth pages (no shell)
import Login from './pages/Login';

// Public signing (no auth, no shell)
import PublicSigning from './pages/signing/PublicSigning';

// App pages (require auth, rendered inside AppShell)
import Dashboard from './pages/Dashboard';
import Inbox from './pages/Inbox';
import Search from './pages/Search';
import Profile from './pages/Profile';

import EnvelopeList from './pages/envelopes/EnvelopeList';
import EnvelopeDetail from './pages/envelopes/EnvelopeDetail';

import TemplateList from './pages/templates/TemplateList';
import FormBuilder from './pages/templates/FormBuilder';

import Documents from './pages/documents/Documents';

import Signing from './pages/signing/Signing';

import WorkflowBuilder from './pages/workflow/WorkflowBuilder';

import Approvals from './pages/approvals/Approvals';

import AuditTrail from './pages/audit/AuditTrail';
import EvidenceBundles from './pages/audit/EvidenceBundles';

import Users from './pages/admin/Users';
import Organizations from './pages/admin/Organizations';
import Teams from './pages/admin/Teams';
import Roles from './pages/admin/Roles';

import SettingsLayout from './pages/settings/SettingsLayout';
import General from './pages/settings/General';
import Branding from './pages/settings/Branding';
import Email from './pages/settings/Email';
import Storage from './pages/settings/Storage';
import Security from './pages/settings/Security';
import Notifications from './pages/settings/Notifications';
import SSO from './pages/settings/SSO';

import SystemHealth from './pages/system/SystemHealth';
import BackgroundTasks from './pages/system/BackgroundTasks';

import LegalHolds from './pages/compliance/LegalHolds';
import Retention from './pages/compliance/Retention';
import DataResidency from './pages/compliance/DataResidency';
import ComplianceExports from './pages/compliance/ComplianceExports';

import Billing from './pages/billing/Billing';
import License from './pages/billing/License';

import ApiKeys from './pages/developer/ApiKeys';
import OAuthApps from './pages/developer/OAuthApps';
import Webhooks from './pages/developer/Webhooks';
import ApiDocs from './pages/developer/ApiDocs';
import TestLab from './pages/developer/TestLab';
import EmailMessages from './pages/developer/EmailMessages';
import OperationsConsole from './pages/developer/OperationsConsole';
import ReleaseControl from './pages/developer/ReleaseControl';

export const router = createBrowserRouter([
  // Public routes
  { path: '/login', element: <Login /> },
  { path: '/sign/:token', element: <PublicSigning /> },

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
      { path: 'dashboard', element: <Dashboard /> },
      { path: 'inbox', element: <Inbox /> },
      { path: 'search', element: <Search /> },
      { path: 'profile', element: <Profile /> },

      { path: 'envelopes', element: <EnvelopeList /> },
      { path: 'envelopes/:id', element: <EnvelopeDetail /> },

      { path: 'templates', element: <TemplateList /> },
      { path: 'form-builder/:templateId?', element: <FormBuilder /> },

      { path: 'documents', element: <Documents /> },

      { path: 'signing', element: <Signing /> },

      { path: 'workflow', element: <WorkflowBuilder /> },

      { path: 'approvals', element: <Approvals /> },

      { path: 'audit', element: <AuditTrail /> },
      { path: 'evidence-bundles', element: <EvidenceBundles /> },

      // Admin
      { path: 'admin/users', element: <Users /> },
      { path: 'admin/organizations', element: <Organizations /> },
      { path: 'admin/teams', element: <Teams /> },
      { path: 'admin/roles', element: <Roles /> },

      // Settings (nested under SettingsLayout for shared sub-nav)
      {
        path: 'settings',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="general" replace /> },
          { path: 'general', element: <General /> },
          { path: 'branding', element: <Branding /> },
          { path: 'email', element: <Email /> },
          { path: 'storage', element: <Storage /> },
          { path: 'security', element: <Security /> },
          { path: 'notifications', element: <Notifications /> },
          { path: 'sso', element: <SSO /> },
        ],
      },

      // System
      { path: 'system/health', element: <SystemHealth /> },
      { path: 'system/tasks', element: <BackgroundTasks /> },

      // Compliance
      { path: 'compliance/legal-holds', element: <LegalHolds /> },
      { path: 'compliance/retention', element: <Retention /> },
      { path: 'compliance/data-residency', element: <DataResidency /> },
      { path: 'compliance/exports', element: <ComplianceExports /> },

      // Billing
      { path: 'billing', element: <Billing /> },
      { path: 'license', element: <License /> },

      // Developer
      { path: 'developer/api-keys', element: <ApiKeys /> },
      { path: 'developer/oauth-apps', element: <OAuthApps /> },
      { path: 'developer/webhooks', element: <Webhooks /> },
      { path: 'developer/api-docs', element: <ApiDocs /> },
      { path: 'developer/test-lab', element: <TestLab /> },
      { path: 'developer/email-messages', element: <EmailMessages /> },
      { path: 'developer/operations', element: <OperationsConsole /> },
      { path: 'developer/release-control', element: <ReleaseControl /> },
    ],
  },

  // Catch-all
  { path: '*', element: <Navigate to="/dashboard" replace /> },
]);
