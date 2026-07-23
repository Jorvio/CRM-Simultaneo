// cotacao.js
// Integração com a AwesomeAPI (economia.awesomeapi.com.br) para obter a cotação
// do dólar comercial (USD/BRL). API pública, gratuita, sem necessidade de chave
// e com CORS liberado para uso direto no navegador.

const AWESOME_API_BASE = 'https://economia.awesomeapi.com.br';
const CACHE_KEY_ATUAL = 'crm_cotacao_usd_atual';
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos — evita bater na API a cada tecla digitada

function lerCacheAtual() {
  try {
    const bruto = sessionStorage.getItem(CACHE_KEY_ATUAL);
    if (!bruto) return null;
    const dados = JSON.parse(bruto);
    if (!dados?.expiraEm || Date.now() > dados.expiraEm) return null;
    return {
      ...dados.valor,
      dataHora: dados.valor.dataHora ? new Date(dados.valor.dataHora) : new Date()
    };
  } catch {
    return null;
  }
}

function salvarCacheAtual(valor) {
  try {
    sessionStorage.setItem(CACHE_KEY_ATUAL, JSON.stringify({
      valor: { ...valor, dataHora: valor.dataHora?.toISOString?.() || null },
      expiraEm: Date.now() + CACHE_TTL_MS
    }));
  } catch {
    // sessionStorage indisponível (ex: modo privado) — segue sem cache
  }
}

/**
 * Busca a cotação atual do dólar comercial (USD -> BRL).
 * Retorna { bid, ask, high, low, varBid, pctChange, dataHora, fonte }
 */
export async function fetchCotacaoAtual({ forcarAtualizacao = false } = {}) {
  if (!forcarAtualizacao) {
    const doCache = lerCacheAtual();
    if (doCache) return doCache;
  }

  const resposta = await fetch(`${AWESOME_API_BASE}/json/last/USD-BRL`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar cotação do dólar (HTTP ${resposta.status})`);
  }

  const dados = await resposta.json();
  const bruto = dados?.USDBRL;
  if (!bruto?.bid) {
    throw new Error('Resposta da API de cotação em formato inesperado');
  }

  const cotacao = {
    bid: Number(bruto.bid),
    ask: Number(bruto.ask),
    high: Number(bruto.high),
    low: Number(bruto.low),
    varBid: Number(bruto.varBid),
    pctChange: Number(bruto.pctChange),
    dataHora: bruto.create_date ? new Date(bruto.create_date.replace(' ', 'T')) : new Date(),
    fonte: 'AWESOMEAPI_USD_BRL'
  };

  salvarCacheAtual(cotacao);
  return cotacao;
}

function converterDataDaAPI(item) {
  // A API só envia "create_date" no primeiro registro da lista; os demais
  // trazem apenas "timestamp" (unix). Por isso o timestamp é a fonte primária.
  if (item.timestamp) {
    const bruto = Number(item.timestamp);
    if (Number.isFinite(bruto) && bruto > 0) {
      // timestamps de 13 dígitos já vêm em milissegundos
      const ms = bruto > 1e12 ? bruto : bruto * 1000;
      const data = new Date(ms);
      if (!Number.isNaN(data.getTime())) return data;
    }
  }

  if (item.create_date) {
    const data = new Date(String(item.create_date).replace(' ', 'T'));
    if (!Number.isNaN(data.getTime())) return data;
  }

  return null;
}

/**
 * Busca cotações intraday (ticks recentes, várias por dia).
 * Usado para os períodos curtos (1D / 5D), onde o endpoint diário
 * entregaria apenas 1 ponto por dia e o gráfico ficaria "quadrado".
 * Retorna array ordenado (mais antigo -> mais recente) de { data, bid }
 */
export async function fetchIntradayDolar(quantidade = 100) {
  const qtd = Math.min(Math.max(Number(quantidade) || 100, 2), 1500);

  const resposta = await fetch(`${AWESOME_API_BASE}/json/USD-BRL/${qtd}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar cotações intraday (HTTP ${resposta.status})`);
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    throw new Error('Resposta intraday em formato inesperado');
  }

  const pontos = dados
    .map((item) => ({
      data: converterDataDaAPI(item),
      bid: Number(item.bid)
    }))
    .filter((item) => item.data && Number.isFinite(item.bid))
    .sort((a, b) => a.data - b.data);

  console.log(`[cotacao] Intraday do dólar: ${dados.length} registros brutos -> ${pontos.length} pontos válidos`);
  return pontos;
}

/**
 * Busca o histórico diário do dólar comercial nos últimos `dias`.
 * Retorna array ordenado (mais antigo -> mais recente) de { data, bid }
 */
export async function fetchHistoricoDolar(dias = 30) {
  // Limite máximo da API é 360 dias por requisição
  const quantidade = Math.min(Math.max(Number(dias) || 30, 2), 360);

  const resposta = await fetch(`${AWESOME_API_BASE}/json/daily/USD-BRL/${quantidade}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar histórico do dólar (HTTP ${resposta.status})`);
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    throw new Error('Resposta de histórico em formato inesperado');
  }

  const pontos = dados
    .map((item) => ({
      data: converterDataDaAPI(item),
      bid: Number(item.bid)
    }))
    .filter((item) => item.data && Number.isFinite(item.bid));

  // A API pode retornar mais de uma cotação por dia (ticks intraday).
  // Mantemos apenas o registro mais recente de cada dia civil.
  const porDia = new Map();
  pontos.forEach((ponto) => {
    const chave = `${ponto.data.getFullYear()}-${ponto.data.getMonth()}-${ponto.data.getDate()}`;
    const existente = porDia.get(chave);
    if (!existente || ponto.data > existente.data) {
      porDia.set(chave, ponto);
    }
  });

  const resultado = Array.from(porDia.values()).sort((a, b) => a.data - b.data);
  console.log(`[cotacao] Histórico do dólar: ${dados.length} registros brutos -> ${resultado.length} dias únicos`);
  return resultado;
}
