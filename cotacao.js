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

/**
 * Busca o histórico diário do dólar comercial nos últimos `dias`.
 * Retorna array ordenado (mais antigo -> mais recente) de { data, bid }
 */
export async function fetchHistoricoDolar(dias = 30) {
  const resposta = await fetch(`${AWESOME_API_BASE}/json/daily/USD-BRL/${dias}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar histórico do dólar (HTTP ${resposta.status})`);
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    throw new Error('Resposta de histórico em formato inesperado');
  }

  return dados
    .map((item) => ({
      data: item.create_date ? new Date(item.create_date.replace(' ', 'T')) : null,
      bid: Number(item.bid)
    }))
    .filter((item) => item.data && Number.isFinite(item.bid))
    .sort((a, b) => a.data - b.data);
}
