import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://vgyeddlrfnzuragrrgla.supabase.co';
const SUPABASE_KEY = 'sb_publishable_URJREuSZM4oeQMzr_B3ljg_yhuWGC-B';

if (!window.supabase?.createClient) {
  window.supabase = { ...(window.supabase || {}), createClient };
}

(function inicializarSupabase() {
  if (window.__crmSupabaseInitialized) {
    console.warn('[Supabase] Tentativa de inicializacao duplicada bloqueada.');
    return;
  }

  window.__crmSupabaseInitialized = true;

  if (window.supabaseClient) {
    console.log('[Supabase] Cliente existente reutilizado.');
    return;
  }

  if (!window.supabase?.createClient) {
    throw new Error('A biblioteca oficial do Supabase nao foi carregada.');
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  console.log('[Supabase] Cliente unico inicializado.');
})();

const supabase = window.supabaseClient;

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

  console.error('A sessao nao foi enviada ou o token e invalido.', error);
  await supabase.auth.signOut();
  window.location.replace('./login.html');
  return true;
}

export async function obterSessaoObrigatoria() {
  const client = window.supabaseClient;

  if (!client) {
    throw new Error('Cliente Supabase nao inicializado.');
  }

  const {
    data: { session },
    error
  } = await client.auth.getSession();

  if (error) {
    console.error('[Auth] Erro ao recuperar sessao:', error);
    throw error;
  }

  if (!session?.user || !session?.access_token) {
    console.error('[Auth] Consulta tentada sem sessao.');
    window.location.replace('./login.html');
    return null;
  }

  console.log('[Auth] Sessao valida:', {
    userId: session.user.id,
    email: session.user.email
  });

  return session;
}

function normalizeRoleName(roleName) {
  return String(roleName || '').trim().toLowerCase();
}

function buildPermissions(perfil) {
  const role = normalizeRoleName(perfil?.role_name);
  const perfilAtivo = perfil?.account_status === 'active';

  const podeAdicionar =
    perfilAtivo &&
    ['master', 'editor'].includes(role);

  const podeEditar =
    perfilAtivo &&
    role === 'master';

  const podeExcluir =
    perfilAtivo &&
    role === 'master';

  return {
    perfilAtivo,
    role,
    podeVisualizar: podeAdicionar,
    podeAdicionar,
    podeEditar,
    podeExcluir
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
    console.error('[Supabase] Erro ao carregar perfil:', perfilError);
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
    const error = new Error('Seu usuário não possui permissão para esta operação.');
    error.code = 'PERMISSION_DENIED';
    error.details = {
      action,
      role_name: perfil.role_name,
      account_status: perfil.account_status
    };
    throw error;
  }
}

async function exec(promise) {
  const { data, error } = await promise;
  if (error) {
    console.error('[Supabase] Erro na operação:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint
    });

    const redirected = await handleUnauthorized(error);
    if (redirected) {
      const authError = new Error('Sessão expirada. Faça login novamente.');
      authError.code = 'AUTH_REQUIRED';
      throw authError;
    }

    throw error;  // lança o objeto completo, não só a mensagem
  }
  return data;
}

function sanitizeResponsavelPayload(payload = {}) {
  const { project_id, ...safePayload } = payload;
  return safePayload;
}

async function testarConexao() {
  const {
    data: { session },
    error: sessionError
  } = await supabase.auth.getSession();

  if (sessionError) {
    console.error('[Supabase] Erro ao verificar sessão:', sessionError);

    return false;
  }

  if (!session) {
    console.warn('[Supabase] Teste não executado porque não existe sessão.');

    return false;
  }

  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .limit(1);

  if (error) {
    console.error('[Supabase] Falha no teste manual:', error);

    return false;
  }

  console.log('[Supabase] Teste manual concluído:', data);

  return true;
}

window.testarConexao = testarConexao;

window.db = {
  client: supabase,

  async fetchClients() {
    console.log('[db] fetchClients');
    const session = await obterSessaoObrigatoria();
    if (!session) return [];
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
        .order('name', { ascending: true })
    );
  },
  async fetchProjects() {
    console.log('[db] fetchProjects');
    const session = await obterSessaoObrigatoria();
    if (!session) return [];
    await assertPermission('select');

    return exec(
      supabase
        .from('projects')
        .select(`
          *,
          client:clients (
            id,
            name,
            legal_name,
            client_type
          ),
          responsavel:responsible_id (
            id,
            nome_completo,
            cpf,
            email,
            telefone
          )
        `)
        .order('id', { ascending: true })
    );
  },
  async fetchResponsaveis() {
    await assertPermission('select');
    console.log('[db] fetchResponsaveis');
    return exec(supabase.from('responsaveis').select('*').order('id', { ascending: true }));
  },
  async fetchContracts() {
    await assertPermission('select');
    console.log('[db] fetchContracts');
    return exec(supabase.from('contracts').select('*').order('id', { ascending: true }));
  },
  async fetchProposals() {
    console.log('[db] fetchProposals');
    const session = await obterSessaoObrigatoria();
    if (!session) return [];
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
        .order('created_at', { ascending: false })
    );
  },
  async fetchClientById(id) {
    await assertPermission('select');
    console.log('[db] fetchClientById', id);
    return exec(supabase.from('clients').select('*').eq('id', id).single());
  },
  async fetchProjectById(id) {
    await assertPermission('select');
    console.log('[db] fetchProjectById', id);
    return exec(
      supabase
        .from('projects')
        .select(`
          *,
          client:clients (
            id,
            name,
            legal_name,
            client_type
          ),
          responsavel:responsible_id (
            id,
            nome_completo,
            cpf,
            email,
            telefone
          )
        `)
        .eq('id', id)
        .single()
    );
  },
  async fetchProjectsByClient(clientId) {
    await assertPermission('select');
    console.log('[db] fetchProjectsByClient', clientId);
    return exec(
      supabase
        .from('projects')
        .select('id, name, client_id')
        .eq('client_id', clientId)
        .order('name', { ascending: true })
    );
  },
  async fetchProposalsByProject(projectId) {
    await assertPermission('select');
    console.log('[db] fetchProposalsByProject', projectId);
    return exec(
      supabase
        .from('proposals')
        .select(`
          id,
          proposal_number,
          budget_date,
          closing_date,
          value_usd,
          value_brl,
          proposal_status,
          project_status,
          contact_name,
          notes,
          created_at
        `)
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
    );
  },
  async fetchProposalById(id) {
    await assertPermission('select');
    console.log('[db] fetchProposalById', id);
    return exec(supabase.from('proposals').select('*').eq('id', id).single());
  },
  async insertClient(payload) {
    await assertPermission('insert');
    console.log('[db] insertClient — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('clients').insert([payload]).select().single());
    console.log('[db] insertClient — resultado:', result);
    return result;
  },
  async updateClient(id, payload) {
    await assertPermission('update');
    console.log('[db] updateClient id:', id, 'payload:', payload);
    return exec(supabase.from('clients').update(payload).eq('id', id).select().single());
  },
  async deleteClient(id) {
    await assertPermission('delete');
    console.log('[db] deleteClient id:', id);
    return exec(supabase.from('clients').delete().eq('id', id));
  },
  async insertProject(payload) {
    await assertPermission('insert');
    console.log('[db] insertProject — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('projects').insert([payload]).select().single());
    console.log('[db] insertProject — resultado:', result);
    return result;
  },
  async updateProject(id, payload) {
    await assertPermission('update');
    console.log('[db] updateProject id:', id, 'payload:', payload);
    return exec(supabase.from('projects').update(payload).eq('id', id).select().single());
  },
  async deleteProject(id) {
    await assertPermission('delete');
    console.log('[db] deleteProject id:', id);
    return exec(supabase.from('projects').delete().eq('id', id));
  },
  async insertResponsavel(payload) {
    await assertPermission('insert');
    const safePayload = sanitizeResponsavelPayload(payload);
    console.log('[db] insertResponsavel payload:', JSON.stringify(safePayload));
    return exec(supabase.from('responsaveis').insert([safePayload]).select().single());
  },
  async updateResponsavel(id, payload) {
    await assertPermission('update');
    const safePayload = sanitizeResponsavelPayload(payload);
    console.log('[db] updateResponsavel id:', id);
    return exec(supabase.from('responsaveis').update(safePayload).eq('id', id).select().single());
  },
  async insertContract(payload) {
    await assertPermission('insert');
    console.log('[db] insertContract payload:', JSON.stringify(payload));
    return exec(supabase.from('contracts').insert([payload]).select().single());
  },
  async updateContract(id, payload) {
    await assertPermission('update');
    console.log('[db] updateContract id:', id);
    return exec(supabase.from('contracts').update(payload).eq('id', id).select().single());
  },
  async insertProposal(payload) {
    await assertPermission('insert');
    console.log('[db] insertProposal — payload enviado:', JSON.stringify(payload));
    const result = await exec(supabase.from('proposals').insert([payload]).select().single());
    console.log('[db] insertProposal — resultado:', result);
    return result;
  },
  async updateProposal(id, payload) {
    await assertPermission('update');
    console.log('[db] updateProposal id:', id, 'payload:', payload);
    return exec(supabase.from('proposals').update(payload).eq('id', id).select().single());
  },
  async deleteProposal(id) {
    await assertPermission('delete');
    console.log('[db] deleteProposal id:', id);
    return exec(supabase.from('proposals').delete().eq('id', id));
  },
  async checkRls() {
    await assertPermission('select');
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

export { supabase, testarConexao };
export const db = window.db;
export const dbMessage = window.dbMessage;
