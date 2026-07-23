
    console.error('[Proposta] Falha ao salvar', {
      code: error?.code,
      message: error?.message,
      details: error?.details,
      hint: error?.hint
    });

    let mensagem = 'Não foi possível salvar a proposta.';

    if (error?.code === '42501' || error?.code === 'PERMISSION_DENIED') {
      mensagem = 'Sua conta não possui permissão para salvar propostas.';
    } else if (error?.code === '23502') {
      mensagem = 'Existe um campo obrigatório sem preenchimento.';
    } else if (error?.code === '23503') {
      mensagem = 'O cliente ou projeto selecionado não existe.';
    } else if (error?.code === '23505') {
      mensagem = 'Já existe uma proposta com essa identificação.';
    } else if (error?.message?.includes('invalid input syntax')) {
      mensagem = 'Existe uma data, número ou valor em formato inválido.';
    } else if (error?.message) {
      mensagem = `Não foi possível salvar: ${error.message}`;
    }

    showToast(mensagem, 'error');
  } finally {
    salvamentoEmAndamento = false;
    botao.disabled = false;
    botao.textContent = proposalId ? 'Salvar Alterações' : 'Salvar Proposta';
  }
}

fldProposalValueUSD.addEventListener('input', calcularValorReaisAPartirDoDolar);

fldProposalClosingDate.addEventListener('change', () => {
  if (fldProposalClosingDate.value) {
    fldProposalClosingMonth.value = formatMonthToInput(fldProposalClosingDate.value);
  } else {
    fldProposalClosingMonth.value = '';
  }
});

document.getElementById('btnSaveProposal').addEventListener('click', salvarProposta);
document.getElementById('btnCancelProposal').addEventListener('click', voltarParaOrigem);
document.getElementById('btnBackProposal').addEventListener('click', voltarParaOrigem);

await Promise.all([carregarClientes(), carregarCotacaoAtual()]);
configurarCampoProjetoDesabilitado();

if (!proposalId) {
  fldProposalNumber.value = `PRP-${Math.floor(Math.random() * 9000) + 1000}`;
  fldProposalBudgetDate.value = new Date().toISOString().slice(0, 10);
  fldProposalStatus.value = statusPropostaOptions[0];
  fldProposalProjectStatus.value = statusProjetoOptions[0];
}

await carregarPropostaParaEdicao();
await carregarPropostaAPartirDoProjeto();

if (!proposalId && !projectIdFromUrl) {
  const returnToAtual = obterDestinoOuPaginaAtual();
  if (!returnToAtual.includes('proposta.html')) {
    document.getElementById('proposalPageSubtext').textContent = 'Cadastre os dados comerciais e financeiros da proposta';
  }
}