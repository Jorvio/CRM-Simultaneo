import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://vgyeddlrfnzuragrrgla.supabase.co';
const SUPABASE_KEY = 'sb_publishable_URJREuSZM4oeQMzr_B3ljg_yhuWGC-B';

if (!window.supabase?.createClient) {
  window.supabase = { ...(window.supabase || {}), createClient };
}

(function initializeSupabaseClient() {
  if (window.__crmSupabaseInitialized) return;
  window.__crmSupabaseInitialized = true;

  if (window.supabaseClient) return;

  if (!window.supabase?.createClient) {
    throw new Error('Biblioteca do Supabase nao carregada.');
  }

  window.supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true
    }
  });
})();

const supabase = window.supabaseClient;

const PUBLIC_ROUTES = new Set([
  'index.html',
  'login.html',
  'esqueci-senha.html',
  'redefinir-senha.html',
  'auth-callback.html'
]);

function getCurrentPageName() {
  return window.location.pathname.split('/').pop() || 'index.html';
}

function isPublicRoute() {
  return PUBLIC_ROUTES.has(getCurrentPageName());
}

function logSupabaseError(scope, error, extra = {}) {
  console.error(`[${scope}]`, {
    code: error?.code,
    message: error?.message,
    details: error?.details,
    hint: error?.hint,
    ...extra
  });
}

function isUnauthorizedError(error) {
  return (
    error?.status === 401 ||
    error?.code === '401' ||
    String(error?.message || '').toLowerCase().includes('jwt')
  );
}

async function handleUnauthorized(error) {
  if (!isUnauthorizedError(error)) {
    return false;
  }

  logSupabaseError('Supabase unauthorized', error);
  await supabase.auth.signOut();

  if (!isPublicRoute()) {
    window.location.replace('./login.html?msg=not-authenticated');
  }

  return true;
}

export async function obterSessaoObrigatoria({ redirectToLogin = true } = {}) {
  const client = window.supabaseClient;

  if (!client) {
    throw new Error('Cliente Supabase nao inicializado.');
  }

  const {
    data: { session },
    error
  } = await client.auth.getSession();

  if (error) {
    logSupabaseError('Auth getSession', error);
    throw error;
  }

  if (!session?.user || !session?.access_token) {
    if (redirectToLogin && !isPublicRoute()) {
      window.location.replace('./login.html?msg=not-authenticated');
    }
    return null;
  }

  return session;
}

function normalizeRoleName(roleName) {
  return String(roleName || '').trim().toLowerCase();
}

function buildPermissions(perfil) {
  const role = normalizeRoleName(perfil?.role_name);
  const perfilAtivo = perfil?.account_status === 'active';

  const podeAdicionar = perfilAtivo && ['master', 'editor'].includes(role);
  const podeEditar = perfilAtivo && role === 'master';
  const podeExcluir = perfilAtivo && role === 'master';
  const podeGerenciarUsuarios =
    perfilAtivo && (role === 'master' || Boolean(perfil?.can_manage_users));

  return {
    perfilAtivo,
    role,
    podeVisualizar: podeAdicionar,
    podeAdicionar,
    podeEditar,
    podeExcluir,
    podeGerenciarUsuarios
  };
}

let cachedProfile = null;
let cachedPermissions = null;
let cachedUserId = null;

async function loadCurrentProfile(session) {
  const activeSession = session || await obterSessaoObrigatoria();
  if (!activeSession?.user) {
    const error = new Error('Usuario nao autenticado.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  const { data: perfil, error: perfilError } = await supabase
    .from('profiles')
    .select(`
      id,
      email,
      full_name,
      role_name,
      account_status,
      can_manage_users,
      must_change_password
    `)
    .eq('id', activeSession.user.id)
    .single();

  if (perfilError || !perfil) {
    logSupabaseError('Profiles select', perfilError, {
      tabela: 'profiles',
      operacao: 'select'
    });
    const error = new Error('Perfil de acesso nao encontrado.');
    error.code = 'PROFILE_NOT_FOUND';
    throw error;
  }

  return perfil;
}

export async function loadCurrentUserPermissions({ force = false } = {}) {
  const session = await obterSessaoObrigatoria();
  if (!session?.user) {
    const error = new Error('Usuario nao autenticado.');
    error.code = 'AUTH_REQUIRED';
    throw error;
  }

  if (!force && cachedPermissions && cachedUserId === session.user.id) {
    return { perfil: cachedProfile, permissions: cachedPermissions };
  }

  const perfil = await loadCurrentProfile(session);
  const permissions = buildPermissions(perfil);

  cachedProfile = perfil;
  cachedPermissions = permissions;
  cachedUserId = session.user.id;

  window.crmCurrentProfile = perfil;
  window.crmCurrentPermissions = permissions;

  return { perfil, permissions };
}

async function assertPermission(action) {
  const { perfil, permissions } = await loadCurrentUserPermissions();
  const map = {
    select: permissions.podeVisualizar,
    insert: permissions.podeAdicionar,
    update: permissions.podeEditar,
    delete: permissions.podeExcluir
  };

  if (!map[action]) {
    const error = new Error('Seu usuario nao possui permissao para esta operacao.');
    error.code = 'PERMISSION_DENIED';
    error.details = {
      action,
      role_name: perfil.role_name,
      account_status: perfil.account_status
    };
    throw error;
  }
}

async function exec(promise, meta = {}) {
  const { data, error } = await promise;
  if (error) {
    logSupabaseError('Supabase operation', error, {
      tabela: meta.table || 'desconhecida',
      operacao: meta.operation || 'desconhecida'
    });

    const redirected = await handleUnauthorized(error);
    if (redirected) {
      const authError = new Error('Sessao expirada. Faca login novamente.');
      authError.code = 'AUTH_REQUIRED';
      throw authError;
    }

    throw error;
  }
  return data;
}

function sanitizeResponsavelPayload(payload = {}) {
  const { project_id, ...safePayload } = payload;
  return safePayload;
}

async function testarConexao() {
  const session = await obterSessaoObrigatoria({ redirectToLogin: false });
  if (!session) return false;

  const { error } = await supabase.from('clients').select('id').limit(1);
  if (error) {
    logSupabaseError('Supabase test', error, {
      tabela: 'clients',
      operacao: 'select'
    });
    return false;
  }

  return true;
}

window.testarConexao = testarConexao;

window.db = {
  client: supabase,

  async fetchClients() {
    await assertPermission('select');

    return exec(
      supabase
        .from('clients')
        .select(`
          id,
          name,
          legal_name,
          cpf,
          cnpj,
          address,
          client_type,
          created_at,
          updated_at
        `)
        .order('name', { ascending: true }),
      { table: 'clients', operation: 'select' }
    );
  },

  async fetchProjects() {
    await assertPermission('select');

    return exec(
      supabase
        .from('projects')
        .select(`
          id,
          client_id,
          responsible_id,
          name,
          services,
          status,
          created_at,
          updated_at,
          cliente:clients!projects_client_id_fkey (
            id,
            name,
            legal_name,
            cpf,
            cnpj,
            address,
            client_type
          ),
          responsavel:responsaveis!projects_responsible_id_fkey (
            id,
            nome_completo,
            cpf,
            rg_orgao_emissor,
            profissao,
            estado_civil,
            endereco_responsavel,
            email,
            telefone,
            email_copia,
            created_at,
            updated_at
          ),
          propostas:proposals!proposals_project_id_fkey (
            id,
            project_id,
            client_id,
            proposal_number,
            proposal_status,
            project_status,
            created_at,
            updated_at
          )
        `)
        .order('id', { ascending: true }),
      { table: 'projects', operation: 'select' }
    );
  },

  async fetchResponsaveis() {
    await assertPermission('select');
    return exec(
      supabase.from('responsaveis').select('*').order('id', { ascending: true }),
      { table: 'responsaveis', operation: 'select' }
    );
  },

  async fetchContracts() {
    await assertPermission('select');
    return exec(
      supabase.from('contracts').select('*').order('id', { ascending: true }),
      { table: 'contracts', operation: 'select' }
    );
  },

  async fetchProposals() {
    await assertPermission('select');

    return exec(
      supabase
        .from('proposals')
        .select(`
          id,
          project_id,
          client_id,
          proposal_number,
          contact_id,
          contact_name,
          point_of_contact,
          budget_date,
          closing_date,
          closing_month,
          value_usd,
          value_brl,
          proposal_status,
          project_status,
          notes,
          created_at,
          updated_at,
          cliente:clients!proposals_client_id_fkey (
            id,
            name,
            legal_name
          ),
          projeto:projects!proposals_project_id_fkey (
            id,
            name,
            client_id
          )
        `)
        .order('created_at', { ascending: false }),
      { table: 'proposals', operation: 'select' }
    );
  },

  async fetchClientById(id) {
    await assertPermission('select');
    return exec(
      supabase.from('clients').select('*').eq('id', id).single(),
      { table: 'clients', operation: 'select.single' }
    );
  },

  async fetchProjectById(id) {
    await assertPermission('select');

    return exec(
      supabase
        .from('projects')
        .select(`
          id,
          client_id,
          responsible_id,
          name,
          services,
          status,
          created_at,
          updated_at,
          cliente:clients!projects_client_id_fkey (
            id,
            name,
            legal_name,
            cpf,
            cnpj,
            address,
            client_type,
            created_at,
            updated_at
          ),
          responsavel:responsaveis!projects_responsible_id_fkey (
            id,
            nome_completo,
            cpf,
            rg_orgao_emissor,
            profissao,
            estado_civil,
            endereco_responsavel,
            email,
            telefone,
            email_copia,
            created_at,
            updated_at
          ),
          propostas:proposals!proposals_project_id_fkey (
            id,
            project_id,
            client_id,
            proposal_number,
            contact_id,
            contact_name,
            point_of_contact,
            budget_date,
            closing_date,
            closing_month,
            value_usd,
            value_brl,
            proposal_status,
            project_status,
            notes,
            created_at,
            updated_at
          )
        `)
        .eq('id', id)
        .single(),
      { table: 'projects', operation: 'select.single' }
    );
  },

  async fetchProjectsByClient(clientId) {
    await assertPermission('select');
    return exec(
      supabase
        .from('projects')
        .select('id, client_id, responsible_id, name, services, status, created_at, updated_at')
        .eq('client_id', clientId)
        .order('name', { ascending: true }),
      { table: 'projects', operation: 'select.byClient' }
    );
  },

  async fetchProposalsByProject(projectId) {
    await assertPermission('select');

    return exec(
      supabase
        .from('proposals')
        .select(`
          id,
          project_id,
          client_id,
          proposal_number,
          contact_id,
          contact_name,
          point_of_contact,
          budget_date,
          closing_date,
          closing_month,
          value_usd,
          value_brl,
          proposal_status,
          project_status,
          notes,
          created_at,
          updated_at,
          cliente:clients!proposals_client_id_fkey (
            id,
            name,
            legal_name
          ),
          projeto:projects!proposals_project_id_fkey (
            id,
            name,
            client_id
          )
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false }),
      { table: 'proposals', operation: 'select.byProject' }
    );
  },

  async fetchProposalById(id) {
    await assertPermission('select');
    return exec(
      supabase
        .from('proposals')
        .select(`
          id,
          project_id,
          client_id,
          proposal_number,
          contact_id,
          contact_name,
          point_of_contact,
          budget_date,
          closing_date,
          closing_month,
          value_usd,
          value_brl,
          proposal_status,
          project_status,
          notes,
          created_at,
          updated_at,
          cliente:clients!proposals_client_id_fkey (
            id,
            name,
            legal_name
          ),
          projeto:projects!proposals_project_id_fkey (
            id,
            name,
            client_id
          )
        `)
        .eq('id', id)
        .single(),
      { table: 'proposals', operation: 'select.single' }
    );
  },

  async insertClient(payload) {
    await assertPermission('insert');
    return exec(
      supabase.from('clients').insert([payload]).select().single(),
      { table: 'clients', operation: 'insert' }
    );
  },

  async updateClient(id, payload) {
    await assertPermission('update');
    return exec(
      supabase.from('clients').update(payload).eq('id', id).select().single(),
      { table: 'clients', operation: 'update' }
    );
  },

  async deleteClient(id) {
    await assertPermission('delete');
    return exec(
      supabase.from('clients').delete().eq('id', id),
      { table: 'clients', operation: 'delete' }
    );
  },

  async insertProject(payload) {
    await assertPermission('insert');
    return exec(
      supabase.from('projects').insert([payload]).select().single(),
      { table: 'projects', operation: 'insert' }
    );
  },

  async updateProject(id, payload) {
    await assertPermission('update');
    return exec(
      supabase.from('projects').update(payload).eq('id', id).select().single(),
      { table: 'projects', operation: 'update' }
    );
  },

  async deleteProject(id) {
    await assertPermission('delete');
    return exec(
      supabase.from('projects').delete().eq('id', id),
      { table: 'projects', operation: 'delete' }
    );
  },

  async insertResponsavel(payload) {
    await assertPermission('insert');
    const safePayload = sanitizeResponsavelPayload(payload);
    return exec(
      supabase.from('responsaveis').insert([safePayload]).select().single(),
      { table: 'responsaveis', operation: 'insert' }
    );
  },

  async updateResponsavel(id, payload) {
    await assertPermission('update');
    const safePayload = sanitizeResponsavelPayload(payload);
    return exec(
      supabase.from('responsaveis').update(safePayload).eq('id', id).select().single(),
      { table: 'responsaveis', operation: 'update' }
    );
  },

  async insertContract(payload) {
    await assertPermission('insert');
    return exec(
      supabase.from('contracts').insert([payload]).select().single(),
      { table: 'contracts', operation: 'insert' }
    );
  },

  async updateContract(id, payload) {
    await assertPermission('update');
    return exec(
      supabase.from('contracts').update(payload).eq('id', id).select().single(),
      { table: 'contracts', operation: 'update' }
    );
  },

  async insertProposal(payload) {
    await assertPermission('insert');
    return exec(
      supabase.from('proposals').insert([payload]).select().single(),
      { table: 'proposals', operation: 'insert' }
    );
  },

  async updateProposal(id, payload) {
    await assertPermission('update');
    return exec(
      supabase.from('proposals').update(payload).eq('id', id).select().single(),
      { table: 'proposals', operation: 'update' }
    );
  },

  async deleteProposal(id) {
    await assertPermission('delete');
    return exec(
      supabase.from('proposals').delete().eq('id', id),
      { table: 'proposals', operation: 'delete' }
    );
  },

  async checkRls() {
    await assertPermission('select');
    const results = {};
    for (const table of ['clients', 'projects', 'responsaveis', 'contracts', 'proposals']) {
      const { error } = await supabase.from(table).select('id').limit(1);
      results[table] = error ? `ERRO: ${error.message}` : 'ok';
    }
    return results;
  }
};

window.dbMessage = function dbMessage(message, type = 'info') {
  if (type === 'error') {
    console.error('[dbMessage]', message);
  }

  if (typeof window.showToast === 'function') {
    window.showToast(message, type);
  }
};

export { supabase, testarConexao };
export const db = window.db;
export const dbMessage = window.dbMessage;
