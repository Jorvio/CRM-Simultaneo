import { db, obterSessaoObrigatoria, loadCurrentUserPermissions, supabase } from './supabase.js';

const MESES_FULL = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
const MESES_ABREV = ['JAN', 'FEV', 'MAR', 'ABR', 'MAI', 'JUN', 'JUL', 'AGO', 'SET', 'OUT', 'NOV', 'DEZ'];
const ANO_MINIMO = 2005;
const INTERVALO_ATUALIZACAO_DOLAR = 30 * 60 * 1000;

const CORES = {
  texto: '#111827',
  textoSuave: '#6B7280',
  textoFraco: '#9CA3AF',
  linhaSuave: '#F3F4F6',
  azul: '#2563EB',
  ambar: '#F59E0B',
  ciano: '#10B981',
  violeta: '#7C3AED',
  vermelho: '#EF4444',
  neutro: '#4a5162'
};

const NOMES_FONTES = {
  clients: 'clientes',
  projects: 'projetos',
  proposals: 'propostas',
  contracts: 'contratos'
};

let modoVisao = 'mensal';
let mesSelecionado = new Date().getMonth();
let anoSelecionado = new Date().getFullYear();

let propostasNormalizadas = [];
let totaisGlobais = {
  totalClientes: 0,
  totalProjetos: 0,
  totalContratos: 0,
  totalPropostas: 0
};

let graficoValor = null;
let graficoStatus = null;
let graficoPropostasAno = null;
let graficoDolar = null;
let intervaloDolar = null;

let cotacaoDolar = {
  status: 'idle',
  atual: null,
  anterior: null,
  variacaoPercentual: null,
  atualizadoEm: null,
  historico: [],
  erro: null
};

const elDashRoot = document.getElementById('dash-root');
const elAvisos = document.getElementById('dash-avisos');

function escapeHtml(valor) {
  return String(valor ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function converterValor(valor) {
  if (valor === null || valor === undefined || valor === '') return 0;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : 0;

  let texto = String(valor).trim().replace(/[^\d,.-]/g, '');
  if (!texto) return 0;

  if (texto.includes('.') && texto.includes(',')) {
    texto = texto.replace(/\./g, '').replace(',', '.');
  } else if (texto.includes(',')) {
    texto = texto.replace(',', '.');
  }

  const numero = Number(texto);
  return Number.isFinite(numero) ? numero : 0;
}

function extrairData(valor) {
  if (!valor) return null;

  const texto = String(valor).trim().split('T')[0].split(' ')[0];
  const partes = texto.split('-');
  if (partes.length !== 3) return null;

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
    if (sinonimos.includes(normalizado)) return categoria;
  }

  return 'outro';
}

function formatarMoeda(valor) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(Number(valor) || 0);
}

function formatarMoedaCompacta(valor) {
  const numero = Number(valor) || 0;

  if (Math.abs(numero) >= 1000000) {
    return `R$ ${(numero / 1000000).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })}M`;
  }

  if (Math.abs(numero) >= 1000) {
    return `R$ ${(numero / 1000).toLocaleString('pt-BR', {
      maximumFractionDigits: 1
    })}k`;
  }

  return `R$ ${numero.toLocaleString('pt-BR')}`;
}

function formatarCotacao(valor) {
  const numero = Number(valor);
  if (!Number.isFinite(numero)) return '—';

  return numero.toLocaleString('pt-BR', {
    minimumFractionDigits: 4,
    maximumFractionDigits: 4
  });
}

function formatarDataExibicao(dataIso) {
  const data = extrairData(dataIso);
  if (!data) return '—';

  return `${String(data.dia).padStart(2, '0')}/${String(data.mes + 1).padStart(2, '0')}/${data.ano}`;
}

function formatarDataHoraCotacao(valor) {
  if (!valor) return '—';

  const data = new Date(String(valor).replace(' ', 'T'));
  if (Number.isNaN(data.getTime())) return String(valor);

  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short'
  }).format(data);
}

function obterDataRecebimento(proposta) {
  return extrairData(proposta.budgetDate) || extrairData(proposta.createdAt);
}

function obterDataAprovacao(proposta) {
  return (
    extrairData(proposta.closingDate) ||
    extrairData(proposta.budgetDate) ||
    extrairData(proposta.createdAt)
  );
}

function mostrarLoading() {
  elDashRoot.innerHTML = `
    <div style="padding:48px;text-align:center;color:var(--text-soft,#6B7280);">
      <div style="font-size:16px;margin-bottom:6px;">Carregando dashboard...</div>
      <div style="font-size:12px;opacity:.7;">Buscando dados no Supabase</div>
    </div>`;
}

function mostrarErro(error) {
  console.error('[Dashboard] Erro:', error);

  elDashRoot.innerHTML = `
    <div style="padding:40px;text-align:center;color:${CORES.vermelho};">
      <div style="font-size:16px;margin-bottom:8px;">Não foi possível carregar o dashboard.</div>
      <div style="font-size:13px;margin-bottom:6px;">${escapeHtml(error?.message || 'Erro desconhecido.')}</div>
      <button type="button" id="btnTentarNovamente" style="padding:7px 18px;cursor:pointer;border:1px solid ${CORES.vermelho};border-radius:6px;background:transparent;color:${CORES.vermelho};">Tentar novamente</button>
    </div>`;

  document.getElementById('btnTentarNovamente')?.addEventListener(
    'click',
    carregarDadosDashboard
  );
}

function mostrarAvisoFontes(errosDeFonte) {
  if (!errosDeFonte?.length) {
    elAvisos.classList.add('hidden');
    elAvisos.textContent = '';
    return;
  }

  const nomes = errosDeFonte
    .map((fonte) => NOMES_FONTES[fonte] || fonte)
    .join(', ');

  elAvisos.textContent = `Algumas informações não puderam ser carregadas: ${nomes}.`;
  elAvisos.classList.remove('hidden');
}

function aplicarPerfilNoMenu(perfil) {
  if (!perfil) return;

  const nome = perfil.full_name || perfil.email || 'Usuário';
  const role = String(perfil.role_name || 'editor').toUpperCase();

  const nomeEl = document.querySelector('.profile-name');
  const roleEl = document.querySelector('.profile-role');
  const avatarEl = document.querySelector('.profile-avatar');

  if (nomeEl) nomeEl.textContent = nome;
  if (roleEl) roleEl.textContent = role;
  if (avatarEl) avatarEl.textContent = nome.trim().slice(0, 1).toUpperCase() || 'U';
}

function construirMapaClientes(clientes) {
  const mapa = new Map();

  clientes.forEach((cliente) => {
    mapa.set(
      Number(cliente.id),
      cliente.legal_name || cliente.name || `Cliente #${cliente.id}`
    );
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
    valorDolar: converterValor(proposta.value_usd),
    statusCategoria: classificarStatus(proposta.proposal_status),
    statusOriginal: proposta.proposal_status || '—'
  };
}

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

  propostasNormalizadas.forEach((proposta) => {
    const dataRecebimento = obterDataRecebimento(proposta);

    if (dataRecebimento?.ano === ano) {
      const bucket = buckets[dataRecebimento.mes];

      bucket.propostas++;
      bucket.valorPropostas += proposta.valorReais;
      bucket.propostasDoMes.push(proposta);

      if (proposta.statusCategoria === 'aberta') bucket.abertas++;
      else if (proposta.statusCategoria === 'negociando') bucket.negociando++;
      else if (proposta.statusCategoria === 'perdida') bucket.perdidas++;
      else if (proposta.statusCategoria === 'pausada') bucket.pausadas++;
    }

    if (proposta.statusCategoria === 'aprovada') {
      const dataAprovacao = obterDataAprovacao(proposta);

      if (dataAprovacao?.ano === ano) {
        const bucket = buckets[dataAprovacao.mes];
        bucket.aprovadas++;
        bucket.valorAprovado += proposta.valorReais;
      }
    }
  });

  buckets.forEach((bucket) => {
    bucket.propostasDoMes.sort(
      (a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0)
    );
  });

  return buckets;
}

function construirResumoAnual(ano, agregadoAno) {
  const propostasDoAno = propostasNormalizadas
    .filter((proposta) => obterDataRecebimento(proposta)?.ano === ano)
    .sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));

  const aprovadasNoAno = propostasNormalizadas.filter((proposta) => {
    return (
      proposta.statusCategoria === 'aprovada' &&
      obterDataAprovacao(proposta)?.ano === ano
    );
  });

  return {
    propostas: propostasDoAno.length,
    valorPropostas: propostasDoAno.reduce(
      (soma, proposta) => soma + proposta.valorReais,
      0
    ),
    abertas: propostasDoAno.filter((p) => p.statusCategoria === 'aberta').length,
    negociando: propostasDoAno.filter((p) => p.statusCategoria === 'negociando').length,
    aprovadas: aprovadasNoAno.length,
    perdidas: propostasDoAno.filter((p) => p.statusCategoria === 'perdida').length,
    pausadas: propostasDoAno.filter((p) => p.statusCategoria === 'pausada').length,
    valorAprovado: agregadoAno.reduce(
      (soma, bucket) => soma + bucket.valorAprovado,
      0
    ),
    propostasDoMes: propostasDoAno
  };
}

function calcularDelta(atual, anterior, campo) {
  if (!anterior || !anterior[campo]) return null;
  return Math.round(((atual[campo] - anterior[campo]) / anterior[campo]) * 100);
}

function kpiHtml(label, valor, opcoes = {}) {
  const {
    tone = CORES.texto,
    delta = null,
    comparacao = modoVisao === 'anual'
      ? 'vs ano anterior'
      : 'vs mês anterior'
  } = opcoes;

  const subiu = delta != null && delta >= 0;

  return `
    <div class="kpi">
      <div class="kpi-top"><span class="kpi-label">${escapeHtml(label)}</span></div>
      <div class="kpi-value num" style="color:${tone}">${valor}</div>
      ${delta != null ? `
        <div class="kpi-delta">
          <span class="pct num" style="color:${subiu ? CORES.ciano : CORES.vermelho}">
            ${subiu ? '+' : ''}${delta}%
          </span>
          <span class="vs">${escapeHtml(comparacao)}</span>
        </div>` : ''}
    </div>`;
}

function renderizarLinhasTabela(propostas) {
  if (!propostas?.length) {
    return '<tr><td colspan="6" style="padding:16px 14px;color:var(--text-soft,#6B7280);text-align:center;">Nenhuma proposta registrada neste período.</td></tr>';
  }

  return propostas.map((proposta) => {
    const cor =
      proposta.statusCategoria === 'aprovada'
        ? CORES.ciano
        : proposta.statusCategoria === 'perdida'
          ? CORES.vermelho
          : CORES.ambar;

    return `<tr style="border-bottom:1px solid var(--border,#E5E7EB);">
      <td style="padding:9px 14px;font-family:monospace;">${escapeHtml(proposta.numero || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(proposta.cliente || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(proposta.projeto || '—')}</td>
      <td style="padding:9px 14px;">${escapeHtml(formatarDataExibicao(proposta.budgetDate || proposta.createdAt))}</td>
      <td style="padding:9px 14px;"><span style="font-size:11px;padding:2px 8px;border-radius:4px;background:${cor}22;color:${cor}">${escapeHtml(proposta.statusOriginal)}</span></td>
      <td style="padding:9px 14px;text-align:right;font-family:monospace;">${escapeHtml(formatarMoeda(proposta.valorReais))}</td>
    </tr>`;
  }).join('');
}


function renderizarDashboard() {
  const agregadoAno = construirAgregadoDoAno(anoSelecionado);
  const resumoAno = construirResumoAnual(anoSelecionado, agregadoAno);
  const agregadoAnoAnterior = construirAgregadoDoAno(anoSelecionado - 1);
  const resumoAnoAnterior = construirResumoAnual(
    anoSelecionado - 1,
    agregadoAnoAnterior
  );

  const periodoAtual = modoVisao === 'anual'
    ? resumoAno
    : agregadoAno[mesSelecionado];

  const periodoAnterior = modoVisao === 'anual'
    ? resumoAnoAnterior
    : (mesSelecionado > 0 ? agregadoAno[mesSelecionado - 1] : null);

  const valorAcumulado = modoVisao === 'anual'
    ? resumoAno.valorAprovado
    : agregadoAno
        .slice(0, mesSelecionado + 1)
        .reduce((soma, bucket) => soma + bucket.valorAprovado, 0);

  const propostasAcumuladas = modoVisao === 'anual'
    ? resumoAno.propostas
    : agregadoAno
        .slice(0, mesSelecionado + 1)
        .reduce((soma, bucket) => soma + bucket.propostas, 0);

  const taxaConversao = periodoAtual.propostas > 0
    ? Math.round((periodoAtual.aprovadas / periodoAtual.propostas) * 100)
    : 0;

  const ticketMedio = periodoAtual.aprovadas > 0
    ? periodoAtual.valorAprovado / periodoAtual.aprovadas
    : 0;

  const periodoTitulo = modoVisao === 'anual'
    ? `Ano ${anoSelecionado}`
    : `${MESES_FULL[mesSelecionado]} / ${anoSelecionado}`;

  const periodoTituloMaiusculo = modoVisao === 'anual'
    ? `VISÃO ANUAL / ${anoSelecionado}`
    : `${MESES_FULL[mesSelecionado].toUpperCase()} / ${anoSelecionado}`;

  const comercialTitulo = modoVisao === 'anual'
    ? `COMERCIAL — ANO ${anoSelecionado}`
    : `COMERCIAL — ${MESES_FULL[mesSelecionado].toUpperCase()}`;

  const tabelaTitulo = modoVisao === 'anual'
    ? `PROPOSTAS DO ANO ${anoSelecionado}`
    : 'PROPOSTAS DO PERÍODO';

  elDashRoot.innerHTML = `
    <div class="dash-header">
      <div>
        <div class="eyebrow">DASHBOARD GERENCIAL — ${escapeHtml(periodoTituloMaiusculo)}</div>
        <h1 class="title disp">${escapeHtml(periodoTitulo)}</h1>
      </div>

      <div class="ytd">
        <div>
          Valor aprovado ${modoVisao === 'anual' ? 'no ano' : 'acumulado'}:
          <b class="num" style="color:${CORES.ciano}">
            ${formatarMoedaCompacta(valorAcumulado)}
          </b>
        </div>
        <div>
          Propostas recebidas no ano:
          <b class="num" style="color:${CORES.ambar}">
            ${propostasAcumuladas}
          </b>
        </div>
      </div>
    </div>

    <div class="section-label">
      <span>VISÃO GERAL</span><div class="section-rule"></div>
    </div>

    <div class="kpi-grid">
      ${kpiHtml('Total de clientes', totaisGlobais.totalClientes)}
      ${kpiHtml('Total de projetos', totaisGlobais.totalProjetos)}
      ${kpiHtml('Total de contratos', totaisGlobais.totalContratos, { tone: CORES.ciano })}
      ${kpiHtml('Total de propostas', totaisGlobais.totalPropostas)}
    </div>

    <div class="section-label">
      <span>${escapeHtml(comercialTitulo)}</span><div class="section-rule"></div>
    </div>

    <div class="kpi-grid">
      ${kpiHtml('Propostas recebidas', periodoAtual.propostas, {
        delta: calcularDelta(periodoAtual, periodoAnterior, 'propostas')
      })}
      ${kpiHtml('Abertas', periodoAtual.abertas, { tone: CORES.textoSuave })}
      ${kpiHtml('Negociando', periodoAtual.negociando, { tone: CORES.ambar })}
      ${kpiHtml('Aprovadas', periodoAtual.aprovadas, {
        tone: CORES.ciano,
        delta: calcularDelta(periodoAtual, periodoAnterior, 'aprovadas')
      })}
      ${kpiHtml('Perdidas', periodoAtual.perdidas, { tone: CORES.vermelho })}
      ${kpiHtml('Pausadas', periodoAtual.pausadas, { tone: CORES.violeta })}
      ${kpiHtml('Taxa de conversão', `${taxaConversao}%`, { tone: CORES.ambar })}
      ${kpiHtml('Ticket médio', formatarMoedaCompacta(ticketMedio))}
      ${kpiHtml('Valor em propostas', formatarMoedaCompacta(periodoAtual.valorPropostas), {
        tone: CORES.textoSuave,
        delta: calcularDelta(periodoAtual, periodoAnterior, 'valorPropostas')
      })}
      ${kpiHtml('Valor aprovado', formatarMoedaCompacta(periodoAtual.valorAprovado), {
        tone: CORES.ciano,
        delta: calcularDelta(periodoAtual, periodoAnterior, 'valorAprovado')
      })}
    </div>

    <div class="section-label">
      <span>GRÁFICOS</span><div class="section-rule"></div>
    </div>

    <div class="dashboard-charts">
      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Valor aprovado por mês — ${anoSelecionado}</h3>
          <p class="chart-card-subtitle">Propostas fechadas em reais ao longo do ano</p>
        </div>
        <div class="chart-wrapper">
          <canvas id="graficoValorMensal"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Propostas recebidas por mês — ${anoSelecionado}</h3>
          <p class="chart-card-subtitle">Quantidade mensal de propostas cadastradas</p>
        </div>
        <div class="chart-wrapper">
          <canvas id="graficoPropostasAno"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card-header">
          <h3 class="chart-card-title">Status das propostas</h3>
          <p class="chart-card-subtitle">
            Distribuição em ${escapeHtml(periodoTitulo.toLowerCase())}
          </p>
        </div>
        <div class="chart-wrapper">
          <canvas id="graficoStatusPropostas"></canvas>
        </div>
      </div>

      <div class="chart-card">
        <div class="chart-card-header with-action">
          <div>
            <h3 class="chart-card-title">Dólar PTAX — venda</h3>
            <div id="dolarValor" class="dolar-value">Carregando…</div>
            <div class="dolar-meta">
              <span id="dolarVariacao" class="dolar-variation neutral">—</span>
              <span id="dolarAtualizadoEm">Banco Central do Brasil</span>
            </div>
          </div>

          <button
            id="btnAtualizarDolar"
            class="btn-refresh-dollar"
            type="button"
          >
            Atualizar agora
          </button>
        </div>

        <div id="dolarConteudo">
          <div class="dolar-loading">Consultando a cotação oficial…</div>
        </div>
      </div>
    </div>

    <div class="section-label">
      <span>${escapeHtml(tabelaTitulo)}</span><div class="section-rule"></div>
    </div>

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
          ${renderizarLinhasTabela(periodoAtual.propostasDoMes)}
        </tbody>
      </table>
    </div>
  `;

  renderizarGraficos(agregadoAno, periodoAtual);
  configurarCardDolar();
  atualizarControlesVisao();
  atualizarBotoesMes();
}

function destruirGrafico(grafico) {
  if (grafico) grafico.destroy();
  return null;
}

function renderizarGraficos(agregadoAno, periodoAtual) {
  if (typeof window.Chart === 'undefined') {
    console.warn('[Dashboard] Chart.js não carregado');
    return;
  }

  graficoValor = destruirGrafico(graficoValor);
  graficoStatus = destruirGrafico(graficoStatus);
  graficoPropostasAno = destruirGrafico(graficoPropostasAno);

  const canvasValor = document.getElementById('graficoValorMensal');
  const canvasStatus = document.getElementById('graficoStatusPropostas');
  const canvasPropostas = document.getElementById('graficoPropostasAno');

  if (canvasValor) {
    graficoValor = new window.Chart(canvasValor, {
      type: 'bar',
      data: {
        labels: MESES_ABREV,
        datasets: [{
          label: 'Valor aprovado',
          data: agregadoAno.map((bucket) => bucket.valorAprovado),
          backgroundColor: agregadoAno.map((bucket) => {
            if (modoVisao === 'mensal' && bucket.mes === mesSelecionado) {
              return CORES.ambar;
            }
            return '#333a48';
          }),
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
          tooltip: {
            callbacks: {
              label: (contexto) => formatarMoeda(contexto.parsed.y)
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: CORES.textoFraco, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            grid: { color: CORES.linhaSuave },
            ticks: {
              color: CORES.textoFraco,
              font: { size: 10 },
              callback: (valor) => formatarMoedaCompacta(valor)
            }
          }
        }
      }
    });
  }

  if (canvasPropostas) {
    graficoPropostasAno = new window.Chart(canvasPropostas, {
      type: 'line',
      data: {
        labels: MESES_ABREV,
        datasets: [{
          label: 'Propostas recebidas',
          data: agregadoAno.map((bucket) => bucket.propostas),
          borderColor: CORES.azul,
          backgroundColor: 'rgba(37,99,235,.12)',
          pointBackgroundColor: CORES.azul,
          pointRadius: 3,
          pointHoverRadius: 5,
          borderWidth: 2,
          tension: 0.28,
          fill: true
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: { duration: 300 },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (contexto) => {
                const quantidade = contexto.parsed.y;
                return `${quantidade} proposta${quantidade === 1 ? '' : 's'}`;
              }
            }
          }
        },
        scales: {
          x: {
            grid: { display: false },
            ticks: { color: CORES.textoFraco, font: { size: 11 } }
          },
          y: {
            beginAtZero: true,
            ticks: {
              precision: 0,
              color: CORES.textoFraco,
              font: { size: 10 }
            },
            grid: { color: CORES.linhaSuave }
          }
        }
      }
    });
  }

  if (canvasStatus) {
    const labels = ['Abertas', 'Negociando', 'Aprovadas', 'Perdidas', 'Pausadas'];
    const valores = [
      periodoAtual.abertas,
      periodoAtual.negociando,
      periodoAtual.aprovadas,
      periodoAtual.perdidas,
      periodoAtual.pausadas
    ];

    graficoStatus = new window.Chart(canvasStatus, {
      type: 'doughnut',
      data: {
        labels,
        datasets: [{
          data: valores,
          backgroundColor: [
            CORES.neutro,
            CORES.ambar,
            CORES.ciano,
            CORES.vermelho,
            CORES.violeta
          ],
          borderWidth: 1
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '62%',
        animation: { duration: 300 },
        plugins: {
          legend: {
            position: 'bottom',
            labels: { boxWidth: 10, usePointStyle: true }
          }
        }
      }
    });
  }
}


function configurarCardDolar() {
  document.getElementById('btnAtualizarDolar')?.addEventListener('click', () => {
    carregarCotacaoDolar({ silencioso: false });
  });

  renderizarCotacaoDolar();

  if (cotacaoDolar.status === 'idle') {
    carregarCotacaoDolar({ silencioso: false });
  }
}

function renderizarCotacaoDolar() {
  const valorEl = document.getElementById('dolarValor');
  const variacaoEl = document.getElementById('dolarVariacao');
  const atualizadoEl = document.getElementById('dolarAtualizadoEm');
  const conteudoEl = document.getElementById('dolarConteudo');
  const botao = document.getElementById('btnAtualizarDolar');

  if (!valorEl || !variacaoEl || !atualizadoEl || !conteudoEl || !botao) {
    return;
  }

  botao.disabled = cotacaoDolar.status === 'loading';

  if (cotacaoDolar.status === 'loading' && !cotacaoDolar.atual) {
    valorEl.textContent = 'Carregando…';
    variacaoEl.textContent = '—';
    variacaoEl.className = 'dolar-variation neutral';
    atualizadoEl.textContent = 'Banco Central do Brasil';
    conteudoEl.innerHTML =
      '<div class="dolar-loading">Consultando a cotação oficial…</div>';
    return;
  }

  if (cotacaoDolar.status === 'error' && !cotacaoDolar.atual) {
    valorEl.textContent = 'Indisponível';
    variacaoEl.textContent = '—';
    variacaoEl.className = 'dolar-variation neutral';
    atualizadoEl.textContent = 'Não foi possível atualizar';
    conteudoEl.innerHTML = `
      <div class="dolar-error">
        ${escapeHtml(cotacaoDolar.erro || 'Falha ao consultar a cotação.')}
      </div>`;
    return;
  }

  if (!cotacaoDolar.atual) return;

  valorEl.textContent = `R$ ${formatarCotacao(cotacaoDolar.atual.cotacaoVenda)}`;

  const variacao = Number(cotacaoDolar.variacaoPercentual);
  const sinal = variacao > 0 ? '+' : '';

  variacaoEl.textContent = Number.isFinite(variacao)
    ? `${sinal}${variacao.toLocaleString('pt-BR', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      })}% vs dia útil anterior`
    : 'Sem comparação disponível';

  variacaoEl.className = `dolar-variation ${
    variacao > 0
      ? 'positive'
      : variacao < 0
        ? 'negative'
        : 'neutral'
  }`;

  atualizadoEl.textContent =
    `Atualizado em ${formatarDataHoraCotacao(cotacaoDolar.atualizadoEm)}`;

  conteudoEl.innerHTML =
    '<div class="chart-wrapper"><canvas id="graficoDolar"></canvas></div>';

  renderizarGraficoDolar();
}

function renderizarGraficoDolar() {
  if (typeof window.Chart === 'undefined') return;

  graficoDolar = destruirGrafico(graficoDolar);

  const canvas = document.getElementById('graficoDolar');
  if (!canvas || !cotacaoDolar.historico.length) return;

  graficoDolar = new window.Chart(canvas, {
    type: 'line',
    data: {
      labels: cotacaoDolar.historico.map((item) =>
        formatarDataExibicao(item.data)
      ),
      datasets: [{
        label: 'PTAX venda',
        data: cotacaoDolar.historico.map((item) =>
          Number(item.cotacaoVenda)
        ),
        borderColor: CORES.ciano,
        backgroundColor: 'rgba(16,185,129,.12)',
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
        tension: 0.24,
        fill: true
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (contexto) =>
              `R$ ${formatarCotacao(contexto.parsed.y)}`
          }
        }
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: CORES.textoFraco,
            font: { size: 9 },
            maxTicksLimit: 8
          }
        },
        y: {
          grid: { color: CORES.linhaSuave },
          ticks: {
            color: CORES.textoFraco,
            font: { size: 9 },
            callback: (valor) =>
              `R$ ${Number(valor).toLocaleString('pt-BR', {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2
              })}`
          }
        }
      }
    }
  });
}

async function carregarCotacaoDolar({ silencioso = false } = {}) {
  if (cotacaoDolar.status === 'loading') return;

  if (!silencioso || !cotacaoDolar.atual) {
    cotacaoDolar.status = 'loading';
    cotacaoDolar.erro = null;
    renderizarCotacaoDolar();
  }

  try {
    const { data, error } = await supabase.functions.invoke('cotacao-dolar', {
      body: { dias: 30 }
    });

    if (error) throw error;

    if (!data?.success || !data?.atual) {
      throw new Error(
        data?.message || 'A função não retornou uma cotação válida.'
      );
    }

    cotacaoDolar = {
      status: 'success',
      atual: data.atual,
      anterior: data.anterior || null,
      variacaoPercentual: data.variacaoPercentual ?? null,
      atualizadoEm:
        data.atualizadoEm ||
        data.atual.dataHoraCotacao ||
        null,
      historico: Array.isArray(data.historico)
        ? data.historico
        : [],
      erro: null
    };
  } catch (error) {
    console.error('[Dashboard] Erro ao carregar dólar:', error);

    cotacaoDolar = {
      ...cotacaoDolar,
      status: cotacaoDolar.atual ? 'success' : 'error',
      erro:
        error?.message ||
        'Não foi possível consultar a cotação do dólar.'
    };
  }

  renderizarCotacaoDolar();
}

function atualizarControlesVisao() {
  document.querySelectorAll('.visao-btn').forEach((botao) => {
    botao.classList.toggle(
      'ativo',
      botao.dataset.visao === modoVisao
    );
  });

  document
    .getElementById('mesesBarra')
    ?.classList.toggle('hidden', modoVisao === 'anual');
}

function atualizarBotoesMes() {
  document.querySelectorAll('.mes-filtro').forEach((botao, indice) => {
    botao.classList.toggle('ativo', indice === mesSelecionado);
  });
}

function selecionarModoVisao(modo) {
  if (!['mensal', 'anual'].includes(modo)) return;
  modoVisao = modo;
  renderizarDashboard();
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
    botao.classList.toggle(
      'ativo-ano',
      Number(botao.dataset.ano) === anoSelecionado
    );
  });
}

function construirDropdownAnos() {
  const dropdown = document.getElementById('anosDropdown');
  if (!dropdown) return;

  const anoAtual = new Date().getFullYear();
  const anosDisponiveis = [];

  for (let ano = anoAtual; ano >= ANO_MINIMO; ano--) {
    anosDisponiveis.push(ano);
  }

  dropdown.innerHTML = anosDisponiveis
    .map((ano) => `
      <button
        type="button"
        data-ano="${ano}"
        class="${ano === anoSelecionado ? 'ativo-ano' : ''}"
      >
        ${ano}
      </button>`)
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
  document.querySelectorAll('.visao-btn').forEach((botao) => {
    botao.addEventListener('click', () => {
      selecionarModoVisao(botao.dataset.visao);
    });
  });

  document.querySelectorAll('.mes-filtro').forEach((botao, indice) => {
    botao.addEventListener('click', () => selecionarMes(indice));
  });

  construirDropdownAnos();
  atualizarAnoExibido();
  atualizarControlesVisao();
  atualizarBotoesMes();

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
}

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
      db.fetchContracts()
    ]);

    const errosDeFonte = [];
    const clientes = extrairResultado(
      resultados[0],
      'clients',
      errosDeFonte
    );
    const projetos = extrairResultado(
      resultados[1],
      'projects',
      errosDeFonte
    );
    const propostas = extrairResultado(
      resultados[2],
      'proposals',
      errosDeFonte
    );
    const contratos = extrairResultado(
      resultados[3],
      'contracts',
      errosDeFonte
    );

    mostrarAvisoFontes(errosDeFonte);

    const clientePorId = construirMapaClientes(clientes);
    const projetoPorId = construirMapaProjetos(projetos);

    propostasNormalizadas = propostas.map((proposta) =>
      normalizarProposta(proposta, clientePorId, projetoPorId)
    );

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

async function inicializarDashboard() {
  mostrarLoading();

  try {
    const session = await obterSessaoObrigatoria();
    if (!session) return;

    const { perfil } = await loadCurrentUserPermissions();
    aplicarPerfilNoMenu(perfil);

    configurarFiltros();
    await carregarDadosDashboard();

    if (!intervaloDolar) {
      intervaloDolar = window.setInterval(() => {
        if (document.visibilityState === 'visible') {
          carregarCotacaoDolar({ silencioso: true });
        }
      }, INTERVALO_ATUALIZACAO_DOLAR);
    }
  } catch (error) {
    mostrarErro(error);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener(
    'DOMContentLoaded',
    inicializarDashboard,
    { once: true }
  );
} else {
  inicializarDashboard();
}
