import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://vgyeddlrfnzuragrrgla.supabase.co';
const SUPABASE_KEY = 'sb_publishable_URJREuSZM4oeQMzr_B3ljg_yhuWGC-B';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

function normalizeError(error) {
  if (!error) return null;
  return error.message || error.details || JSON.stringify(error);
}

async function exec(promise) {
  const { data, error } = await promise;
  if (error) {
    throw new Error(normalizeError(error));
  }
  return data;
}

window.supabaseClient = supabase;
window.db = {
  client: supabase,
  async fetchClients() {
    return exec(supabase.from('clients').select('*').order('id', { ascending: true }));
  },
  async fetchProjects() {
    return exec(supabase.from('projects').select('*').order('id', { ascending: true }));
  },
  async fetchResponsaveis() {
    return exec(supabase.from('responsaveis').select('*').order('id', { ascending: true }));
  },
  async fetchContracts() {
    return exec(supabase.from('contracts').select('*').order('id', { ascending: true }));
  },
  async fetchProposals() {
    return exec(supabase.from('proposals').select('*').order('id', { ascending: false }));
  },
  async fetchClientById(id) {
    return exec(supabase.from('clients').select('*').eq('id', id).single());
  },
  async fetchProjectById(id) {
    return exec(supabase.from('projects').select('*').eq('id', id).single());
  },
  async fetchProposalById(id) {
    return exec(supabase.from('proposals').select('*').eq('id', id).single());
  },
  async insertClient(payload) {
    return exec(supabase.from('clients').insert([payload]).select().single());
  },
  async updateClient(id, payload) {
    return exec(supabase.from('clients').update(payload).eq('id', id).select().single());
  },
  async deleteClient(id) {
    return exec(supabase.from('clients').delete().eq('id', id));
  },
  async insertProject(payload) {
    return exec(supabase.from('projects').insert([payload]).select().single());
  },
  async updateProject(id, payload) {
    return exec(supabase.from('projects').update(payload).eq('id', id).select().single());
  },
  async deleteProject(id) {
    return exec(supabase.from('projects').delete().eq('id', id));
  },
  async insertResponsavel(payload) {
    return exec(supabase.from('responsaveis').insert([payload]).select().single());
  },
  async updateResponsavel(id, payload) {
    return exec(supabase.from('responsaveis').update(payload).eq('id', id).select().single());
  },
  async insertContract(payload) {
    return exec(supabase.from('contracts').insert([payload]).select().single());
  },
  async updateContract(id, payload) {
    return exec(supabase.from('contracts').update(payload).eq('id', id).select().single());
  },
  async insertProposal(payload) {
    return exec(supabase.from('proposals').insert([payload]).select().single());
  },
  async updateProposal(id, payload) {
    return exec(supabase.from('proposals').update(payload).eq('id', id).select().single());
  },
  async deleteProposal(id) {
    return exec(supabase.from('proposals').delete().eq('id', id));
  },
  async checkRls() {
    const results = {};
    for (const table of ['clients','projects','responsaveis','contracts','proposals']) {
      try {
        await exec(supabase.from(table).select('id').limit(1));
        results[table] = 'ok';
      } catch (error) {
        results[table] = normalizeError(error);
      }
    }
    return results;
  }
};

window.dbMessage = function(message, type='info') {
  if (window.showToast) {
    showToast(message);
    return;
  }
  console[type==='error' ? 'error' : 'log'](message);
  if (type==='success') alert(message);
  if (type==='error') alert('Erro: ' + message);
};

export { supabase, db, dbMessage };
