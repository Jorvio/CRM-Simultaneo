import { db, obterSessaoObrigatoria, loadCurrentUserPermissions } from './supabase.js';
import { fetchCotacaoAtual, fetchHistoricoDolar } from './cotacao.js';

// ─────────────────────────────────────────────────────────────────────────
// Constantes
// ─────────────────────────────────────────────────────────────────────────

const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const MESES_ABREV_MIN = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const ANO_MINIMO = 2005;

const CORES = {
  texto: '#111827',
  textoSuave: '#6B7280',
  textoFraco: '#9CA3AF',
  linha: '#E5E7EB',
  linhaSuave: '#F3F4F6',
  ambar: '#F59E0B',
  ciano: '#10B981',
  violeta: '#7C3AED',
  vermelho: '#EF4444',
  neutro: '#4a5162',
  marca: '#ffb800'
};

const PALETA_ANOS = ['#F59E0B', '#10B981', '#7C3AED', '#EF4444', '#4a5162', '#0EA5E9', '#EC4899', '#84CC16'];

const PERIODOS_DOLAR = [
  { chave: '1D', label: '1 D', qtd: 2 },
  { chave: '5D', label: '5 D', qtd: 5 },
  { chave: '1M', label: '1 M', qtd: 22 },
  { chave: '1A', label: '1 A', qtd: 252 },
  { chave: '5A', label: '5 A', qtd: null },
  { chave: 'MAX', label: 'Máx', qtd: null }
];

const NOMES_FONTES = {
  clients: 'clientes',
  projects: 'projetos',
  proposals: 'propostas',
  contracts: 'contratos'
};

// ─────────────────────────────────────────────────────────────────────────
// Estado
// ─────────────────────────────────────────────────────────────────────────

let mesSelecionado = new Date().getMonth();
let anoSelecionado = new Date().getFullYear();

let propostasNormalizadas = [];
let totaisGlobais = { totalClientes: 0, totalProjetos: 0, totalContratos: 0, totalPropostas: 0 };

let graficoValor = null;
let graficoStatus = null;
let graficoDolar = null;
let graficoAnual = null;

let cotacaoAtual = null;
let historicoDolar = [];
let periodoSelecionadoDolar = '1M';

const elDashRoot = document.getElementById('dash-root');
const elAvisos = document.getElementById('dash-avisos');

// ─────────────────────────────────────────────────────────────────────────
// Utilidades de segurança e formatação
// ─────────────────────────────────────────────────────────────────────────

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function converterValor(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 0;
  }

  if (typeof valor === 'number') {
    return Number.isFinite(valor) ? valor : 0;
  }

  let texto = String(valor).trim().replace(/[^\d,.-]/g, '');

  if (!texto) {
    return 0;
  }

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function extrairData(valor) {
  if (!valor) {
    return null;
  }

  const texto = String(valor).trim().split('T')[0];
  const partes = texto.split('-');

  if (partes.length !== 3) {
    return null;
  }

  const ano = Number(partes[0]);
  const mes = Number(partes[1]) - 1;
  const dia = Number(partes[2]);

  if (
    !Number.isInteger(ano) ||
    !Number.isInteger(mes) ||
    !Number.isInteger(dia) ||
    mes < 0 ||
    mes > 11
  ) {
    return null;
  }

  return { ano, mes, dia };
}

function normalizarStatus(valor) {
  return String(valor || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

const STATUS_SINONIMOS = {
  aberta: ['aberta', 'aberto'],
  negociando: ['negociando', 'em negociacao'],
  aprovada: ['aprovada', 'aprovado', 'fechada', 'fechado', 'ganha', 'ganho'],
  perdida: ['perdida', 'perdido'],
  pausada: ['pausada', 'pausado']
};

function classificarStatus(valor) {
  const normalizado = normalizarStatus(valor);
  for (const [categoria, sinonimos] of Object.entries(STATUS_SINONIMOS)) {
    if (sinonimos.includes(normalizado)) {
      return categoria;
    }
  }
  return 'outro';
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(valor) || 0);
}

function formatarTaxaCambio(valor) {
  const v = Number(valor);
  return Number.isFinite(v) ? `R$ ${v.toFixed(4).replace('.', ',')}` : '—';
}

function formatarMoedaCompacta(valor) {
  const v = Number(valor) || 0;
  if (Math.abs(v) >= 1000000) return 'R$ ' + (v / 1000000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'M';
  if (Math.abs(v) >= 1000) return 'R$ ' + (v / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 }) + 'k';
  return 'R$ ' + v.toLocaleString('pt-BR');
}

// ─────────────────────────────────────────────────────────────────────────
// Estados de interface
// ─────────────────────────────────────────────────────────────────────────

function mostrarLoading() {
  elDashRoot.innerHTML = `
    <div style="padding:48px;text-align:center;color:var(--text-soft,#6B7280);">
      <div style="font-size:16px;margin-bottom:6px;">Carregando dashboard...</div>
      <div style="font-size:12px;opacity:.7;">Buscando dados no Supabase</div>
    </div>`;
}

function mostrarErro(error) {
  console.error('[Dashboard] Erro ao carregar dashboard:', error);
  elDashRoot.innerHTML = `
    <div style="padding:40px;text-align:center;color:${CORES.vermelho};">
      <div style="font-size:16px;margin-bottom:8px;">Não foi possível carregar o dashboard.</div>
      <div style="font-size:13px;margin-bottom:6px;">${escapeHtml(error?.message || 'Erro desconhecido.')}</div>
      <div style="font-size:11px;opacity:.7;margin-bottom:14px;">
        code: ${escapeHtml(error?.code || '—')} · details: ${escapeHtml(error?.details || '—')} · hint: ${escapeHtml(error?.hint || '—')}
      </div>
      <button type="button" id="btnTentarNovamente" style="padding:7px 18px;cursor:pointer;border:1px solid ${CORES.vermelho};border-radius:6px;background:transparent;color:${CORES.vermelho};">Tentar novamente</button>
    </div>`;

  const botao = document.getElementById('btnTentarNovamente');
  if (botao) {
    botao.addEventListener('click', () => { carregarDadosDashboard(); });
  }
}

function mostrarAvisoFontes(errosDeFonte) {
  if (!errosDeFonte || errosDeFonte.length === 0) {
    elAvisos.classList.add('hidden');
    elAvisos.textContent = '';
    return;
  }

  const nomes = errosDeFonte.map((fonte) => NOMES_FONTES[fonte] || fonte).join(', ');
  elAvisos.textContent = `Algumas informações não puderam ser carregadas: ${nomes}.`;
  elAvisos.classList.remove('hidden');
}

// ─────────────────────────────────────────────────────────────────────────
// Perfil no rodapé do menu
// ─────────────────────────────────────────────────────────────────────────

function aplicarPerfilNoMenu(perfil) {
  if (!perfil) return;

  const nomeEl = document.querySelector('.profile-name');
  const roleEl = document.querySelector('.profile-role');
  const avatarEl = document.querySelector('.profile-avatar');

  const nome = perfil.full_name || perfil.email || 'Usuário';
  const role = String(perfil.role_name || 'editor').toUpperCase();

  if (nomeEl) nomeEl.textContent = nome;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = nome.trim().slice(0, 1).toUpperCase() || 'U';
}

// ─────────────────────────────────────────────────────────────────────────
// Associação de proposta com cliente/projeto
// ─────────────────────────────────────────────────────────────────────────

function construirMapaClientes(clientes) {
  const mapa = new Map();
  clientes.forEach((cliente) => {
    mapa.set(Number(cliente.id), cliente.legal_name || cliente.name || `Cliente #${cliente.id}`);
  });
  return mapa;
}

function construirMapaProjetos(projetos) {
  const mapa = new Map();
  projetos.forEach((projeto) => {
    mapa.set(Number(projeto.id), projeto.name || `Projeto #${projeto.id}`);
  });
  return mapa;
}

function normalizarProposta(proposta, clientePorId, projetoPorId) {
  const nomeCliente =
    proposta.cliente?.legal_name ||
    proposta.cliente?.name ||
    proposta.client?.legal_name ||
    proposta.client?.name ||
    clientePorId.get(Number(proposta.client_id)) ||
    `Cliente #${proposta.client_id}`;

  const nomeProjeto =
    proposta.projeto?.name ||
    proposta.project?.name ||
    projetoPorId.get(Number(proposta.project_id)) ||
    `Projeto #${proposta.project_id}`;

  return {
    id: proposta.id,
    numero: proposta.proposal_number ?? '',
    cliente: nomeCliente,
    projeto: nomeProjeto,
    budgetDate: proposta.budget_date || null,
    closingDate: proposta.closing_date || null,
    createdAt: proposta.created_at || null,
    valorReais: converterValor(proposta.value_brl),
    statusCategoria: classificarStatus(proposta.proposal_status),
    statusOriginal: proposta.proposal_status || '—'
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Agregação por mês
// ─────────────────────────────────────────────────────────────────────────

function criarBucketsVazios() {
  return MESES_FULL.map((nome, indice) => ({
    mes: indice,
    nome,
    propostas: 0,
    valorPropostas: 0,
    abertas: 0,
    negociando: 0,
    aprovadas: 0,
    perdidas: 0,
    pausadas: 0,
    valorAprovado: 0,
    propostasDoMes: []
  }));
}

function construirAgregadoDoAno(ano) {
  const buckets = criarBucketsVazios();

  propostasNormalizadas.forEach((p) => {
    // Propostas recebidas → agrupadas por budget_date, com fallback para created_at
    const dataRecebimento = extrairData(p.budgetDate) || extrairData(p.createdAt);
    if (dataRecebimento && dataRecebimento.ano === ano) {
      const bucket = buckets[dataRecebimento.mes];
      bucket.propostas++;
      bucket.valorPropostas += p.valorReais;
      bucket.propostasDoMes.push(p);

      if (p.statusCategoria === 'aberta') bucket.abertas++;
      else if (p.statusCategoria === 'negociando') bucket.negociando++;
      else if (p.statusCategoria === 'perdida') bucket.perdidas++;
      else if (p.statusCategoria === 'pausada') bucket.pausadas++;
    }

    // Propostas aprovadas → agrupadas por closing_date, com fallback para budget_date e created_at
    if (p.statusCategoria === 'aprovada') {
      const dataAprovacao = extrairData(p.closingDate) || extrairData(p.budgetDate) || extrairData(p.createdAt);
      if (dataAprovacao && dataAprovacao.ano === ano) {
        const bucket = buckets[dataAprovacao.mes];
        bucket.aprovadas++;
        bucket.valorAprovado += p.valorReais;
      }
    }
  });

  buckets.forEach((bucket) => {
    bucket.propostasDoMes.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  });

  return buckets;
}

function calcularDelta(atual, anterior, campo) {
  if (!anterior || !anterior[campo]) return null;
  return Math.round(((atual[campo] - anterior[campo]) / anterior[campo]) * 100);
}

// ─────────────────────────────────────────────────────────────────────────
// Componentes de KPI
// ─────────────────────────────────────────────────────────────────────────

function kpiHtml(label, valor, opcoes = {}) {
  const { tone = CORES.texto, delta = null } = opcoes;
  const subiu = delta != null && delta >= 0;
  return `
    <div class="kpi">
      <div class="kpi-top"><span class="kpi-label">${escapeHtml(label)}</span></div>
      <div class="kpi-value num" style="color:${tone}">${valor}</div>
      ${delta != null ? `<div class="kpi-delta">
        <span class="pct num" style="color:${subiu ? CORES.ciano : CORES.vermelho}">${subiu ? '+' : ''}${delta}%</span>
        <span class="vs">vs mês anterior</span>
      </div>` : ''}
    </div>`;
}

// ─────────────────────────────────────────────────────────────────────────
// Renderização principal
// ─────────────────────────────────────────────────────────────────────────

function renderizarDashboard() {
  const agregadoAno = construirAgregadoDoAno(anoSelecionado);
  const bucketAtual = agregadoAno[mesSelecionado];
  const bucketAnterior = mesSelecionado > 0 ? agregadoAno[mesSelecionado - 1] : null;

  const ytdValor = agregadoAno.slice(0, mesSelecionado + 1).reduce((soma, b) => soma + b.valorAprovado, 0);
  const ytdPropostas = agregadoAno.slice(0, mesSelecionado + 1).reduce((soma, b) => soma + b.propostas, 0);

  const totaisAnoStatus = agregadoAno.reduce((acc, b) => {
    acc.abertas += b.abertas;
    acc.negociando += b.negociando;
    acc.aprovadas += b.aprovadas;
    acc.perdidas += b.perdidas;
    acc.pausadas += b.pausadas;
    acc.propostas += b.propostas;
    return acc;
  }, { abertas: 0, negociando: 0, aprovadas: 0, perdidas: 0, pausadas: 0, propostas: 0 });

  const taxaConversao = bucketAtual.propostas > 0
    ? Math.round((bucketAtual.aprovadas / bucketAtual.propostas) * 100)
    : 0;
  const ticketMedio = bucketAtual.aprovadas > 0
    ? bucketAtual.valorAprovado / bucketAtual.aprovadas
    : 0;

  console.log('[Dashboard] Período selecionado', { mesSelecionado, anoSelecionado });
  console.log('[Dashboard] Propostas do período', bucketAtual.propostasDoMes);

  elDashRoot.innerHTML = `
    <div class="dash-header">
      <div>
        <div class="eyebrow">DASHBOARD GERENCIAL — ${escapeHtml(MESES_FULL[mesSelecionado].toUpperCase())} / ${anoSelecionado}</div>
        <h1 class="title disp">${escapeHtml(MESES_FULL[mesSelecionado])} <span>/ ${anoSelecionado}</span></h1>
      </div>
      <div class="ytd">
        <div>Valor aprovado acumulado: <b class="num" style="color:${CORES.ciano}">${formatarMoedaCompacta(ytdValor)}</b></div>
        <div>Propostas recebidas (ano): <b class="num" style="color:${CORES.ambar}">${ytdPropostas}</b></div>
      </div>
    </div>

    <div class="section-label"><span>VISÃO GERAL</span><div class="section-rule"></div></div>
    <div class="kpi-grid">
      ${kpiHtml('Total de clientes', totaisGlobais.totalClientes)}
      ${kpiHtml('Total de projetos', totaisGlobais.totalProjetos)}
      ${kpiHtml('Total de contratos', totaisGlobais.totalContratos, { tone: CORES.ciano })}
      ${kpiHtml('Total de propostas', totaisGlobais.totalPropostas)}
    </div>

    <div class="section-label"><span>COTAÇÃO DO DÓLAR &amp; HISTÓRICO ANUAL</span><div class="section-rule"></div></div>
    <div class="charts-row" style="grid-template-columns:0.65fr 2fr; margin-bottom:24px; align-items:stretch;">
      <div id="fxCardDolar" style="height:100%;">${renderizarPainelDolar()}</div>
      <div class="panel" style="display:flex;flex-direction:column;height:100%;box-sizing:border-box;">
        <div class="panel-title">Propostas por ano</div>
        <div class="panel-sub">Total e distribuição de status em ${anoSelecionado}</div>
        <div style="display:flex;align-items:center;gap:24px;flex:1;min-height:0;margin-top:6px;">
          <div style="flex-shrink:0;">
            <div style="font-size:11px;color:var(--text-soft,#6B7280);margin-bottom:4px;">Total no ano</div>
            <div class="num" style="font-size:40px;font-weight:700;color:${CORES.texto};line-height:1;">${totaisAnoStatus.propostas}</div>
          </div>
          <div style="flex:1;min-width:0;height:100%;position:relative;">
            <canvas id="graficoStatusAnual"></canvas>
          </div>
        </div>
      </div>
    </div>

    <div class="section-label"><span>COMERCIAL — ${escapeHtml(MESES_FULL[mesSelecionado].toUpperCase())}</span><div class="section-rule"></div></div>
    <div class="kpi-grid">
      ${kpiHtml('Propostas recebidas', bucketAtual.propostas, { delta: calcularDelta(bucketAtual, bucketAnterior, 'propostas') })}
      ${kpiHtml('Abertas', bucketAtual.abertas, { tone: CORES.textoSuave })}
      ${kpiHtml('Negociando', bucketAtual.negociando, { tone: CORES.ambar })}
      ${kpiHtml('Aprovadas', bucketAtual.aprovadas, { tone: CORES.ciano, delta: calcularDelta(bucketAtual, bucketAnterior, 'aprovadas') })}
      ${kpiHtml('Perdidas', bucketAtual.perdidas, { tone: CORES.vermelho })}
      ${kpiHtml('Pausadas', bucketAtual.pausadas, { tone: CORES.violeta })}
      ${kpiHtml('Taxa de conversão', taxaConversao + '%', { tone: CORES.ambar })}
      ${kpiHtml('Ticket médio', formatarMoedaCompacta(ticketMedio))}
      ${kpiHtml('Valor em propostas', formatarMoedaCompacta(bucketAtual.valorPropostas), { tone: CORES.textoSuave, delta: calcularDelta(bucketAtual, bucketAnterior, 'valorPropostas') })}
      ${kpiHtml('Valor aprovado', formatarMoedaCompacta(bucketAtual.valorAprovado), { tone: CORES.ciano, delta: calcularDelta(bucketAtual, bucketAnterior, 'valorAprovado') })}
    </div>

    <div class="section-label"><span>GRÁFICOS</span><div class="section-rule"></div></div>
    <div class="dashboard-charts">
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Valor aprovado por mês</h3>
          <p class="chart-card-subtitle">Propostas fechadas em reais</p>
        </div>
        <div class="chart-wrapper"><canvas id="graficoValorMensal"></canvas></div>
      </div>
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Status das propostas</h3>
          <p class="chart-card-subtitle">Distribuição no período selecionado</p>
        </div>
        <div class="chart-wrapper"><canvas id="graficoStatusPropostas"></canvas></div>
      </div>
    </div>

    <div class="section-label"><span>PROPOSTAS DO PERÍODO</span><div class="section-rule"></div></div>
    <div class="panel" style="overflow-x:auto;padding:0;">
      <table style="width:100%;border-collapse:collapse;font-size:13px;">
        <thead>
          <tr style="color:var(--text-soft,#6B7280);border-bottom:1px solid var(--border,#E5E7EB);">
            <th style="padding:10px 14px;font-weight:500;text-align:left;">Nº Proposta</th>
            <th style="padding:10px 14px;font-weight:500;text-align:left;">Cliente</th>
            <th style="padding:10px 14px;font-weight:500;text-align:left;">Projeto</th>
            <th style="padding:10px 14px;font-weight:500;text-align:left;">Data do orçamento</th>
            <th style="padding:10px 14px;font-weight:500;text-align:left;">Status</th>
            <th style="padding:10px 14px;font-weight:500;text-align:right;">Valor R$</th>
          </tr>
        </thead>
        <tbody>
          ${renderizarLinhasTabela(bucketAtual.propostasDoMes)}
        </tbody>
      </table>
    </div>
  `;

  try {
    renderizarGraficos(agregadoAno, bucketAtual);
  } catch (error) {
    console.error('[Dashboard] Falha ao renderizar gráficos mensais/status:', error);
  }
  try {
    renderizarGraficoStatusAnual(totaisAnoStatus);
  } catch (error) {
    console.error('[Dashboard] Falha ao renderizar gráfico anual:', error);
  }
  atualizarBotoesMes();
}

// ─────────────────────────────────────────────────────────────────────────
// Painel de cotação do dólar (estilo ticker / análise técnica)
// ─────────────────────────────────────────────────────────────────────────

function calcularVariacaoPeriodo(pontos) {
  if (!pontos || pontos.length < 2) return null;
  const primeiro = pontos[0].bid;
  const ultimo = pontos[pontos.length - 1].bid;
  if (!primeiro) return null;
  return ((ultimo - primeiro) / primeiro) * 100;
}

function renderizarPainelDolar() {
  if (!cotacaoAtual) {
    return `
      <div class="panel" style="display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center;gap:6px;">
        <div class="panel-title">USD / BRL</div>
        <div class="panel-sub" style="color:${CORES.vermelho};">Não foi possível buscar a cotação agora.</div>
      </div>`;
  }

  const pontosPeriodo = obterHistoricoParaPeriodo(periodoSelecionadoDolar);
  const variacaoPeriodo = calcularVariacaoPeriodo(pontosPeriodo);
  // Se não houver pontos suficientes no período, cai no % do dia (o que a própria API já fornece)
  const variacaoExibida = variacaoPeriodo ?? cotacaoAtual.pctChange;

  const subiu = variacaoExibida >= 0;
  const corTendencia = subiu ? '#3ddc84' : '#ff5c5c';
  const seta = subiu ? '▲' : '▼';

  const tabsHtml = PERIODOS_DOLAR.map((periodo) => {
    const ativo = periodo.chave === periodoSelecionadoDolar;
    return `<button type="button" class="fx-periodo-btn" data-periodo="${periodo.chave}"
      style="border:none;background:${ativo ? CORES.marca : 'transparent'};color:${ativo ? '#1a1300' : '#8b90a0'};
      font-weight:${ativo ? '700' : '500'};font-size:11.5px;padding:5px 10px;border-radius:7px;cursor:pointer;
      font-family:'Space Grotesk',sans-serif;transition:background .15s,color .15s;">${periodo.label}</button>`;
  }).join('');

  return `
    <div class="panel fx-panel" style="display:flex;flex-direction:column;background:#12151c;border:1px solid #232733;border-radius:12px;padding:16px;height:100%;box-sizing:border-box;">
      <div style="display:flex;align-items:center;gap:2px;margin-bottom:14px;">${tabsHtml}</div>

      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:8px;margin-bottom:6px;">
        <div>
          <div style="font-size:11px;letter-spacing:.06em;color:#8b90a0;font-weight:600;">USD / BRL</div>
          <div class="num" style="font-size:24px;font-weight:700;color:#f2f3f7;margin-top:2px;">${escapeHtml(formatarTaxaCambio(cotacaoAtual.bid))}</div>
        </div>
        <div class="num" style="font-size:11px;font-weight:700;padding:3px 8px;border-radius:20px;background:${corTendencia}22;color:${corTendencia};white-space:nowrap;margin-top:2px;">
          ${seta} ${subiu ? '+' : ''}${variacaoExibida.toFixed(2)}%
        </div>
      </div>

      <div class="chart-wrapper" style="flex:1;min-height:120px;height:auto;max-height:none;">
        <canvas id="graficoDolar"></canvas>
      </div>

      <div style="font-size:10.5px;color:#5b6072;margin-top:8px;">
        Atualizado em ${escapeHtml(formatarDataHoraExibicao(cotacaoAtual.dataHora))}${['5A', 'MAX'].includes(periodoSelecionadoDolar) ? ' · histórico limitado a ~360 dias (API gratuita)' : ''}
      </div>
    </div>`;
}

function atualizarPainelDolar() {
  const container = document.getElementById('fxCardDolar');
  if (!container) return;
  container.innerHTML = renderizarPainelDolar();
  renderizarGraficoDolar();
}

function renderizarLinhasTabela(propostas) {
  if (!propostas || propostas.length === 0) {
    return '<tr><td colspan="6" style="padding:16px 14px;color:var(--text-soft,#6B7280);text-align:center;">Nenhuma proposta registrada neste período.</td></tr>';
  }

  return propostas.map((p) => {
    const cor = p.statusCategoria === 'aprovada' ? CORES.ciano : p.statusCategoria === 'perdida' ? CORES.vermelho : CORES.ambar;
    const dataFormatada = formatarDataExibicao(p.budgetDate || p.createdAt);
    return `<tr style="border-bottom:1px solid var(--border,#E5E7EB);">
      <td style="padding:9px 14px;font-family:monospace;">${escapeHtml(p.numero || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(p.cliente || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(p.projeto || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(dataFormatada)}</td>
      <td style="padding:9px 14px;"><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${cor}22;color:${cor}">${escapeHtml(p.statusOriginal)}</span></td>
      <td style="padding:9px 14px;text-align:right;font-family:monospace;">${escapeHtml(formatarMoeda(p.valorReais))}</td>
    </tr>`;
  }).join('');
}

function formatarDataHoraExibicao(data) {
  if (!data || Number.isNaN(new Date(data).getTime())) return '—';
  return new Date(data).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit'
  });
}

function formatarDataExibicao(dataIso) {
  const data = extrairData(dataIso);
  if (!data) return '—';
  const dia = String(data.dia).padStart(2, '0');
  const mes = String(data.mes + 1).padStart(2, '0');
  return `${dia}/${mes}/${data.ano}`;
}

// ─────────────────────────────────────────────────────────────────────────
// Gráficos
// ─────────────────────────────────────────────────────────────────────────

function renderizarGraficos(agregadoAno, bucketAtual) {
  if (typeof window.Chart === 'undefined') {
    console.warn('[Dashboard] Chart.js não carregado');
    return;
  }

  const canvasValor = document.getElementById('graficoValorMensal');
  const canvasStatus = document.getElementById('graficoStatusPropostas');

  if (graficoValor) {
    graficoValor.destroy();
    graficoValor = null;
  }
  if (graficoStatus) {
    graficoStatus.destroy();
    graficoStatus = null;
  }

  if (canvasValor) {
    graficoValor = new window.Chart(canvasValor, {
      type: 'bar',
      data: {
        labels: MESES_ABREV,
        datasets: [{
          label: 'Valor aprovado',
          data: agregadoAno.map((b) => b.valorAprovado),
          backgroundColor: agregadoAno.map((b) => b.mes === mesSelecionado ? CORES.ambar : '#333a48'),
          borderRadius: 4,
          maxBarThickness: 34
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: (ctx) => formatarMoeda(ctx.parsed.y) } }
        },
        scales: {
          x: { grid: { display: false }, ticks: { color: CORES.textoFraco, font: { size: 11 } } },
          y: { grid: { color: CORES.linhaSuave }, ticks: { color: CORES.textoFraco, font: { size: 10 }, callback: (v) => formatarMoedaCompacta(v) } }
        }
      }
    });
  }

  if (canvasStatus) {
    const labels = ['Abertas', 'Negociando', 'Aprovadas', 'Perdidas', 'Pausadas'];
    const valores = [bucketAtual.abertas, bucketAtual.negociando, bucketAtual.aprovadas, bucketAtual.perdidas, bucketAtual.pausadas];
    const cores = [CORES.neutro, CORES.ambar, CORES.ciano, CORES.vermelho, CORES.violeta];

    graficoStatus = new window.Chart(canvasStatus, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{ data: valores, backgroundColor: cores, borderWidth: 1 }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 300 },
        plugins: {
          legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true } }
        }
      }
    });
  }

  renderizarGraficoDolar();
}

function obterHistoricoParaPeriodo(periodo) {
  if (!historicoDolar || historicoDolar.length === 0) return [];
  const config = PERIODOS_DOLAR.find((p) => p.chave === periodo);
  if (!config || !config.qtd) return historicoDolar; // 5A / Máx -> usa tudo que a API entregou
  return historicoDolar.slice(-config.qtd);
}

function renderizarGraficoDolar() {
  if (typeof window.Chart === 'undefined') return;

  const canvasDolar = document.getElementById('graficoDolar');
  if (graficoDolar) {
    graficoDolar.destroy();
    graficoDolar = null;
  }
  if (!canvasDolar) return;

  const pontos = obterHistoricoParaPeriodo(periodoSelecionadoDolar);

  if (pontos.length < 2) {
    const ctx = canvasDolar.getContext('2d');
    ctx.clearRect(0, 0, canvasDolar.width, canvasDolar.height);
    ctx.fillStyle = '#5b6072';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Histórico insuficiente para este período', canvasDolar.width / 2, canvasDolar.height / 2);
    return;
  }

  const corLinha = CORES.marca; // dourado — cor da marca, igual em qualquer tendência

  graficoDolar = new window.Chart(canvasDolar, {
    type: 'line',
    data: {
      labels: pontos.map((item) => `${item.data.getDate()} de ${MESES_ABREV_MIN[item.data.getMonth()]}.`),
      datasets: [{
        label: 'USD/BRL',
        data: pontos.map((item) => item.bid),
        borderColor: corLinha,
        backgroundColor: (ctx) => {
          const { chartArea, ctx: canvasCtx } = ctx.chart;
          if (!chartArea) return `${corLinha}00`;
          const gradiente = canvasCtx.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
          gradiente.addColorStop(0, `${corLinha}55`);
          gradiente.addColorStop(1, `${corLinha}00`);
          return gradiente;
        },
        borderWidth: 1.8,
        pointRadius: pontos.map((_, i) => i === pontos.length - 1 ? 4 : 0),
        pointHoverRadius: 4,
        pointBackgroundColor: corLinha,
        pointBorderColor: '#12151c',
        pointBorderWidth: 1.5,
        tension: 0.25,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 250 },
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          displayColors: false,
          backgroundColor: '#1c202b',
          titleColor: '#8b90a0',
          bodyColor: '#f2f3f7',
          borderColor: '#2b303e',
          borderWidth: 1,
          padding: 8,
          callbacks: {
            title: (items) => items[0]?.label || '',
            label: (ctx) => formatarTaxaCambio(ctx.parsed.y)
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: { color: '#5b6072', font: { size: 10 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 4 }
        },
        y: {
          position: 'left',
          grid: { color: '#232733' },
          ticks: {
            color: '#5b6072',
            font: { size: 10 },
            maxTicksLimit: 5,
            callback: (v) => Number(v).toFixed(2).replace('.', ',')
          }
        }
      }
    }
  });
}

function renderizarGraficoStatusAnual(totaisAnoStatus) {
  if (typeof window.Chart === 'undefined') return;

  const canvasAnual = document.getElementById('graficoStatusAnual');
  if (graficoAnual) {
    graficoAnual.destroy();
    graficoAnual = null;
  }
  if (!canvasAnual) return;

  if (!totaisAnoStatus || totaisAnoStatus.propostas === 0) {
    const ctx = canvasAnual.getContext('2d');
    ctx.clearRect(0, 0, canvasAnual.width, canvasAnual.height);
    ctx.fillStyle = CORES.textoFraco;
    ctx.font = '13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Nenhuma proposta neste ano', canvasAnual.width / 2, canvasAnual.height / 2);
    return;
  }

  const labels = ['Abertas', 'Negociando', 'Aprovadas', 'Perdidas', 'Pausadas'];
  const valores = [totaisAnoStatus.abertas, totaisAnoStatus.negociando, totaisAnoStatus.aprovadas, totaisAnoStatus.perdidas, totaisAnoStatus.pausadas];
  const cores = [CORES.neutro, CORES.ambar, CORES.ciano, CORES.vermelho, CORES.violeta];

  graficoAnual = new window.Chart(canvasAnual, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: valores, backgroundColor: cores, borderWidth: 1 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '62%',
      animation: { duration: 300 },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 10, usePointStyle: true, font: { size: 10 } } }
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Filtros de mês e ano
// ─────────────────────────────────────────────────────────────────────────

function atualizarBotoesMes() {
  document.querySelectorAll('.mes-filtro').forEach((botao, indice) => {
    botao.classList.toggle('ativo', indice === mesSelecionado);
  });
}

function selecionarMes(indiceMes) {
  mesSelecionado = Number(indiceMes);
  renderizarDashboard();
}

function selecionarAno(ano) {
  anoSelecionado = Number(ano);
  atualizarAnoExibido();
  renderizarDashboard();
}

function atualizarAnoExibido() {
  const elAno = document.getElementById('anoExibido');
  if (elAno) elAno.textContent = anoSelecionado;

  document.querySelectorAll('.anos-dropdown button').forEach((botao) => {
    botao.classList.toggle('ativo-ano', Number(botao.dataset.ano) === anoSelecionado);
  });
}

function construirDropdownAnos() {
  const dropdown = document.getElementById('anosDropdown');
  if (!dropdown) return;

  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [];
  for (let ano = anoAtual; ano >= ANO_MINIMO; ano--) anosDisponiveis.push(ano);

  dropdown.innerHTML = anosDisponiveis
    .map((ano) => `<button type="button" data-ano="${ano}" class="${ano === anoSelecionado ? 'ativo-ano' : ''}">${ano}</button>`)
    .join('');

  dropdown.querySelectorAll('button').forEach((botao) => {
    botao.addEventListener('click', (evento) => {
      evento.stopPropagation();
      selecionarAno(Number(botao.dataset.ano));
      dropdown.classList.add('hidden');
    });
  });
}

function configurarFiltros() {
  document.querySelectorAll('.mes-filtro').forEach((botao, indice) => {
    botao.addEventListener('click', () => selecionarMes(indice));
  });
  atualizarBotoesMes();

  construirDropdownAnos();
  atualizarAnoExibido();

  const btnAno = document.getElementById('btnAno');
  const dropdown = document.getElementById('anosDropdown');

  if (btnAno && dropdown) {
    btnAno.addEventListener('click', (evento) => {
      evento.stopPropagation();
      dropdown.classList.toggle('hidden');
    });

    document.addEventListener('click', () => {
      dropdown.classList.add('hidden');
    });
  }

  // Delegado no elDashRoot (elemento estável entre re-renderizações) para as
  // abas de período do gráfico do dólar (1D / 5D / 1M / 1A / 5A / Máx)
  elDashRoot.addEventListener('click', (evento) => {
    const botaoPeriodo = evento.target.closest('.fx-periodo-btn');
    if (!botaoPeriodo) return;
    periodoSelecionadoDolar = botaoPeriodo.dataset.periodo;
    atualizarPainelDolar();
  });
}

// ─────────────────────────────────────────────────────────────────────────
// Carregamento de dados
// ─────────────────────────────────────────────────────────────────────────

function extrairResultado(resultado, nomeFonte, errosDeFonte) {
  if (resultado.status === 'fulfilled') {
    return Array.isArray(resultado.value) ? resultado.value : [];
  }

  const error = resultado.reason;
  console.error(`[Dashboard] Falha em ${nomeFonte}:`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint
  });
  errosDeFonte.push(nomeFonte);
  return [];
}

async function carregarDadosDashboard() {
  mostrarLoading();

  try {
    const resultados = await Promise.allSettled([
      db.fetchClients(),
      db.fetchProjects(),
      db.fetchProposals(),
      db.fetchContracts(),
      fetchCotacaoAtual(),
      fetchHistoricoDolar(360)
    ]);

    const errosDeFonte = [];
    const clientes = extrairResultado(resultados[0], 'clients', errosDeFonte);
    const projetos = extrairResultado(resultados[1], 'projects', errosDeFonte);
    const propostas = extrairResultado(resultados[2], 'proposals', errosDeFonte);
    const contratos = extrairResultado(resultados[3], 'contracts', errosDeFonte);

    cotacaoAtual = resultados[4].status === 'fulfilled' ? resultados[4].value : null;
    historicoDolar = resultados[5].status === 'fulfilled' ? resultados[5].value : [];

    if (resultados[4].status === 'rejected') {
      console.error('[Dashboard] Falha ao buscar cotação atual do dólar:', resultados[4].reason);
    }
    if (resultados[5].status === 'rejected') {
      console.error('[Dashboard] Falha ao buscar histórico do dólar:', resultados[5].reason);
    }

    console.log('[Dashboard] Dados recebidos', {
      clientes: clientes.length,
      projetos: projetos.length,
      propostas: propostas.length,
      contratos: contratos.length
    });

    mostrarAvisoFontes(errosDeFonte);

    const clientePorId = construirMapaClientes(clientes);
    const projetoPorId = construirMapaProjetos(projetos);

    propostasNormalizadas = propostas.map((p) => normalizarProposta(p, clientePorId, projetoPorId));

    totaisGlobais = {
      totalClientes: clientes.length,
      totalProjetos: projetos.length,
      totalContratos: contratos.length,
      totalPropostas: propostas.length
    };

    renderizarDashboard();
  } catch (error) {
    mostrarErro(error);
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Inicialização
// ─────────────────────────────────────────────────────────────────────────

async function inicializarDashboard() {
  mostrarLoading();

  try {
    const session = await obterSessaoObrigatoria();
    if (!session) return; // obterSessaoObrigatoria já redireciona para login.html

    console.log('[Dashboard] Sessão confirmada', { userId: session.user.id, email: session.user.email });

    const { perfil } = await loadCurrentUserPermissions();
    aplicarPerfilNoMenu(perfil);

    configurarFiltros();

    await carregarDadosDashboard();
  } catch (error) {
    mostrarErro(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', inicializarDashboard, { once: true });
} else {
  inicializarDashboard();
}
