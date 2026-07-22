import './auth-guard.js?v=20260722-6';
import './user-menu.js?v=20260722-6';
import './ui.js?v=20260722-6';
import { db, loadCurrentUserPermissions } from './supabase.js?v=20260722-6';

await window.crmAuthReady;

const params = new URLSearchParams(window.location.search);
const proposalId = params.get('id');
const projectIdFromUrl = params.get('projectId');
const statusPropostaOptions = ['Aberta', 'Negociando', 'Fechada', 'Perdida', 'Pausada'];
const statusProjetoOptions = ['—', 'Aguardando dados para contrato', 'Contrato em elaboração', 'Aguardando assinatura', 'Contrato assinado', 'Em produção', 'Projeto em andamento', 'Entrega parcial', 'Aprovação', 'Cobrança enviada', 'Projeto finalizado'];

const access = await loadCurrentUserPermissions().catch(() => null);
if (!access) {
  window.location.href = './login.html';
  throw new Error('Usuário não autenticado');
}

const permissions = access.permissions;

if (proposalId && !permissions.podeEditar) {
  showToast('Seu usuario nao possui permissao para editar propostas.', 'error');
  window.location.href = './funil.html';
  throw new Error('Sem permissão de edição');
}

if (!proposalId && !permissions.podeAdicionar) {
  showToast('Seu usuario nao possui permissao para cadastrar propostas.', 'error');
  window.location.href = './funil.html';
  throw new Error('Sem permissão de cadastro');
}

const state = {
  clients: [],
  projectsByClient: new Map(),
  selectedClient: null,
  selectedProject: null,
  proposalLoaded: null
};

const fldProposalNumber = document.getElementById('fldProposalNumber');
const fldProposalClientSearch = document.getElementById('fldProposalClientSearch');
const fldProposalClientId = document.getElementById('fldProposalClientId');
const fldProposalClientResults = document.getElementById('fldProposalClientResults');
const fldProposalProjectSearch = document.getElementById('fldProposalProjectSearch');
const fldProposalProjectId = document.getElementById('fldProposalProjectId');
const fldProposalProjectResults = document.getElementById('fldProposalProjectResults');
const fldProposalContact = document.getElementById('fldProposalContact');
const fldProposalPointOfContact = document.getElementById('fldProposalPointOfContact');
const fldProposalBudgetDate = document.getElementById('fldProposalBudgetDate');
const fldProposalClosingDate = document.getElementById('fldProposalClosingDate');
const fldProposalClosingMonth = document.getElementById('fldProposalClosingMonth');
const fldProposalStatus = document.getElementById('fldProposalStatus');
const fldProposalProjectStatus = document.getElementById('fldProposalProjectStatus');
const fldProposalNotes = document.getElementById('fldProposalNotes');
const fldProposalValueBRL = document.getElementById('fldProposalValueBRL');
const fldProposalValueUSD = document.getElementById('fldProposalValueUSD');
const fldProposalPaymentMethod = document.getElementById('fldProposalPaymentMethod');
const fldProposalInstallmentTerms = document.getElementById('fldProposalInstallmentTerms');
const fldProposalPaymentDueDate = document.getElementById('fldProposalPaymentDueDate');
const fldProposalInstallmentDueDay = document.getElementById('fldProposalInstallmentDueDay');
const fldProposalInstallmentValue = document.getElementById('fldProposalInstallmentValue');
const fldProposalContractDeliveryMethod = document.getElementById('fldProposalContractDeliveryMethod');
const fldProposalBillingDeliveryMethod = document.getElementById('fldProposalBillingDeliveryMethod');

function preencherSelect(select, options) {
  select.innerHTML = '';
  options.forEach((optionValue) => {
    const option = document.createElement('option');
    option.value = optionValue;
    option.textContent = optionValue;
    select.appendChild(option);
  });
}

preencherSelect(fldProposalStatus, statusPropostaOptions);
preencherSelect(fldProposalProjectStatus, statusProjetoOptions);

function sanitizeReturnTo(rawValue) {
  if (!rawValue) return null;

  const destino = decodeURIComponent(rawValue).trim();
  const paginasPermitidas = ['dashboard.html', 'funil.html', 'clientes.html', 'projetos.html', 'visualizar.html', 'proposta.html'];
  const arquivo = destino.split('?')[0].split('#')[0];
  const inseguro = destino.includes('..') || destino.startsWith('/') || destino.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(destino);

  if (inseguro || !paginasPermitidas.includes(arquivo)) {
    return null;
  }

  return destino;
}

function obterRetornoOrigem() {
  return sanitizeReturnTo(params.get('returnTo')) || 'funil.html';
}

function obterDestinoOuPaginaAtual() {
  return sanitizeReturnTo(params.get('returnTo')) || `proposta.html${window.location.search}`;
}

function voltarParaOrigem() {
  const destino = obterRetornoOrigem();
  window.location.href = `./${destino}`;
}

function formatMonthLabel(dateStr) {
  if (!dateStr) return '';
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const date = new Date(`${dateStr}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  return `${months[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`;
}

function normalizeSearchText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function obterNumeroInteiro(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const number = Number.parseInt(text, 10);
  return Number.isFinite(number) ? number : null;
}

function converterValorMonetario(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  const normalized = text.replace(/\./g, '').replace(',', '.').replace(/[^\d.-]/g, '');
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function obterTexto(input) {
  return String(input?.value ?? '').trim();
}

function obterNomeCliente(client) {
  return client?.legal_name || client?.name || `Cliente #${client?.id ?? ''}`;
}

function obterNomeProjeto(project) {
  return project?.name || `Projeto #${project?.id ?? ''}`;
}

function limparSelecaoProjeto() {
  state.selectedProject = null;
  fldProposalProjectId.value = '';
  fldProposalProjectSearch.value = '';
  fldProposalProjectSearch.setAttribute('aria-activedescendant', '');
}

function configurarCampoProjetoDesabilitado() {
  limparSelecaoProjeto();
  fldProposalProjectSearch.disabled = true;
  fldProposalProjectSearch.placeholder = 'Selecione um cliente primeiro';
  fldProposalProjectResults.hidden = true;
  fldProposalProjectSearch.setAttribute('aria-expanded', 'false');
}

function habilitarCampoProjeto() {
  fldProposalProjectSearch.disabled = false;
  fldProposalProjectSearch.placeholder = 'Busque pelo nome do projeto';
}

function criarCombobox({ input, hiddenInput, results, getItems, getItemLabel, getItemKeywords, onSelect, onManualChange, noResultsText }) {
  const comboState = {
    items: [],
    visibleItems: [],
    activeIndex: -1,
    optionPrefix: `${input.id}-option`
  };

  function closeResults() {
    comboState.visibleItems = [];
    comboState.activeIndex = -1;
    results.hidden = true;
    results.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.setAttribute('aria-activedescendant', '');
  }

  function setActiveIndex(index) {
    comboState.activeIndex = index;
    const optionId = index >= 0 ? `${comboState.optionPrefix}-${index}` : '';
    input.setAttribute('aria-activedescendant', optionId);

    Array.from(results.children).forEach((child, childIndex) => {
      if (child.getAttribute('role') !== 'option') return;
      child.classList.toggle('active', childIndex === index);
      if (childIndex === index) {
        child.scrollIntoView({ block: 'nearest' });
      }
    });
  }

  function selectItem(item) {
    hiddenInput.value = String(item.id);
    input.value = getItemLabel(item);
    onSelect(item);
    closeResults();
  }

  function renderResults(filteredItems) {
    comboState.visibleItems = filteredItems;
    comboState.activeIndex = -1;
    results.replaceChildren();
    input.setAttribute('aria-activedescendant', '');

    if (!filteredItems.length) {
      const empty = document.createElement('div');
      empty.className = 'no-result';
      empty.textContent = noResultsText;
      results.appendChild(empty);
      results.hidden = false;
      input.setAttribute('aria-expanded', 'true');
      return;
    }

    filteredItems.forEach((item, index) => {
      const option = document.createElement('div');
      option.id = `${comboState.optionPrefix}-${index}`;
      option.className = 'result-item';
      option.setAttribute('role', 'option');
      option.setAttribute('aria-selected', 'false');
      option.textContent = getItemLabel(item);
      option.addEventListener('mousedown', (event) => {
        event.preventDefault();
        selectItem(item);
      });
      results.appendChild(option);
    });

    results.hidden = false;
    input.setAttribute('aria-expanded', 'true');
  }

  function filtrar(query) {
    comboState.items = getItems();
    const normalizedQuery = normalizeSearchText(query);
    if (!comboState.items.length) {
      closeResults();
      return;
    }

    const filteredItems = comboState.items.filter((item) => {
      const keywords = getItemKeywords(item);
      return !normalizedQuery || keywords.some((keyword) => normalizeSearchText(keyword).includes(normalizedQuery));
    });

    renderResults(filteredItems);
  }

  input.addEventListener('focus', () => {
    filtrar(input.value);
  });

  input.addEventListener('input', () => {
    hiddenInput.value = '';
    onManualChange();
    filtrar(input.value);
  });

  input.addEventListener('keydown', (event) => {
    if (results.hidden && (event.key === 'ArrowDown' || event.key === 'ArrowUp')) {
      filtrar(input.value);
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      if (!comboState.visibleItems.length) return;
      const nextIndex = comboState.activeIndex + 1 >= comboState.visibleItems.length ? 0 : comboState.activeIndex + 1;
      setActiveIndex(nextIndex);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      if (!comboState.visibleItems.length) return;
      const nextIndex = comboState.activeIndex <= 0 ? comboState.visibleItems.length - 1 : comboState.activeIndex - 1;
      setActiveIndex(nextIndex);
      return;
    }

    if (event.key === 'Enter') {
      if (comboState.activeIndex >= 0 && comboState.visibleItems[comboState.activeIndex]) {
        event.preventDefault();
        selectItem(comboState.visibleItems[comboState.activeIndex]);
      }
      return;
    }

    if (event.key === 'Escape') {
      closeResults();
    }
  });

  document.addEventListener('click', (event) => {
    if (event.target === input || results.contains(event.target)) {
      return;
    }
    closeResults();
  });

  return {
    open() {
      filtrar(input.value);
    },
    close: closeResults,
    setSelected(item) {
      hiddenInput.value = item ? String(item.id) : '';
      input.value = item ? getItemLabel(item) : '';
      closeResults();
    }
  };
}

async function carregarClientes() {
  state.clients = await db.fetchClients().catch((error) => {
    console.error('[proposta] Erro ao carregar clientes:', error);
    showToast('Nao foi possivel carregar os clientes.', 'error');
    return [];
  });
}

async function carregarProjetosDoCliente(clientId) {
  if (!clientId) return [];
  if (state.projectsByClient.has(clientId)) {
    return state.projectsByClient.get(clientId);
  }

  const projects = await db.fetchProjectsByClient(clientId).catch((error) => {
    console.error('[proposta] Erro ao carregar projetos do cliente:', error);
    showToast('Nao foi possivel carregar os projetos do cliente.', 'error');
    return [];
  });

  state.projectsByClient.set(clientId, projects || []);
  return state.projectsByClient.get(clientId);
}

const clientCombobox = criarCombobox({
  input: fldProposalClientSearch,
  hiddenInput: fldProposalClientId,
  results: fldProposalClientResults,
  getItems: () => state.clients,
  getItemLabel: (client) => obterNomeCliente(client),
  getItemKeywords: (client) => [client.legal_name, client.name, client.cpf, client.cnpj, client.id],
  onSelect: async (client) => {
    const previousClientId = state.selectedClient?.id ? Number(state.selectedClient.id) : null;
    state.selectedClient = client;
    fldProposalClientId.value = String(client.id);

    if (previousClientId !== Number(client.id)) {
      limparSelecaoProjeto();
    }

    habilitarCampoProjeto();
    await carregarProjetosDoCliente(Number(client.id));
  },
  onManualChange: () => {
    state.selectedClient = null;
    limparSelecaoProjeto();
    configurarCampoProjetoDesabilitado();
  },
  noResultsText: 'Nenhum cliente encontrado.'
});

const projectCombobox = criarCombobox({
  input: fldProposalProjectSearch,
  hiddenInput: fldProposalProjectId,
  results: fldProposalProjectResults,
  getItems: () => {
    const clientId = Number(fldProposalClientId.value || 0);
    return clientId ? state.projectsByClient.get(clientId) || [] : [];
  },
  getItemLabel: (project) => obterNomeProjeto(project),
  getItemKeywords: (project) => [project.name, project.services, project.status, project.id],
  onSelect: (project) => {
    state.selectedProject = project;
    fldProposalProjectId.value = String(project.id);
  },
  onManualChange: () => {
    state.selectedProject = null;
  },
  noResultsText: 'Nenhum projeto encontrado para este cliente.'
});

async function selecionarClientePorId(clientId) {
  const numericClientId = Number(clientId);
  if (!Number.isFinite(numericClientId)) return null;

  const client = state.clients.find((item) => Number(item.id) === numericClientId) || null;
  if (!client) return null;

  state.selectedClient = client;
  fldProposalClientId.value = String(client.id);
  clientCombobox.setSelected(client);
  habilitarCampoProjeto();
  await carregarProjetosDoCliente(numericClientId);
  return client;
}

async function selecionarProjetoPorId(projectId) {
  const numericProjectId = Number(projectId);
  const numericClientId = Number(fldProposalClientId.value || 0);
  if (!Number.isFinite(numericProjectId) || !Number.isFinite(numericClientId) || !numericClientId) return null;

  const projects = await carregarProjetosDoCliente(numericClientId);
  const project = (projects || []).find((item) => Number(item.id) === numericProjectId) || null;
  if (!project) return null;

  state.selectedProject = project;
  fldProposalProjectId.value = String(project.id);
  projectCombobox.setSelected(project);
  return project;
}

function preencherFormulario(proposal) {
  fldProposalNumber.value = proposal.proposal_number || '';
  fldProposalContact.value = proposal.contact_name || '';
  fldProposalPointOfContact.value = proposal.point_of_contact || '';
  fldProposalBudgetDate.value = proposal.budget_date || '';
  fldProposalClosingDate.value = proposal.closing_date || '';
  fldProposalClosingMonth.value = proposal.closing_month || formatMonthLabel(proposal.closing_date || '');
  fldProposalStatus.value = proposal.proposal_status || statusPropostaOptions[0];
  fldProposalProjectStatus.value = proposal.project_status || statusProjetoOptions[0];
  fldProposalNotes.value = proposal.notes || '';
  fldProposalValueBRL.value = proposal.value_brl ?? '';
  fldProposalValueUSD.value = proposal.value_usd ?? '';
  fldProposalPaymentMethod.value = proposal.payment_method || '';
  fldProposalInstallmentTerms.value = proposal.installment_terms || '';
  fldProposalPaymentDueDate.value = proposal.payment_due_date || '';
  fldProposalInstallmentDueDay.value = proposal.installment_due_day ?? '';
  fldProposalInstallmentValue.value = proposal.installment_value ?? '';
  fldProposalContractDeliveryMethod.value = proposal.contract_delivery_method || '';
  fldProposalBillingDeliveryMethod.value = proposal.billing_delivery_method || '';
}

async function carregarPropostaParaEdicao() {
  if (!proposalId) return;

  const proposal = await db.fetchProposalById(Number(proposalId)).catch((error) => {
    console.error('[proposta] Erro ao carregar proposta:', error);
    showToast('Nao foi possivel carregar a proposta.', 'error');
    return null;
  });

  if (!proposal) return;

  state.proposalLoaded = proposal;
  document.getElementById('proposalPageTitle').textContent = 'Editar Proposta';
  document.getElementById('proposalPageSubtext').textContent = 'Atualize os dados comerciais e financeiros da proposta';
  document.getElementById('btnSaveProposal').textContent = 'Salvar Alterações';
  preencherFormulario(proposal);
  await selecionarClientePorId(proposal.client_id);
  await selecionarProjetoPorId(proposal.project_id);
}

async function carregarPropostaAPartirDoProjeto() {
  if (proposalId || !projectIdFromUrl) return;

  const project = await db.fetchProjectById(Number(projectIdFromUrl)).catch((error) => {
    console.error('[proposta] Erro ao carregar projeto pela URL:', error);
    showToast('Nao foi possivel carregar o projeto informado.', 'error');
    return null;
  });

  if (!project) return;

  await selecionarClientePorId(project.client_id);
  await selecionarProjetoPorId(project.id);
}

function montarPayload() {
  const clientId = Number(fldProposalClientId.value);
  const projectId = Number(fldProposalProjectId.value);

  return {
    proposal_number: obterTexto(fldProposalNumber),
    client_id: Number.isFinite(clientId) ? clientId : null,
    project_id: Number.isFinite(projectId) ? projectId : null,
    contact_id: null,
    contact_name: obterTexto(fldProposalContact) || null,
    point_of_contact: obterTexto(fldProposalPointOfContact) || null,
    budget_date: fldProposalBudgetDate.value || null,
    closing_date: fldProposalClosingDate.value || null,
    closing_month: fldProposalClosingDate.value ? formatMonthLabel(fldProposalClosingDate.value) : null,
    value_usd: fldProposalValueUSD.value === '' ? null : Number(fldProposalValueUSD.value),
    value_brl: fldProposalValueBRL.value === '' ? null : Number(fldProposalValueBRL.value),
    proposal_status: fldProposalStatus.value || null,
    project_status: fldProposalProjectStatus.value || null,
    notes: obterTexto(fldProposalNotes) || null,
    payment_method: obterTexto(fldProposalPaymentMethod) || null,
    installment_terms: obterTexto(fldProposalInstallmentTerms) || null,
    payment_due_date: fldProposalPaymentDueDate.value || null,
    installment_due_day: obterNumeroInteiro(fldProposalInstallmentDueDay.value),
    installment_value: converterValorMonetario(fldProposalInstallmentValue.value),
    contract_delivery_method: obterTexto(fldProposalContractDeliveryMethod) || null,
    billing_delivery_method: obterTexto(fldProposalBillingDeliveryMethod) || null
  };
}

async function validarRelacaoProjetoCliente(clientId, projectId) {
  const projects = await carregarProjetosDoCliente(clientId);
  const selectedProject = (projects || []).find((project) => Number(project.id) === Number(projectId)) || null;

  if (!selectedProject || Number(selectedProject.client_id) !== Number(clientId)) {
    showToast('O projeto selecionado não pertence ao cliente informado.', 'error');
    return null;
  }

  return selectedProject;
}

async function salvarProposta() {
  const clientId = Number(fldProposalClientId.value);
  const projectId = Number(fldProposalProjectId.value);
  const payload = montarPayload();

  const required = {
    'Numero da proposta': payload.proposal_number,
    'Cliente': Number.isFinite(clientId) ? clientId : null,
    'Projeto': Number.isFinite(projectId) ? projectId : null,
    'Contato': payload.contact_name,
    'Ponto de contato': payload.point_of_contact,
    'Data do orçamento': payload.budget_date
  };

  for (const [label, value] of Object.entries(required)) {
    if (!value) {
      showToast(`${label} é obrigatório.`, 'error');
      return;
    }
  }

  if (!Number.isFinite(clientId) || !state.selectedClient || Number(state.selectedClient.id) !== clientId) {
    showToast('Selecione um cliente válido da lista.', 'error');
    return;
  }

  if (!Number.isFinite(projectId) || !state.selectedProject || Number(state.selectedProject.id) !== projectId) {
    showToast('Selecione um projeto válido da lista.', 'error');
    return;
  }

  const projetoConfirmado = await validarRelacaoProjetoCliente(clientId, projectId);
  if (!projetoConfirmado) {
    return;
  }

  let proposalSaved;
  try {
    if (proposalId) {
      proposalSaved = await db.updateProposal(Number(proposalId), payload);
    } else {
      proposalSaved = await db.insertProposal(payload);
    }
  } catch (error) {
    console.error('[Proposta] Falha ao salvar proposta', error);
    showToast('Nao foi possivel salvar a proposta.', 'error');
    return;
  }

  const idSalvo = Number(proposalSaved?.id || proposalId);
  if (!Number.isFinite(idSalvo)) {
    showToast('Nao foi possivel determinar o ID da proposta salva.', 'error');
    return;
  }

  const propostaConfirmada = await db.fetchProposalById(idSalvo).catch((error) => {
    console.error('[Proposta] Falha ao confirmar proposta', error);
    return null;
  });

  console.log('[Proposta] Dados confirmados', propostaConfirmada);

  if (!propostaConfirmada) {
    showToast('A proposta foi salva, mas a confirmação dos dados falhou.', 'error');
    return;
  }

  const returnTo = encodeURIComponent(obterRetornoOrigem());
  showToast(proposalId ? 'Proposta atualizada com sucesso.' : 'Proposta cadastrada com sucesso.', 'success');
  window.location.href = `./visualizar.html?type=proposal&id=${idSalvo}&returnTo=${returnTo}`;
}

fldProposalClosingDate.addEventListener('change', () => {
  fldProposalClosingMonth.value = formatMonthLabel(fldProposalClosingDate.value);
});

document.getElementById('btnSaveProposal').addEventListener('click', salvarProposta);
document.getElementById('btnCancelProposal').addEventListener('click', voltarParaOrigem);
document.getElementById('btnBackProposal').addEventListener('click', voltarParaOrigem);

await carregarClientes();
configurarCampoProjetoDesabilitado();

if (!proposalId) {
  fldProposalNumber.value = `PRP-${Math.floor(Math.random() * 9000) + 1000}`;
  fldProposalBudgetDate.value = new Date().toISOString().slice(0, 10);
  fldProposalStatus.value = statusPropostaOptions[0];
  fldProposalProjectStatus.value = statusProjetoOptions[0];
}

await carregarPropostaParaEdicao();
await carregarPropostaAPartirDoProjeto();

if (!proposalId && !projectIdFromUrl) {
  const returnToAtual = obterDestinoOuPaginaAtual();
  if (!returnToAtual.includes('proposta.html')) {
    document.getElementById('proposalPageSubtext').textContent = 'Cadastre os dados comerciais e financeiros da proposta';
  }
}