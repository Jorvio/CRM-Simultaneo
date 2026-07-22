import './auth-guard.js?v=20260722-9';
import './user-menu.js?v=20260722-9';
import { db, loadCurrentUserPermissions } from './supabase.js?v=20260722-9';

await window.crmAuthReady;
const access = await loadCurrentUserPermissions().catch(() => null);
if (!access) {
  window.location.href = './login.html';
  throw new Error('Usuário não autenticado');
}

const permissions = access.permissions;

// ===== CONFIGURAÇÃO DE COLUNAS =====
const defaultColumns = [
  { id: 'numero', label: 'Nº Proposta', width: 100 },
  { id: 'cliente', label: 'Cliente', width: 150 },
  { id: 'projeto', label: 'Projeto', width: 140 },
  { id: 'contato', label: 'Contato', width: 120 },
  { id: 'pontoContato', label: 'Ponto de Contato', width: 120 },
  { id: 'dataOrcamento', label: 'Data Orçamento', width: 110 },
  { id: 'dataFechamento', label: 'Data Fechamento', width: 110 },
  { id: 'mesFechamento', label: 'Mês Fechamento', width: 100 },
  { id: 'valorExterior', label: 'Valor USD', width: 110 },
  { id: 'valorReais', label: 'Valor BRL', width: 110 },
  { id: 'formaPagamento', label: 'Forma Pagamento', width: 120 },
  { id: 'parcelamento', label: 'Parcelamento', width: 100 },
  { id: 'vencimento', label: 'Vencimento', width: 110 },
  { id: 'diaPadrao', label: 'Dia Padrão', width: 90 },
  { id: 'valorParcelas', label: 'Valor Parcelas', width: 110 },
  { id: 'statusProposta', label: 'Status Proposta', width: 120 },
  { id: 'statusProjeto', label: 'Status Projeto', width: 150 },
  { id: 'observacoes', label: 'Observações', width: 180 },
  { id: 'criacao', label: 'Criação', width: 110 },
  { id: 'atualizacao', label: 'Atualização', width: 110 }
];

let visibleColumns = [...defaultColumns];
let columnWidths = {};
let data = [];
let filteredData = [];
let selectedRows = new Set();
let currentPage = 1;
let pageSize = 25;
let sortKey = null;
let sortDir = 1;
let isLoading = false;
let loadError = false;

// Filtros
let filters = {
  searchText: '',
  clientFilter: '',
  projectFilter: '',
  proposalStatusFilter: [],
  projectStatusFilter: '',
  paymentMethodFilter: '',
  dateType: 'budget_date',
  dateFrom: '',
  dateTo: '',
  valueMin: '',
  valueMax: '',
  withDueDate: false,
  withoutDueDate: false
};

// ===== DÉBOUNCE =====
function debounce(func, delay = 300) {
  let timeout;
  return function(...args) {
    clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), delay);
  };
}

// ===== FORMATAÇÃO =====
function formatDate(dateStr) {
  if (!dateStr) return '—';
  try {
    const [year, month, day] = dateStr.split('-');
    return `${day}/${month}/${year}`;
  } catch {
    return dateStr;
  }
}

function formatMonth(dateStr) {
  if (!dateStr) return '—';
  try {
    const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
    const [year, month] = dateStr.split('-');
    return `${months[parseInt(month) - 1]}/${year.slice(2)}`;
  } catch {
    return dateStr;
  }
}

function formatCurrency(value, currency = 'BRL') {
  if (value === '' || value === null || value === undefined) return '—';
  const num = Number(value);
  const formatted = num.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return currency === 'USD' ? `US$ ${formatted}` : `R$ ${formatted}`;
}

function getClientName(proposal) {
  return proposal.cliente?.legal_name || proposal.cliente?.name || proposal.cliente?.name || '—';
}

function getProjectName(proposal) {
  return proposal.projeto?.name || '—';
}

function normalizeSearch(text) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

// ===== UTILITÁRIOS =====
function getReturnUrl() {
  const file = window.location.pathname.split('/').pop() || 'funil.html';
  return file + window.location.search + window.location.hash;
}

function getViewUrl(type, id) {
  const returnTo = encodeURIComponent(getReturnUrl());
  return `./visualizar.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&returnTo=${returnTo}`;
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2000);
}

function getStatusBadgeClass(status) {
  const map = {
    'Aberta': 'aberta',
    'Negociando': 'negociando',
    'Fechada': 'fechada',
    'Perdida': 'perdida',
    'Pausada': 'pausada'
  };
  return map[status] || 'pausada';
}

// ===== COLUNAS =====
function loadColumnPreferences() {
  const saved = localStorage.getItem('crm.funil.columnVisibility');
  if (saved) {
    try {
      const visible = JSON.parse(saved);
      visibleColumns = defaultColumns.filter(col => visible.includes(col.id));
    } catch {
      visibleColumns = [...defaultColumns];
    }
  }

  const savedWidths = localStorage.getItem('crm.funil.columnWidths');
  if (savedWidths) {
    try {
      columnWidths = JSON.parse(savedWidths);
    } catch {
      columnWidths = {};
    }
  }
}

function saveColumnPreferences() {
  localStorage.setItem('crm.funil.columnVisibility', JSON.stringify(visibleColumns.map(c => c.id)));
  localStorage.setItem('crm.funil.columnWidths', JSON.stringify(columnWidths));
}

function renderColumnsModal() {
  const container = document.getElementById('columnsListModal');
  container.innerHTML = visibleColumns.map((col, idx) => `
    <div class="checkbox-item" style="display: flex; justify-content: space-between; align-items: center; padding: 8px 0;">
      <div>
        <input type="checkbox" id="col_${col.id}" checked data-col-id="${col.id}">
        <label for="col_${col.id}" style="margin: 0; font-weight: 500;">${col.label}</label>
      </div>
      <div style="display: flex; gap: 4px;">
        <button class="col-move-up" data-idx="${idx}" style="background: none; border: none; cursor: pointer; padding: 4px 8px;">↑</button>
        <button class="col-move-down" data-idx="${idx}" style="background: none; border: none; cursor: pointer; padding: 4px 8px;">↓</button>
      </div>
    </div>
  `).join('');

  document.querySelectorAll('.col-move-up').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx > 0) {
        [visibleColumns[idx - 1], visibleColumns[idx]] = [visibleColumns[idx], visibleColumns[idx - 1]];
        renderColumnsModal();
        applyTable();
      }
    };
  });

  document.querySelectorAll('.col-move-down').forEach(btn => {
    btn.onclick = () => {
      const idx = parseInt(btn.dataset.idx);
      if (idx < visibleColumns.length - 1) {
        [visibleColumns[idx], visibleColumns[idx + 1]] = [visibleColumns[idx + 1], visibleColumns[idx]];
        renderColumnsModal();
        applyTable();
      }
    };
  });
}

// ===== FILTROS =====
function applyFilters() {
  filters.searchText = document.getElementById('searchInput').value;
  filters.clientFilter = normalizeSearch(document.getElementById('filterClient').value);
  filters.projectFilter = normalizeSearch(document.getElementById('filterProject').value);
  filters.projectStatusFilter = normalizeSearch(document.getElementById('filterProjectStatus').value);
  filters.paymentMethodFilter = normalizeSearch(document.getElementById('filterPaymentMethod').value);
  filters.dateType = document.getElementById('filterDateType').value;
  filters.dateFrom = document.getElementById('filterDateFrom').value;
  filters.dateTo = document.getElementById('filterDateTo').value;
  filters.valueMin = document.getElementById('filterValueMin').value;
  filters.valueMax = document.getElementById('filterValueMax').value;
  filters.withDueDate = document.getElementById('filterWithDueDate').checked;
  filters.withoutDueDate = document.getElementById('filterWithoutDueDate').checked;

  const selected = document.getElementById('filterProposalStatus');
  filters.proposalStatusFilter = Array.from(selected.options)
    .filter(opt => opt.selected && opt.value)
    .map(opt => opt.value);

  applySearch();
  currentPage = 1;
  renderTable();
  renderSummaryCards();
}

function applySearch() {
  let result = [...data];

  // Pesquisa global
  if (filters.searchText) {
    const normalized = normalizeSearch(filters.searchText);
    result = result.filter(row => {
      const haystack = normalizeSearch(
        `${row.numero} ${getClientName(row)} ${getProjectName(row)} ${row.contato} ${row.pontoContato} ${row.observacoes}`
      );
      return haystack.includes(normalized);
    });
  }

  // Filtros específicos
  result = result.filter(row => {
    if (filters.clientFilter) {
      const clientName = normalizeSearch(getClientName(row));
      if (!clientName.includes(filters.clientFilter)) return false;
    }

    if (filters.projectFilter) {
      const projectName = normalizeSearch(getProjectName(row));
      if (!projectName.includes(filters.projectFilter)) return false;
    }

    if (filters.proposalStatusFilter.length > 0) {
      if (!filters.proposalStatusFilter.includes(row.statusProposta)) return false;
    }

    if (filters.projectStatusFilter) {
      const status = normalizeSearch(row.statusProjeto || '');
      if (!status.includes(filters.projectStatusFilter)) return false;
    }

    if (filters.paymentMethodFilter) {
      const method = normalizeSearch(row.formaPagamento || '');
      if (!method.includes(filters.paymentMethodFilter)) return false;
    }

    if (filters.dateFrom || filters.dateTo) {
      const dateField = row[filters.dateType === 'budget_date' ? 'dataOrcamento' : filters.dateType === 'closing_date' ? 'dataFechamento' : filters.dateType === 'payment_due_date' ? 'vencimento' : 'criacao'];
      if (dateField) {
        if (filters.dateFrom && dateField < filters.dateFrom) return false;
        if (filters.dateTo && dateField > filters.dateTo) return false;
      }
    }

    const val = parseFloat(row.valorReais) || 0;
    if (filters.valueMin && val < parseFloat(filters.valueMin)) return false;
    if (filters.valueMax && val > parseFloat(filters.valueMax)) return false;

    if (filters.withDueDate && !row.vencimento) return false;
    if (filters.withoutDueDate && row.vencimento) return false;

    return true;
  });

  // Ordenação
  if (sortKey) {
    result.sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];

      if (sortKey === 'valorReais' || sortKey === 'valorExterior') {
        av = parseFloat(av) || 0;
        bv = parseFloat(bv) || 0;
      } else if (sortKey.includes('data') || sortKey.includes('criacao') || sortKey.includes('atualizacao')) {
        av = av || '';
        bv = bv || '';
      } else {
        av = String(av).toLowerCase();
        bv = String(bv).toLowerCase();
      }

      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }

  filteredData = result;
}

function clearFilters() {
  document.getElementById('filterClient').value = '';
  document.getElementById('filterProject').value = '';
  document.getElementById('filterProposalStatus').value = '';
  document.getElementById('filterProjectStatus').value = '';
  document.getElementById('filterPaymentMethod').value = '';
  document.getElementById('filterDateFrom').value = '';
  document.getElementById('filterDateTo').value = '';
  document.getElementById('filterValueMin').value = '';
  document.getElementById('filterValueMax').value = '';
  document.getElementById('filterWithDueDate').checked = false;
  document.getElementById('filterWithoutDueDate').checked = false;
  applyFilters();
}

// ===== RESUMO CARDS =====
function renderSummaryCards() {
  const container = document.getElementById('summaryCards');
  const statuses = ['Aberta', 'Negociando', 'Fechada', 'Perdida', 'Pausada'];

  const cards = statuses.map(status => {
    const count = filteredData.filter(p => p.statusProposta === status).length;
    const total = filteredData
      .filter(p => p.statusProposta === status)
      .reduce((sum, p) => sum + (parseFloat(p.valorReais) || 0), 0);

    return {
      status,
      count,
      total,
      class: getStatusBadgeClass(status)
    };
  });

  // Card de total
  const grandTotal = filteredData.reduce((sum, p) => sum + (parseFloat(p.valorReais) || 0), 0);
  const usdTotal = filteredData.reduce((sum, p) => sum + (parseFloat(p.valorExterior) || 0), 0);

  container.innerHTML = cards.map(card => `
    <div class="card" onclick="applyStatusFilter('${card.status}')" title="Filtrar por ${card.status}">
      <div class="card-number">${card.count}</div>
      <div class="card-label">${card.status}</div>
      <div class="card-value">${formatCurrency(card.total)}</div>
    </div>
  `).join('') + `
    <div class="card" title="Total do período">
      <div class="card-number" style="font-size: 18px;">R$ ${(grandTotal/1000).toFixed(1)}k</div>
      <div class="card-label">Total Período</div>
      <div class="card-value">${formatCurrency(usdTotal, 'USD')}</div>
    </div>
  `;
}

function applyStatusFilter(status) {
  const select = document.getElementById('filterProposalStatus');
  const isSelected = Array.from(select.options).some(opt => opt.value === status && opt.selected);

  Array.from(select.options).forEach(opt => {
    if (opt.value === status) opt.selected = !isSelected;
  });

  applyFilters();
}

// ===== TABELA =====
function renderTable() {
  const container = document.getElementById('tableState');

  if (isLoading) {
    container.innerHTML = `
      <div class="state-loading">
        <div class="state-icon">⏳</div>
        <div class="state-title">Carregando propostas...</div>
      </div>
    `;
    return;
  }

  if (loadError) {
    container.innerHTML = `
      <div class="state-error">
        <div class="state-icon">❌</div>
        <div class="state-title">Erro ao carregar</div>
        <div class="state-message">Não foi possível carregar as propostas</div>
        <button class="btn" onclick="loadProposals()">Tentar Novamente</button>
      </div>
    `;
    return;
  }

  if (filteredData.length === 0) {
    const message = data.length === 0 ? 'Nenhuma proposta cadastrada' : 'Nenhuma proposta corresponde aos filtros';
    container.innerHTML = `
      <div class="state-empty">
        <div class="state-icon">📭</div>
        <div class="state-title">${message}</div>
      </div>
    `;
    return;
  }

  // Paginação
  const totalPages = Math.ceil(filteredData.length / pageSize);
  const start = (currentPage - 1) * pageSize;
  const pageData = filteredData.slice(start, start + pageSize);

  const table = document.createElement('table');
  table.innerHTML = `
    <thead>
      <tr>
        <th class="checkbox-col">
          <input type="checkbox" id="selectAll" onchange="toggleSelectAll(this.checked)">
        </th>
        ${visibleColumns.map(col => `
          <th onclick="setSortKey('${col.id}')">
            ${col.label}
            ${sortKey === col.id ? `<span class="sort-indicator">${sortDir === 1 ? '▲' : '▼'}</span>` : ''}
          </th>
        `).join('')}
        <th style="width: 180px;">Ações</th>
      </tr>
    </thead>
    <tbody>
      ${pageData.map(row => renderTableRow(row)).join('')}
    </tbody>
  `;

  container.innerHTML = '';
  container.appendChild(table);

  // Footer
  updateFooter(filteredData.length, pageData.length, totalPages);
}

function renderTableRow(row) {
  const cells = visibleColumns.map(col => {
    const value = row[col.id];
    let cellContent = '';

    switch (col.id) {
      case 'cliente':
        cellContent = `<span class="link-cell" onclick="navigateTo('client', ${row.client_id})">${getClientName(row)}</span>`;
        break;
      case 'projeto':
        cellContent = `<span class="link-cell" onclick="navigateTo('project', ${row.project_id})">${getProjectName(row)}</span>`;
        break;
      case 'dataOrcamento':
      case 'dataFechamento':
      case 'vencimento':
      case 'criacao':
      case 'atualizacao':
        cellContent = `<span class="date-cell">${formatDate(value)}</span>`;
        break;
      case 'mesFechamento':
        cellContent = `<span class="date-cell">${formatMonth(value)}</span>`;
        break;
      case 'valorReais':
      case 'valorExterior':
        cellContent = `<span class="money-cell">${formatCurrency(value, col.id === 'valorExterior' ? 'USD' : 'BRL')}</span>`;
        break;
      case 'statusProposta':
        cellContent = `<span class="badge ${getStatusBadgeClass(value)}" onclick="editStatus(event, '${row.id}', '${col.id}')">${value}</span>`;
        break;
      default:
        cellContent = value || '—';
    }

    return `<td${col.id === 'cliente' || col.id === 'projeto' ? ' class="link-cell"' : ''}>${cellContent}</td>`;
  }).join('');

  return `
    <tr>
      <td class="checkbox-col">
        <input type="checkbox" data-row-id="${row.id}" onchange="toggleSelectRow(this)">
      </td>
      ${cells}
      <td class="actions-cell">
        <button onclick="navigateTo('proposal', ${row.id})" title="Visualizar">👁️ Ver</button>
        ${permissions.podeEditar ? `<button onclick="editProposal(${row.id})" title="Editar">✏️ Editar</button>` : ''}
        ${permissions.podeExcluir ? `<button onclick="deleteProposal(${row.id})" title="Excluir">🗑️ Del</button>` : ''}
      </td>
    </tr>
  `;
}

function updateFooter(totalCount, pageCount, totalPages) {
  const start = (currentPage - 1) * pageSize + 1;
  const end = start + pageCount - 1;

  document.getElementById('footerInfo').textContent = `${pageCount} proposta${pageCount !== 1 ? 's' : ''} exibida${pageCount !== 1 ? 's' : ''} (${totalCount} no total)`;
  document.getElementById('pageInfo').textContent = `Página ${currentPage} de ${totalPages}`;

  document.getElementById('btnPrevPage').disabled = currentPage === 1;
  document.getElementById('btnNextPage').disabled = currentPage >= totalPages;
}

// ===== PAGINAÇÃO =====
function setSortKey(key) {
  if (sortKey === key) {
    sortDir *= -1;
  } else {
    sortKey = key;
    sortDir = 1;
  }
  applySearch();
  currentPage = 1;
  renderTable();
}

function goToPage(direction) {
  const totalPages = Math.ceil(filteredData.length / pageSize);
  if (direction === 'prev' && currentPage > 1) currentPage--;
  if (direction === 'next' && currentPage < totalPages) currentPage++;
  renderTable();
}

function changePageSize(size) {
  pageSize = parseInt(size);
  currentPage = 1;
  renderTable();
}

// ===== SELEÇÃO =====
function toggleSelectAll(checked) {
  document.querySelectorAll('tbody input[type="checkbox"]').forEach(cb => {
    cb.checked = checked;
    toggleSelectRow({ target: cb });
  });
}

function toggleSelectRow(e) {
  const rowId = e.target.dataset.rowId;
  if (e.target.checked) {
    selectedRows.add(rowId);
  } else {
    selectedRows.delete(rowId);
  }
}

// ===== AÇÕES =====
function navigateTo(type, id) {
  window.location.href = getViewUrl(type, id);
}

function editProposal(id) {
  window.location.href = `./proposta.html?id=${id}&returnTo=${encodeURIComponent(getReturnUrl())}`;
}

async function deleteProposal(id) {
  if (!confirm('Confirmar exclusão desta proposta?')) return;
  if (!permissions.podeExcluir) {
    showToast('Sem permissão para excluir');
    return;
  }

  try {
    await db.deleteProposal(id);
    data = data.filter(p => p.id !== id);
    applySearch();
    renderTable();
    renderSummaryCards();
    showToast('Proposta excluída com sucesso');
  } catch (error) {
    console.error('Erro ao excluir:', error);
    showToast('Erro ao excluir proposta');
  }
}

async function editStatus(e, id, field) {
  if (!permissions.podeEditar) return;
  e.stopPropagation();

  const row = data.find(p => p.id === id);
  if (!row) return;

  const options = ['Aberta', 'Negociando', 'Fechada', 'Perdida', 'Pausada'];
  const current = row.statusProposta;

  const newStatus = prompt(`Novo status (${options.join(', ')}):`, current);
  if (!newStatus || newStatus === current) return;

  if (!options.includes(newStatus)) {
    showToast('Status inválido');
    return;
  }

  try {
    await db.updateProposal(id, { proposal_status: newStatus });
    row.statusProposta = newStatus;
    applySearch();
    renderTable();
    renderSummaryCards();
    showToast('Status atualizado com sucesso');
  } catch (error) {
    console.error('Erro ao atualizar:', error);
    showToast('Erro ao atualizar status');
  }
}

// ===== EXPORTAÇÃO =====
function exportData(exportType) {
  let exportRows = [];

  if (exportType === 'all') {
    exportRows = data;
  } else if (exportType === 'filtered') {
    exportRows = filteredData;
  } else if (exportType === 'selected') {
    exportRows = data.filter(p => selectedRows.has(p.id));
  }

  if (exportRows.length === 0) {
    showToast('Nenhum registro para exportar');
    return;
  }

  const exportColumns = visibleColumns.map(col => col.label);
  const exportData = exportRows.map(row =>
    visibleColumns.map(col => {
      const value = row[col.id];
      if (col.id === 'cliente') return getClientName(row);
      if (col.id === 'projeto') return getProjectName(row);
      if (col.id.includes('data')) return formatDate(value);
      if (col.id === 'mesFechamento') return formatMonth(value);
      if (col.id === 'valorReais' || col.id === 'valorExterior') return value;
      return value || '';
    })
  );

  const worksheet = XLSX.utils.aoa_to_sheet([exportColumns, ...exportData]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, 'Propostas');
  XLSX.writeFile(workbook, `propostas_${new Date().getTime()}.xlsx`);

  showToast('Arquivo exportado com sucesso');
  document.getElementById('exportModal').classList.remove('show');
}

// ===== NORMALIZAÇÃO DE DADOS =====
function normalizeProposal(raw) {
  return {
    id: raw.id,
    numero: raw.proposal_number || '',
    cliente: raw.cliente || {},
    projeto: raw.projeto || {},
    client_id: raw.client_id,
    project_id: raw.project_id,
    contato: raw.contact_name || '—',
    pontoContato: raw.point_of_contact || '—',
    dataOrcamento: raw.budget_date || '',
    dataFechamento: raw.closing_date || '',
    mesFechamento: raw.closing_month || '',
    valorExterior: raw.value_usd,
    valorReais: raw.value_brl,
    formaPagamento: raw.payment_method || '',
    parcelamento: raw.installment_terms || '',
    vencimento: raw.payment_due_date || '',
    diaPadrao: raw.installment_due_day || '',
    valorParcelas: raw.installment_value || '',
    statusProposta: raw.proposal_status || 'Pausada',
    statusProjeto: raw.project_status || '—',
    observacoes: raw.notes || '',
    criacao: raw.created_at || '',
    atualizacao: raw.updated_at || ''
  };
}

// ===== CARREGAMENTO =====
async function loadProposals() {
  isLoading = true;
  loadError = false;
  renderTable();

  try {
    const proposals = await db.fetchProposals();
    data = Array.isArray(proposals) ? proposals.map(normalizeProposal) : [];
    applySearch();
    currentPage = 1;
    renderTable();
    renderSummaryCards();
  } catch (error) {
    console.error('Erro ao carregar propostas:', error);
    loadError = true;
    renderTable();
  } finally {
    isLoading = false;
  }
}

// ===== EVENT LISTENERS =====
document.getElementById('searchInput').addEventListener('input', debounce(() => {
  applyFilters();
}, 300));

document.getElementById('btnFilters').addEventListener('click', () => {
  const panel = document.getElementById('filterPanel');
  panel.classList.toggle('show');
});

document.getElementById('btnFilterApply').addEventListener('click', applyFilters);
document.getElementById('btnFilterClear').addEventListener('click', clearFilters);

document.getElementById('btnColumns').addEventListener('click', () => {
  renderColumnsModal();
  document.getElementById('columnsModal').classList.add('show');
});

document.getElementById('btnColumnsReset').addEventListener('click', () => {
  visibleColumns = [...defaultColumns];
  columnWidths = {};
  saveColumnPreferences();
  renderColumnsModal();
  renderTable();
  showToast('Colunas restauradas');
});

document.getElementById('columnsListModal').addEventListener('change', (e) => {
  if (e.target.type === 'checkbox' && e.target.id.startsWith('col_')) {
    const colId = e.target.dataset.colId;
    if (e.target.checked) {
      const col = defaultColumns.find(c => c.id === colId);
      if (col) visibleColumns.push(col);
    } else {
      visibleColumns = visibleColumns.filter(c => c.id !== colId);
    }
    saveColumnPreferences();
    renderTable();
  }
});

document.getElementById('btnExport').addEventListener('click', () => {
  document.getElementById('exportModal').classList.add('show');
});

document.getElementById('btnExportAll').addEventListener('click', () => exportData('all'));
document.getElementById('btnExportFiltered').addEventListener('click', () => exportData('filtered'));
document.getElementById('btnExportSelected').addEventListener('click', () => exportData('selected'));

document.getElementById('btnPrevPage').addEventListener('click', () => goToPage('prev'));
document.getElementById('btnNextPage').addEventListener('click', () => goToPage('next'));
document.getElementById('pageSize').addEventListener('change', (e) => changePageSize(e.target.value));

if (!permissions.podeAdicionar) {
  document.getElementById('btnNovaProposta').style.display = 'none';
}

// ===== INICIALIZAÇÃO =====
loadColumnPreferences();
loadProposals();
