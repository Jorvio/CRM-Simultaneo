import './auth-guard.js?v=20260722-1';
import './user-menu.js?v=20260722-1';
import { db, loadCurrentUserPermissions } from './supabase.js?v=20260722-2';

await window.crmAuthReady;
const access = await loadCurrentUserPermissions().catch(() => null);
if (!access) {
  window.location.href = './login.html';
  throw new Error('Usuário não autenticado');
}

const permissions = access.permissions;
const btnNovaProposta = document.getElementById('btnNovaProposta');
if (btnNovaProposta && !permissions.podeAdicionar) {
  btnNovaProposta.style.display = 'none';
}

const columns = [
  { key: 'numero', label: 'Nº Proposta', type: 'text', width: 110 },
  { key: 'cliente', label: 'Cliente', type: 'link-client', width: 150 },
  { key: 'projeto', label: 'Projeto', type: 'link-project', width: 150 },
  { key: 'contato', label: 'Contato', type: 'text', width: 130 },
  { key: 'pontoContato', label: 'Ponto de Contato', type: 'text', width: 130 },
  { key: 'dataOrcamento', label: 'Data Orçamento', type: 'date', width: 120 },
  { key: 'dataFechamento', label: 'Data Fechamento', type: 'date', width: 120 },
  { key: 'mesFechamento', label: 'Mês Fecham.', type: 'computed', width: 100 },
  { key: 'valorExterior', label: 'Valor Exterior', type: 'money-usd', width: 110 },
  { key: 'valorReais', label: 'Valor R$', type: 'money-brl', width: 110 },
  { key: 'statusProposta', label: 'Status Proposta', type: 'status-proposta', width: 130 },
  { key: 'statusProjeto', label: 'Status Projeto', type: 'status-projeto', width: 150 },
  { key: 'obs', label: 'Observações', type: 'text-long', width: 180 }
];

const statusPropostaOptions = ['Aberta', 'Negociando', 'Fechada', 'Perdida', 'Pausada'];

let data = [];
let filterText = '';
let activeStatuses = new Set();
let sortKey = null;
let sortDir = 1;
let proposalsLoadError = false;

function obterUrlAtualRelativa() {
  const arquivo = window.location.pathname.split('/').pop() || 'funil.html';
  return arquivo + window.location.search + window.location.hash;
}

function criarUrlVisualizacao(type, id) {
  const returnTo = encodeURIComponent(obterUrlAtualRelativa());
  return `./visualizar.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&returnTo=${returnTo}`;
}

function monthLabel(dateStr) {
  if (!dateStr) return '—';
  const months = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  const date = new Date(`${dateStr}T00:00:00`);
  return `${months[date.getMonth()]}/${String(date.getFullYear()).slice(2)}`;
}

function formatMoney(value, currency) {
  if (value === '' || value === null || value === undefined) return '—';
  const number = Number(value);
  return `${currency === 'USD' ? 'US$ ' : 'R$ '}${number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr) {
  if (!dateStr) return '—';
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

function statusClass(status, kind) {
  if (kind === 'proposta') {
    const map = { Aberta: 'aberta', Negociando: 'negociando', Fechada: 'fechada', Perdida: 'perdida', Pausada: 'pausada' };
    return map[status] || 'pausada';
  }
  return 'aberta';
}

function showToast(message) {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 1800);
}

function montarPayloadProposta(row, changedKey) {
  const proposalFieldMap = {
    numero: 'proposal_number',
    contato: 'contact_name',
    pontoContato: 'point_of_contact',
    dataOrcamento: 'budget_date',
    dataFechamento: 'closing_date',
    valorExterior: 'value_usd',
    valorReais: 'value_brl',
    statusProposta: 'proposal_status',
    statusProjeto: 'project_status',
    obs: 'notes'
  };

  const payload = {};
  if (changedKey) {
    const dbField = proposalFieldMap[changedKey];
    if (!dbField) return payload;
    payload[dbField] = changedKey === 'valorExterior' || changedKey === 'valorReais'
      ? (row[changedKey] === '' || row[changedKey] == null ? null : Number(row[changedKey]))
      : (row[changedKey] || null);
    if (changedKey === 'dataFechamento') {
      payload.closing_month = row.dataFechamento ? monthLabel(row.dataFechamento) : null;
    }
    return payload;
  }

  payload.proposal_number = row.numero;
  payload.client_id = row.client_id || null;
  payload.project_id = row.project_id || null;
  payload.contact_id = row.contact_id || null;
  payload.contact_name = row.contato || null;
  payload.point_of_contact = row.pontoContato || null;
  payload.budget_date = row.dataOrcamento || null;
  payload.closing_date = row.dataFechamento || null;
  payload.closing_month = row.dataFechamento ? monthLabel(row.dataFechamento) : null;
  payload.value_usd = row.valorExterior === '' || row.valorExterior == null ? null : Number(row.valorExterior);
  payload.value_brl = row.valorReais === '' || row.valorReais == null ? null : Number(row.valorReais);
  payload.payment_method = row.proposalPaymentMethod || null;
  payload.installment_terms = row.proposalInstallmentTerms || null;
  payload.payment_due_date = row.proposalPaymentDueDate || null;
  payload.installment_due_day = row.proposalInstallmentDueDay === '' || row.proposalInstallmentDueDay == null ? null : Number(row.proposalInstallmentDueDay);
  payload.installment_value = row.proposalInstallmentValue === '' || row.proposalInstallmentValue == null ? null : Number(row.proposalInstallmentValue);
  payload.contract_delivery_method = row.proposalContractDeliveryMethod || null;
  payload.billing_delivery_method = row.proposalBillingDeliveryMethod || null;
  payload.proposal_status = row.statusProposta || null;
  payload.project_status = row.statusProjeto || null;
  payload.notes = row.obs || null;
  return payload;
}

function renderHeader() {
  const row = document.getElementById('headerRow');
  row.innerHTML = '';
  columns.forEach((col) => {
    const th = document.createElement('th');
    th.style.width = `${col.width}px`;
    let arrow = '';
    if (sortKey === col.key) arrow = `<span class="sort-arrow">${sortDir === 1 ? '▲' : '▼'}</span>`;
    th.innerHTML = col.label + arrow;
    th.onclick = () => {
      if (sortKey === col.key) {
        sortDir *= -1;
      } else {
        sortKey = col.key;
        sortDir = 1;
      }
      render();
    };
    row.appendChild(th);
  });
  const thActions = document.createElement('th');
  thActions.style.width = '220px';
  thActions.textContent = 'Ações';
  thActions.style.cursor = 'default';
  row.appendChild(thActions);
}

function renderStatusFilters() {
  const wrap = document.getElementById('statusFilters');
  wrap.innerHTML = '';
  statusPropostaOptions.forEach((status) => {
    const chip = document.createElement('div');
    chip.className = `chip${activeStatuses.has(status) ? ' active' : ''}`;
    chip.textContent = status;
    chip.onclick = () => {
      if (activeStatuses.has(status)) activeStatuses.delete(status); else activeStatuses.add(status);
      render();
    };
    wrap.appendChild(chip);
  });
}

function renderSummary() {
  const wrap = document.getElementById('summaryPills');
  const total = data.length;
  const abertas = data.filter((item) => String(item.statusProposta || '').toLowerCase() === 'aberta').length;
  const fechadas = data.filter((item) => String(item.statusProposta || '').toLowerCase() === 'fechada').length;
  const valorFechado = data
    .filter((item) => String(item.statusProposta || '').toLowerCase() === 'fechada')
    .reduce((acc, item) => acc + Number(item.valorReais || 0), 0);
  const conv = total ? Math.round((fechadas / total) * 100) : 0;

  const pills = [
    { num: total, lbl: 'Propostas' },
    { num: abertas, lbl: 'Abertas' },
    { num: `${conv}%`, lbl: 'Conversão' },
    { num: `R$ ${Math.round(valorFechado / 1000)}k`, lbl: 'Fechado' }
  ];
  wrap.innerHTML = pills.map((pill) => `<div class="pill-stat"><span class="num">${pill.num}</span><span class="lbl">${pill.lbl}</span></div>`).join('');
}

function getFiltered() {
  let rows = data.filter((row) => {
    if (activeStatuses.size && !activeStatuses.has(row.statusProposta)) return false;
    if (filterText) {
      const haystack = `${row.numero} ${row.cliente} ${row.projeto} ${row.contato} ${row.pontoContato} ${row.obs}`.toLowerCase();
      if (!haystack.includes(filterText.toLowerCase())) return false;
    }
    return true;
  });

  if (sortKey) {
    rows = rows.slice().sort((a, b) => {
      let av = a[sortKey];
      let bv = b[sortKey];
      if (sortKey === 'valorExterior' || sortKey === 'valorReais') {
        av = Number(av || 0);
        bv = Number(bv || 0);
      }
      if (av === undefined || av === '') av = '';
      if (bv === undefined || bv === '') bv = '';
      if (av < bv) return -1 * sortDir;
      if (av > bv) return 1 * sortDir;
      return 0;
    });
  }

  return rows;
}

function attachEdit(td, row, col, inputType) {
  if (!permissions.podeEditar) return;
  td.onclick = () => {
    if (td.querySelector('input')) return;
    const current = row[col.key] || '';
    td.innerHTML = `<input type="${inputType}" value="${current}">`;
    const input = td.querySelector('input');
    input.focus();
    input.select();
    const commit = async () => {
      row[col.key] = input.value;
      if (row.id) {
        try {
          const payload = montarPayloadProposta(row, col.key);
          await db.updateProposal(row.id, payload);
        } catch (error) {
          console.error('[updateProposal] Erro:', error);
          alert(`Erro ao atualizar proposta: ${error.message || JSON.stringify(error)}`);
        }
      }
      render();
    };
    input.onblur = commit;
    input.onkeydown = (event) => {
      if (event.key === 'Enter') input.blur();
      if (event.key === 'Escape') render();
    };
  };
}

function openSelectEdit(td, row, col, options) {
  if (!permissions.podeEditar || td.querySelector('select')) return;
  td.innerHTML = `<select>${options.map((option) => `<option value="${option}" ${option === row[col.key] ? 'selected' : ''}>${option}</option>`).join('')}</select>`;
  const select = td.querySelector('select');
  select.focus();
  select.onchange = async () => {
    row[col.key] = select.value;
    if (row.id) {
      try {
        const payload = montarPayloadProposta(row, col.key);
        await db.updateProposal(row.id, payload);
      } catch (error) {
        console.error('[updateProposal select] Erro:', error);
        alert(`Erro ao atualizar: ${error.message || JSON.stringify(error)}`);
      }
    }
    render();
  };
  select.onblur = () => render();
}

function makeCell(row, col) {
  const td = document.createElement('td');
  const value = row[col.key];

  if (col.type === 'computed') {
    td.innerHTML = `<span class="badge-mes">${monthLabel(row.dataFechamento)}</span>`;
    return td;
  }
  if (col.type === 'link-client') {
    td.innerHTML = `<span class="client-link">${value}</span>`;
    td.querySelector('.client-link').onclick = () => {
      if (row.client_id) {
        window.location.href = criarUrlVisualizacao('client', row.client_id);
        return;
      }
      showToast('Cliente não vinculado');
    };
    return td;
  }
  if (col.type === 'link-project') {
    td.innerHTML = `<span class="project-link">${value}</span>`;
    td.querySelector('.project-link').onclick = () => {
      if (row.project_id) {
        window.location.href = criarUrlVisualizacao('project', row.project_id);
        return;
      }
      showToast('Projeto não vinculado');
    };
    return td;
  }
  if (col.type === 'money-usd' || col.type === 'money-brl') {
    td.className = 'money-col editable';
    td.textContent = formatMoney(value, col.type === 'money-usd' ? 'USD' : 'BRL');
    attachEdit(td, row, col, 'number');
    return td;
  }
  if (col.type === 'date') {
    td.className = 'editable';
    td.textContent = formatDate(value);
    attachEdit(td, row, col, 'date');
    return td;
  }
  if (col.type === 'status-proposta') {
    const cls = statusClass(value, 'proposta');
    td.innerHTML = `<span class="badge" style="color:var(--st-${cls});background:var(--st-${cls}-bg)">${value}</span>`;
    td.className = 'editable';
    td.onclick = () => openSelectEdit(td, row, col, statusPropostaOptions);
    return td;
  }
  if (col.type === 'status-projeto') {
    td.textContent = value || '—';
    td.className = 'editable';
    td.style.color = 'var(--ink-soft)';
    td.style.fontSize = '12px';
    td.onclick = () => openSelectEdit(td, row, col, ['—', 'Aguardando dados para contrato', 'Contrato em elaboração', 'Aguardando assinatura', 'Contrato assinado', 'Em produção', 'Projeto em andamento', 'Entrega parcial', 'Aprovação', 'Cobrança enviada', 'Projeto finalizado']);
    return td;
  }
  if (col.type === 'text-long') {
    td.className = 'obs-cell editable';
    td.textContent = value || '';
    td.title = value || '';
    attachEdit(td, row, col, 'text');
    return td;
  }

  td.className = 'num-col editable';
  td.textContent = value || '';
  attachEdit(td, row, col, 'text');
  return td;
}

function renderTable() {
  const body = document.getElementById('tableBody');
  body.innerHTML = '';
  const rows = getFiltered();

  if (proposalsLoadError) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length + 1;
    td.innerHTML = '<div class="empty-state">Não foi possível carregar as propostas.</div>';
    tr.appendChild(td);
    body.appendChild(tr);
    return;
  }

  if (!rows.length) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.colSpan = columns.length + 1;
    td.innerHTML = `<div class="empty-state">${data.length === 0 ? 'Nenhuma proposta encontrada para esse filtro.' : 'Sem propostas para o filtro atual.'}</div>`;
    tr.appendChild(td);
    body.appendChild(tr);
  } else {
    rows.forEach((row) => {
      const tr = document.createElement('tr');
      columns.forEach((col) => tr.appendChild(makeCell(row, col)));
      const tdActions = document.createElement('td');
      tdActions.innerHTML = `
        <div class="row-actions">
          <button title="Visualizar proposta">Visualizar proposta</button>
          ${permissions.podeEditar ? '<button title="Editar proposta">Editar</button>' : ''}
          ${permissions.podeExcluir ? '<button title="Excluir proposta">Excluir</button>' : ''}
        </div>`;

      tdActions.querySelectorAll('button').forEach((btn, i) => {
        if (i === 0) {
          btn.onclick = () => {
            if (!row.id) return;
            window.location.href = criarUrlVisualizacao('proposal', row.id);
          };
          return;
        }
        if (permissions.podeEditar && i === 1) {
          btn.onclick = () => {
            window.location.href = `./proposta.html?id=${encodeURIComponent(row.id)}&returnTo=${encodeURIComponent(obterUrlAtualRelativa())}`;
          };
          return;
        }
        btn.onclick = async () => {
          if (!permissions.podeExcluir) {
            alert('Seu usuário não possui permissão para excluir propostas.');
            return;
          }
          if (!row.id || !confirm('Excluir proposta?')) return;
          try {
            await db.deleteProposal(row.id);
            data = data.filter((item) => item.id !== row.id);
            render();
            showToast('Proposta excluída com sucesso');
          } catch (error) {
            console.error('[deleteProposal] Erro ao excluir proposta:', error);
            alert('Não foi possível excluir a proposta.');
          }
        };
      });
      tr.appendChild(tdActions);
      body.appendChild(tr);
    });
  }

  const total = rows.reduce((acc, row) => acc + Number(row.valorReais || 0), 0);
  document.getElementById('footerCount').textContent = `${rows.length} proposta${rows.length !== 1 ? 's' : ''} exibida${rows.length !== 1 ? 's' : ''} de ${data.length}`;
  document.getElementById('footerTotal').textContent = `Total (filtro): ${formatMoney(total, 'BRL')}`;
}

function render() {
  renderHeader();
  renderStatusFilters();
  renderSummary();
  renderTable();
}

document.getElementById('searchInput').addEventListener('input', (event) => {
  filterText = event.target.value;
  renderTable();
});

function normalizeProposalRow(row) {
  return {
    id: row.id,
    numero: row.proposal_number || '',
    cliente: row.cliente?.legal_name || row.cliente?.name || 'Não informado',
    projeto: row.projeto?.name || 'Não informado',
    contact_id: row.contact_id || null,
    contato: row.contact_name || 'Não informado',
    pontoContato: row.point_of_contact || 'Não informado',
    dataOrcamento: row.budget_date || '',
    dataFechamento: row.closing_date || '',
    mesFechamento: row.closing_month || 'Não informado',
    valorExterior: row.value_usd != null ? Number(row.value_usd) : null,
    valorReais: row.value_brl != null ? Number(row.value_brl) : null,
    proposalPaymentMethod: row.payment_method || '',
    proposalInstallmentTerms: row.installment_terms || '',
    proposalPaymentDueDate: row.payment_due_date || '',
    proposalInstallmentDueDay: row.installment_due_day ?? '',
    proposalInstallmentValue: row.installment_value ?? '',
    proposalContractDeliveryMethod: row.contract_delivery_method || '',
    proposalBillingDeliveryMethod: row.billing_delivery_method || '',
    statusProposta: row.proposal_status || 'Não informado',
    statusProjeto: row.project_status || 'Não informado',
    obs: row.notes || 'Não informado',
    client_id: row.client_id || null,
    project_id: row.project_id || null
  };
}

async function loadData() {
  try {
    const proposals = await db.fetchProposals();
    proposalsLoadError = false;
    data = Array.isArray(proposals) ? proposals.map(normalizeProposalRow) : [];
  } catch (error) {
    console.error('Erro completo ao carregar propostas:', error);
    proposalsLoadError = true;
    data = [];
    alert('Não foi possível carregar as propostas.');
  }
  render();
}

render();
await loadData();