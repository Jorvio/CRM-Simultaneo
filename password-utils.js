export function validatePasswordFields(pass, confirmPass) {
  const password = String(pass || '');
  const confirmPassword = String(confirmPass || '');

  if (!password) {
    return { ok: false, message: 'Informe a nova senha.' };
  }

  if (password.length < 8) {
    return { ok: false, message: 'A senha deve ter no minimo 8 caracteres.' };
  }

  if (password !== confirmPassword) {
    return { ok: false, message: 'As senhas nao conferem.' };
  }

  return { ok: true };
}
