import './sidebar.js';
import './ui.js';

import { supabase } from './supabase.js';
import { getCachedProfile, requireAuth, signOutAndGoLogin } from './auth-guard.js';

function initials(name, email) {
  const text = (name || email || 'U').trim();
  const parts = text.split(' ').filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return text.slice(0, 2).toUpperCase();
}

function closeMenu() {
  const existing = document.querySelector('.user-menu-popover');
  if (existing) existing.remove();
  document.removeEventListener('click', handleOutsideClick, true);
}

function handleOutsideClick(event) {
  const popover = document.querySelector('.user-menu-popover');
  if (!popover) return;
  if (popover.contains(event.target)) return;
  closeMenu();
}

function openMenu(trigger, profile) {
  closeMenu();

  const rect = trigger.getBoundingClientRect();
  const menu = document.createElement('div');
  menu.className = 'user-menu-popover';
  menu.style.top = `${Math.min(window.innerHeight - 260, rect.bottom + 8)}px`;
  menu.style.left = `${Math.max(12, rect.left)}px`;

  const roleTag = String(profile.role_name || '').toLowerCase() === 'master' ? 'MASTER' : 'EDITOR';
  const canManageUsers = Boolean(profile.can_manage_users) && profile.account_status === 'active';

  menu.innerHTML = `
    <div class="user-menu-head">
      <div class="user-menu-avatar">${initials(profile.full_name, profile.email)}</div>
      <div>
        <p class="user-menu-name">${profile.full_name || 'Usuário'}</p>
        <p class="user-menu-email">${profile.email || ''}</p>
        <span class="user-role-tag">${roleTag}</span>
      </div>
    </div>
    <div class="user-menu-list">
      <button type="button" class="user-menu-btn" data-action="account">Minha conta</button>
      <button type="button" class="user-menu-btn" data-action="password">Alterar senha</button>
      ${canManageUsers ? '<button type="button" class="user-menu-btn" data-action="users">Gerenciar usuários</button>' : ''}
      <button type="button" class="user-menu-btn danger" data-action="logout">Sair</button>
    </div>
  `;

  menu.addEventListener('click', async (event) => {
    const actionButton = event.target.closest('[data-action]');
    if (!actionButton) return;
    const action = actionButton.getAttribute('data-action');

    if (action === 'account') {
      window.location.href = 'minha-conta.html';
      return;
    }
    if (action === 'password') {
      window.location.href = './redefinir-senha.html?mode=change';
      return;
    }
    if (action === 'users') {
      window.location.href = 'usuarios.html';
      return;
    }
    if (action === 'logout') {
      await signOutAndGoLogin();
    }
  });

  document.body.appendChild(menu);
  setTimeout(() => document.addEventListener('click', handleOutsideClick, true), 0);
}

async function initUserMenu() {
  const current = window.location.pathname.split('/').pop() || '';
  if (['login.html', 'esqueci-senha.html', 'redefinir-senha.html', 'auth-callback.html'].includes(current)) {
    return;
  }

  const { profile } = await requireAuth();
  if (!profile) return;

  const profileName = document.querySelector('.profile-name');
  const profileRole = document.querySelector('.profile-role');
  const profileAvatar = document.querySelector('.profile-avatar');

  if (profileName) profileName.textContent = profile.full_name || 'Usuário';
  if (profileRole) profileRole.textContent = String(profile.role_name || 'editor').toUpperCase();
  if (profileAvatar) profileAvatar.textContent = initials(profile.full_name, profile.email);

  const settingsLink = document.querySelector('.sidebar-nav .nav-item[data-nav-key="configuracoes"]');
  if (!settingsLink) return;

  settingsLink.addEventListener('click', async (event) => {
    event.preventDefault();

    const cached = getCachedProfile();
    if (cached) {
      openMenu(settingsLink, cached);
      return;
    }

    const { profile: freshProfile } = await requireAuth();
    if (freshProfile) openMenu(settingsLink, freshProfile);
  });
}

await initUserMenu();

export async function logout() {
  await supabase.auth.signOut();
  window.location.href = './login.html';
}
