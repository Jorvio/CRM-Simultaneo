import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://vgyeddlrfnzuragrrgla.supabase.co';
const SUPABASE_KEY = 'sb_publishable_URJREuSZM4oeQMzr_B3ljg_yhuWGC-B';

console.log('[Supabase] Inicializando cliente...');
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
console.log('[Supabase] Cliente criado:', supabase);

async function testarConexao() {
  console.log('[Supabase] Testando conexão com a tabela clients...');
  const { data, error } = await supabase.from('clients').select('*').limit(1);
  if (error) {
    console.error('[Supabase] FALHA NA CONEXÃO:', error);
    alert(`Falha na conexão com o banco de dados:\n${error.message}`);
    return false;
  }
  console.log('[Supabase] Conexão OK. Retorno:', data);
  return true;
}

async function exec(promise) {
  const { data, error } = await promise;
  if (error) {
    console.error('[Supabase] Erro na operação:', error);
    throw error;  // lança o objeto completo, não só a mensagem
  }
  return data;
}

window.supabaseClient = supabase;
window.testarConexao = testarConexao;

window.db = {
  client: supabase,

  async fetchClients() {
    console.log('[db] fetchClients');
    return exec(supabase.from('clients').select('*').order('id', { ascending: true }));
  },
  async fetchProjects() {
    console.log('[db] fetchProjects');
    return exec(supabase.from('projects').select('*').order('id', { ascending: true }));
  },
  async fetchResponsaveis() {
    console.log('[db] fetchResponsaveis');
    return exec(supabase.from('responsaveis').select('*').order('id', { ascending: true }));
  },
  async fetchContracts() {
    console.log('[db] fetchContracts');
    return exec(supabase.from('contracts').select('*').order('id', { ascending: true }));
  },
  async fetchProposals() {
    console.log('[db] fetchProposals');
    return exec(supabase.from('proposals').select('*').order('id', { ascending: false }));
  },
  async fetchClientById(id) {
    console.log('[db] fetchClientById', id);
    return exec(supabase.from('clients').select('*').eq('id', id).single());
  },
  async fetchProjectById(id) {
    console.log('[db] fetchProjectById', id);
    return exec(supabase.from('projects').select('*').eq('id', id).single());
  },
  async fetchProposalById(id) {
    console.log('[db] fetchProposalById', id);
    return exec(supabase.from('proposals').select('*').eq('id', id).single());
  },
  async insertClient(payload) {
    console.log('[db] insertClient — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('clients').insert([payload]).select().single());
    console.log('[db] insertClient — resultado:', result);
    return result;
  },
  async updateClient(id, payload) {
    console.log('[db] updateClient id:', id, 'payload:', payload);
    return exec(supabase.from('clients').update(payload).eq('id', id).select().single());
  },
  async deleteClient(id) {
    console.log('[db] deleteClient id:', id);
    return exec(supabase.from('clients').delete().eq('id', id));
  },
  async insertProject(payload) {
    console.log('[db] insertProject — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('projects').insert([payload]).select().single());
    console.log('[db] insertProject — resultado:', result);
    return result;
  },
  async updateProject(id, payload) {
    console.log('[db] updateProject id:', id, 'payload:', payload);
    return exec(supabase.from('projects').update(payload).eq('id', id).select().single());
  },
  async deleteProject(id) {
    console.log('[db] deleteProject id:', id);
    return exec(supabase.from('projects').delete().eq('id', id));
  },
  async insertResponsavel(payload) {
    console.log('[db] insertResponsavel payload:', JSON.stringify(payload));
    return exec(supabase.from('responsaveis').insert([payload]).select().single());
  },
  async updateResponsavel(id, payload) {
    console.log('[db] updateResponsavel id:', id);
    return exec(supabase.from('responsaveis').update(payload).eq('id', id).select().single());
  },
  async insertContract(payload) {
    console.log('[db] insertContract payload:', JSON.stringify(payload));
    return exec(supabase.from('contracts').insert([payload]).select().single());
  },
  async updateContract(id, payload) {
    console.log('[db] updateContract id:', id);
    return exec(supabase.from('contracts').update(payload).eq('id', id).select().single());
  },
  async insertProposal(payload) {
    console.log('[db] insertProposal — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('proposals').insert([payload]).select().single());
    console.log('[db] insertProposal — resultado:', result);
    return result;
  },
  async updateProposal(id, payload) {
    console.log('[db] updateProposal id:', id, 'payload:', payload);
    return exec(supabase.from('proposals').update(payload).eq('id', id).select().single());
  },
  async deleteProposal(id) {
    console.log('[db] deleteProposal id:', id);
    return exec(supabase.from('proposals').delete().eq('id', id));
  },
  async checkRls() {
    const results = {};
    for (const table of ['clients', 'projects', 'responsaveis', 'contracts', 'proposals']) {
      const { data, error } = await supabase.from(table).select('id').limit(1);
      results[table] = error ? `ERRO: ${error.message}` : 'ok';
      console.log(`[RLS] ${table}:`, results[table]);
    }
    return results;
  }
};

window.dbMessage = function(message, type = 'info') {
  if (type === 'error') {
    console.error('[dbMessage erro]', message);
    alert(`Erro: ${message}`);
  } else if (type === 'success') {
    console.log('[dbMessage sucesso]', message);
    if (window.showToast) { showToast(message); } else { alert(message); }
  } else {
    console.log('[dbMessage]', message);
  }
};

// Testa conexão automaticamente ao carregar a página
document.addEventListener('DOMContentLoaded', testarConexao);

export { supabase, testarConexao };
export const db = window.db;
export const dbMessage = window.dbMessage;
