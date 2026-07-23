import { db, loadCurrentUserPermissions } from './supabase.js';
import { escapeHtml, showToast } from './ui.js';

await window.crmAuthReady;

const access = await loadCurrentUserPermissions().catch((error) => {
  console.error('[funil] Não foi possível carregar as permissões:', error);
  return null;
});

if (!access) {
  window.location.href = './login.html';
  throw new Error('Usuário não autenticado.');
}

const permissions = access.permissions;

let allProposals = [];
let filteredProposals = [];
let activeFilters = {};

const TABLE_BODY = document.getElementById('proposalTableBody');
const SEARCH_INPUT = document.getElementById('searchInput');
const BTN_FILTERS = document.getElementById('btnFilters');
const FILTER_PANEL = document.getElementById('filterPanel');
const BTN_FILTER_APPLY = document.getElementById('btnFilterApply');
const BTN_FILTER_CLEAR = document.getElementById('btnFilterClear');
const FOOTER_INFO = document.getElementById('footerInfo');
const FILTER_COUNT = document.getElementById('filterCount');
const BTN_NEW_PROPOSAL = document.getElementById('btnNewProposal');

const PROPOSAL_STATUS_OPTIONS = ['Aberta', 'Negociando', 'Fechada', 'Perdida', 'Pausada'];
const PROJECT_STATUS_OPTIONS = [
  '',
  'Aguardando dados para contrato',
  'Contrato em elaboração',
  'Aguardando assinatura',
  'Contrato assinado',
  'Em produção',
  'Projeto em andamento',
  'Entrega parcial',
  'Aprovação',
  'Cobrança enviada',
  'Projeto finalizado'
];

const EDITABLE_FIELDS = {
  proposal_number: { type: 'text', label: 'número da proposta' },
  contact_name: { type: 'text', label: 'contato' },
  point_of_contact: { type: 'text', label: 'ponto de contato' },
  budget_date: { type: 'date', label: 'data do orçamento' },
  closing_date: { type: 'date', label: 'data de fechamento' },
  closing_month: { type: 'month', label: 'mês de fechamento' },
  value_usd: { type: 'number', step: '0.01', label: 'valor exterior' },
  value_brl: { type: 'number', step: '0.01', label: 'valor em reais' },
  proposal_status: { type: 'select', options: PROPOSAL_STATUS_OPTIONS, label: 'status do orçamento' },
  project_status: { type: 'select', options: PROJECT_STATUS_OPTIONS, label: 'status do andamento' },
  observations: { type: 'text', label: 'observações' }
};

if (BTN_NEW_PROPOSAL && !permissions.podeAdicionar) {
  BTN_NEW_PROPOSAL.style.display = 'none';
}

function stringValue(value) {
  return String(value ?? '');
}

function lower(value) {
  return stringValue(value).toLowerCase();
}

function findProposal(id) {
  return allProposals.find((proposal) => Number(proposal.id) === Number(id)) || null;
}

async function loadProposals() {
  try {
    TABLE_BODY.innerHTML = '<tr><td colspan="13" class="state-message"><div class="title">Carregando propostas...</div></td></tr>';

    const { data, error } = await db.client
      .from('proposals')
      .select(`
        id,
        proposal_number,
        contact_name,
        point_of_contact,
        budget_date,
        closing_date,
        closing_month,
        value_usd,
        value_brl,
        proposal_status,
        project_status,
        observations,
        client:clients!proposals_client_id_fkey(id, name, legal_name),
        project:projects!proposals_project_id_fkey(id, name, client_id)
      `)
      .order('proposal_number', { ascending: false });

    if (error) {
      console.error('Erro ao carregar propostas:', error);
      renderError();
      return;
    }

    allProposals = data || [];
    filteredProposals = [...allProposals];
    renderCurrentView();
  } catch (error) {
    console.error('Erro:', error);
    renderError();
  }
}

function renderCurrentView() {
  if (SEARCH_INPUT.value.trim()) {
    applySearch();
  } else {
    renderTable();
  }
}

function renderTable() {
  if (filteredProposals.length === 0) {
    TABLE_BODY.innerHTML = '<tr><td colspan="13" class="state-message"><div class="title">Nenhuma proposta corresponde aos critérios.</div></td></tr>';
    FOOTER_INFO.textContent = '0 propostas';
    return;
  }

  TABLE_BODY.innerHTML = filteredProposals.map(renderRow).join('');
  FOOTER_INFO.textContent = `${filteredProposals.length} ${filteredProposals.length === 1 ? 'proposta' : 'propostas'}`;
}

function applyFilters() {
  const filters = {
    number: lower(document.getElementById('filterNumber').value),
    client: lower(document.getElementById('filterClient').value),
    project: lower(document.getElementById('filterProject').value),
    contact: lower(document.getElementById('filterContact').value),
    poc: lower(document.getElementById('filterPOC').value),
    proposalStatus: Array.from(document.getElementById('filterProposalStatus').selectedOptions)
      .map((option) => option.value)
      .filter(Boolean),
    projectStatus: lower(document.getElementById('filterProjectStatus').value),
    budgetDateFrom: document.getElementById('filterBudgetDateFrom').value,
    budgetDateTo: document.getElementById('filterBudgetDateTo').value,
    closingDateFrom: document.getElementById('filterClosingDateFrom').value,
    closingDateTo: document.getElementById('filterClosingDateTo').value,
    month: document.getElementById('filterMonth').value,
    valueUSDMin: parseFloat(document.getElementById('filterValueUSDMin').value) || 0,
    valueUSDMax: parseFloat(document.getElementById('filterValueUSDMax').value) || Infinity,
    valueBRLMin: parseFloat(document.getElementById('filterValueBRLMin').value) || 0,
    valueBRLMax: parseFloat(document.getElementById('filterValueBRLMax').value) || Infinity
  };

  activeFilters = Object.keys(filters).reduce((result, key) => {
    const value = filters[key];
    if (value && value !== '' && (!Array.isArray(value) || value.length > 0)) {
      result[key] = value;
    }
    return result;
  }, {});

  filteredProposals = allProposals.filter((proposal) => {
    const clientText = `${proposal.client?.name || ''} ${proposal.client?.legal_name || ''}`;

    if (filters.number && !lower(proposal.proposal_number).includes(filters.number)) return false;
    if (filters.client && !lower(clientText).includes(filters.client)) return false;
    if (filters.project && !lower(proposal.project?.name).includes(filters.project)) return false;
    if (filters.contact && !lower(proposal.contact_name).includes(filters.contact)) return false;
    if (filters.poc && !lower(proposal.point_of_contact).includes(filters.poc)) return false;
    if (filters.proposalStatus.length && !filters.proposalStatus.includes(proposal.proposal_status)) return false;
    if (filters.projectStatus && !lower(proposal.project_status).includes(filters.projectStatus)) return false;
    if (filters.budgetDateFrom && stringValue(proposal.budget_date) < filters.budgetDateFrom) return false;
    if (filters.budgetDateTo && stringValue(proposal.budget_date) > filters.budgetDateTo) return false;
    if (filters.closingDateFrom && stringValue(proposal.closing_date) < filters.closingDateFrom) return false;
    if (filters.closingDateTo && stringValue(proposal.closing_date) > filters.closingDateTo) return false;
    if (filters.month && proposal.closing_month !== filters.month) return false;
    if (proposal.value_usd != null && (Number(proposal.value_usd) < filters.valueUSDMin || Number(proposal.value_usd) > filters.valueUSDMax)) return false;
    if (proposal.value_brl != null && (Number(proposal.value_brl) < filters.valueBRLMin || Number(proposal.value_brl) > filters.valueBRLMax)) return false;
    return true;
  });

  const count = Object.keys(activeFilters).length;
  if (count > 0) {
    FILTER_COUNT.textContent = ` (${count})`;
    FILTER_COUNT.style.display = 'inline';
  } else {
    FILTER_COUNT.style.display = 'none';
  }

  FILTER_PANEL.classList.remove('show');
  renderCurrentView();
}

function clearFilters() {
  const ids = [
    'filterNumber', 'filterClient', 'filterProject', 'filterContact', 'filterPOC',
    'filterProjectStatus', 'filterBudgetDateFrom', 'filterBudgetDateTo',
    'filterClosingDateFrom', 'filterClosingDateTo', 'filterMonth',
    'filterValueUSDMin', 'filterValueUSDMax', 'filterValueBRLMin', 'filterValueBRLMax'
  ];

  ids.forEach((id) => {
    document.getElementById(id).value = '';
  });

  const statusSelect = document.getElementById('filterProposalStatus');
  Array.from(statusSelect.options).forEach((option) => {
    option.selected = false;
  });

  activeFilters = {};
  FILTER_COUNT.style.display = 'none';
  filteredProposals = [...allProposals];
  renderCurrentView();
}

function applySearch() {
  const searchTerm = lower(SEARCH_INPUT.value).trim();

  if (!searchTerm) {
    renderTable();
    return;
  }

  const searched = filteredProposals.filter((proposal) => {
    const searchableText = [
      proposal.proposal_number,
      proposal.client?.name,
      proposal.client?.legal_name,
      proposal.project?.name,
      proposal.contact_name,
      proposal.point_of_contact,
      proposal.proposal_status,
      proposal.project_status,
      proposal.observations
    ].join(' ').toLowerCase();

    return searchableText.includes(searchTerm);
  });

  TABLE_BODY.innerHTML = searched.length === 0
    ? '<tr><td colspan="13" class="state-message"><div class="title">Nenhuma proposta encontrada.</div></td></tr>'
    : searched.map(renderRow).join('');

  FOOTER_INFO.textContent = `${searched.length} ${searched.length === 1 ? 'proposta' : 'propostas'}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('pt-BR');
}

function formatMonth(monthStr) {
  if (!monthStr) return '—';
  const [year, month] = monthStr.split('-');
  return `${month}/${year}`;
}

function formatCurrency(value, type) {
  if (value === null || value === undefined || value === '') return 'Não informado';
  const formatted = Math.abs(Number(value)).toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return type === 'USD' ? `US$ ${formatted}` : `R$ ${formatted}`;
}

function formatClientName(client) {
  return client?.legal_name || client?.name || 'Cliente não informado';
}

function formatProjectName(project) {
  return project?.name || 'Projeto não informado';
}

function formatBadgeClass(status) {
  return lower(status).replace(/\s+/g, '');
}

function editableCell(proposal, field, content, extraClass = '') {
  const editable = permissions.podeEditar && EDITABLE_FIELDS[field];
  const className = [extraClass, editable ? 'inline-editable-cell' : '']
    .filter(Boolean)
    .join(' ');
  const attributes = editable
    ? ` data-proposal-id="${proposal.id}" data-edit-field="${field}" title="Clique para editar" tabindex="0"`
    : '';

  return `<td class="${className}"${attributes}>${content}</td>`;
}

function renderRow(proposal) {
  const statusContent = `<span class="badge ${formatBadgeClass(proposal.proposal_status)}">${escapeHtml(proposal.proposal_status || '—')}</span>`;

  return `
    <tr>
      <td>
        <button class="action-button" type="button" onclick="window.location.href='./visualizar.html?type=proposal&id=${proposal.id}&returnTo=funil.html'" title="Visualizar proposta">
          <svg viewBox="0 0 24 24">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </td>
      ${editableCell(proposal, 'proposal_number', escapeHtml(proposal.proposal_number || '—'))}
      <td>
        <div class="client-project">
          <strong>${escapeHtml(formatClientName(proposal.client))}</strong>
          <small>${escapeHtml(formatProjectName(proposal.project))}</small>
        </div>
      </td>
      ${editableCell(proposal, 'contact_name', escapeHtml(proposal.contact_name || '—'))}
      ${editableCell(proposal, 'point_of_contact', escapeHtml(proposal.point_of_contact || '—'))}
      ${editableCell(proposal, 'budget_date', escapeHtml(formatDate(proposal.budget_date)))}
      ${editableCell(proposal, 'closing_date', escapeHtml(formatDate(proposal.closing_date)))}
      ${editableCell(proposal, 'closing_month', escapeHtml(formatMonth(proposal.closing_month)))}
      ${editableCell(proposal, 'value_usd', escapeHtml(formatCurrency(proposal.value_usd, 'USD')))}
      ${editableCell(proposal, 'value_brl', escapeHtml(formatCurrency(proposal.value_brl, 'BRL')))}
      ${editableCell(proposal, 'proposal_status', statusContent)}
      ${editableCell(proposal, 'project_status', escapeHtml(proposal.project_status || '—'))}
      ${editableCell(proposal, 'observations', escapeHtml(proposal.observations || '—'), 'observations-cell')}
    </tr>
  `;
}

function inputValueForField(proposal, field) {
  const value = proposal[field];
  return value === null || value === undefined ? '' : String(value);
}

function createEditor(config, currentValue) {
  if (config.type === 'select') {
    const select = document.createElement('select');
    select.className = 'inline-editor-control';
    config.options.forEach((value) => {
      const option = document.createElement('option');
      option.value = value;
      option.textContent = value || '—';
      option.selected = value === currentValue;
      select.appendChild(option);
    });
    return select;
  }

  const input = document.createElement('input');
  input.className = 'inline-editor-control';
  input.type = config.type;
  input.value = currentValue;
  if (config.step) input.step = config.step;
  return input;
}

function normalizeEditedValue(config, rawValue) {
  const trimmed = String(rawValue ?? '').trim();
  if (!trimmed) return null;

  if (config.type === 'number') {
    const number = Number(trimmed);
    if (!Number.isFinite(number)) {
      throw new Error('Informe um valor numérico válido.');
    }
    return number;
  }

  return trimmed;
}

async function startInlineEdit(cell) {
  if (!permissions.podeEditar || cell.dataset.editing === 'true') return;

  const proposal = findProposal(cell.dataset.proposalId);
  const field = cell.dataset.editField;
  const config = EDITABLE_FIELDS[field];
  if (!proposal || !config) return;

  cell.dataset.editing = 'true';
  const originalHtml = cell.innerHTML;
  const editor = createEditor(config, inputValueForField(proposal, field));
  cell.innerHTML = '';
  cell.appendChild(editor);
  editor.focus();
  if (typeof editor.select === 'function' && config.type !== 'date' && config.type !== 'month') {
    editor.select();
  }

  let finished = false;

  const cancel = () => {
    if (finished) return;
    finished = true;
    cell.innerHTML = originalHtml;
    delete cell.dataset.editing;
  };

  const save = async () => {
    if (finished) return;
    finished = true;
    editor.disabled = true;

    try {
      const value = normalizeEditedValue(config, editor.value);
      const payload = { [field]: value };

      if (field === 'closing_date') {
        payload.closing_month = value ? String(value).slice(0, 7) : null;
      }

      await db.updateProposal(proposal.id, payload);
      Object.assign(proposal, payload);
      showToast(`${config.label.charAt(0).toUpperCase()}${config.label.slice(1)} atualizado com sucesso.`, 'success');
      renderCurrentView();
    } catch (error) {
      console.error('[funil inline edit]', error);
      showToast(error?.message || 'Não foi possível salvar a alteração.', 'error');
      cell.innerHTML = originalHtml;
      delete cell.dataset.editing;
    }
  };

  editor.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      cancel();
      return;
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      save();
    }
  });

  editor.addEventListener('blur', save, { once: true });
  if (config.type === 'select') {
    editor.addEventListener('change', save, { once: true });
  }
}

function renderError() {
  TABLE_BODY.innerHTML = '<tr><td colspan="13" class="state-message"><div class="title">Não foi possível carregar o Funil.</div><div class="description">Tente novamente recarregando a página.</div></td></tr>';
  FOOTER_INFO.textContent = '0 propostas';
}

BTN_FILTERS.addEventListener('click', () => {
  FILTER_PANEL.classList.toggle('show');
});

BTN_FILTER_APPLY.addEventListener('click', applyFilters);
BTN_FILTER_CLEAR.addEventListener('click', clearFilters);
SEARCH_INPUT.addEventListener('input', applySearch);

TABLE_BODY.addEventListener('click', (event) => {
  const cell = event.target.closest('td[data-edit-field]');
  if (cell) startInlineEdit(cell);
});

TABLE_BODY.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter' && event.key !== ' ') return;
  const cell = event.target.closest('td[data-edit-field]');
  if (!cell || cell.dataset.editing === 'true') return;
  event.preventDefault();
  startInlineEdit(cell);
});

loadProposals();
