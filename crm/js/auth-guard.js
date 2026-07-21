import { supabase, loadCurrentUserPermissions } from './supabase.js';

const PUBLIC_PAGES = new Set([
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

function toLogin(message) {
  const url = new URL('login.html', window.location.href);
  if (message) url.searchParams.set('msg', message);
  window.location.replace(url.toString());
}

function toDashboard() {
  window.location.replace('dashboard.html');
}

function toPrimeiroAcesso() {
  window.location.replace('primeiro-acesso.html');
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
    data: { user },
    error: userError
  } = await supabase.auth.getUser();

  if (!user || userError) {
    return { session: null, profile: null };
  }

  try {
    const { perfil } = await loadCurrentUserPermissions();
    return { session: { user }, profile: perfil };
  } catch {
    return { session: { user }, profile: null };
  }
}

async function invalidateWithMessage(message) {
  await supabase.auth.signOut();
  clearProfileCache();
  toLogin(message);
}

export async function requireAuth() {
  const currentPage = pageName();
  const isPublic = PUBLIC_PAGES.has(currentPage);

  const { session, profile } = await loadSessionProfile();

  if (!session) {
    clearProfileCache();
    if (!isPublic) toLogin('not-authenticated');
    return { session: null, profile: null };
  }

  if (!profile) {
    if (isPublic) return { session, profile: null };
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

  if (!isPublic && profile.must_change_password && currentPage !== 'primeiro-acesso.html') {
    toPrimeiroAcesso();
    return { session, profile };
  }

  if (currentPage === 'primeiro-acesso.html' && !profile.must_change_password) {
    toDashboard();
    return { session, profile };
  }

  if (isPublic && !profile.must_change_password && currentPage !== 'auth-callback.html') {
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

if (!PUBLIC_PAGES.has(pageName())) {
  await requireAuth();
}

supabase.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_OUT' && !PUBLIC_PAGES.has(pageName())) {
    clearProfileCache();
    toLogin('signed-out');
  }
});
