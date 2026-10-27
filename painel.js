/* Livo Keys — painel web das keys do Livo Edit e do Livo Clips.
   Login: Supabase Auth do projeto (cadastro público desligado). As ações passam pela função
   painel-keys, que confere a lista de administradores e guarda os Admin Tokens no servidor.
   A chave abaixo é a chave PÚBLICA do projeto (feita para ficar no navegador); não dá acesso a nada
   sem login de um administrador. */
'use strict';
const PROJETO = 'https://aofmxsiqxtzlsvfhiueb.supabase.co';
const CHAVE_PUBLICA = 'sb_publishable_D83dM2KGVJ0T1v35j44O8w_mv5n0bks';
const FUNCAO = PROJETO + '/functions/v1/painel-keys';
const PRODUTO = { edit: 'Livo Edit', clips: 'Livo Clips' };
const PLANO = { monthly: 'Mensal', annual: 'Anual' };
const SITUACAO = { active: 'ativa', expired: 'expirada', revoked: 'revogada' };

const sb = window.supabase.createClient(PROJETO, CHAVE_PUBLICA, { auth: { persistSession: true, autoRefreshToken: true, storageKey: 'livo-keys-painel' } });
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];

function el(tag, props = {}, filhos = []) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v);
  }
  for (const f of [].concat(filhos)) if (f) e.append(f);
  return e;
}
const data = iso => iso ? new Date(iso).toLocaleDateString('pt-BR') : '—';
const dataHora = iso => iso ? new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '';

let avisoTimer;
function aviso(texto, erro = false) {
  const a = $('#aviso');
  a.textContent = texto; a.className = 'aviso' + (erro ? ' erro-aviso' : ''); a.hidden = false;
  clearTimeout(avisoTimer); avisoTimer = setTimeout(() => { a.hidden = true; }, 4500);
}

async function api(acao, extra = {}) {
  const { data: s } = await sb.auth.getSession();
  if (!s.session) { mostrarLogin(); throw new Error('Faça login.'); }
  const r = await fetch(FUNCAO, { method: 'POST', headers: { Authorization: 'Bearer ' + s.session.access_token, 'Content-Type': 'application/json' }, body: JSON.stringify({ acao, ...extra }) });
  const d = await r.json().catch(() => ({ ok: false, error: 'Resposta inválida do servidor.' }));
  if (r.status === 401) { await sb.auth.signOut(); mostrarLogin('Sua sessão expirou. Entre de novo.'); }
  if (!d.ok) throw new Error(d.error || 'Não foi possível concluir.');
  return d;
}

// ---------------------------------------------------------------- login
function mostrarLogin(msg = '') {
  $('#app').hidden = true; $('#entrar').hidden = false; $('#loginErro').textContent = msg;
  setTimeout(() => $('#loginEmail').focus(), 30);
}

$('#formLogin').addEventListener('submit', async ev => {
  ev.preventDefault();
  const b = ev.submitter || $('#formLogin button'); b.disabled = true; $('#loginErro').textContent = '';
  const { error } = await sb.auth.signInWithPassword({ email: $('#loginEmail').value.trim(), password: $('#loginSenha').value });
  b.disabled = false;
  if (error) { $('#loginErro').textContent = /invalid/i.test(error.message) ? 'E-mail ou senha incorretos.' : error.message; return; }
  $('#loginSenha').value = '';
  entrar();
});

async function entrar() {
  try {
    const eu = await api('eu');
    $('#quem').textContent = eu.email;
    $('#entrar').hidden = true; $('#app').hidden = false;
    abrir('clientes');
    buscar();
  } catch (e) {
    await sb.auth.signOut();
    mostrarLogin(e.message);
  }
}

$('#btnSair').addEventListener('click', async () => { await sb.auth.signOut(); mostrarLogin(); });

$('#btnSenha').addEventListener('click', () => {
  const s1 = el('input', { type: 'password', autocomplete: 'new-password', id: 'novaSenha1' });
  const s2 = el('input', { type: 'password', autocomplete: 'new-password', id: 'novaSenha2' });
  const erro = el('div', { class: 'erro' });
  const salvar = el('button', { class: 'primario', text: 'Salvar senha', onclick: async () => {
    if (s1.value.length < 12) { erro.textContent = 'Use pelo menos 12 caracteres.'; return; }
    if (s1.value !== s2.value) { erro.textContent = 'As senhas não conferem.'; return; }
    salvar.disabled = true;
    const { error } = await sb.auth.updateUser({ password: s1.value });
    salvar.disabled = false;
    if (error) { erro.textContent = error.message; return; }
    fecharModal(); aviso('Senha alterada.');
  } });
  modal([el('h3', { text: 'Trocar senha' }), el('label', { for: 'novaSenha1', text: 'Nova senha (mín. 12 caracteres)' }), s1,
    el('label', { for: 'novaSenha2', text: 'Repita a nova senha' }), s2, erro,
    el('div', { class: 'modal-acoes' }, [el('button', { text: 'Cancelar', onclick: fecharModal }), salvar])]);
  s1.focus();
});

// ---------------------------------------------------------------- abas
function abrir(aba) {
  $$('.abas button').forEach(b => b.classList.toggle('ativa', b.dataset.aba === aba));
  $$('.aba').forEach(s => { s.hidden = s.id !== 'aba-' + aba; });
  if (aba === 'resumo') carregarResumo();
  if (aba === 'historico') carregarHistorico();
  if (aba === 'nova') $('#novaEmail').focus();
}
$$('.abas button').forEach(b => b.addEventListener('click', () => abrir(b.dataset.aba)));

// ---------------------------------------------------------------- clientes
$('#formBusca').addEventListener('submit', ev => { ev.preventDefault(); buscar(); });

async function buscar() {
  const caixa = $('#resultado');
  caixa.replaceChildren(el('div', { class: 'vazio', text: 'Buscando…' }));
  try {
    const d = await api('buscar', { produto: $('#buscaProduto').value, termo: $('#buscaTermo').value.trim() });
    if (!d.licencas.length) { caixa.replaceChildren(el('div', { class: 'vazio', text: 'Nenhuma licença encontrada.' })); return; }
    caixa.replaceChildren(...d.licencas.map(cartaoLicenca));
  } catch (e) { caixa.replaceChildren(el('div', { class: 'vazio', text: e.message })); }
}

function cartaoLicenca(l) {
  const s = l.effective_status || l.status;
  const disp = l.active_device ? `${l.active_device.device_name} · visto ${dataHora(l.active_device.last_seen_at)}` : 'nenhum computador ativado';
  const botoes = [el('button', { text: 'Ver key', onclick: () => verKey(l) })];
  if (s === 'active') {
    botoes.push(el('button', { text: 'Enviar e-mail', onclick: () => confirmar(l, 'enviar', `Enviar a MESMA key de ${PRODUTO[l.produto]} para ${l.customer_email}?`) }));
    if (l.active_device) botoes.push(el('button', { text: 'Liberar computador', onclick: () => confirmar(l, 'liberar', `Liberar o computador "${l.active_device.device_name}"? A mesma key poderá ser ativada em outro computador.`) }));
  }
  if (l.status !== 'revoked') botoes.push(el('button', { class: 'perigo', text: 'Revogar', onclick: () => revogar(l) }));
  return el('div', { class: 'item' }, [
    el('div', { class: 'linha1' }, [
      el('span', { class: 'email', text: l.customer_email }),
      el('span', { class: 'etiqueta produto', text: PRODUTO[l.produto] }),
      el('span', { class: 'etiqueta ' + s, text: SITUACAO[s] || s }),
    ]),
    el('div', { class: 'detalhes' }, [
      el('span', { text: `Plano: ${PLANO[l.plan] || l.plan}` }),
      el('span', { text: `Validade: ${data(l.expires_at)}` }),
      el('span', { text: disp }),
      el('span', { text: `Origem: ${l.origin === 'kiwify' ? 'Kiwify' : 'manual'}` }),
    ]),
    el('div', { class: 'acoes' }, botoes),
  ]);
}

function linhaKey(key) {
  const code = el('code', { text: key });
  return el('div', { class: 'key' }, [code, el('button', { text: 'Copiar', onclick: async () => { await navigator.clipboard.writeText(key); aviso('Key copiada.'); } })]);
}

async function verKey(l) {
  try {
    const d = await api('ver-key', { produto: l.produto, id: l.id, cliente: l.customer_email });
    modal([el('h3', { text: `Key de ${l.customer_email}` }), el('p', { class: 'sub', text: `${PRODUTO[l.produto]} · ${PLANO[l.plan] || l.plan} · válida até ${data(l.expires_at)}` }),
      d.disponivel ? linhaKey(d.license_key) : el('p', { text: d.mensagem || 'Key indisponível.' }),
      el('div', { class: 'modal-acoes' }, [el('button', { text: 'Fechar', onclick: fecharModal })])]);
  } catch (e) { aviso(e.message, true); }
}

function confirmar(l, acao, pergunta) {
  const ok = el('button', { class: 'primario', text: 'Confirmar', onclick: async () => {
    ok.disabled = true;
    try { const d = await api(acao, { produto: l.produto, id: l.id, cliente: l.customer_email }); fecharModal(); aviso(acao === 'enviar' ? 'E-mail enviado.' : (d.mensagem || 'Pronto.')); buscar(); }
    catch (e) { ok.disabled = false; aviso(e.message, true); }
  } });
  modal([el('h3', { text: 'Confirmar' }), el('p', { text: pergunta }), el('div', { class: 'modal-acoes' }, [el('button', { text: 'Cancelar', onclick: fecharModal }), ok])]);
}

function revogar(l) {
  const campo = el('input', { id: 'confRevogar', autocomplete: 'off' });
  const erro = el('div', { class: 'erro' });
  const ok = el('button', { class: 'primario', text: 'Revogar', onclick: async () => {
    if (campo.value.trim().toUpperCase() !== 'REVOGAR') { erro.textContent = 'Digite REVOGAR para confirmar.'; return; }
    ok.disabled = true;
    try { await api('revogar', { produto: l.produto, id: l.id, cliente: l.customer_email, confirmar: 'REVOGAR' }); fecharModal(); aviso('Licença revogada.'); buscar(); }
    catch (e) { ok.disabled = false; erro.textContent = e.message; }
  } });
  modal([el('h3', { text: 'Revogar licença' }),
    el('p', { text: `${PRODUTO[l.produto]} · ${l.customer_email}. O app bloqueia em até 15 minutos e não dá para desfazer (seria preciso criar outra key).` }),
    el('label', { for: 'confRevogar', text: 'Digite REVOGAR para confirmar' }), campo, erro,
    el('div', { class: 'modal-acoes' }, [el('button', { text: 'Cancelar', onclick: fecharModal }), ok])]);
  campo.focus();
}

// ---------------------------------------------------------------- nova key
$('#formNova').addEventListener('submit', async ev => {
  ev.preventDefault();
  const b = $('#formNova button[type=submit]'); b.disabled = true;
  $('#novaErro').textContent = ''; $('#novaResultado').replaceChildren();
  const produto = $('input[name=produto]:checked').value;
  try {
    const d = await api('criar', { produto, email: $('#novaEmail').value.trim(), plano: $('input[name=plano]:checked').value, enviar: $('#novaEnviar').checked });
    const envio = d.envio ? (d.envio.ok ? el('div', { class: 'ok-msg', text: `E-mail com a key enviado para ${d.licenca.customer_email}.` }) : el('div', { class: 'erro', text: `A key foi criada, mas o e-mail NÃO foi enviado: ${d.envio.error}` })) : el('div', { class: 'sub', text: 'Nenhum e-mail enviado.' });
    $('#novaResultado').replaceChildren(el('p', { class: 'ok-msg', text: `Key criada (${PRODUTO[produto]}, ${PLANO[d.licenca.plan]}, até ${data(d.licenca.expires_at)}):` }), linhaKey(d.license_key), envio);
    $('#novaEmail').value = '';
  } catch (e) { $('#novaErro').textContent = e.message; }
  b.disabled = false;
});

// ---------------------------------------------------------------- resumo e histórico
async function carregarResumo() {
  const caixa = $('#resumo');
  caixa.replaceChildren(el('div', { class: 'vazio', text: 'Carregando…' }));
  try {
    const d = await api('resumo');
    caixa.replaceChildren(...Object.entries(d.resumo).map(([id, c]) => el('div', { class: 'cartao' }, [
      el('h3', { text: PRODUTO[id] }),
      c.erro ? el('p', { class: 'erro', text: c.erro }) : el('div', { class: 'numeros' }, [
        ['Ativas', c.ativas], ['Em uso', c.em_uso], ['Vencem em 7 dias', c.vencem_7_dias],
        ['Mensal', c.mensal], ['Anual', c.anual], ['Revogadas', c.revogadas],
      ].map(([t, n]) => el('div', {}, [el('b', { text: String(n) }), el('span', { text: t })]))),
    ])));
  } catch (e) { caixa.replaceChildren(el('div', { class: 'vazio', text: e.message })); }
}

async function carregarHistorico() {
  const caixa = $('#historico');
  caixa.replaceChildren(el('div', { class: 'vazio', text: 'Carregando…' }));
  try {
    const d = await api('historico');
    if (!d.itens.length) { caixa.replaceChildren(el('div', { class: 'vazio', text: 'Nenhuma ação registrada ainda.' })); return; }
    const nomes = { criar: 'criou key', enviar: 'enviou e-mail', 'ver-key': 'viu a key', revogar: 'revogou', liberar: 'liberou computador' };
    caixa.replaceChildren(el('table', {}, [
      el('thead', {}, el('tr', {}, ['Quando', 'Quem', 'Produto', 'Ação', 'Cliente', 'Resultado'].map(t => el('th', { text: t })))),
      el('tbody', {}, d.itens.map(i => el('tr', {}, [
        el('td', { text: dataHora(i.quando) }), el('td', { text: i.email }), el('td', { text: PRODUTO[i.produto] || '—' }),
        el('td', { text: nomes[i.acao] || i.acao }), el('td', { text: i.cliente || '—' }),
        el('td', { class: i.ok ? '' : 'falhou', text: i.ok ? 'ok' : ('falhou: ' + (i.detalhe || '')) }),
      ]))),
    ]));
  } catch (e) { caixa.replaceChildren(el('div', { class: 'vazio', text: e.message })); }
}

// ---------------------------------------------------------------- modal
function modal(filhos) { $('#modalCorpo').replaceChildren(...filhos); $('#modal').hidden = false; }
function fecharModal() { $('#modal').hidden = true; $('#modalCorpo').replaceChildren(); }
$('#modal').addEventListener('click', ev => { if (ev.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', ev => { if (ev.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

// ---------------------------------------------------------------- início
sb.auth.getSession().then(({ data: s }) => { if (s.session) entrar(); else mostrarLogin(); });
