import './auth-guard.js';
import './user-menu.js';
import './ui.js';
import { db, loadCurrentUserPermissions } from './supabase.js';

await window.crmAuthReady;

const access = await loadCurrentUserPermissions().catch(() => null);
const permissions = access?.permissions || {
  podeEditar: false,
  podeAdicionar: false,
  podeExcluir: false,
  podeVisualizar: true
};

const escapeHtml = window.escapeHtml || ((v) => String(v ?? ''));

function getQueryParams() {
  return Object.fromEntries(new URLSearchParams(window.location.search));
}

function exibirValor(valor) {
  if (valor === null || valor === undefined || String(valor).trim() === '') {
    return 'Não informado';
  }
  return String(valor);
}

function somenteNumeros(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function formatarCPF(valor) {
  const numeros = somenteNumeros(valor).slice(0, 11);
  return numeros
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function formatarCNPJ(valor) {
  const numeros = somenteNumeros(valor).slice(0, 14);
  return numeros
    .replace(/^(\d{2})(\d)/, '$1.$2')
    .replace(/^(\d{2})\.(\d{3})(\d)/, '$1.$2.$3')
    .replace(/\.(\d{3})(\d)/, '.$1/$2')
    .replace(/(\d{4})(\d)/, '$1-$2');
}

function formatarData(dataIso) {
  if (!dataIso) return 'Não informado';
  const [y, m, d] = String(dataIso).split('T')[0].split('-');
  if (!y || !m || !d) return 'Não informado';
  return `${d}/${m}/${y}`;
}

function formatarMoeda(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 'Não informado';
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return 'Não informado';
  }
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(numero);
}

function formatarMoedaUSD(valor) {
  if (valor === null || valor === undefined || valor === '') {
    return 'Não informado';
  }
  const numero = Number(valor);
  if (!Number.isFinite(numero)) {
    return 'Não informado';
  }
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(numero);
}

function renderCampo(label, value) {
  return `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(exibirValor(value))}</p>`;
}

function renderSecaoVaziaAviso(campos) {
  const possuiAlgumValor = campos.some((campo) => {
    if (campo === null || campo === undefined) return false;
    return String(campo).trim() !== '';
  });
  if (possuiAlgumValor) return '';
  return '<p style="color:var(--text-soft); margin-top:0;"><em>Nenhuma informação foi preenchida nesta seção.</em></p>';
}

function sanitizeReturnTo(rawValue) {
  if (!rawValue) return null;
  const destino = decodeURIComponent(rawValue).trim();
  const paginasPermitidas = ['dashboard.html', 'funil.html', 'clientes.html', 'projetos.html', 'visualizar.html', 'proposta.html'];
  const arquivo = destino.split('?')[0].split('#')[0];
  const destinoInseguro = destino.includes('..') || destino.startsWith('/') || destino.startsWith('//') || /^[a-z][a-z0-9+.-]*:/i.test(destino);
  if (destinoInseguro || !paginasPermitidas.includes(arquivo)) {
    return null;
  }
  return destino;
}

function obterDestinoRetorno() {
  return sanitizeReturnTo(new URLSearchParams(window.location.search).get('returnTo'));
}

function obterDestinoOuPaginaAtual() {
  return obterDestinoRetorno() || `${window.location.pathname.split('/').pop() || 'visualizar.html'}${window.location.search}`;
}

function voltarParaOrigem() {
  const destino = obterDestinoRetorno();

  // O parâmetro returnTo representa a página que abriu o registro e tem prioridade.
  // Assim, uma proposta aberta por projetos.html volta para projetos.html, mesmo que
  // exista outro item no histórico do navegador.
  if (destino) {
    window.location.href = `./${destino}`;
    return;
  }

  const veioDoMesmoSite = (() => {
    try {
      return document.referrer && new URL(document.referrer).origin === window.location.origin;
    } catch {
      return false;
    }
  })();

  if (veioDoMesmoSite && window.history.length > 1) {
    window.history.back();
    return;
  }

  const params = new URLSearchParams(window.location.search);
  const type = params.get('type');
  window.location.href = type === 'proposal' ? './funil.html' : './projetos.html';
}

function criarUrlVisualizacao(type, id, returnTo) {
  return `./visualizar.html?type=${encodeURIComponent(type)}&id=${encodeURIComponent(id)}&returnTo=${encodeURIComponent(returnTo)}`;
}

async function renderRecord() {
  const params = getQueryParams();
  const content = document.getElementById('recordContent');
  const editClientLink = document.getElementById('editClientLink');

  if (!params.type || !params.id) {
    content.innerHTML = '<div class="empty-state">Registro nao especificado.</div>';
    return;
  }

  try {
    if (params.type === 'client') {
      const client = await db.fetchClientById(Number(params.id));
      const tipoCliente = client.client_type === 'PF' ? 'Pessoa Fisica' : client.client_type === 'PJ' ? 'Pessoa Juridica' : null;
      editClientLink.href = `./cliente-novo.html?id=${client.id}`;
      content.innerHTML = `
        <div class="card-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px;">
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Cliente</h3>
            ${renderCampo('ID', client.id)}
            ${renderCampo('Nome', client.name)}
            ${renderCampo('Razao Social', client.legal_name)}
            ${renderCampo('Tipo', tipoCliente)}
            ${renderCampo('CPF', client.cpf ? formatarCPF(client.cpf) : null)}
            ${renderCampo('CNPJ', client.cnpj ? formatarCNPJ(client.cnpj) : null)}
            ${renderCampo('Endereco', client.address)}
          </div>
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Auditoria</h3>
            ${renderCampo('Criado em', formatarData(client.created_at))}
            ${renderCampo('Atualizado em', formatarData(client.updated_at))}
          </div>
        </div>`;
      return;
    }

    if (params.type === 'project') {
      const [project, contract, followup, propostas] = await Promise.all([
        db.fetchProjectById(Number(params.id)),
        db.fetchContractByProject(Number(params.id)).catch(() => null),
        db.fetchProjectFollowupByProject(Number(params.id)).catch(() => null),
        db.fetchProposalsByProject(Number(params.id))
      ]);

      const cliente = project.cliente || null;
      const responsavel = project.responsavel || null;
      const retornoProjeto = `visualizar.html?type=project&id=${project.id}`;

      const blocoPropostas = `
        ${renderSecaoVaziaAviso((propostas || []).map((p) => p.proposal_number))}
        ${!propostas || propostas.length === 0
          ? '<div class="empty-state">Nenhuma proposta foi preenchida nesta seção.</div>'
          : `<div style="display:grid; gap:12px; margin-top:16px;">
            ${propostas.map((p) => `
              <div class="page-card" style="padding:14px; border:1px solid var(--border);">
                ${renderCampo('Proposta', p.proposal_number)}
                ${renderCampo('Status da proposta', p.proposal_status)}
                ${renderCampo('Valor BRL', formatarMoeda(p.value_brl))}
                <div style="display:flex; gap:8px; margin-top:10px; flex-wrap:wrap;">
                  <a class="btn-secondary" href="${criarUrlVisualizacao('proposal', p.id, retornoProjeto)}">Visualizar</a>
                  ${permissions.podeEditar ? `<a class="btn" href="./proposta.html?id=${encodeURIComponent(p.id)}&returnTo=${encodeURIComponent(retornoProjeto)}">Editar</a>` : ''}
                </div>
              </div>
            `).join('')}
          </div>`}
      `;

      editClientLink.href = `./projeto-novo.html?id=${project.id}`;
      content.innerHTML = `
        <div class="card-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px;">
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Projeto</h3>
            ${renderCampo('ID', project.id)}
            ${renderCampo('Nome', project.name)}
            ${renderCampo('Servicos', project.services)}
            ${renderCampo('Status', project.status)}
            ${renderCampo('Criado em', formatarData(project.created_at))}
            ${renderCampo('Atualizado em', formatarData(project.updated_at))}
          </div>
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Cliente</h3>
            ${renderSecaoVaziaAviso([cliente?.name, cliente?.legal_name, cliente?.client_type, cliente?.cpf, cliente?.cnpj, cliente?.address])}
            ${renderCampo('Nome', cliente?.name)}
            ${renderCampo('Razao social', cliente?.legal_name)}
            ${renderCampo('Tipo', cliente?.client_type)}
            ${renderCampo('CPF', cliente?.cpf ? formatarCPF(cliente.cpf) : null)}
            ${renderCampo('CNPJ', cliente?.cnpj ? formatarCNPJ(cliente.cnpj) : null)}
            ${renderCampo('Endereco', cliente?.address)}
          </div>
        </div>
        <div class="page-card" style="padding:18px; margin-top:20px;">
          <h3 style="margin-top:0;">Responsável</h3>
          ${renderSecaoVaziaAviso([responsavel?.nome_completo, responsavel?.cpf, responsavel?.rg_orgao_emissor, responsavel?.profissao, responsavel?.estado_civil, responsavel?.endereco_responsavel, responsavel?.email, responsavel?.telefone, responsavel?.email_copia])}
          ${renderCampo('Nome completo', responsavel?.nome_completo)}
          ${renderCampo('CPF', responsavel?.cpf)}
          ${renderCampo('RG orgao emissor', responsavel?.rg_orgao_emissor)}
          ${renderCampo('Profissao', responsavel?.profissao)}
          ${renderCampo('Estado civil', responsavel?.estado_civil)}
          ${renderCampo('Endereco', responsavel?.endereco_responsavel)}
          ${renderCampo('Email', responsavel?.email)}
          ${renderCampo('Telefone', responsavel?.telefone)}
          ${renderCampo('Email copia', responsavel?.email_copia)}
        </div>
        <div class="page-card" style="padding:18px; margin-top:20px;">
          <h3 style="margin-top:0;">Financeiro</h3>
          ${renderSecaoVaziaAviso([contract?.payment_method, contract?.installment_terms, contract?.installment_due_day, contract?.contract_total, contract?.installment_value])}
          ${renderCampo('Forma de pagamento', contract?.payment_method)}
          ${renderCampo('Forma de parcelamento', contract?.installment_terms)}
          ${renderCampo('Dia do vencimento', contract?.installment_due_day)}
          ${renderCampo('Valor total do contrato', formatarMoeda(contract?.contract_total))}
          ${renderCampo('Valor das parcelas', formatarMoeda(contract?.installment_value))}
        </div>
        <div class="page-card" style="padding:18px; margin-top:20px;">
          <h3 style="margin-top:0;">Contrato</h3>
          ${renderSecaoVaziaAviso([contract?.contract_delivery_method, contract?.billing_delivery_method])}
          ${renderCampo('Envio do contrato', contract?.contract_delivery_method)}
          ${renderCampo('Envio de cobrancas', contract?.billing_delivery_method)}
        </div>
        <div class="page-card" style="padding:18px; margin-top:20px;">
          <h3 style="margin-top:0;">Acompanhamento</h3>
          ${renderSecaoVaziaAviso([followup?.project_files_request, followup?.deliveries_approvals])}
          ${renderCampo('Solicitacao de arquivos', followup?.project_files_request)}
          ${renderCampo('Entregas e aprovacoes', followup?.deliveries_approvals)}
        </div>
        <div id="propostas-area" class="page-card" style="padding:18px; margin-top:20px;">
          <div style="display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap;">
            <h3 style="margin:0;">Propostas</h3>
            <a class="btn-primary" href="./proposta.html?projectId=${encodeURIComponent(project.id)}&returnTo=${encodeURIComponent(retornoProjeto)}">Nova Proposta</a>
          </div>
          ${blocoPropostas}
        </div>`;

      if (params.focus === 'propostas') {
        document.getElementById('propostas-area')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
      return;
    }

    if (params.type === 'proposal') {
      const proposal = await db.fetchProposalById(Number(params.id));
      const nomeCliente = proposal.cliente?.legal_name || proposal.cliente?.name || 'Não informado';
      const nomeProjeto = proposal.projeto?.name || 'Não informado';
      const urlEditar = `./proposta.html?id=${proposal.id}&returnTo=${encodeURIComponent(obterDestinoOuPaginaAtual())}`;
      editClientLink.href = urlEditar;
      editClientLink.style.display = permissions.podeEditar ? 'inline-flex' : 'none';
      content.innerHTML = `
        <div class="card-grid" style="grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px;">
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Proposta</h3>
            ${renderCampo('ID', proposal.id)}
            ${renderCampo('Numero', proposal.proposal_number)}
            ${renderCampo('Cliente', nomeCliente)}
            ${renderCampo('Cliente ID', proposal.client_id)}
            ${renderCampo('Projeto', nomeProjeto)}
            ${renderCampo('Projeto ID', proposal.project_id)}
            ${renderCampo('Data orcamento', formatarData(proposal.budget_date))}
            ${renderCampo('Data fechamento', formatarData(proposal.closing_date))}
            ${renderCampo('Mes fechamento', proposal.closing_month)}
          </div>
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Comercial</h3>
            ${renderCampo('Status proposta', proposal.proposal_status)}
            ${renderCampo('Status projeto', proposal.project_status)}
            ${renderCampo('Contato', proposal.contact_name)}
            ${renderCampo('Ponto de contato', proposal.point_of_contact)}
            ${renderCampo('Observacoes', proposal.observations || proposal.notes)}
          </div>
          <div class="page-card" style="padding:18px;">
            <h3 style="margin-top:0;">Financeiro</h3>
            ${renderSecaoVaziaAviso([proposal.value_brl, proposal.value_usd, proposal.payment_method, proposal.installment_terms, proposal.payment_due_date, proposal.installment_due_day, proposal.installment_value, proposal.contract_delivery_method, proposal.billing_delivery_method])}
            ${renderCampo('Valor total em reais', formatarMoeda(proposal.value_brl))}
            ${renderCampo('Valor total em dólar', formatarMoedaUSD(proposal.value_usd))}
            ${renderCampo('Forma de pagamento', proposal.payment_method)}
            ${renderCampo('Forma de parcelamento', proposal.installment_terms)}
            ${renderCampo('Data do vencimento', formatarData(proposal.payment_due_date))}
            ${renderCampo('Dia padrão das parcelas', proposal.installment_due_day)}
            ${renderCampo('Valor das parcelas', formatarMoeda(proposal.installment_value))}
            ${renderCampo('Envio do contrato', proposal.contract_delivery_method)}
            ${renderCampo('Envio das cobranças', proposal.billing_delivery_method)}
          </div>
        </div>`;
      return;
    }

    content.innerHTML = '<div class="empty-state">Tipo de registro invalido.</div>';
  } catch (error) {
    console.error('[visualizar]', error);
    showToast('Nao foi possivel carregar o registro.', 'error');
    content.innerHTML = '<div class="empty-state">Erro ao carregar registro.</div>';
  }
}

document.getElementById('btnVoltar')?.addEventListener('click', voltarParaOrigem);
renderRecord();