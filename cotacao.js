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

function formatarDataParaAPI(data) {
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const dia = String(data.getDate()).padStart(2, '0');
  return `${ano}${mes}${dia}`;
}

/**
 * Busca o histórico diário do dólar comercial nos últimos `dias`.
 * Retorna array ordenado (mais antigo -> mais recente) de { data, bid }
 */
export async function fetchHistoricoDolar(dias = 30) {
  const hoje = new Date();
  const inicio = new Date();
  inicio.setDate(inicio.getDate() - dias);

  // Forçamos start_date/end_date explícitos: sem isso, a API às vezes devolve
  // várias cotações de um intervalo curto (ex: só do dia de hoje) em vez de
  // uma cotação por dia espalhada ao longo do período pedido.
  const params = new URLSearchParams({
    start_date: formatarDataParaAPI(inicio),
    end_date: formatarDataParaAPI(hoje)
  });

  // Limite máximo da API é 360; damos uma folga (fins de semana/feriados não têm cotação)
  const quantidade = Math.min(Math.ceil(dias * 1.6) + 10, 360);

  const resposta = await fetch(`${AWESOME_API_BASE}/json/daily/USD-BRL/${quantidade}?${params.toString()}`);
  if (!resposta.ok) {
    throw new Error(`Falha ao buscar histórico do dólar (HTTP ${resposta.status})`);
  }

  const dados = await resposta.json();
  if (!Array.isArray(dados)) {
    throw new Error('Resposta de histórico em formato inesperado');
  }

  const pontos = dados
    .map((item) => ({
      data: item.create_date ? new Date(item.create_date.replace(' ', 'T')) : null,
      bid: Number(item.bid)
    }))
    .filter((item) => item.data && Number.isFinite(item.bid));

  // A API pode retornar mais de uma cotação por dia (ticks intraday).
  // Aqui mantemos apenas o registro mais recente de cada dia civil,
  // senão o gráfico "achata" tudo em poucos pontos.
  const porDia = new Map();
  pontos.forEach((ponto) => {
    const chave = ponto.data.toISOString().slice(0, 10); // YYYY-MM-DD
    const existente = porDia.get(chave);
    if (!existente || ponto.data > existente.data) {
      porDia.set(chave, ponto);
    }
  });

  const resultado = Array.from(porDia.values()).sort((a, b) => a.data - b.data);
  console.log(`[cotacao] Histórico do dólar: ${dados.length} registros brutos -> ${resultado.length} dias únicos`);
  return resultado;
}
