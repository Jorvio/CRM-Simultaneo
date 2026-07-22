import { supabase, loadCurrentUserPermissions } from './supabase.js';

const PUBLIC_PAGES = new Set([
  'index.html',
  'login.html',
  'esqueci-senha.html',
  'redefinir-senha.html',
  'auth-callback.html'
]);

const PROFILE_CACHE_KEY = 'crm_profile';

function pageName() {
  const path = window.location.pathname;
  return path.split('/').pop() || 'index.html';
}

function isPublicPage(name = pageName()) {
  return PUBLIC_PAGES.has(name);
}

function toLogin(message) {
  const url = new URL('./login.html', window.location.href);
  if (message) url.searchParams.set('msg', message);
  window.location.replace(url.toString());
}

function toDashboard() {
  window.location.replace('./dashboard.html');
}

function toPrimeiroAcesso() {
  window.location.replace('./primeiro-acesso.html');
}

function cacheProfile(profile) {
  sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(profile));
}

function clearProfileCache() {
  sessionStorage.removeItem(PROFILE_CACHE_KEY);
}

export function getCachedProfile() {
  const raw = sessionStorage.getItem(PROFILE_CACHE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function loadSessionProfile() {
  const {
    data: { session },
    error
  } = await supabase.auth.getSession();

  if (error) {
    console.error('[auth-guard getSession]', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });
  }

  if (error || !session) {
    return { session: null, profile: null };
  }

  try {
    const { perfil } = await loadCurrentUserPermissions();
    return { session, profile: perfil };
  } catch (profileError) {
    console.error('[auth-guard loadCurrentUserPermissions]', {
      code: profileError?.code,
      message: profileError?.message,
      details: profileError?.details,
      hint: profileError?.hint
    });
    return { session, profile: null };
  }
}

async function invalidateWithMessage(message) {
  await supabase.auth.signOut();
  clearProfileCache();
  toLogin(message);
}

export async function requireAuth() {
  const currentPage = pageName();
  const publicPage = isPublicPage(currentPage);

  const { session, profile } = await loadSessionProfile();

  if (!session) {
    clearProfileCache();
    if (!publicPage) toLogin('not-authenticated');
    return { session: null, profile: null };
  }

  if (!profile) {
    if (publicPage) return { session, profile: null };
    await invalidateWithMessage('no-profile');
    return { session: null, profile: null };
  }

  cacheProfile(profile);

  if (profile.account_status === 'blocked') {
    await invalidateWithMessage('blocked');
    return { session: null, profile: null };
  }

  if (profile.account_status === 'pending') {
    await invalidateWithMessage('pending');
    return { session: null, profile: null };
  }

  if (profile.account_status !== 'active') {
    await invalidateWithMessage('inactive');
    return { session: null, profile: null };
  }

  if (!publicPage && profile.must_change_password && currentPage !== 'primeiro-acesso.html') {
    toPrimeiroAcesso();
    return { session, profile };
  }

  if (currentPage === 'primeiro-acesso.html' && !profile.must_change_password) {
    toDashboard();
    return { session, profile };
  }

  if (
    publicPage &&
    !profile.must_change_password &&
    currentPage !== 'auth-callback.html' &&
    currentPage !== 'redefinir-senha.html'
  ) {
    toDashboard();
    return { session, profile };
  }

  return { session, profile };
}

export async function signOutAndGoLogin() {
  await supabase.auth.signOut();
  clearProfileCache();
  toLogin('signed-out');
}

if (!window.crmAuthReady) {
  window.crmAuthReady = requireAuth();
}

if (!window.__crmAuthGuardInitialized) {
  window.__crmAuthGuardInitialized = true;

  if (!isPublicPage()) {
    await window.crmAuthReady;
  }

  supabase.auth.onAuthStateChange((event) => {
    if (event === 'SIGNED_OUT' && !isPublicPage()) {
      clearProfileCache();
      toLogin('signed-out');
    }
  });
}
