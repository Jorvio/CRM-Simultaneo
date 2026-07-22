import './auth-guard.js?v=20260722-10';
import './user-menu.js?v=20260722-10';
import './ui.js?v=20260722-10';
import { db, loadCurrentUserPermissions } from './supabase.js?v=20260722-10';

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

function formatMonthToInput(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '';
  return `${parts[0]}-${parts[1]}`;
}

function formatDateFromMonth(monthStr) {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length < 2) return '';
  return `${parts[0]}-${parts[1]}-01`;
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

function textoOuNull(valor) {
  const texto = String(valor ?? '').trim();
  return texto || null;
}

function inteiroOuNull(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  const numero = Number(String(valor).replace(/\D/g, ''));
  return Number.isInteger(numero) && numero > 0 ? numero : null;
}

function dataOuNull(valor) {
  const texto = String(valor ?? '').trim();
  if (!texto) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(texto)) return texto;
  const correspondencia = texto.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (correspondencia) {
    const [, dia, mes, ano] = correspondencia;
    return `${ano}-${mes}-${dia}`;
  }
  return null;
}

function moedaOuNull(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') return null;
  let texto = String(valor).trim()
    .replace(/R\$/gi, '')
    .replace(/US\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!texto) return null;
  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }
  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : null;
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
  fldProposalClosingMonth.value = proposal.closing_month ? formatMonthToInput(proposal.closing_month) : formatMonthToInput(proposal.closing_date || '');
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
  return {
    proposal_number: textoOuNull(fldProposalNumber?.value),
    client_id: inteiroOuNull(fldProposalClientId?.value),
    project_id: inteiroOuNull(fldProposalProjectId?.value),
    contact_id: null,
    contact_name: textoOuNull(fldProposalContact?.value),
    point_of_contact: textoOuNull(fldProposalPointOfContact?.value),
    budget_date: dataOuNull(fldProposalBudgetDate?.value),
    closing_date: dataOuNull(fldProposalClosingDate?.value),
    closing_month: textoOuNull(fldProposalClosingMonth?.value),
    value_brl: moedaOuNull(fldProposalValueBRL?.value),
    value_usd: moedaOuNull(fldProposalValueUSD?.value),
    proposal_status: textoOuNull(fldProposalStatus?.value),
    project_status: textoOuNull(fldProposalProjectStatus?.value),
    notes: textoOuNull(fldProposalNotes?.value),
    payment_method: textoOuNull(fldProposalPaymentMethod?.value),
    installment_terms: textoOuNull(fldProposalInstallmentTerms?.value),
    payment_due_date: dataOuNull(fldProposalPaymentDueDate?.value),
    installment_due_day: inteiroOuNull(fldProposalInstallmentDueDay?.value),
    installment_value: moedaOuNull(fldProposalInstallmentValue?.value),
    contract_delivery_method: textoOuNull(fldProposalContractDeliveryMethod?.value),
    billing_delivery_method: textoOuNull(fldProposalBillingDeliveryMethod?.value)
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

let salvamentoEmAndamento = false;

async function salvarProposta() {
  if (salvamentoEmAndamento) return;

  const botao = document.getElementById('btnSaveProposal');
  salvamentoEmAndamento = true;
  botao.disabled = true;
  botao.textContent = 'Salvando...';

  try {
    const payload = montarPayload();

    Object.keys(payload).forEach(chave => {
      if (payload[chave] === undefined) {
        payload[chave] = null;
      }
    });

    console.log('[Proposta] Payload normalizado', payload);

    if (!payload.proposal_number) {
      showToast('Informe o número da proposta.', 'error');
      return;
    }

    if (!payload.client_id) {
      showToast('Selecione um cliente da lista.', 'error');
      return;
    }

    if (!payload.project_id) {
      showToast('Selecione um projeto da lista.', 'error');
      return;
    }

    if (!payload.budget_date) {
      showToast('Informe a data do orçamento.', 'error');
      return;
    }

    if (!payload.proposal_status) {
      showToast('Informe o status da proposta.', 'error');
      return;
    }

    if (!state.selectedClient || Number(state.selectedClient.id) !== payload.client_id) {
      showToast('Selecione um cliente válido da lista.', 'error');
      return;
    }

    if (!state.selectedProject || Number(state.selectedProject.id) !== payload.project_id) {
      showToast('Selecione um projeto válido da lista.', 'error');
      return;
    }

    if (payload.installment_due_day !== null && (payload.installment_due_day < 1 || payload.installment_due_day > 31)) {
      showToast('O dia do vencimento deve estar entre 1 e 31.', 'error');
      return;
    }

    const projetoConfirmado = await validarRelacaoProjetoCliente(payload.client_id, payload.project_id);
    if (!projetoConfirmado) return;

    let propostaSalva;
    if (proposalId) {
      propostaSalva = await db.updateProposal(Number(proposalId), payload);
    } else {
      propostaSalva = await db.insertProposal(payload);
    }

    const idSalvo = Number(propostaSalva?.id || proposalId);
    if (!Number.isFinite(idSalvo) || idSalvo <= 0) {
      showToast('Não foi possível determinar o ID da proposta salva.', 'error');
      return;
    }

    const propostaConfirmada = await db.fetchProposalById(idSalvo).catch(err => {
      console.error('[Proposta] Falha ao confirmar proposta', err);
      return null;
    });

    console.log('[Proposta] Registro confirmado', propostaConfirmada);

    if (!propostaConfirmada) {
      showToast('A proposta foi salva, mas a confirmação dos dados falhou.', 'error');
      return;
    }

    const returnTo = encodeURIComponent(obterRetornoOrigem());
    showToast(proposalId ? 'Proposta atualizada com sucesso.' : 'Proposta cadastrada com sucesso.', 'success');
    window.location.href = `./visualizar.html?type=proposal&id=${idSalvo}&returnTo=${returnTo}`;

  } catch (error) {
    if (error?.code === 'AUTH_REQUIRED') return;

    console.error('[Proposta] Falha ao salvar', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint
    });

    let mensagem = 'Não foi possível salvar a proposta.';

    if (error?.code === '42501' || error?.code === 'PERMISSION_DENIED') {
      mensagem = 'Sua conta não possui permissão para salvar propostas.';
    } else if (error?.code === '23502') {
      mensagem = 'Existe um campo obrigatório sem preenchimento.';
    } else if (error?.code === '23503') {
      mensagem = 'O cliente ou projeto selecionado não existe.';
    } else if (error?.code === '23505') {
      mensagem = 'Já existe uma proposta com essa identificação.';
    } else if (error?.message?.includes('invalid input syntax')) {
      mensagem = 'Existe uma data, número ou valor em formato inválido.';
    } else if (error?.message) {
      mensagem = `Não foi possível salvar: ${error.message}`;
    }

    showToast(mensagem, 'error');
  } finally {
    salvamentoEmAndamento = false;
    botao.disabled = false;
    botao.textContent = proposalId ? 'Salvar Alterações' : 'Salvar Proposta';
  }
}

fldProposalClosingDate.addEventListener('change', () => {
  if (fldProposalClosingDate.value) {
    fldProposalClosingMonth.value = formatMonthToInput(fldProposalClosingDate.value);
  } else {
    fldProposalClosingMonth.value = '';
  }
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