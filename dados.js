import './ui.js';
import { supabase, db, loadCurrentUserPermissions } from './supabase.js';

await window.crmAuthReady;

const XLSX_LIB = window.XLSX;

const elements = {
  message: document.getElementById('dataMessage'),
  importSection: document.getElementById('importSection'),
  dropZone: document.getElementById('dropZone'),
  fileInput: document.getElementById('fileInput'),
  selectedFile: document.getElementById('selectedFile'),
  selectedFileName: document.getElementById('selectedFileName'),
  selectedFileMeta: document.getElementById('selectedFileMeta'),
  btnRemoveFile: document.getElementById('btnRemoveFile'),
  importOptions: document.getElementById('importOptions'),
  duplicateMode: document.getElementById('duplicateMode'),
  previewArea: document.getElementById('previewArea'),
  previewSummary: document.getElementById('previewSummary'),
  validationSummary: document.getElementById('validationSummary'),
  previewTableHead: document.getElementById('previewTableHead'),
  previewTableBody: document.getElementById('previewTableBody'),
  btnImportData: document.getElementById('btnImportData'),
  importProgress: document.getElementById('importProgress'),
  importProgressText: document.getElementById('importProgressText'),
  importProgressPercent: document.getElementById('importProgressPercent'),
  importProgressBar: document.getElementById('importProgressBar'),
  importResult: document.getElementById('importResult'),
  btnExportData: document.getElementById('btnExportData'),
  btnDownloadTemplate: document.getElementById('btnDownloadTemplate'),
  exportClients: document.getElementById('exportClients'),
  exportResponsibles: document.getElementById('exportResponsibles'),
  exportProjects: document.getElementById('exportProjects'),
  exportProposals: document.getElementById('exportProposals')
};

const state = {
  access: null,
  file: null,
  workbook: null,
  parsed: emptyParsedData(),
  issues: [],
  currentTab: 'clients',
  database: null,
  analysis: null,
  importing: false
};

const PREVIEW_CONFIG = {
  clients: {
    columns: [
      ['row', 'Linha'], ['name', 'Cliente'], ['client_type', 'Tipo'],
      ['legal_name', 'Razão Social'], ['cpf', 'CPF'], ['cnpj', 'CNPJ'], ['address', 'Endereço']
    ]
  },
  responsibles: {
    columns: [
      ['row', 'Linha'], ['nome_completo', 'Nome'], ['cpf', 'CPF'],
      ['email', 'E-mail'], ['telefone', 'Telefone'], ['email_copia', 'E-mail em cópia']
    ]
  },
  projects: {
    columns: [
      ['row', 'Linha'], ['client_name', 'Cliente'], ['name', 'Projeto'],
      ['services', 'Serviços'], ['status', 'Status'], ['contract_delivery_method', 'Envio do contrato'],
      ['billing_delivery_method', 'Envio de cobranças']
    ]
  },
  proposals: {
    columns: [
      ['row', 'Linha'], ['proposal_number', 'N°'], ['client_name', 'Cliente'],
      ['project_name', 'Projeto'], ['budget_date', 'Data orçamento'], ['value_brl', 'Valor R$'],
      ['proposal_status', 'Status'], ['observations', 'Observações']
    ]
  }
};

const HEADER_SETS = {
  clients: [
    'cliente', 'tipo', 'razao social', 'cnpj', 'endereco completo cnpj',
    'nome completo', 'cpf', 'rg orgao emissor', 'endereco completo responsavel'
  ],
  responsibles: [
    'nome completo', 'cpf', 'rg orgao emissor', 'profissao', 'estado civil',
    'endereco completo responsavel', 'email', 'telefone', 'email em copia'
  ],
  projects: [
    'cliente', 'nome do projeto', 'servicos', 'status do projeto', 'envio do contrato',
    'envio de cobrancas', 'solicitacao de arquivos de projeto', 'entregas e aprovacoes', 'email em copia'
  ],
  proposals: [
    'n proposta', 'cliente', 'projeto', 'contato', 'ponto de contato',
    'data orcamento', 'data fechamento', 'mes fechamento', 'valor exterior',
    'valor reais', 'status orcamento', 'status andamento'
  ]
};

const SHEET_NAME_ALIASES = {
  clients: ['ficha cadastral cliente', 'ficha cadastral do cliente', 'clientes', 'cliente'],
  responsibles: ['ficha cadastral responsavel', 'responsaveis', 'responsavel'],
  projects: ['ficha cadastral do projeto', 'ficha cadastral projeto', 'projetos', 'projeto'],
  proposals: ['proposta', 'propostas', 'orcamento', 'orcamentos']
};

function emptyParsedData() {
  return { clients: [], responsibles: [], projects: [], proposals: [] };
}

function normalizeText(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .toLowerCase();
}

function cleanText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function onlyDigits(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  return digits || null;
}

function normalizeEmail(value) {
  const text = cleanText(value);
  return text ? text.toLowerCase() : null;
}

function normalizeClientType(value, cpf, cnpj) {
  const normalized = normalizeText(value);
  if (['pf', 'pessoa fisica', 'fisica'].includes(normalized)) return 'PF';
  if (['pj', 'pessoa juridica', 'juridica'].includes(normalized)) return 'PJ';
  if (cnpj) return 'PJ';
  if (cpf) return 'PF';
  return null;
}

function normalizeProposalStatus(value) {
  const text = cleanText(value);
  if (!text) return null;
  const normalized = normalizeText(text);
  const map = {
    aberta: 'Aberta', aberto: 'Aberta',
    negociando: 'Negociando', negociacao: 'Negociando',
    fechada: 'Fechada', fechado: 'Fechada',
    perdida: 'Perdida', perdido: 'Perdida',
    pausada: 'Pausada', pausado: 'Pausada'
  };
  return map[normalized] || text;
}

function parseNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = String(value).trim()
    .replace(/R\$/gi, '')
    .replace(/US\$/gi, '')
    .replace(/\s/g, '')
    .replace(/[^\d,.-]/g, '');
  if (!text) return null;
  if (text.includes('.') && text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  else if (text.includes(',')) text = text.replace(',', '.');
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function parseInteger(value) {
  const number = parseNumber(value);
  return number === null ? null : Math.trunc(number);
}

function isoDateFromParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return null;
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function parseDate(value) {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return isoDateFromParts(value.getFullYear(), value.getMonth() + 1, value.getDate());
  }
  if (typeof value === 'number' && XLSX_LIB?.SSF?.parse_date_code) {
    const parsed = XLSX_LIB.SSF.parse_date_code(value);
    if (parsed) return isoDateFromParts(parsed.y, parsed.m, parsed.d);
  }
  const text = String(value).trim();
  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (match) return isoDateFromParts(match[1], match[2], match[3]);
  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
  if (match) return isoDateFromParts(match[3], match[2], match[1]);
  const parsedDate = new Date(text);
  if (!Number.isNaN(parsedDate.getTime())) {
    return isoDateFromParts(parsedDate.getFullYear(), parsedDate.getMonth() + 1, parsedDate.getDate());
  }
  return null;
}

function parseClosingMonth(value, fallbackDate) {
  if (!value && !fallbackDate) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}`;
  }
  if (typeof value === 'number' && XLSX_LIB?.SSF?.parse_date_code) {
    const parsed = XLSX_LIB.SSF.parse_date_code(value);
    if (parsed) return `${parsed.y}-${String(parsed.m).padStart(2, '0')}`;
  }
  const text = cleanText(value);
  if (text) {
    let match = text.match(/^(\d{4})[-/.](\d{1,2})$/);
    if (match) return `${match[1]}-${String(match[2]).padStart(2, '0')}`;
    match = text.match(/^(\d{1,2})[-/.](\d{4})$/);
    if (match) return `${match[2]}-${String(match[1]).padStart(2, '0')}`;
    const months = {
      janeiro: 1, jan: 1, fevereiro: 2, fev: 2, marco: 3, mar: 3,
      abril: 4, abr: 4, maio: 5, mai: 5, junho: 6, jun: 6,
      julho: 7, jul: 7, agosto: 8, ago: 8, setembro: 9, set: 9,
      outubro: 10, out: 10, novembro: 11, nov: 11, dezembro: 12, dez: 12
    };
    const normalized = normalizeText(text);
    if (months[normalized]) {
      const year = fallbackDate ? Number(String(fallbackDate).slice(0, 4)) : new Date().getFullYear();
      return `${year}-${String(months[normalized]).padStart(2, '0')}`;
    }
  }
  return fallbackDate ? String(fallbackDate).slice(0, 7) : null;
}

function formatDateBR(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

function formatMonthBR(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})/);
  return match ? `${match[2]}/${match[1]}` : value;
}

function normalizeHeader(value) {
  return normalizeText(value)
    .replace(/^numero /, 'n ')
    .replace(/^no /, 'n ')
    .replace(/^nro /, 'n ');
}

function getRowValue(rowMap, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (rowMap.has(key)) return rowMap.get(key);
  }
  return null;
}

function hasAnyValue(values) {
  return values.some((value) => value !== null && value !== undefined && String(value).trim() !== '');
}

function addIssue(severity, entity, row, message) {
  state.issues.push({ severity, entity, row, message });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function showMessage(message, type = 'info') {
  if (!elements.message) return;
  elements.message.textContent = message;
  elements.message.className = `data-message ${type}`;
}

function hideMessage() {
  if (!elements.message) return;
  elements.message.textContent = '';
  elements.message.className = 'data-message is-hidden';
}

function setButtonLoading(button, loading, text) {
  if (!button) return;
  if (!button.dataset.defaultText) button.dataset.defaultText = button.textContent.trim();
  button.disabled = loading;
  button.textContent = loading ? text : button.dataset.defaultText;
}

function clientNaturalKey(record) {
  if (record.cnpj) return `cnpj:${onlyDigits(record.cnpj)}`;
  if (record.cpf) return `cpf:${onlyDigits(record.cpf)}`;
  return `name:${normalizeText(record.name)}`;
}

function responsibleNaturalKey(record) {
  if (record.cpf) return `cpf:${onlyDigits(record.cpf)}`;
  if (record.email) return `email:${normalizeEmail(record.email)}`;
  return `name:${normalizeText(record.nome_completo)}`;
}

function projectNaturalKey(clientIdOrKey, name) {
  return `${clientIdOrKey}|${normalizeText(name)}`;
}

function proposalNaturalKey(number) {
  return normalizeText(number);
}

function mergeNonEmpty(base, incoming) {
  const merged = { ...base };
  for (const [key, value] of Object.entries(incoming || {})) {
    if (value !== null && value !== undefined && String(value).trim() !== '') merged[key] = value;
  }
  return merged;
}

function cleanPayload(payload) {
  return Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined && value !== null && value !== '')
  );
}

function sheetRows(sheet) {
  return XLSX_LIB.utils.sheet_to_json(sheet, {
    header: 1,
    defval: null,
    raw: true,
    blankrows: false
  });
}

function scoreHeaderRow(row, entity) {
  const expected = new Set(HEADER_SETS[entity].map(normalizeHeader));
  return row.reduce((score, cell) => score + (expected.has(normalizeHeader(cell)) ? 1 : 0), 0);
}

function findBestHeader(rows, entity) {
  let best = { index: -1, score: 0 };
  rows.slice(0, 15).forEach((row, index) => {
    const score = scoreHeaderRow(row, entity);
    if (score > best.score) best = { index, score };
  });
  return best.score >= 2 ? best.index : -1;
}

function findSheetForEntity(workbook, entity) {
  const aliases = SHEET_NAME_ALIASES[entity].map(normalizeText);
  const byName = workbook.SheetNames.find((name) => {
    const normalized = normalizeText(name);
    return aliases.some((alias) => normalized.includes(alias));
  });
  if (byName) return byName;

  let best = null;
  for (const name of workbook.SheetNames) {
    const rows = sheetRows(workbook.Sheets[name]);
    const headerIndex = findBestHeader(rows, entity);
    if (headerIndex < 0) continue;
    const score = scoreHeaderRow(rows[headerIndex], entity);
    if (!best || score > best.score) best = { name, score };
  }
  return best?.name || null;
}

function rowsAsMaps(rows, headerIndex) {
  const headers = (rows[headerIndex] || []).map(normalizeHeader);
  const output = [];
  for (let index = headerIndex + 1; index < rows.length; index += 1) {
    const values = rows[index] || [];
    if (!hasAnyValue(values)) continue;
    const map = new Map();
    headers.forEach((header, columnIndex) => {
      if (header) map.set(header, values[columnIndex]);
    });
    output.push({ row: index + 1, map, values });
  }
  return output;
}

function parseClients(workbook) {
  const sheetName = findSheetForEntity(workbook, 'clients');
  if (!sheetName) return [];
  const rows = sheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findBestHeader(rows, 'clients');
  if (headerIndex < 0) return [];

  return rowsAsMaps(rows, headerIndex).map(({ row, map }) => {
    const name = cleanText(getRowValue(map, ['Cliente', 'Nome do cliente', 'Nome fantasia']));
    const legalName = cleanText(getRowValue(map, ['Razão Social', 'Razao social']));
    const cpf = onlyDigits(getRowValue(map, ['CPF']));
    const cnpj = onlyDigits(getRowValue(map, ['CNPJ']));
    const clientType = normalizeClientType(getRowValue(map, ['Tipo', 'Tipo de cliente']), cpf, cnpj);
    const address = cleanText(getRowValue(map, ['Endereço Completo CNPJ', 'Endereco completo CNPJ', 'Endereço']));
    const responsibleName = cleanText(getRowValue(map, ['Nome Completo', 'Nome completo responsável']));
    const responsibleAddress = cleanText(getRowValue(map, ['Endereço Completo Responsável', 'Endereco completo responsavel']));
    const responsibleRg = cleanText(getRowValue(map, ['RG - Órgão Emissor', 'RG Orgao Emissor']));

    const responsibleHint = {
      nome_completo: responsibleName || (clientType === 'PF' ? name : null),
      cpf,
      rg_orgao_emissor: responsibleRg,
      endereco_responsavel: responsibleAddress || (clientType === 'PF' ? address : null),
      source_client_name: name
    };

    return {
      row,
      name,
      client_type: clientType,
      legal_name: clientType === 'PJ' ? legalName : null,
      cpf: clientType === 'PF' ? cpf : null,
      cnpj: clientType === 'PJ' ? cnpj : null,
      address,
      responsibleHint
    };
  });
}

function parseResponsibles(workbook) {
  const sheetName = findSheetForEntity(workbook, 'responsibles');
  if (!sheetName) return [];
  const rows = sheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findBestHeader(rows, 'responsibles');
  if (headerIndex < 0) return [];

  return rowsAsMaps(rows, headerIndex).map(({ row, map }) => ({
    row,
    nome_completo: cleanText(getRowValue(map, ['Nome Completo', 'Nome do responsável'])),
    cpf: onlyDigits(getRowValue(map, ['CPF'])),
    rg_orgao_emissor: cleanText(getRowValue(map, ['RG - Órgão Emissor', 'RG Orgao Emissor'])),
    profissao: cleanText(getRowValue(map, ['Profissão', 'Profissao'])),
    estado_civil: cleanText(getRowValue(map, ['Estado Civil'])),
    endereco_responsavel: cleanText(getRowValue(map, ['Endereço Completo Responsável', 'Endereco completo responsavel'])),
    email: normalizeEmail(getRowValue(map, ['E-mail', 'Email'])),
    telefone: cleanText(getRowValue(map, ['Telefone', 'Celular'])),
    email_copia: normalizeEmail(getRowValue(map, ['E-mail em cópia', 'Email em copia']))
  }));
}

function parseProjects(workbook) {
  const sheetName = findSheetForEntity(workbook, 'projects');
  if (!sheetName) return [];
  const rows = sheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findBestHeader(rows, 'projects');
  if (headerIndex < 0) return [];

  return rowsAsMaps(rows, headerIndex).map(({ row, map }) => ({
    row,
    client_name: cleanText(getRowValue(map, ['Cliente'])),
    name: cleanText(getRowValue(map, ['Nome do projeto', 'Projeto'])),
    services: cleanText(getRowValue(map, ['Serviços', 'Servicos'])),
    status: cleanText(getRowValue(map, ['Status do projeto', 'Status'])),
    contract_delivery_method: cleanText(getRowValue(map, ['Envio do contrato'])),
    billing_delivery_method: cleanText(getRowValue(map, ['Envio de cobranças', 'Envio de cobrancas'])),
    project_files_request: cleanText(getRowValue(map, ['Solicitação de arquivos de projeto', 'Solicitacao de arquivos de projeto'])),
    deliveries_approvals: cleanText(getRowValue(map, ['Entregas e aprovações', 'Entregas e aprovacoes'])),
    email_copia: normalizeEmail(getRowValue(map, ['E-mail em cópia', 'Email em copia'])),
    unsupported_observations: cleanText(getRowValue(map, ['Observações - Relacionado a contrato e cobranças', 'Observacoes relacionado a contrato e cobrancas']))
  }));
}

function parseProposals(workbook) {
  const sheetName = findSheetForEntity(workbook, 'proposals');
  if (!sheetName) return [];
  const rows = sheetRows(workbook.Sheets[sheetName]);
  const headerIndex = findBestHeader(rows, 'proposals');
  if (headerIndex < 0) return [];

  return rowsAsMaps(rows, headerIndex).map(({ row, map }) => {
    const budgetDate = parseDate(getRowValue(map, ['DATA ORÇAMENTO', 'Data orçamento', 'Data do orçamento']));
    const closingDate = parseDate(getRowValue(map, ['DATA FECHAMENTO', 'Data fechamento', 'Data de fechamento']));
    const closingMonth = parseClosingMonth(
      getRowValue(map, ['MÊS FECHAMENTO', 'Mes fechamento', 'Mês de fechamento']),
      closingDate || budgetDate
    );

    return {
      row,
      proposal_number: cleanText(getRowValue(map, ['N° PROPOSTA', 'N PROPOSTA', 'Número da proposta', 'Numero da proposta'])),
      client_name: cleanText(getRowValue(map, ['CLIENTE', 'Cliente'])),
      project_name: cleanText(getRowValue(map, ['PROJETO', 'Projeto'])),
      contact_name: cleanText(getRowValue(map, ['CONTATO', 'Contato'])),
      point_of_contact: cleanText(getRowValue(map, ['PONTO DE CONTATO', 'Ponto de contato'])),
      budget_date: budgetDate,
      closing_date: closingDate,
      closing_month: closingMonth,
      value_usd: parseNumber(getRowValue(map, ['VALOR EXTERIOR', 'Valor exterior', 'Valor dólar', 'Valor dolar'])),
      value_brl: parseNumber(getRowValue(map, ['VALOR REAIS', 'Valor reais', 'Valor em reais'])),
      proposal_status: normalizeProposalStatus(getRowValue(map, ['STATUS ORÇAMENTO', 'Status orçamento', 'Status da proposta'])),
      project_status: cleanText(getRowValue(map, ['STATUS ANDAMENTO', 'Status andamento', 'Status do projeto'])),
      observations: cleanText(getRowValue(map, ['OBSERVAÇÕES', 'Observações', 'Observacoes', 'Notas'])),
      payment_method: cleanText(getRowValue(map, ['Forma de pagamento'])),
      installment_terms: cleanText(getRowValue(map, ['Forma de parcelamento', 'Condições de parcelamento', 'Condicoes de parcelamento'])),
      payment_due_date: parseDate(getRowValue(map, ['Data de vencimento', 'Vencimento'])),
      installment_due_day: parseInteger(getRowValue(map, ['Dia de vencimento das parcelas', 'Dia de vencimento'])),
      contract_total: parseNumber(getRowValue(map, ['Valor total do contrato', 'Valor contrato'])),
      installment_value: parseNumber(getRowValue(map, ['Valores das parcelas', 'Valor das parcelas'])),
      contract_delivery_method: cleanText(getRowValue(map, ['Envio do contrato'])),
      billing_delivery_method: cleanText(getRowValue(map, ['Envio de cobranças', 'Envio de cobrancas']))
    };
  });
}

function mergeResponsibleHints(clients, responsibles) {
  const merged = new Map();
  for (const responsible of responsibles) {
    if (!responsible.nome_completo && !responsible.cpf && !responsible.email) continue;
    const key = responsibleNaturalKey(responsible);
    merged.set(key, mergeNonEmpty(merged.get(key) || {}, responsible));
  }

  for (const client of clients) {
    const hint = client.responsibleHint;
    if (!hint || (!hint.nome_completo && !hint.cpf)) continue;
    let key = responsibleNaturalKey(hint);
    let existingKey = key;

    if (!merged.has(key) && hint.cpf) {
      const byCpf = [...merged.keys()].find((candidate) => candidate === `cpf:${hint.cpf}`);
      if (byCpf) existingKey = byCpf;
    }
    if (!merged.has(existingKey) && hint.nome_completo) {
      const byName = [...merged.entries()].find(([, item]) => normalizeText(item.nome_completo) === normalizeText(hint.nome_completo));
      if (byName) existingKey = byName[0];
    }

    const targetKey = merged.has(existingKey) ? existingKey : key;
    merged.set(targetKey, mergeNonEmpty(merged.get(targetKey) || {}, hint));
    client.responsible_key = targetKey;
  }

  return [...merged.values()].map((record, index) => ({ row: record.row || index + 1, ...record }));
}

function validateParsedData() {
  state.issues = [];
  const { clients, responsibles, projects, proposals } = state.parsed;

  if (![clients, responsibles, projects, proposals].some((rows) => rows.length > 0)) {
    addIssue('error', 'arquivo', null, 'Nenhuma aba reconhecida foi encontrada na planilha.');
    return;
  }

  const clientNames = new Map();
  for (const client of clients) {
    if (!client.name) addIssue('error', 'clientes', client.row, 'Cliente não informado.');
    if (!client.client_type) addIssue('error', 'clientes', client.row, 'Tipo do cliente não informado e não foi possível identificar PF ou PJ.');
    if (client.client_type === 'PF' && (!client.cpf || client.cpf.length !== 11)) {
      addIssue('error', 'clientes', client.row, 'Cliente PF precisa de CPF com 11 números.');
    }
    if (client.client_type === 'PJ' && (!client.cnpj || client.cnpj.length !== 14)) {
      addIssue('error', 'clientes', client.row, 'Cliente PJ precisa de CNPJ com 14 números.');
    }
    const key = normalizeText(client.name);
    if (key) clientNames.set(key, (clientNames.get(key) || 0) + 1);
  }

  for (const [name, count] of clientNames.entries()) {
    if (count > 1) addIssue('warning', 'clientes', null, `O cliente “${name}” aparece ${count} vezes na planilha.`);
  }

  for (const responsible of responsibles) {
    if (!responsible.nome_completo) addIssue('error', 'responsaveis', responsible.row, 'Nome completo do responsável não informado.');
    if (responsible.cpf && responsible.cpf.length !== 11) addIssue('error', 'responsaveis', responsible.row, 'CPF do responsável deve ter 11 números.');
  }

  for (const project of projects) {
    if (!project.client_name) addIssue('error', 'projetos', project.row, 'Cliente do projeto não informado.');
    if (!project.name) addIssue('error', 'projetos', project.row, 'Nome do projeto não informado.');
    if (project.unsupported_observations) {
      addIssue('warning', 'projetos', project.row, 'A coluna “Observações - Relacionado a contrato e cobranças” não possui um campo correspondente no banco e não será importada.');
    }
  }

  for (const proposal of proposals) {
    if (!proposal.proposal_number) addIssue('error', 'propostas', proposal.row, 'Número da proposta não informado.');
    if (!proposal.client_name) addIssue('error', 'propostas', proposal.row, 'Cliente da proposta não informado.');
    if (!proposal.project_name) addIssue('error', 'propostas', proposal.row, 'Projeto da proposta não informado.');
    if (!proposal.budget_date) addIssue('error', 'propostas', proposal.row, 'Data do orçamento ausente ou inválida.');
    if (!proposal.proposal_status) addIssue('error', 'propostas', proposal.row, 'Status do orçamento não informado.');
    if (proposal.installment_due_day !== null && (proposal.installment_due_day < 1 || proposal.installment_due_day > 31)) {
      addIssue('error', 'propostas', proposal.row, 'Dia de vencimento deve estar entre 1 e 31.');
    }
  }
}

async function fetchAll(table, select = '*', orderColumn = 'id') {
  const pageSize = 1000;
  const rows = [];
  let from = 0;
  while (true) {
    let query = supabase.from(table).select(select).range(from, from + pageSize - 1);
    if (orderColumn) query = query.order(orderColumn, { ascending: true });
    const { data, error } = await query;
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < pageSize) break;
    from += pageSize;
  }
  return rows;
}

async function loadDatabaseSnapshot() {
  const [clients, responsibles, projects, contracts, followups, proposals] = await Promise.all([
    fetchAll('clients'),
    fetchAll('responsaveis'),
    fetchAll('projects'),
    fetchAll('contracts'),
    fetchAll('project_followups'),
    fetchAll('proposals')
  ]);
  return { clients, responsibles, projects, contracts, followups, proposals };
}

function createUniqueNameIndex(records, nameGetter) {
  const map = new Map();
  const duplicates = new Set();
  for (const record of records) {
    const key = normalizeText(nameGetter(record));
    if (!key) continue;
    if (map.has(key)) duplicates.add(key);
    else map.set(key, record);
  }
  for (const key of duplicates) map.set(key, null);
  return map;
}

function analyzeAgainstDatabase() {
  const database = state.database;
  if (!database) return;
  const clientByNatural = new Map(database.clients.map((record) => [clientNaturalKey(record), record]));
  const clientByName = createUniqueNameIndex(database.clients, (record) => record.name || record.legal_name);
  const responsibleByNatural = new Map(database.responsibles.map((record) => [responsibleNaturalKey(record), record]));
  const proposalByNumber = new Map(database.proposals.map((record) => [proposalNaturalKey(record.proposal_number), record]));

  const importedClientNames = createUniqueNameIndex(state.parsed.clients, (record) => record.name);
  const allClientsByName = new Map(clientByName);
  for (const [key, record] of importedClientNames.entries()) {
    if (record && !allClientsByName.get(key)) allClientsByName.set(key, record);
  }

  let existingClients = 0;
  let existingResponsibles = 0;
  let existingProjects = 0;
  let existingProposals = 0;

  for (const client of state.parsed.clients) {
    if (clientByNatural.has(clientNaturalKey(client))) existingClients += 1;
  }
  for (const responsible of state.parsed.responsibles) {
    if (responsibleByNatural.has(responsibleNaturalKey(responsible))) existingResponsibles += 1;
  }
  for (const project of state.parsed.projects) {
    const client = allClientsByName.get(normalizeText(project.client_name));
    if (client === null) {
      addIssue('error', 'projetos', project.row, `Existem vários clientes com o nome “${project.client_name}”. Use CNPJ/CPF no cadastro e deixe o nome único antes de importar.`);
      continue;
    }
    if (!client) {
      addIssue('error', 'projetos', project.row, `Cliente “${project.client_name}” não foi encontrado na planilha nem no CRM.`);
      continue;
    }
    if (client.id) {
      const exists = database.projects.some((record) => Number(record.client_id) === Number(client.id) && normalizeText(record.name) === normalizeText(project.name));
      if (exists) existingProjects += 1;
    }
  }
  for (const proposal of state.parsed.proposals) {
    if (proposalByNumber.has(proposalNaturalKey(proposal.proposal_number))) existingProposals += 1;
    const client = allClientsByName.get(normalizeText(proposal.client_name));
    if (client === null) addIssue('error', 'propostas', proposal.row, `Existem vários clientes com o nome “${proposal.client_name}”.`);
    else if (!client) addIssue('error', 'propostas', proposal.row, `Cliente “${proposal.client_name}” não foi encontrado na planilha nem no CRM.`);
  }

  state.analysis = {
    existing: {
      clients: existingClients,
      responsibles: existingResponsibles,
      projects: existingProjects,
      proposals: existingProposals
    }
  };
}

async function parseSelectedFile(file) {
  if (!XLSX_LIB) throw new Error('A biblioteca de leitura de Excel não foi carregada.');
  const buffer = await file.arrayBuffer();
  const workbook = XLSX_LIB.read(buffer, { type: 'array', cellDates: true, raw: true });
  state.workbook = workbook;
  const clients = parseClients(workbook);
  const sheetResponsibles = parseResponsibles(workbook);
  const responsibles = mergeResponsibleHints(clients, sheetResponsibles);
  const projects = parseProjects(workbook);
  const proposals = parseProposals(workbook);
  state.parsed = { clients, responsibles, projects, proposals };
  validateParsedData();

  try {
    state.database = await loadDatabaseSnapshot();
    analyzeAgainstDatabase();
  } catch (error) {
    console.error('[dados] Falha ao comparar com o banco:', error);
    addIssue('warning', 'banco', null, 'Não foi possível comparar duplicidades com o banco. A validação será repetida durante a importação.');
  }
}

function issueCounts() {
  return state.issues.reduce((acc, issue) => {
    acc[issue.severity] = (acc[issue.severity] || 0) + 1;
    return acc;
  }, { error: 0, warning: 0 });
}

function renderSummary() {
  const parsed = state.parsed;
  const existing = state.analysis?.existing || {};
  const cards = [
    ['Clientes', parsed.clients.length, existing.clients || 0],
    ['Responsáveis', parsed.responsibles.length, existing.responsibles || 0],
    ['Projetos', parsed.projects.length, existing.projects || 0],
    ['Propostas', parsed.proposals.length, existing.proposals || 0]
  ];
  elements.previewSummary.innerHTML = cards.map(([label, total, existingCount]) => `
    <article class="preview-stat">
      <span>${escapeHtml(label)}</span>
      <strong>${total}</strong>
      <small>${existingCount} já existente${existingCount === 1 ? '' : 's'}</small>
    </article>
  `).join('');

  const counts = issueCounts();
  elements.validationSummary.innerHTML = `
    <div class="validation-item ${counts.error ? 'has-error' : 'is-ok'}">
      <strong>${counts.error}</strong><span>erro${counts.error === 1 ? '' : 's'}</span>
    </div>
    <div class="validation-item ${counts.warning ? 'has-warning' : 'is-ok'}">
      <strong>${counts.warning}</strong><span>aviso${counts.warning === 1 ? '' : 's'}</span>
    </div>
  `;

  const totalRecords = Object.values(parsed).reduce((sum, rows) => sum + rows.length, 0);
  elements.btnImportData.disabled = counts.error > 0 || totalRecords === 0 || state.importing;
}

function previewValue(value, key) {
  if (value === null || value === undefined || value === '') return '—';
  if (['value_brl', 'value_usd'].includes(key)) {
    return Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  if (key.includes('date')) return formatDateBR(value) || value;
  return String(value);
}

function renderPreviewTable(tab = state.currentTab) {
  state.currentTab = tab;
  document.querySelectorAll('.preview-tab').forEach((button) => {
    button.classList.toggle('active', button.dataset.previewTab === tab);
  });

  if (tab === 'issues') {
    elements.previewTableHead.innerHTML = '<tr><th>Tipo</th><th>Seção</th><th>Linha</th><th>Descrição</th></tr>';
    elements.previewTableBody.innerHTML = state.issues.length
      ? state.issues.map((issue) => `
          <tr>
            <td><span class="issue-badge ${issue.severity}">${issue.severity === 'error' ? 'Erro' : 'Aviso'}</span></td>
            <td>${escapeHtml(issue.entity)}</td>
            <td>${issue.row || '—'}</td>
            <td>${escapeHtml(issue.message)}</td>
          </tr>
        `).join('')
      : '<tr><td colspan="4" class="preview-empty">Nenhum erro ou aviso encontrado.</td></tr>';
    return;
  }

  const config = PREVIEW_CONFIG[tab];
  const records = state.parsed[tab] || [];
  elements.previewTableHead.innerHTML = `<tr>${config.columns.map(([, label]) => `<th>${escapeHtml(label)}</th>`).join('')}</tr>`;
  elements.previewTableBody.innerHTML = records.length
    ? records.slice(0, 50).map((record) => `
        <tr>${config.columns.map(([key]) => `<td>${escapeHtml(previewValue(record[key], key))}</td>`).join('')}</tr>
      `).join('')
    : `<tr><td colspan="${config.columns.length}" class="preview-empty">Nenhum registro encontrado nesta aba.</td></tr>`;
}

function renderFileSelection() {
  elements.selectedFile.classList.remove('is-hidden');
  elements.importOptions.classList.remove('is-hidden');
  elements.previewArea.classList.remove('is-hidden');
  elements.importResult.classList.add('is-hidden');
  elements.selectedFileName.textContent = state.file?.name || 'Arquivo selecionado';
  const sizeKb = state.file ? Math.max(1, Math.round(state.file.size / 1024)) : 0;
  elements.selectedFileMeta.textContent = `${sizeKb} KB • ${state.workbook?.SheetNames?.length || 0} aba(s) encontrada(s)`;
  renderSummary();
  renderPreviewTable('clients');
}

function resetImport() {
  state.file = null;
  state.workbook = null;
  state.parsed = emptyParsedData();
  state.issues = [];
  state.database = null;
  state.analysis = null;
  state.currentTab = 'clients';
  elements.fileInput.value = '';
  elements.selectedFile.classList.add('is-hidden');
  elements.importOptions.classList.add('is-hidden');
  elements.previewArea.classList.add('is-hidden');
  elements.importProgress.classList.add('is-hidden');
  elements.importResult.classList.add('is-hidden');
  hideMessage();
}

async function handleFile(file) {
  if (!file) return;
  const allowed = /\.(xlsx|xls|csv)$/i.test(file.name);
  if (!allowed) {
    showMessage('Selecione um arquivo .xlsx, .xls ou .csv.', 'error');
    return;
  }

  state.file = file;
  elements.dropZone.classList.add('is-loading');
  showMessage('Lendo e validando a planilha...', 'info');
  try {
    await parseSelectedFile(file);
    hideMessage();
    renderFileSelection();
  } catch (error) {
    console.error('[dados] Erro ao ler planilha:', error);
    resetImport();
    showMessage(error?.message || 'Não foi possível ler a planilha.', 'error');
  } finally {
    elements.dropZone.classList.remove('is-loading');
  }
}

function setProgress(current, total, text) {
  const percent = total ? Math.round((current / total) * 100) : 0;
  elements.importProgress.classList.remove('is-hidden');
  elements.importProgressText.textContent = text;
  elements.importProgressPercent.textContent = `${percent}%`;
  elements.importProgressBar.style.width = `${percent}%`;
}

function resultCounter() {
  return {
    clients: { created: 0, updated: 0, skipped: 0, failed: 0 },
    responsibles: { created: 0, updated: 0, skipped: 0, failed: 0 },
    projects: { created: 0, updated: 0, skipped: 0, failed: 0 },
    proposals: { created: 0, updated: 0, skipped: 0, failed: 0 },
    errors: []
  };
}

function mapByNatural(records, keyGetter) {
  const map = new Map();
  for (const record of records) map.set(keyGetter(record), record);
  return map;
}

function addToNameMap(map, name, value) {
  const key = normalizeText(name);
  if (!key) return;
  if (!map.has(key)) map.set(key, value);
  else if (map.get(key)?.id !== value?.id) map.set(key, null);
}

async function importData() {
  if (state.importing) return;
  const counts = issueCounts();
  if (counts.error > 0) {
    showMessage('Corrija os erros indicados antes de importar.', 'error');
    renderPreviewTable('issues');
    return;
  }

  const mode = elements.duplicateMode.value;
  const result = resultCounter();
  state.importing = true;
  elements.btnImportData.disabled = true;
  elements.importResult.classList.add('is-hidden');
  hideMessage();

  const totalSteps = state.parsed.clients.length + state.parsed.responsibles.length +
    state.parsed.projects.length + state.parsed.proposals.length;
  let currentStep = 0;

  try {
    const database = await loadDatabaseSnapshot();
    const clientByNatural = mapByNatural(database.clients, clientNaturalKey);
    const clientByName = new Map();
    database.clients.forEach((record) => addToNameMap(clientByName, record.name || record.legal_name, record));

    const responsibleByNatural = mapByNatural(database.responsibles, responsibleNaturalKey);
    const responsibleByName = new Map();
    database.responsibles.forEach((record) => addToNameMap(responsibleByName, record.nome_completo, record));

    const projectByKey = new Map(database.projects.map((record) => [projectNaturalKey(record.client_id, record.name), record]));
    const proposalByNumber = mapByNatural(database.proposals, (record) => proposalNaturalKey(record.proposal_number));
    const contractByProject = new Map(database.contracts.map((record) => [Number(record.project_id), record]));
    const followupByProject = new Map(database.followups.map((record) => [Number(record.project_id), record]));

    const clientResponsibleKey = new Map();

    for (const client of state.parsed.clients) {
      currentStep += 1;
      setProgress(currentStep, totalSteps, `Importando cliente: ${client.name || 'sem nome'}`);
      try {
        const key = clientNaturalKey(client);
        const existing = clientByNatural.get(key);
        const payload = cleanPayload({
          name: client.name,
          client_type: client.client_type,
          legal_name: client.client_type === 'PJ' ? client.legal_name : null,
          cpf: client.client_type === 'PF' ? client.cpf : null,
          cnpj: client.client_type === 'PJ' ? client.cnpj : null,
          address: client.address
        });

        let saved = existing;
        if (existing && mode === 'skip') result.clients.skipped += 1;
        else if (existing) {
          saved = await db.updateClient(existing.id, payload);
          result.clients.updated += 1;
        } else {
          saved = await db.insertClient(payload);
          result.clients.created += 1;
        }
        clientByNatural.set(key, saved);
        addToNameMap(clientByName, saved.name || saved.legal_name, saved);
        if (client.responsible_key) clientResponsibleKey.set(clientNaturalKey(client), client.responsible_key);
      } catch (error) {
        result.clients.failed += 1;
        result.errors.push(`Cliente, linha ${client.row}: ${error?.message || 'falha desconhecida'}`);
      }
    }

    for (const responsible of state.parsed.responsibles) {
      currentStep += 1;
      setProgress(currentStep, totalSteps, `Importando responsável: ${responsible.nome_completo || 'sem nome'}`);
      try {
        const key = responsibleNaturalKey(responsible);
        const existing = responsibleByNatural.get(key);
        const payload = cleanPayload({
          nome_completo: responsible.nome_completo,
          cpf: responsible.cpf,
          rg_orgao_emissor: responsible.rg_orgao_emissor,
          profissao: responsible.profissao,
          estado_civil: responsible.estado_civil,
          endereco_responsavel: responsible.endereco_responsavel,
          email: responsible.email,
          telefone: responsible.telefone,
          email_copia: responsible.email_copia
        });

        let saved = existing;
        if (existing && mode === 'skip') result.responsibles.skipped += 1;
        else if (existing) {
          saved = await db.updateResponsavel(existing.id, payload);
          result.responsibles.updated += 1;
        } else {
          saved = await db.insertResponsavel(payload);
          result.responsibles.created += 1;
        }
        responsibleByNatural.set(key, saved);
        addToNameMap(responsibleByName, saved.nome_completo, saved);
      } catch (error) {
        result.responsibles.failed += 1;
        result.errors.push(`Responsável, linha ${responsible.row}: ${error?.message || 'falha desconhecida'}`);
      }
    }

    for (const project of state.parsed.projects) {
      currentStep += 1;
      setProgress(currentStep, totalSteps, `Importando projeto: ${project.name || 'sem nome'}`);
      try {
        const client = clientByName.get(normalizeText(project.client_name));
        if (!client) throw new Error(`Cliente “${project.client_name}” não foi encontrado ou está duplicado.`);

        const clientKey = clientNaturalKey(client);
        const responsibleKey = clientResponsibleKey.get(clientKey);
        let responsible = responsibleKey ? responsibleByNatural.get(responsibleKey) : null;
        if (!responsible && client.client_type === 'PF') responsible = responsibleByName.get(normalizeText(client.name));

        if (project.email_copia && responsible && (mode === 'update' || !responsible.email_copia)) {
          responsible = await db.updateResponsavel(responsible.id, { email_copia: project.email_copia });
          responsibleByNatural.set(responsibleNaturalKey(responsible), responsible);
        }

        const key = projectNaturalKey(client.id, project.name);
        const existing = projectByKey.get(key);
        const payload = cleanPayload({
          client_id: Number(client.id),
          responsible_id: responsible?.id || null,
          name: project.name,
          services: project.services,
          status: project.status
        });

        let saved = existing;
        if (existing && mode === 'skip') result.projects.skipped += 1;
        else if (existing) {
          saved = await db.updateProject(existing.id, payload);
          result.projects.updated += 1;
        } else {
          saved = await db.insertProject(payload);
          result.projects.created += 1;
        }
        projectByKey.set(key, saved);

        const hasContractData = [project.contract_delivery_method, project.billing_delivery_method].some(Boolean);
        if (hasContractData && (!existing || mode === 'update')) {
          const currentContract = contractByProject.get(Number(saved.id));
          const contractPayload = mergeNonEmpty(currentContract || {}, {
            contract_delivery_method: project.contract_delivery_method,
            billing_delivery_method: project.billing_delivery_method
          });
          const savedContract = await db.saveContractByProject(saved.id, contractPayload);
          contractByProject.set(Number(saved.id), savedContract);
        }

        const hasFollowupData = [project.project_files_request, project.deliveries_approvals].some(Boolean);
        if (hasFollowupData && (!existing || mode === 'update')) {
          const currentFollowup = followupByProject.get(Number(saved.id));
          const followupPayload = mergeNonEmpty(currentFollowup || {}, {
            project_files_request: project.project_files_request,
            deliveries_approvals: project.deliveries_approvals
          });
          const savedFollowup = await db.saveProjectFollowupByProject(saved.id, followupPayload);
          followupByProject.set(Number(saved.id), savedFollowup);
        }
      } catch (error) {
        result.projects.failed += 1;
        result.errors.push(`Projeto, linha ${project.row}: ${error?.message || 'falha desconhecida'}`);
      }
    }

    for (const proposal of state.parsed.proposals) {
      currentStep += 1;
      setProgress(currentStep, totalSteps, `Importando proposta: ${proposal.proposal_number || 'sem número'}`);
      try {
        const client = clientByName.get(normalizeText(proposal.client_name));
        if (!client) throw new Error(`Cliente “${proposal.client_name}” não foi encontrado ou está duplicado.`);
        const project = projectByKey.get(projectNaturalKey(client.id, proposal.project_name));
        if (!project) throw new Error(`Projeto “${proposal.project_name}” não foi encontrado para o cliente “${proposal.client_name}”.`);

        const key = proposalNaturalKey(proposal.proposal_number);
        const existing = proposalByNumber.get(key);
        const payload = cleanPayload({
          proposal_number: proposal.proposal_number,
          client_id: Number(client.id),
          project_id: Number(project.id),
          contact_id: null,
          contact_name: proposal.contact_name,
          point_of_contact: proposal.point_of_contact,
          budget_date: proposal.budget_date,
          closing_date: proposal.closing_date,
          closing_month: proposal.closing_month,
          value_usd: proposal.value_usd,
          value_brl: proposal.value_brl,
          proposal_status: proposal.proposal_status,
          project_status: proposal.project_status,
          observations: proposal.observations,
          notes: proposal.observations,
          payment_method: proposal.payment_method,
          installment_terms: proposal.installment_terms,
          payment_due_date: proposal.payment_due_date,
          installment_due_day: proposal.installment_due_day,
          installment_value: proposal.installment_value,
          contract_delivery_method: proposal.contract_delivery_method,
          billing_delivery_method: proposal.billing_delivery_method
        });

        let saved = existing;
        if (existing && mode === 'skip') result.proposals.skipped += 1;
        else if (existing) {
          saved = await db.updateProposal(existing.id, payload);
          result.proposals.updated += 1;
        } else {
          saved = await db.insertProposal(payload);
          result.proposals.created += 1;
        }
        proposalByNumber.set(key, saved);

        const hasContractData = [
          proposal.payment_method, proposal.installment_terms, proposal.installment_due_day,
          proposal.contract_total, proposal.installment_value, proposal.contract_delivery_method,
          proposal.billing_delivery_method
        ].some((value) => value !== null && value !== undefined && value !== '');

        if (hasContractData && (!existing || mode === 'update')) {
          const currentContract = contractByProject.get(Number(project.id));
          const contractPayload = mergeNonEmpty(currentContract || {}, {
            payment_method: proposal.payment_method,
            installment_terms: proposal.installment_terms,
            installment_due_day: proposal.installment_due_day,
            contract_total: proposal.contract_total,
            installment_value: proposal.installment_value,
            contract_delivery_method: proposal.contract_delivery_method,
            billing_delivery_method: proposal.billing_delivery_method
          });
          const savedContract = await db.saveContractByProject(project.id, contractPayload);
          contractByProject.set(Number(project.id), savedContract);
        }
      } catch (error) {
        result.proposals.failed += 1;
        result.errors.push(`Proposta, linha ${proposal.row}: ${error?.message || 'falha desconhecida'}`);
      }
    }

    setProgress(totalSteps, totalSteps, 'Importação concluída.');
    renderImportResult(result);
  } catch (error) {
    console.error('[dados] Falha geral na importação:', error);
    showMessage(error?.message || 'Não foi possível concluir a importação.', 'error');
  } finally {
    state.importing = false;
    renderSummary();
  }
}

function renderImportResult(result) {
  const totalFailed = result.clients.failed + result.responsibles.failed + result.projects.failed + result.proposals.failed;
  const rows = [
    ['Clientes', result.clients],
    ['Responsáveis', result.responsibles],
    ['Projetos', result.projects],
    ['Propostas', result.proposals]
  ];
  elements.importResult.className = `import-result ${totalFailed ? 'has-errors' : 'is-success'}`;
  elements.importResult.innerHTML = `
    <h3>${totalFailed ? 'Importação concluída com pendências' : 'Importação concluída com sucesso'}</h3>
    <div class="import-result-grid">
      ${rows.map(([label, item]) => `
        <div><strong>${escapeHtml(label)}</strong><span>${item.created} criado(s), ${item.updated} atualizado(s), ${item.skipped} ignorado(s), ${item.failed} erro(s)</span></div>
      `).join('')}
    </div>
    ${result.errors.length ? `
      <details open><summary>Ver falhas</summary><ul>${result.errors.map((error) => `<li>${escapeHtml(error)}</li>`).join('')}</ul></details>
    ` : ''}
  `;
  elements.importResult.classList.remove('is-hidden');
}

function worksheetWithTitle(title, headers, rows) {
  const data = [[title], [], headers, ...rows];
  const sheet = XLSX_LIB.utils.aoa_to_sheet(data, { cellDates: true });
  sheet['!freeze'] = { xSplit: 0, ySplit: 3 };
  sheet['!autofilter'] = { ref: `A3:${XLSX_LIB.utils.encode_col(headers.length - 1)}${Math.max(3, rows.length + 3)}` };
  sheet['!cols'] = headers.map((header) => ({ wch: Math.min(38, Math.max(12, String(header).length + 2)) }));
  return sheet;
}

function buildWorkbookFromData(data, selected) {
  const workbook = XLSX_LIB.utils.book_new();
  const clientsById = new Map(data.clients.map((item) => [Number(item.id), item]));
  const responsiblesById = new Map(data.responsibles.map((item) => [Number(item.id), item]));
  const projectsById = new Map(data.projects.map((item) => [Number(item.id), item]));
  const contractsByProject = new Map(data.contracts.map((item) => [Number(item.project_id), item]));
  const followupsByProject = new Map(data.followups.map((item) => [Number(item.project_id), item]));
  const firstProjectByClient = new Map();
  for (const project of data.projects) {
    if (!firstProjectByClient.has(Number(project.client_id))) firstProjectByClient.set(Number(project.client_id), project);
  }

  if (selected.proposals) {
    const headers = [
      'N° PROPOSTA', 'CLIENTE', 'PROJETO', 'CONTATO', 'PONTO DE CONTATO',
      'DATA ORÇAMENTO', 'DATA FECHAMENTO', 'MÊS FECHAMENTO', 'VALOR EXTERIOR',
      'VALOR REAIS', 'STATUS ORÇAMENTO', 'STATUS ANDAMENTO', 'OBSERVAÇÕES',
      'Forma de pagamento', 'Forma de parcelamento', 'Data de vencimento',
      'Dia de vencimento das parcelas', 'Valor total do contrato', 'Valores das parcelas',
      'Envio do contrato', 'Envio de cobranças'
    ];
    const rows = data.proposals.map((proposal) => {
      const client = clientsById.get(Number(proposal.client_id));
      const project = projectsById.get(Number(proposal.project_id));
      const contract = contractsByProject.get(Number(proposal.project_id));
      return [
        proposal.proposal_number, client?.name || client?.legal_name, project?.name,
        proposal.contact_name, proposal.point_of_contact, formatDateBR(proposal.budget_date),
        formatDateBR(proposal.closing_date), formatMonthBR(proposal.closing_month),
        proposal.value_usd, proposal.value_brl, proposal.proposal_status, proposal.project_status,
        proposal.observations || proposal.notes, proposal.payment_method || contract?.payment_method,
        proposal.installment_terms || contract?.installment_terms, formatDateBR(proposal.payment_due_date),
        proposal.installment_due_day ?? contract?.installment_due_day, contract?.contract_total,
        proposal.installment_value ?? contract?.installment_value,
        proposal.contract_delivery_method || contract?.contract_delivery_method,
        proposal.billing_delivery_method || contract?.billing_delivery_method
      ];
    });
    XLSX_LIB.utils.book_append_sheet(workbook, worksheetWithTitle('EXCEL MODELO IMPORTAÇÃO - ORÇAMENTO - PROPOSTA', headers, rows), 'PROPOSTA');
  }

  if (selected.projects) {
    const headers = [
      'Cliente', 'Nome do projeto', 'Serviços', 'Status do projeto', 'Envio do contrato',
      'Envio de cobranças', 'Solicitação de arquivos de projeto', 'Entregas e aprovações', 'E-mail em cópia'
    ];
    const rows = data.projects.map((project) => {
      const client = clientsById.get(Number(project.client_id));
      const responsible = responsiblesById.get(Number(project.responsible_id));
      const contract = contractsByProject.get(Number(project.id));
      const followup = followupsByProject.get(Number(project.id));
      return [
        client?.name || client?.legal_name, project.name, project.services, project.status,
        contract?.contract_delivery_method, contract?.billing_delivery_method,
        followup?.project_files_request, followup?.deliveries_approvals, responsible?.email_copia
      ];
    });
    XLSX_LIB.utils.book_append_sheet(workbook, worksheetWithTitle('FICHA CADASTRAL DO PROJETO', headers, rows), 'FICHA CADASTRAL DO PROJETO');
  }

  if (selected.clients) {
    const headers = [
      'Cliente', 'Tipo', 'Razão Social', 'CNPJ', 'Endereço Completo CNPJ',
      'Nome Completo', 'CPF', 'RG - Órgão Emissor', 'Endereço Completo Responsável'
    ];
    const rows = data.clients.map((client) => {
      const project = firstProjectByClient.get(Number(client.id));
      const responsible = project ? responsiblesById.get(Number(project.responsible_id)) : null;
      return [
        client.name, client.client_type === 'PF' ? 'Pessoa Física' : 'Pessoa Jurídica',
        client.legal_name, client.cnpj, client.address, responsible?.nome_completo,
        client.client_type === 'PF' ? client.cpf : responsible?.cpf,
        responsible?.rg_orgao_emissor, responsible?.endereco_responsavel
      ];
    });
    XLSX_LIB.utils.book_append_sheet(workbook, worksheetWithTitle('FICHA CADASTRAL DO CLIENTE', headers, rows), 'FICHA CADASTRAL CLIENTE');
  }

  if (selected.responsibles) {
    const headers = [
      'Nome Completo', 'CPF', 'RG - Órgão Emissor', 'Profissão', 'Estado Civil',
      'Endereço Completo Responsável', 'E-mail', 'Telefone', 'E-mail em cópia'
    ];
    const rows = data.responsibles.map((responsible) => [
      responsible.nome_completo, responsible.cpf, responsible.rg_orgao_emissor,
      responsible.profissao, responsible.estado_civil, responsible.endereco_responsavel,
      responsible.email, responsible.telefone, responsible.email_copia
    ]);
    XLSX_LIB.utils.book_append_sheet(workbook, worksheetWithTitle('FICHA CADASTRAL RESPONSÁVEL', headers, rows), 'FICHA CADASTRAL RESPONSAVEL');
  }

  return workbook;
}

function selectedExportOptions() {
  return {
    clients: elements.exportClients.checked,
    responsibles: elements.exportResponsibles.checked,
    projects: elements.exportProjects.checked,
    proposals: elements.exportProposals.checked
  };
}

async function exportData() {
  if (!XLSX_LIB) {
    showMessage('A biblioteca de exportação do Excel não foi carregada.', 'error');
    return;
  }
  const selected = selectedExportOptions();
  if (!Object.values(selected).some(Boolean)) {
    showMessage('Selecione pelo menos uma categoria para exportar.', 'error');
    return;
  }

  setButtonLoading(elements.btnExportData, true, 'Gerando arquivo...');
  hideMessage();
  try {
    const data = await loadDatabaseSnapshot();
    const workbook = buildWorkbookFromData(data, selected);
    const date = new Date().toISOString().slice(0, 10);
    XLSX_LIB.writeFile(workbook, `CRM_Astra_${date}.xlsx`);
    showMessage('Arquivo Excel gerado com sucesso.', 'success');
  } catch (error) {
    console.error('[dados] Erro ao exportar:', error);
    showMessage(error?.message || 'Não foi possível exportar os dados.', 'error');
  } finally {
    setButtonLoading(elements.btnExportData, false, 'Exportar Excel');
  }
}

function downloadTemplate() {
  if (!XLSX_LIB) {
    showMessage('A biblioteca de Excel não foi carregada.', 'error');
    return;
  }
  const workbook = buildWorkbookFromData({
    clients: [], responsibles: [], projects: [], contracts: [], followups: [], proposals: []
  }, { clients: true, responsibles: true, projects: true, proposals: true });
  XLSX_LIB.writeFile(workbook, 'Modelo_Importacao_CRM_Astra.xlsx');
}

function setupEvents() {
  elements.dropZone.addEventListener('click', () => elements.fileInput.click());
  elements.dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      elements.fileInput.click();
    }
  });
  elements.fileInput.addEventListener('change', () => handleFile(elements.fileInput.files?.[0]));

  ['dragenter', 'dragover'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.add('is-dragging');
    });
  });
  ['dragleave', 'drop'].forEach((eventName) => {
    elements.dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      elements.dropZone.classList.remove('is-dragging');
    });
  });
  elements.dropZone.addEventListener('drop', (event) => handleFile(event.dataTransfer?.files?.[0]));
  elements.btnRemoveFile.addEventListener('click', resetImport);
  elements.btnImportData.addEventListener('click', importData);
  elements.btnExportData.addEventListener('click', exportData);
  elements.btnDownloadTemplate.addEventListener('click', downloadTemplate);
  document.querySelectorAll('.preview-tab').forEach((button) => {
    button.addEventListener('click', () => renderPreviewTable(button.dataset.previewTab));
  });
}

async function init() {
  const access = await loadCurrentUserPermissions().catch((error) => {
    console.error('[dados] Falha ao carregar permissões:', error);
    return null;
  });
  if (!access) {
    window.location.href = './login.html';
    return;
  }
  state.access = access;
  if (!access.permissions.podeAdicionar) {
    elements.importSection.classList.add('viewer-import-disabled');
    const controls = elements.importSection.querySelectorAll('input, select, button');
    controls.forEach((control) => { control.disabled = true; });
    elements.dropZone.setAttribute('aria-disabled', 'true');
    elements.dropZone.innerHTML = `
      <strong>Importação indisponível para Visualizador</strong>
      <span>Seu perfil pode exportar e consultar dados, mas não pode cadastrar ou alterar registros.</span>
    `;
  }
  setupEvents();
}

await init();
