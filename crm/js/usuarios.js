import { supabase } from '../../bd/supabase.js';
import { requireAuth, getCachedProfile } from './auth-guard.js';

const ADMIN_EMAIL = 'juana.virgesint@gmail.com';

function byId(id) {
  return document.getElementById(id);
}

function fmtDate(value) {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('pt-BR');
}

function showBanner(message, type = 'info') {
  const box = byId('usersMessage');
  if (!box) return;
  box.textContent = message;
  box.className = type === 'error' ? 'auth-error' : type === 'success' ? 'auth-success' : 'auth-info';
  box.classList.remove('is-hidden');
}

function clearBanner() {
  const box = byId('usersMessage');
  if (!box) return;
  box.classList.add('is-hidden');
  box.textContent = '';
}

function disableBtn(button, disabled, textWhenDisabled) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = disabled;
  if (disabled) button.textContent = textWhenDisabled;
  else button.textContent = button.dataset.defaultText;
}

async function loadUsers() {
  const tbody = byId('usersTableBody');
  if (!tbody) return;

  clearBanner();
  tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Carregando usuários...</div></td></tr>';

  const { data: authData } = await supabase.auth.getUser();
  const currentUserId = authData?.user?.id;
  const currentProfile = getCachedProfile();

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role_name, account_status, can_manage_users, created_at')
    .order('created_at', { ascending: false });

  if (error) {
    console.error(error);
    showBanner('Não foi possível carregar os usuários.', 'error');
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Falha ao carregar usuários.</div></td></tr>';
    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = '<tr><td colspan="7"><div class="empty-state">Nenhum usuário encontrado.</div></td></tr>';
    return;
  }

  tbody.innerHTML = '';

  for (const user of data) {
    const tr = document.createElement('tr');
    const isCurrent = currentUserId === user.id;
    const isJuana = String(user.email || '').toLowerCase() === ADMIN_EMAIL;

    const roleOptions = ['editor', 'master']
      .map((role) => `<option value="${role}" ${String(user.role_name || '').toLowerCase() === role ? 'selected' : ''}>${role === 'master' ? 'Master' : 'Editor'}</option>`)
      .join('');

    tr.innerHTML = `
      <td>
        <div style="display:flex; flex-direction:column; gap:2px;">
          <strong>${user.full_name || 'Sem nome'}</strong>
          ${isCurrent ? '<small style="color:var(--text-soft);">Você</small>' : ''}
          ${isJuana ? '<small style="color:#2563eb;">Administradora de usuários</small>' : ''}
        </div>
      </td>
      <td>${user.email || '—'}</td>
      <td>${String(user.role_name || '').toUpperCase()}</td>
      <td>${user.account_status || '—'}</td>
      <td>${fmtDate(user.created_at)}</td>
      <td>
        <select data-role-id="${user.id}" ${isCurrent && isJuana ? 'disabled' : ''}>
          ${roleOptions}
        </select>
      </td>
      <td>
        <button type="button" class="btn-secondary" data-toggle-id="${user.id}" data-current-status="${user.account_status || ''}">
          ${String(user.account_status || '') === 'blocked' ? 'Reativar' : 'Bloquear'}
        </button>
      </td>
    `;

    const roleSelect = tr.querySelector('select[data-role-id]');
    roleSelect?.addEventListener('change', async () => {
      const newRole = roleSelect.value;

      if (isCurrent && isJuana && String(newRole).toLowerCase() !== 'master') {
        showBanner('A administradora não pode reduzir a própria função.', 'error');
        roleSelect.value = String(user.role_name || 'master').toLowerCase();
        return;
      }

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ role_name: newRole })
        .eq('id', user.id);

      if (updateError) {
        console.error(updateError);
        showBanner('Não foi possível alterar a função do usuário.', 'error');
        roleSelect.value = String(user.role_name || '').toLowerCase();
        return;
      }

      showBanner('Função atualizada com sucesso.', 'success');
      await loadUsers();
    });

    const toggleBtn = tr.querySelector('button[data-toggle-id]');
    toggleBtn?.addEventListener('click', async () => {
      if (isCurrent && String(currentProfile?.email || '').toLowerCase() === ADMIN_EMAIL) {
        showBanner('A administradora não pode bloquear a própria conta.', 'error');
        return;
      }

      const nextStatus = String(user.account_status || '') === 'blocked' ? 'active' : 'blocked';
      const { error: updateError } = await supabase
        .from('profiles')
        .update({ account_status: nextStatus })
        .eq('id', user.id);

      if (updateError) {
        console.error(updateError);
        showBanner('Não foi possível alterar o status do usuário.', 'error');
        return;
      }

      showBanner(nextStatus === 'active' ? 'Usuário reativado com sucesso.' : 'Usuário bloqueado com sucesso.', 'success');
      await loadUsers();
    });

    tbody.appendChild(tr);
  }
}

function initCreateUserModal() {
  const openBtn = byId('btnOpenCreateUser');
  const modal = byId('createUserModal');
  const closeBtn = byId('btnCloseCreateUser');
  const cancelBtn = byId('btnCancelCreateUser');
  const form = byId('createUserForm');

  if (!openBtn || !modal || !closeBtn || !cancelBtn || !form) return;

  const open = () => {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
  };

  const close = () => {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    form.reset();
  };

  openBtn.addEventListener('click', open);
  closeBtn.addEventListener('click', close);
  cancelBtn.addEventListener('click', close);

  modal.addEventListener('click', (event) => {
    if (event.target === modal) close();
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearBanner();

    const fullName = String(byId('newUserFullName')?.value || '').trim();
    const email = String(byId('newUserEmail')?.value || '').trim();
    const tempPass = String(byId('newUserPassword')?.value || '');
    const tempPassConfirm = String(byId('newUserPasswordConfirm')?.value || '');
    const roleName = String(byId('newUserRole')?.value || 'editor').toLowerCase();
    const submitBtn = byId('btnCreateUser');

    if (!fullName || !email || !tempPass || !tempPassConfirm) {
      showBanner('Preencha todos os campos obrigatórios.', 'error');
      return;
    }

    if (tempPass.length < 8) {
      showBanner('A senha temporária deve ter no mínimo 8 caracteres.', 'error');
      return;
    }

    if (tempPass !== tempPassConfirm) {
      showBanner('As senhas temporárias não conferem.', 'error');
      return;
    }

    disableBtn(submitBtn, true, 'Criando...');

    try {
      const { error } = await supabase.functions.invoke('admin-create-user', {
        body: {
          full_name: fullName,
          email,
          temporary_password: tempPass,
          role_name: roleName
        }
      });

      if (error) {
        console.error(error);
        showBanner('Não foi possível criar o usuário. Tente novamente.', 'error');
        return;
      }

      showBanner('Usuário criado. Ele deverá alterar a senha no primeiro acesso.', 'success');
      close();
      await loadUsers();
    } catch (error) {
      console.error(error);
      showBanner('Não foi possível criar o usuário. Tente novamente.', 'error');
    } finally {
      disableBtn(submitBtn, false, 'Criar usuário');
    }
  });
}

async function initUsersPage() {
  const { profile } = await requireAuth();
  if (!profile) return;

  if (profile.can_manage_users !== true) {
    alert('Você não possui permissão para acessar esta página.');
    window.location.href = 'dashboard.html';
    return;
  }

  initCreateUserModal();
  await loadUsers();
}

await initUsersPage();
