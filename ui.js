export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function showToast(message, type = 'info') {
  const text = String(message || '').trim();
  if (!text) return;

  let toast = document.getElementById('crm-global-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'crm-global-toast';
    toast.className = 'crm-toast';
    document.body.appendChild(toast);
  }

  toast.textContent = text;
  toast.setAttribute('data-type', type);
  toast.classList.add('show');

  clearTimeout(showToast.__timer);
  showToast.__timer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

window.showToast = showToast;
window.escapeHtml = escapeHtml;
