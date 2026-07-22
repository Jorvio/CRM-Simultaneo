const MENU_ITEMS = [
  {
    key: 'dashboard',
    label: 'Dashboard',
    href: './dashboard.html',
    path: 'dashboard.html',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"></rect><rect x="14" y="3" width="7" height="7"></rect><rect x="14" y="14" width="7" height="7"></rect><rect x="3" y="14" width="7" height="7"></rect></svg>'
  },
  {
    key: 'funil',
    label: 'Funil',
    href: './funil.html',
    path: 'funil.html',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"></path><path d="M7 15l3-4 3 2 4-6"></path></svg>'
  },
  {
    key: 'clientes',
    label: 'Clientes',
    href: './clientes.html',
    path: 'clientes.html',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><path d="M20 8v6"></path><path d="M23 11h-6"></path></svg>'
  },
  {
    key: 'projetos',
    label: 'Projetos',
    href: './projetos.html',
    path: 'projetos.html',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18"></path><path d="M5 7v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7"></path><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>'
  },
  {
    key: 'configuracoes',
    label: 'Configuracoes',
    href: './minha-conta.html',
    path: 'minha-conta.html',
    svg: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.2a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.2a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9c0 .7.4 1.3 1 1.5V11a2 2 0 0 1 0 4h-.2a1.7 1.7 0 0 0-1.5 1Z"></path></svg>'
  }
];

function getCurrentPath() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function mapCurrentNav(path) {
  if (path === 'cliente-novo.html') return 'clientes';
  if (path === 'projeto-novo.html' || path === 'visualizar.html') return 'projetos';
  if (path === 'usuarios.html' || path === 'minha-conta.html' || path === 'redefinir-senha.html') return 'configuracoes';
  return path.replace('.html', '');
}

function renderSidebarBrand() {
  const brand = document.querySelector('.sidebar-brand');
  if (!brand) return;

  brand.innerHTML = `
    <a href="./dashboard.html" class="sidebar-brand-link" aria-label="Ir para o Dashboard">
      <img src="./assets/astra-logo.png?v=20260722-1" alt="Astra CRM" class="sidebar-logo-full">
      <img src="./assets/astra-icon.png?v=20260722-1" alt="" aria-hidden="true" class="sidebar-logo-compact">
    </a>
  `;
}

function addSidebarCredit() {
  const footer = document.querySelector('.sidebar-footer');
  if (!footer) return;

  let credit = footer.querySelector('.sidebar-credit');
  if (!credit) {
    credit = document.createElement('div');
    credit.className = 'sidebar-credit';
    credit.textContent = 'produced by Juana Wurges';
    footer.appendChild(credit);
  }
}

export function renderSharedSidebar() {
  const sidebar = document.querySelector('.sidebar');
  if (!sidebar) return;

  const nav = sidebar.querySelector('.sidebar-nav');
  if (!nav) return;

  const currentKey = mapCurrentNav(getCurrentPath());

  nav.innerHTML = MENU_ITEMS.map((item) => {
    const active = item.key === currentKey ? ' active' : '';
    return `<a class="nav-item${active}" data-nav-key="${item.key}" href="${item.href}"><span class="nav-icon">${item.svg}</span><span class="nav-label">${item.label}</span></a>`;
  }).join('');
}

renderSidebarBrand();
renderSharedSidebar();
addSidebarCredit();
