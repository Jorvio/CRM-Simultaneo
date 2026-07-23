import { supabase } from './supabase.js';
import { showToast } from './ui.js';

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

async function loadProposals() {
  try {
    TABLE_BODY.innerHTML = '<tr><td colspan="13" class="state-message"><div class="title">Carregando propostas...</div></td></tr>';

    const { data, error } = await supabase
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
    renderTable();
  } catch (err) {
    console.error('Erro:', err);
    renderError();
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
    number: document.getElementById('filterNumber').value.toLowerCase(),
    client: document.getElementById('filterClient').value.toLowerCase(),
    project: document.getElementById('filterProject').value.toLowerCase(),
    contact: document.getElementById('filterContact').value.toLowerCase(),
    poc: document.getElementById('filterPOC').value.toLowerCase(),
    proposalStatus: Array.from(document.getElementById('filterProposalStatus').selectedOptions).map(o => o.value).filter(v => v),
    projectStatus: document.getElementById('filterProjectStatus').value.toLowerCase(),
    budgetDateFrom: document.getElementById('filterBudgetDateFrom').value,
    budgetDateTo: document.getElementById('filterBudgetDateTo').value,
    closingDateFrom: document.getElementById('filterClosingDateFrom').value,
    closingDateTo: document.getElementById('filterClosingDateTo').value,
    month: document.getElementById('filterMonth').value,
    valueUSDMin: parseFloat(document.getElementById('filterValueUSDMin').value) || 0,
    valueUSDMax: parseFloat(document.getElementById('filterValueUSDMax').value) || Infinity,
    valueBRLMin: parseFloat(document.getElementById('filterValueBRLMin').value) || 0,
    valueBRLMax: parseFloat(document.getElementById('filterValueBRLMax').value) || Infinity,
  };

  activeFilters = Object.keys(filters).reduce((acc, key) => {
    if (filters[key] && filters[key] !== '' && (!Array.isArray(filters[key]) || filters[key].length > 0)) {
      acc[key] = filters[key];
    }
    return acc;
  }, {});

  filteredProposals = allProposals.filter(proposal => {
    if (filters.number && !proposal.proposal_number.toLowerCase().includes(filters.number)) return false;
    if (filters.client && !(proposal.client?.name + proposal.client?.legal_name).toLowerCase().includes(filters.client)) return false;
    if (filters.project && !proposal.project?.name?.toLowerCase().includes(filters.project)) return false;
    if (filters.contact && !proposal.contact_name?.toLowerCase().includes(filters.contact)) return false;
    if (filters.poc && !proposal.point_of_contact?.toLowerCase().includes(filters.poc)) return false;
    if (filters.proposalStatus.length && !filters.proposalStatus.includes(proposal.proposal_status)) return false;
    if (filters.projectStatus && !proposal.project_status?.toLowerCase().includes(filters.projectStatus)) return false;
    if (filters.budgetDateFrom && proposal.budget_date < filters.budgetDateFrom) return false;
    if (filters.budgetDateTo && proposal.budget_date > filters.budgetDateTo) return false;
    if (filters.closingDateFrom && proposal.closing_date < filters.closingDateFrom) return false;
    if (filters.closingDateTo && proposal.closing_date > filters.closingDateTo) return false;
    if (filters.month && proposal.closing_month !== filters.month) return false;
    if (proposal.value_usd && (proposal.value_usd < filters.valueUSDMin || proposal.value_usd > filters.valueUSDMax)) return false;
    if (proposal.value_brl && (proposal.value_brl < filters.valueBRLMin || proposal.value_brl > filters.valueBRLMax)) return false;
    return true;
  });

  const filterCount = Object.keys(activeFilters).length;
  if (filterCount > 0) {
    FILTER_COUNT.textContent = ` (${filterCount})`;
    FILTER_COUNT.style.display = 'inline';
  } else {
    FILTER_COUNT.style.display = 'none';
  }

  FILTER_PANEL.classList.remove('show');
  renderTable();
  applySearch();
}

function clearFilters() {
  document.getElementById('filterNumber').value = '';
  document.getElementById('filterClient').value = '';
  document.getElementById('filterProject').value = '';
  document.getElementById('filterContact').value = '';
  document.getElementById('filterPOC').value = '';
  document.getElementById('filterProposalStatus').value = '';
  document.getElementById('filterProjectStatus').value = '';
  document.getElementById('filterBudgetDateFrom').value = '';
  document.getElementById('filterBudgetDateTo').value = '';
  document.getElementById('filterClosingDateFrom').value = '';
  document.getElementById('filterClosingDateTo').value = '';
  document.getElementById('filterMonth').value = '';
  document.getElementById('filterValueUSDMin').value = '';
  document.getElementById('filterValueUSDMax').value = '';
  document.getElementById('filterValueBRLMin').value = '';
  document.getElementById('filterValueBRLMax').value = '';

  activeFilters = {};
  FILTER_COUNT.style.display = 'none';
  filteredProposals = [...allProposals];
  renderTable();
  applySearch();
}

function applySearch() {
  const searchTerm = SEARCH_INPUT.value.toLowerCase().trim();
  if (!searchTerm) {
    renderTable();
    return;
  }

  const searched = filteredProposals.filter(proposal => {
    const observationType = getObservationType(proposal.project_status);
    const searchableText = [
      proposal.proposal_number,
      proposal.client?.name,
      proposal.client?.legal_name,
      proposal.project?.name,
      proposal.contact_name,
      proposal.point_of_contact,
      proposal.proposal_status,
      proposal.project_status,
      observationType.label
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
  const date = new Date(dateStr + 'T00:00:00');
  return date.toLocaleDateString('pt-BR');
}

function formatMonth(monthStr) {
  if (!monthStr) return '—';
  const [year, month] = monthStr.split('-');
  return `${month}/${year}`;
}

function formatCurrency(value, type) {
  if (!value && value !== 0) return 'Não informado';
  const formatted = Math.abs(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return type === 'USD' ? `US$ ${formatted}` : `R$ ${formatted}`;
}

function formatClientName(client) {
  if (!client) return 'Cliente não informado';
  return client.legal_name || client.name || 'Cliente não informado';
}

function formatProjectName(project) {
  if (!project) return 'Projeto não informado';
  return project.name || 'Projeto não informado';
}

function formatProposalNumber(num) {
  return num || '—';
}

function formatBadgeClass(status) {
  if (!status) return '';
  return status.toLowerCase().replace(/\s+/g, '');
}

function getObservationType(projectStatus) {
  const value = String(projectStatus || '').toLowerCase();

  if (value.includes('nf') || value.includes('nota fiscal') || value.includes('boleto')) {
    return { label: 'NF e boleto enviado', className: 'obs-type-financeiro' };
  }

  if (value.includes('contrato')) {
    return { label: 'Contrato enviado', className: 'obs-type-contrato' };
  }

  return { label: '—', className: 'obs-type-empty' };
}

function renderRow(proposal) {
  const observationType = getObservationType(proposal.project_status);

  return `
    <tr>
      <td>
        <button class="action-button" onclick="window.location.href='./visualizar.html?type=proposal&id=${proposal.id}&returnTo=funil.html'" title="Visualizar proposta">
          <svg viewBox="0 0 24 24">
            <path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z" fill="none" stroke="currentColor" stroke-width="2"/>
            <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="2"/>
          </svg>
        </button>
      </td>
      <td>${formatProposalNumber(proposal.proposal_number)}</td>
      <td>
        <div class="client-project">
          <strong>${formatClientName(proposal.client)}</strong>
          <small>${formatProjectName(proposal.project)}</small>
        </div>
      </td>
      <td>${proposal.contact_name || '—'}</td>
      <td>${proposal.point_of_contact || '—'}</td>
      <td>${formatDate(proposal.budget_date)}</td>
      <td>${formatDate(proposal.closing_date)}</td>
      <td>${formatMonth(proposal.closing_month)}</td>
      <td>${formatCurrency(proposal.value_usd, 'USD')}</td>
      <td>${formatCurrency(proposal.value_brl, 'BRL')}</td>
      <td><span class="badge ${formatBadgeClass(proposal.proposal_status)}">${proposal.proposal_status || '—'}</span></td>
      <td>${proposal.project_status || '—'}</td>
      <td><span class="obs-type ${observationType.className}">${observationType.label}</span></td>
    </tr>
  `;
}

function renderError() {
  TABLE_BODY.innerHTML = '<tr><td colspan="13" class="state-message"><div class="title">Não foi possível carregar o Funil.</div><div class="description">Tente novamente recarregando a página.</div></td></tr>';
  FOOTER_INFO.textContent = '0 propostas';
}

// Event Listeners
BTN_FILTERS.addEventListener('click', () => {
  FILTER_PANEL.classList.toggle('show');
});

BTN_FILTER_APPLY.addEventListener('click', applyFilters);
BTN_FILTER_CLEAR.addEventListener('click', clearFilters);

SEARCH_INPUT.addEventListener('input', applySearch);

// Initialize
loadProposals();
