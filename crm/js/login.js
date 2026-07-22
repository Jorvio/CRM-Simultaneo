import { supabase } from './supabase.js';
import { requireAuth } from './auth-guard.js';
import { validatePasswordFields } from './password-utils.js';
import './ui.js';

function byId(id) {
  return document.getElementById(id);
}

function showMessage(id, message, type = 'error') {
  const el = byId(id);
  if (!el) return;
  el.textContent = message;
  el.className = type === 'success' ? 'auth-success' : type === 'info' ? 'auth-info' : 'auth-error';
  el.classList.remove('is-hidden');
}

function clearMessage(id) {
  const el = byId(id);
  if (!el) return;
  el.classList.add('is-hidden');
  el.textContent = '';
}

function setLoading(button, loading, loadingText) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent;
  button.disabled = loading;
  button.classList.toggle('auth-loading', loading);
  button.textContent = loading ? loadingText : button.dataset.defaultText;
}

function readLoginMessage() {
  const msgCode = new URLSearchParams(window.location.search).get('msg');
  if (!msgCode) return;

  const map = {
    blocked: 'Seu acesso está bloqueado. Procure a administradora.',
    pending: 'Seu acesso ainda não foi liberado.',
    'no-profile': 'Seu perfil de acesso não foi configurado.',
    inactive: 'Seu acesso não está ativo.',
    'not-authenticated': 'Faça login para continuar.',
    'signed-out': 'Sessão encerrada.'
  };

  if (map[msgCode]) {
    showMessage('loginMessage', map[msgCode], 'info');
  }
}

function togglePassword(buttonId, inputId) {
  const button = byId(buttonId);
  const input = byId(inputId);
  if (!button || !input) return;

  button.addEventListener('click', () => {
    const showing = input.type === 'text';
    input.type = showing ? 'password' : 'text';
    button.textContent = showing ? 'Mostrar' : 'Ocultar';
  });
}

async function initLoginPage() {
  const form = byId('loginForm');
  if (!form) return;

  readLoginMessage();
  togglePassword('togglePassword', 'password');

  const googleBtn = byId('btnGoogleLogin');
  googleBtn?.addEventListener('click', async () => {
    clearMessage('loginMessage');
    setLoading(googleBtn, true, 'Conectando...');

    const redirectTo = new URL('auth-callback.html', window.location.href).href;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo }
    });

    if (error) {
      console.error(error);
      showMessage('loginMessage', 'Não foi possível entrar. Tente novamente.');
      setLoading(googleBtn, false, 'Entrar com Google');
    }
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('loginMessage');

    const email = String(byId('email')?.value || '').trim();
    const password = String(byId('password')?.value || '');
    const submitBtn = byId('btnLogin');

    if (!email || !password) {
      showMessage('loginMessage', 'Informe seu e-mail e senha.');
      return;
    }

    setLoading(submitBtn, true, 'Entrando...');

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });

      if (error) {
        const msg = String(error.message || '').toLowerCase();
        if (msg.includes('invalid login credentials')) {
          showMessage('loginMessage', 'E-mail ou senha incorretos.');
        } else {
          showMessage('loginMessage', 'Não foi possível entrar. Tente novamente.');
        }
        return;
      }

      if (!data?.user) {
        showMessage('loginMessage', 'Não foi possível entrar. Tente novamente.');
        return;
      }

      window.location.href = './dashboard.html';
    } catch (error) {
      console.error(error);
      showMessage('loginMessage', 'Não foi possível entrar. Tente novamente.');
    } finally {
      setLoading(submitBtn, false, 'Entrar');
    }
  });
}

function initForgotPage() {
  const form = byId('forgotForm');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('forgotMessage');

    const email = String(byId('forgotEmail')?.value || '').trim();
    const submitBtn = byId('btnSendReset');

    if (!email) {
      showMessage('forgotMessage', 'Informe seu e-mail.', 'info');
      return;
    }

    setLoading(submitBtn, true, 'Enviando...');

    try {
      const redirectTo = new URL('redefinir-senha.html', window.location.href).href;
      await supabase.auth.resetPasswordForEmail(email, { redirectTo });
      showMessage('forgotMessage', 'Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.', 'success');
    } catch (error) {
      console.error(error);
      showMessage('forgotMessage', 'Se este e-mail estiver cadastrado, você receberá as instruções para redefinir sua senha.', 'success');
    } finally {
      setLoading(submitBtn, false, 'Enviar link');
    }
  });
}

function initResetPage() {
  const form = byId('resetForm');
  if (!form) return;

  const mode = new URLSearchParams(window.location.search).get('mode');
  if (mode === 'change') {
    requireAuth().catch(() => null);
  }

  togglePassword('toggleResetPassword', 'resetPassword');
  togglePassword('toggleResetPasswordConfirm', 'resetPasswordConfirm');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('resetMessage');

    const password = String(byId('resetPassword')?.value || '');
    const confirmPassword = String(byId('resetPasswordConfirm')?.value || '');
    const submitBtn = byId('btnResetPassword');

    const validation = validatePasswordFields(password, confirmPassword);
    if (!validation.ok) {
      showMessage('resetMessage', validation.message);
      return;
    }

    setLoading(submitBtn, true, 'Redefinindo...');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error(error);
        showMessage('resetMessage', 'Não foi possível redefinir a senha. Tente novamente.');
        return;
      }

      showMessage('resetMessage', 'Senha alterada com sucesso.', 'success');
      setTimeout(() => {
        window.location.href = mode === 'change' ? 'dashboard.html' : 'login.html';
      }, 900);
    } catch (error) {
      console.error(error);
      showMessage('resetMessage', 'Não foi possível redefinir a senha. Tente novamente.');
    } finally {
      setLoading(submitBtn, false, 'Redefinir senha');
    }
  });
}

async function initPrimeiroAcessoPage() {
  const form = byId('firstAccessForm');
  if (!form) return;

  const { profile } = await requireAuth();
  if (!profile) return;

  togglePassword('toggleFirstPassword', 'firstPassword');
  togglePassword('toggleFirstPasswordConfirm', 'firstPasswordConfirm');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('firstAccessMessage');

    const password = String(byId('firstPassword')?.value || '');
    const confirmPassword = String(byId('firstPasswordConfirm')?.value || '');
    const submitBtn = byId('btnFirstAccess');

    const validation = validatePasswordFields(password, confirmPassword);
    if (!validation.ok) {
      showMessage('firstAccessMessage', validation.message);
      return;
    }

    setLoading(submitBtn, true, 'Salvando...');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        console.error(error);
        showMessage('firstAccessMessage', 'Não foi possível atualizar a senha. Tente novamente.');
        return;
      }

      const { error: rpcError } = await supabase.rpc('complete_first_access');
      if (rpcError) {
        console.error(rpcError);
        showMessage('firstAccessMessage', 'Senha alterada, mas não foi possível concluir o primeiro acesso. Tente entrar novamente.', 'info');
        return;
      }

      showMessage('firstAccessMessage', 'Senha salva com sucesso.', 'success');
      setTimeout(() => { window.location.href = 'dashboard.html'; }, 800);
    } catch (error) {
      console.error(error);
      showMessage('firstAccessMessage', 'Não foi possível atualizar a senha. Tente novamente.');
    } finally {
      setLoading(submitBtn, false, 'Salvar nova senha');
    }
  });
}

async function initAuthCallbackPage() {
  const target = byId('callbackMessage');
  if (!target) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const user = sessionData?.session?.user;

    if (!user) {
      window.location.href = 'login.html?msg=not-authenticated';
      return;
    }

    const { data: perfil, error: perfilError } = await supabase
      .from('profiles')
      .select(`
        id,
        full_name,
        email,
        avatar_url,
        role_name,
        account_status,
        can_manage_users,
        must_change_password
      `)
      .eq('id', user.id)
      .single();

    if (perfilError || !perfil) {
      await supabase.auth.signOut();
      window.location.href = 'login.html?msg=no-profile';
      return;
    }

    if (perfil.account_status === 'blocked') {
      await supabase.auth.signOut();
      window.location.href = 'login.html?msg=blocked';
      return;
    }

    if (perfil.account_status === 'pending') {
      await supabase.auth.signOut();
      window.location.href = 'login.html?msg=pending';
      return;
    }

    if (perfil.must_change_password) {
      window.location.href = 'primeiro-acesso.html';
      return;
    }

    window.location.href = 'dashboard.html';
  } catch (error) {
    console.error(error);
    target.textContent = 'Não foi possível concluir o login. Redirecionando...';
    setTimeout(() => {
      window.location.href = 'login.html';
    }, 1200);
  }
}

async function initMinhaContaPage() {
  const form = byId('accountForm');
  if (!form) return;

  const { session, profile } = await requireAuth();
  if (!session || !profile) return;

  const nameInput = byId('accountName');
  const emailInput = byId('accountEmail');
  const roleInput = byId('accountRole');
  const statusInput = byId('accountStatus');
  const providerInput = byId('accountProvider');
  const avatar = byId('accountAvatar');

  if (nameInput) nameInput.value = profile.full_name || '';
  if (emailInput) emailInput.value = profile.email || '';
  if (roleInput) roleInput.value = String(profile.role_name || '').toUpperCase();
  if (statusInput) statusInput.value = profile.account_status || '';
  if (providerInput) providerInput.value = session.user?.app_metadata?.provider || 'email';
  if (avatar) avatar.textContent = (profile.full_name || profile.email || 'U').slice(0, 2).toUpperCase();

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage('accountMessage');

    const submitBtn = byId('btnSaveAccount');
    const fullName = String(nameInput?.value || '').trim();

    if (!fullName) {
      showMessage('accountMessage', 'Informe o nome completo.');
      return;
    }

    setLoading(submitBtn, true, 'Salvando...');

    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .update({ full_name: fullName })
        .eq('id', profile.id);

      if (profileError) {
        console.error(profileError);
        showMessage('accountMessage', 'Não foi possível atualizar seus dados.');
        return;
      }

      showMessage('accountMessage', 'Dados atualizados com sucesso.', 'success');
    } catch (error) {
      console.error(error);
      showMessage('accountMessage', 'Não foi possível atualizar seus dados.');
    } finally {
      setLoading(submitBtn, false, 'Salvar alterações');
    }
  });
}

await initLoginPage();
initForgotPage();
initResetPage();
await initPrimeiroAcessoPage();
await initAuthCallbackPage();
await initMinhaContaPage();
