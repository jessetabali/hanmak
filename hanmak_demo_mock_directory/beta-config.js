window.HANMAK_FRONTEND_CONFIG = {
  mode: localStorage.getItem('HANMAK_FRONTEND_MODE') || 'beta',
  requireAuth: true,
  allowDemoAutoLogin: false,
  allowPlaceholderDocuments: false,
  apiBaseUrl: localStorage.getItem('HANMAK_API_BASE_URL') || '',
};
