import { supabase } from './supabase.js';
import {
  requireAuth,
  getCachedProfile
} from './auth-guard.js';

const ADMIN_EMAIL = 'juana.virgesint@gmail.com';
const CREATE_USER_FUNCTION = 'create-crm-user';

function byId(id) {
  return document.getElementById(id);
}

function fmtDate(value) {
  if (!value) return '—';

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '—';
  }

  return date.toLocaleDateString('pt-BR');
}

function setMessage(elementId, message, type = 'info') {
  const box = byId(elementId);

  if (!box) return;

  box.textContent = message;

  box.className =
    type === 'error'
      ? 'auth-error'
      : type === 'success'
        ? 'auth-success'
        : 'auth-info';

  box.classList.remove('is-hidden');
}

function clearMessage(elementId) {
  const box = byId(elementId);

  if (!box) return;

  box.textContent = '';
  box.classList.add('is-hidden');
}

function showBanner(message, type = 'info') {
  setMessage('usersMessage', message, type);
}

function clearBanner() {
  clearMessage('usersMessage');
}

function showCreateUserMessage(message, type = 'info') {
  setMessage('createUserMessage', message, type);
}

function clearCreateUserMessage() {
  clearMessage('createUserMessage');
}

function disableBtn(button, disabled, disabledText) {
  if (!button) return;

  if (!button.dataset.defaultText) {
    button.dataset.defaultText =
      button.textContent?.trim() || '';
  }

  button.disabled = disabled;

  button.textContent = disabled
    ? disabledText
    : button.dataset.defaultText;
}

async function getFunctionErrorMessage(error, data) {
  if (data?.message) {
    return data.message;
  }

  const response = error?.context;

  if (
    response &&
    typeof response.clone === 'function'
  ) {
    try {
      const payload = await response.clone().json();

      if (payload?.message) {
        return payload.message;
      }
    } catch {
      // A resposta não estava em JSON.
    }

    try {
      const text = await response.clone().text();

      if (text) {
        return text;
      }
    } catch {
      // Não foi possível ler o texto da resposta.
    }
  }

  return (
    error?.message ||
    'Não foi possível criar o usuário.'
  );
}

async function loadUsers() {
  const tbody = byId('usersTableBody');

  if (!tbody) return;

  clearBanner();

  tbody.innerHTML = `
    <tr>
      <td colspan="7">
        <div class="empty-state">
          Carregando usuários...
        </div>
      </td>
    </tr>
  `;

  const {
    data: authData,
    error: authError
  } = await supabase.auth.getUser();

  if (authError) {
    console.error(
      'Erro ao obter usuário atual:',
      authError
    );
  }

  const currentUserId = authData?.user?.id;
  const currentProfile = getCachedProfile();

  const {
    data,
    error
  } = await supabase
    .from('profiles')
    .select(`
      id,
      full_name,
      email,
      role_name,
      account_status,
      can_manage_users,
      created_at
    `)
    .order('created_at', {
      ascending: false
    });

  if (error) {
    console.error(
      'Erro ao carregar usuários:',
      error
    );

    showBanner(
      error.message ||
        'Não foi possível carregar os usuários.',
      'error'
    );

    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            Falha ao carregar usuários.
          </div>
        </td>
      </tr>
    `;

    return;
  }

  if (!data || data.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7">
          <div class="empty-state">
            Nenhum usuário encontrado.
          </div>
        </td>
      </tr>
    `;

    return;
  }

  tbody.innerHTML = '';

  for (const user of data) {
    const tr = document.createElement('tr');

    const isCurrent =
      currentUserId === user.id;

    const normalizedEmail =
      String(user.email || '')
        .trim()
        .toLowerCase();

    const isJuana =
      normalizedEmail === ADMIN_EMAIL;

    const currentRole =
      String(user.role_name || '')
        .trim()
        .toLowerCase();

    const currentStatus =
      String(user.account_status || '')
        .trim()
        .toLowerCase();

    const roleOptions = ['editor', 'master']
      .map((role) => {
        const selected =
          currentRole === role
            ? 'selected'
            : '';

        const label =
          role === 'master'
            ? 'Master'
            : 'Editor';

        return `
          <option
            value="${role}"
            ${selected}
          >
            ${label}
          </option>
        `;
      })
      .join('');

    tr.innerHTML = `
      <td>
        <div
          style="
            display: flex;
            flex-direction: column;
            gap: 2px;
          "
        >
          <strong>
            ${user.full_name || 'Sem nome'}
          </strong>

          ${
            isCurrent
              ? `
                <small
                  style="color: var(--text-soft);"
                >
                  Você
                </small>
              `
              : ''
          }

          ${
            isJuana
              ? `
                <small style="color: #2563eb;">
                  Administradora de usuários
                </small>
              `
              : ''
          }
        </div>
      </td>

      <td>
        ${user.email || '—'}
      </td>

      <td>
        ${currentRole.toUpperCase() || '—'}
      </td>

      <td>
        ${currentStatus || '—'}
      </td>

      <td>
        ${fmtDate(user.created_at)}
      </td>

      <td>
        <select
          data-role-id="${user.id}"
          ${
            isCurrent && isJuana
              ? 'disabled'
              : ''
          }
        >
          ${roleOptions}
        </select>
      </td>

      <td>
        <button
          type="button"
          class="btn-secondary"
          data-toggle-id="${user.id}"
          data-current-status="${currentStatus}"
        >
          ${
            currentStatus === 'blocked'
              ? 'Reativar'
              : 'Bloquear'
          }
        </button>
      </td>
    `;

    const roleSelect = tr.querySelector(
      'select[data-role-id]'
    );

    roleSelect?.addEventListener(
      'change',
      async () => {
        clearBanner();

        const newRole =
          String(roleSelect.value || '')
            .trim()
            .toLowerCase();

        if (
          isCurrent &&
          isJuana &&
          newRole !== 'master'
        ) {
          showBanner(
            'A administradora não pode reduzir a própria função.',
            'error'
          );

          roleSelect.value =
            currentRole || 'master';

          return;
        }

        const {
          error: updateError
        } = await supabase
          .from('profiles')
          .update({
            role_name: newRole,
            can_manage_users:
              newRole === 'master'
          })
          .eq('id', user.id);

        if (updateError) {
          console.error(
            'Erro ao alterar função:',
            updateError
          );

          showBanner(
            updateError.message ||
              'Não foi possível alterar a função do usuário.',
            'error'
          );

          roleSelect.value = currentRole;

          return;
        }

        showBanner(
          'Função atualizada com sucesso.',
          'success'
        );

        await loadUsers();
      }
    );

    const toggleBtn = tr.querySelector(
      'button[data-toggle-id]'
    );

    toggleBtn?.addEventListener(
      'click',
      async () => {
        clearBanner();

        const cachedEmail =
          String(currentProfile?.email || '')
            .trim()
            .toLowerCase();

        if (
          isCurrent &&
          cachedEmail === ADMIN_EMAIL
        ) {
          showBanner(
            'A administradora não pode bloquear a própria conta.',
            'error'
          );

          return;
        }

        const nextStatus =
          currentStatus === 'blocked'
            ? 'active'
            : 'blocked';

        disableBtn(
          toggleBtn,
          true,
          nextStatus === 'active'
            ? 'Reativando...'
            : 'Bloqueando...'
        );

        try {
          const {
            error: updateError
          } = await supabase
            .from('profiles')
            .update({
              account_status: nextStatus
            })
            .eq('id', user.id);

          if (updateError) {
            console.error(
              'Erro ao alterar status:',
              updateError
            );

            showBanner(
              updateError.message ||
                'Não foi possível alterar o status do usuário.',
              'error'
            );

            return;
          }

          showBanner(
            nextStatus === 'active'
              ? 'Usuário reativado com sucesso.'
              : 'Usuário bloqueado com sucesso.',
            'success'
          );

          await loadUsers();
        } finally {
          disableBtn(
            toggleBtn,
            false,
            ''
          );
        }
      }
    );

    tbody.appendChild(tr);
  }
}

function initCreateUserModal() {
  const openBtn = byId('btnOpenCreateUser');
  const modal = byId('createUserModal');
  const closeBtn = byId('btnCloseCreateUser');
  const cancelBtn = byId('btnCancelCreateUser');
  const form = byId('createUserForm');

  const fullNameInput =
    byId('newUserFullName');

  if (
    !openBtn ||
    !modal ||
    !closeBtn ||
    !cancelBtn ||
    !form
  ) {
    console.error(
      'Elementos do formulário de criação não foram encontrados.'
    );

    return;
  }

  const open = () => {
    clearCreateUserMessage();

    modal.classList.add('open');
    modal.setAttribute(
      'aria-hidden',
      'false'
    );

    setTimeout(() => {
      fullNameInput?.focus();
    }, 50);
  };

  const close = () => {
    modal.classList.remove('open');
    modal.setAttribute(
      'aria-hidden',
      'true'
    );

    form.reset();
    clearCreateUserMessage();
  };

  openBtn.addEventListener(
    'click',
    open
  );

  closeBtn.addEventListener(
    'click',
    close
  );

  cancelBtn.addEventListener(
    'click',
    close
  );

  modal.addEventListener(
    'click',
    (event) => {
      if (event.target === modal) {
        close();
      }
    }
  );

  document.addEventListener(
    'keydown',
    (event) => {
      if (
        event.key === 'Escape' &&
        modal.classList.contains('open')
      ) {
        close();
      }
    }
  );

  form.addEventListener(
    'submit',
    async (event) => {
      event.preventDefault();

      clearCreateUserMessage();
      clearBanner();

      const fullName =
        String(
          byId('newUserFullName')?.value ||
            ''
        ).trim();

      const email =
        String(
          byId('newUserEmail')?.value ||
            ''
        )
          .trim()
          .toLowerCase();

      const tempPass =
        String(
          byId('newUserPassword')?.value ||
            ''
        );

      const tempPassConfirm =
        String(
          byId('newUserPasswordConfirm')
            ?.value || ''
        );

      const roleName =
        String(
          byId('newUserRole')?.value ||
            'editor'
        )
          .trim()
          .toLowerCase();

      const submitBtn =
        byId('btnCreateUser');

      if (
        !fullName ||
        !email ||
        !tempPass ||
        !tempPassConfirm
      ) {
        showCreateUserMessage(
          'Preencha todos os campos obrigatórios.',
          'error'
        );

        return;
      }

      const emailIsValid =
        /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
          email
        );

      if (!emailIsValid) {
        showCreateUserMessage(
          'Informe um e-mail válido.',
          'error'
        );

        return;
      }

      if (
        roleName !== 'editor' &&
        roleName !== 'master'
      ) {
        showCreateUserMessage(
          'Selecione uma função válida.',
          'error'
        );

        return;
      }

      if (tempPass.length < 8) {
        showCreateUserMessage(
          'A senha temporária deve ter no mínimo 8 caracteres.',
          'error'
        );

        return;
      }

      if (tempPass !== tempPassConfirm) {
        showCreateUserMessage(
          'As senhas temporárias não conferem.',
          'error'
        );

        return;
      }

      disableBtn(
        submitBtn,
        true,
        'Criando...'
      );

      try {
        const {
          data: sessionData,
          error: sessionError
        } = await supabase.auth.getSession();

        const accessToken =
          sessionData?.session?.access_token;

        if (
          sessionError ||
          !accessToken
        ) {
          console.error(
            'Sessão indisponível:',
            sessionError
          );

          showCreateUserMessage(
            'Sua sessão expirou. Entre novamente no sistema.',
            'error'
          );

          return;
        }

        const {
          data,
          error
        } = await supabase.functions.invoke(
          CREATE_USER_FUNCTION,
          {
            headers: {
              Authorization:
                `Bearer ${accessToken}`
            },

            body: {
              full_name: fullName,
              email,
              temporary_password:
                tempPass,
              role_name: roleName
            }
          }
        );

        if (error) {
          console.error(
            'Erro completo da Edge Function:',
            error
          );

          const errorMessage =
            await getFunctionErrorMessage(
              error,
              data
            );

          showCreateUserMessage(
            errorMessage,
            'error'
          );

          return;
        }

        if (!data?.success) {
          console.error(
            'Resposta inválida da função:',
            data
          );

          showCreateUserMessage(
            data?.message ||
              'A função não confirmou a criação do usuário.',
            'error'
          );

          return;
        }

        close();

        showBanner(
          data?.message ||
            'Usuário criado com sucesso.',
          'success'
        );

        await loadUsers();
      } catch (error) {
        console.error(
          'Erro inesperado ao criar usuário:',
          error
        );

        showCreateUserMessage(
          error?.message ||
            'Não foi possível criar o usuário.',
          'error'
        );
      } finally {
        disableBtn(
          submitBtn,
          false,
          'Criar usuário'
        );
      }
    }
  );
}

async function initUsersPage() {
  const {
    profile
  } = await requireAuth();

  if (!profile) return;

  if (
    profile.can_manage_users !== true
  ) {
    alert(
      'Você não possui permissão para acessar esta página.'
    );

    window.location.href =
      'dashboard.html';

    return;
  }

  initCreateUserModal();

  await loadUsers();
}

await initUsersPage();