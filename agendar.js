/* Entre — página pública de agendamento (agendar.html?n=<endereço>). A cliente escolhe serviço, dia e horário
   e manda o pedido. Fala só com a função "agendar" do Supabase (nada de login). Tudo que vem do banco passa por esc(). */
(() => {
  'use strict';
  const CFG = window.ENTRE_CONFIG;
  const API = window.ENTRE_AGENDAR_API || (CFG ? CFG.url + '/functions/v1/agendar' : '');
  const SLUG = (new URLSearchParams(location.search).get('n') || location.hash.slice(1) || '').trim().toLowerCase();
  const TOKEN = (new URLSearchParams(location.search).get('b') || '').trim(); // link secreto de um horário (ver/cancelar)
  const root = document.getElementById('ag');

  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const WD = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];
  const WDS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const MS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const brl = (c) => (c == null ? 'valor sob consulta' : 'R$ ' + (c / 100).toFixed(2).replace('.', ','));
  const dur = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`);
  const weekdayOf = (d) => { const [y, m, dd] = d.split('-').map(Number); return new Date(Date.UTC(y, m - 1, dd)).getUTCDay(); };
  const dayLong = (d) => `${WD[weekdayOf(d)]}, ${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const LOGO = '<svg class="entre-logo" viewBox="26 16 68 70" aria-hidden="true"><path class="b" d="M30 70 V34 A14 14 0 0 1 44 20 H76 A14 14 0 0 1 90 34 V56 A14 14 0 0 1 76 70 H48 L34 82 Z"/><circle class="d" cx="47" cy="45" r="5"/><circle class="d" cx="60" cy="45" r="5"/><circle class="d" cx="73" cy="45" r="5"/></svg>';
  const initials = (n) => String(n || '?').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const local = {
    get(k) { try { return localStorage.getItem('entre.agendar.' + k) || ''; } catch { return ''; } },
    set(k, v) { try { localStorage.setItem('entre.agendar.' + k, v); } catch { /* sem armazenamento */ } },
  };

  // Visual novo do Entre (26/11): um visual só, o mesmo do app (html.v2 no style.css). Topo verde com a logo do negócio.
  document.documentElement.classList.add('v2');
  const syncThemeColor = () => $('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.documentElement).getPropertyValue('--hero').trim() || '#1F7A57');
  syncThemeColor();
  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener?.('change', (e) => {
    document.documentElement.dataset.mode = e.matches ? 'dark' : 'light';
    syncThemeColor();
  });
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.className = 'toast'; }, 5000);
  }

  async function api(params, body) {
    const url = API + '?' + new URLSearchParams(params);
    let r;
    try {
      r = body
        ? await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
        : await fetch(url);
    } catch { throw Object.assign(new Error('Sem internet. Confira a conexão e tente de novo.'), { status: 0 }); }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw Object.assign(new Error(j.erro || 'Não deu certo. Tente de novo.'), { status: r.status });
    return j;
  }

  // ------------------------------------------------------------------ estado
  // Uma tela por vez (26/11, pedido do Eduardo): home (o negócio) › servico › prof (se tiver mais de um) › quando › dados.
  const S = {
    info: null, step: 'home', dir: 1, svc: null, prof: null, dias: null, data: null, horarios: null, hora: null,
    nome: local.get('nome'), tel: local.get('tel'), obs: '', done: null, esperaDone: false, mine: null,
  };
  const svc = () => S.info.servicos.find((s) => s.id === S.svc);
  const profName = (id) => S.info.profissionais.find((p) => p.id === id)?.nome || '';
  const KIND = { salao: 'Salão de beleza', manicure: 'Unhas', barbearia: 'Barbearia', estetica: 'Estética', clinica: 'Clínica', dentista: 'Dentista', pet: 'Pet shop', academia: 'Academia e pilates', spa: 'Spa e massagem', tatuagem: 'Estúdio de tatuagem', terapia: 'Psicologia e terapia' };
  const COLORS = ['copper', 'mint', 'navy', 'green', 'sun'];
  const priceShort = (c) => (c == null ? 'a combinar' : 'R$ ' + (c % 100 ? (c / 100).toFixed(2).replace('.', ',') : String(c / 100)));
  // O passo 'Com quem?' só existe se o serviço tem mais de uma pessoa (antes de escolher: se algum serviço tem)
  const steps = () => { const s = S.svc && svc(); const two = s ? s.profissionais.length > 1 : S.info.servicos.some((x) => x.profissionais.length > 1); return ['servico', ...(two ? ['prof'] : []), 'quando', 'dados']; };

  // Som e vibração leves (o navegador só deixa tocar depois do primeiro toque; o iPhone não vibra pelo navegador)
  let actx = null;
  function beep(notes) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      const t0 = actx.currentTime;
      notes.forEach(([f, at, len, vol = 0.05]) => {
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0, t0 + at); g.gain.linearRampToValueAtTime(vol, t0 + at + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + len);
        o.connect(g).connect(actx.destination); o.start(t0 + at); o.stop(t0 + at + len + 0.05);
      });
    } catch { /* sem som */ }
  }
  const tick = () => beep([[1320, 0, 0.05, 0.022]]);
  const chime = () => beep([[880, 0, 0.5], [1175, 0.12, 0.5], [1568, 0.24, 0.8]]);
  const buzz = (p) => { try { if (navigator.userActivation?.hasBeenActive !== false) navigator.vibrate?.(p); } catch { /* sem vibração */ } };

  function fatal(msg) {
    root.innerHTML = `<div class="card narrow center ag-msg"><span class="logo-badge">${LOGO}</span><p>${esc(msg)}</p>
      <button type="button" class="btn primary block" id="retry">Tentar de novo</button></div>`;
    $('#retry').onclick = () => location.reload();
  }

  async function boot() {
    if (!API) return fatal('Não consegui carregar a página. Tente de novo.');
    if (!SLUG) return fatal('Este link está incompleto. Peça o link certo para o estabelecimento.');
    try { S.info = await api({ n: SLUG }); } catch (e) {
      return e.status === 404 ? fatal('Este link de agendamento não existe ou foi desligado pelo estabelecimento.') : fatal(e.message);
    }
    document.title = `Agendar · ${S.info.negocio.nome}`;
    if (TOKEN) {
      try { S.mine = (await api({ n: SLUG, b: TOKEN })).agendamento; } catch (e) { toast(e.message, 'bad'); }
      if (S.mine) return renderMine();
    }
    render();
  }

  // ------------------------------------------------------------------ escolhas
  function go(step, dir = 1) { S.step = step; S.dir = dir; render(); window.scrollTo(0, 0); }
  function back() {
    const list = steps(), i = list.indexOf(S.step);
    if (S.step === 'espera') return go('quando', -1);
    go(i > 0 ? list[i - 1] : 'home', -1);
  }
  function pickService(id) {
    S.svc = id; S.prof = null; S.dias = null; S.data = null; S.horarios = null; S.hora = null;
    go(svc().profissionais.length > 1 ? 'prof' : 'quando');
    loadDays();
  }
  function pickProf(id) {
    S.prof = id || null; S.dias = null; S.data = null; S.horarios = null; S.hora = null;
    go('quando');
    loadDays();
  }
  async function loadDays() {
    const key = S.svc + '|' + S.prof;
    try {
      const r = await api({ n: SLUG, servico: S.svc, ...(S.prof ? { prof: S.prof } : {}) });
      if (key !== S.svc + '|' + S.prof) return;
      S.dias = r.dias;
      const first = r.dias.find((d) => d.livres > 0);
      if (first) return pickDay(first.data);
    } catch (e) { toast(e.message, 'bad'); }
    if (S.step === 'quando') render(true);
  }
  async function pickDay(d) {
    S.data = d; S.horarios = null; S.hora = null;
    if (S.step === 'quando') render(true);
    try {
      const r = await api({ n: SLUG, servico: S.svc, data: d, ...(S.prof ? { prof: S.prof } : {}) });
      if (S.data === d) S.horarios = r.horarios;
    } catch (e) { toast(e.message, 'bad'); }
    if (S.step === 'quando' && S.data === d) render(true);
  }
  const submitBtn = (form) => $(`button[form="${form.id}"]`) || $('button[type=submit]', form);

  async function send(form) {
    const f = new FormData(form);
    S.nome = String(f.get('nome') || '').trim(); S.tel = String(f.get('tel') || '').trim(); S.obs = String(f.get('obs') || '').trim();
    if (S.nome.length < 2) return toast('Escreva seu nome.', 'bad');
    if (S.tel.replace(/\D/g, '').length < 10) return toast('Escreva seu WhatsApp com DDD.', 'bad');
    const btn = submitBtn(form);
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await api(null, {
        n: SLUG, servico: S.svc, prof: S.prof, data: S.data, hora: S.hora,
        nome: S.nome, telefone: S.tel, obs: S.obs, empresa_url: String(f.get('empresa_url') || ''),
      });
      local.set('nome', S.nome); local.set('tel', S.tel);
      S.done = { status: r.status, servico: svc().nome, com: r.resumo?.com || (S.prof ? profName(S.prof) : ''), data: S.data, hora: S.hora, nome: S.nome, token: r.token || '', inicio: r.inicio || '', fim: r.fim || '' };
      chime(); buzz([18, 60, 18]);
      render(); window.scrollTo(0, 0);
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false; btn.textContent = S.info.negocio.confirma_sozinho ? 'Marcar horário' : 'Pedir horário';
      if (e.status === 409 && S.data) { go('quando', -1); pickDay(S.data); } // horário ocupado: mostra os livres de novo
    }
  }

  async function sendWait(form) {
    const f = new FormData(form);
    S.nome = String(f.get('nome') || '').trim(); S.tel = String(f.get('tel') || '').trim();
    if (S.nome.length < 2) return toast('Escreva seu nome.', 'bad');
    if (S.tel.replace(/\D/g, '').length < 10) return toast('Escreva seu WhatsApp com DDD.', 'bad');
    const btn = submitBtn(form);
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      await api(null, {
        acao: 'espera', n: SLUG, servico: S.svc, prof: S.prof, data: f.get('qualquer') ? null : S.data, periodo: String(f.get('periodo') || 'any'),
        nome: S.nome, telefone: S.tel, empresa_url: String(f.get('empresa_url') || ''),
      });
      local.set('nome', S.nome); local.set('tel', S.tel);
      S.esperaDone = true; chime(); buzz([18, 60, 18]);
      render(); window.scrollTo(0, 0);
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false; btn.textContent = 'Entrar na lista de espera';
    }
  }

  // ------------------------------------------------------------------ desenhos
  const PIN = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/></svg>';
  const CHAT = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M5 6h14v10h-9l-5 4z"/></svg>';
  const SHARE = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M12 15V4M8 8l4-4 4 4M6 12v7h12v-7"/></svg>';
  const BACK = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>';
  const STAR = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2.5l2.6 6.9 6.9 2.6-6.9 2.6L12 21.5l-2.6-6.9L2.5 12l6.9-2.6z" fill="currentColor"/></svg>';
  const CHECK = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>';
  const COVER_ART = '<svg viewBox="0 0 390 200" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><circle cx="330" cy="36" r="92" fill="#26915F"/><circle cx="30" cy="196" r="74" fill="#26915F"/><circle cx="292" cy="168" r="30" fill="#F2994A"/><rect x="34" y="58" width="46" height="46" rx="15" fill="#2B3D6B" transform="rotate(-14 57 81)"/><circle cx="118" cy="34" r="12" fill="#FFD66B"/><circle cx="214" cy="128" r="7" fill="#D9EEE2" opacity=".8"/><circle cx="352" cy="128" r="6" fill="#fff" opacity=".7"/><path d="M246 44l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" fill="#FFD66B"/><path d="M150 150l3 7 7 3-7 3-3 7-3-7-7-3 7-3z" fill="#fff" opacity=".85"/></svg>';
  const logoOf = (n) => (n.logo ? `<img alt="" src="${esc(n.logo)}">` : esc(initials(n.nome)));
  const loading = (t) => `<div class="ag2-wait"><span class="ag2-dots"><i></i><i></i><i></i></span>${esc(t)}</div>`;
  const confetti = () => `<div class="ag2-burst" aria-hidden="true">${Array.from({ length: 18 }, (_, i) => `<i class="c-${COLORS[i % COLORS.length]}" style="--x:${(i * 37) % 100}%;--d:${(i % 6) * 0.08}s;--r:${(i * 47) % 360}deg"></i>`).join('')}</div>`;

  // ------------------------------------------------------------------ telas
  function viewHome() {
    const n = S.info.negocio, I = S.info;
    const precos = I.servicos.map((x) => x.preco).filter((p) => p != null);
    const min = precos.length ? Math.min(...precos) : null;
    return `<div class="ag2 ag2-home">
      <div class="ag2-cover${n.capa ? ' photo' : ''}">${n.capa ? '' : COVER_ART}</div>
      <section class="ag2-id">
        <span class="ag2-logo">${logoOf(n)}</span>
        ${KIND[n.tipo] ? `<span class="ag2-kind">${esc(KIND[n.tipo])}</span>` : ''}
        <h1>${esc(n.nome)}</h1>
        ${n.endereco ? `<p class="ag2-addr">${esc(n.endereco)}</p>` : ''}
        <div class="ag2-acts">
          ${n.endereco ? `<a class="ag2-act c-copper" target="_blank" rel="noopener" href="https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(n.endereco + ' ' + n.nome)}"><span>${PIN}</span>Como chegar</a>` : ''}
          ${n.whatsapp ? `<a class="ag2-act c-green" target="_blank" rel="noopener" href="https://wa.me/${esc(n.whatsapp)}"><span>${CHAT}</span>WhatsApp</a>` : ''}
          ${navigator.share ? `<button type="button" class="ag2-act c-navy" id="share"><span>${SHARE}</span>Enviar</button>` : ''}
        </div>
      </section>
      ${I.servicos.length ? `<div class="ag2-facts">
        <div class="ag2-fact c-mint"><b>${I.servicos.length}</b><small>${I.servicos.length > 1 ? 'serviços' : 'serviço'}</small></div>
        ${min != null ? `<div class="ag2-fact c-sun"><small>a partir de</small><b>${esc(priceShort(min))}</b></div>` : ''}
        <div class="ag2-fact c-navy"><b>${n.confirma_sozinho ? 'Na hora' : 'WhatsApp'}</b><small>${n.confirma_sozinho ? 'o horário já fica marcado' : 'confirma por lá'}</small></div>
      </div>` : ''}
      ${(n.galeria || []).length ? `<section class="ag2-gal" aria-label="Nossos trabalhos"><h2>Nossos trabalhos</h2>
        <div class="ag2-gal-row">${n.galeria.map((u, i) => `<button type="button" class="ag2-ph" data-ph="${i}" aria-label="Ver foto ${i + 1}"><img alt="" loading="lazy" src="${esc(u)}"></button>`).join('')}</div></section>` : ''}
      ${I.servicos.length ? '<div class="ag2-dock"><button type="button" class="ag2-go" id="start">Marcar horário</button></div>'
        : '<div class="card empty ag2-none">Ainda não há serviços disponíveis para marcar por aqui. Fale com o estabelecimento pelo WhatsApp.</div>'}
    </div>`;
  }

  function flow(body, foot = '') {
    const list = steps(), i = list.indexOf(S.step), n = S.info.negocio;
    const pct = i < 0 ? 100 : Math.round(((i + 1) / list.length) * 100);
    return `<div class="ag2 ag2-flow">
      <header class="ag2-bar">
        <button type="button" class="ag2-back" id="back" aria-label="Voltar">${BACK}</button>
        <div class="ag2-prog" aria-hidden="true"><i style="width:${pct}%"></i></div>
        <span class="ag2-mini" title="${esc(n.nome)}">${logoOf(n)}</span>
      </header>
      <div class="ag2-screen">${i >= 0 ? `<p class="ag2-step">Passo ${i + 1} de ${list.length}</p>` : ''}${body}</div>
      ${foot ? `<div class="ag2-dock">${foot}</div>` : ''}
    </div>`;
  }

  function viewServico() {
    return flow(`<h2>O que você vai fazer?</h2><div class="ag2-svcs">
      ${S.info.servicos.map((x, i) => `<button type="button" class="ag2-svc c-${COLORS[i % COLORS.length]}${S.svc === x.id ? ' sel' : ''}" data-svc="${esc(x.id)}" aria-pressed="${S.svc === x.id}">
        <span class="ag2-ic">${esc(initials(x.nome).slice(0, 1))}</span>
        <span class="grow"><b>${esc(x.nome)}</b><small>${esc(dur(x.duracao))}${x.obs ? ' · ' + esc(x.obs) : ''}</small></span>
        <span class="ag2-price">${esc(priceShort(x.preco))}</span></button>`).join('')}</div>`);
  }

  function viewProf() {
    const s = svc();
    return flow(`<h2>Com quem?</h2><div class="ag2-pros">
      <button type="button" class="ag2-pro c-sun${!S.prof ? ' sel' : ''}" data-prof=""><span class="ag2-av">${STAR}</span><b>Tanto faz</b><small>quem tiver horário</small></button>
      ${s.profissionais.map((id, i) => `<button type="button" class="ag2-pro c-${COLORS[i % 4]}${S.prof === id ? ' sel' : ''}" data-prof="${esc(id)}"><span class="ag2-av">${esc(initials(profName(id)))}</span><b>${esc(profName(id))}</b></button>`).join('')}
    </div>`);
  }

  function viewQuando() {
    const dias = S.dias, hs = S.horarios;
    let body = '<h2>Quando fica bom?</h2>';
    if (!dias) body += loading('Procurando dias com vaga…');
    else if (!dias.some((d) => d.livres)) {
      body += `<div class="ag2-empty"><span class="ag2-av c-sun">${STAR}</span><p>Não há horários livres nos próximos dias. Entre na lista de espera: quando vagar, chamam você no WhatsApp.</p>
        <button type="button" class="ag2-go" data-wait="1">Entrar na lista de espera</button></div>`;
    } else {
      body += `<div class="ag-days ag2-days">${dias.map((d) => `<button type="button" class="ag-day ${S.data === d.data ? 'sel' : ''}" data-day="${d.data}" ${d.livres ? '' : 'disabled'}>
          <small>${WDS[weekdayOf(d.data)]}</small><b>${Number(d.data.slice(8, 10))}</b><small>${MS[Number(d.data.slice(5, 7)) - 1]}</small></button>`).join('')}</div>`;
      if (S.data) {
        if (!hs) body += loading('Carregando horários…');
        else if (!hs.length) body += '<p class="ag2-note">Esse dia lotou. Escolha outro dia.</p>';
        else {
          const parts = [['Manhã', (h) => h < '12:00', 'sun'], ['Tarde', (h) => h >= '12:00' && h < '18:00', 'copper'], ['Noite', (h) => h >= '18:00', 'navy']];
          body += parts.map(([t, f, c]) => {
            const l = hs.filter((x) => f(x.hora));
            return l.length ? `<div class="ag2-period"><h3><i class="c-${c}"></i>${t}</h3><div class="ag-times">${l.map((h) => `<button type="button" class="ag-time ${S.hora === h.hora ? 'sel' : ''}" data-hora="${esc(h.hora)}">${esc(h.hora)}</button>`).join('')}</div></div>` : '';
          }).join('');
        }
      }
      body += '<button type="button" class="ag-waitlink" data-wait="1">Não achou um horário bom? Entre na lista de espera</button>';
    }
    return flow(body);
  }

  const ticket = (servico, com, data, hora, preco) => `<div class="ag2-ticket"><span class="ag2-tag">Seu horário</span><b>${esc(servico)}</b>
    <span class="ag2-when">${esc(dayLong(data))} às ${esc(hora)}</span>${com || preco !== undefined ? `<small>${com ? 'com ' + esc(com) : ''}${com && preco !== undefined ? ' · ' : ''}${preco !== undefined ? esc(brl(preco)) : ''}</small>` : ''}</div>`;

  function viewDados() {
    const s = svc(), auto = S.info.negocio.confirma_sozinho;
    return flow(`<h2>Quase lá!</h2>${ticket(s.nome, S.prof ? profName(S.prof) : '', S.data, S.hora, s.preco)}
      <form id="agForm" class="ag2-form" novalidate>
        <label>Seu nome<input name="nome" autocomplete="name" maxlength="80" required value="${esc(S.nome)}"></label>
        <label>Seu WhatsApp (com DDD)<input name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" required placeholder="(11) 91234-5678" value="${esc(S.tel)}"></label>
        <label>Alguma observação? <span class="muted small">(opcional)</span><input name="obs" maxlength="200" value="${esc(S.obs)}"></label>
        <label class="ag-hp" aria-hidden="true">Não preencha<input name="empresa_url" tabindex="-1" autocomplete="off"></label>
      </form>`,
    `<button type="submit" form="agForm" class="ag2-go">${auto ? 'Marcar horário' : 'Pedir horário'}</button>
      <p class="ag2-fine">${auto ? 'O horário fica marcado na hora.' : 'A confirmação chega pelo seu WhatsApp.'}</p>`);
  }

  function viewEspera() {
    const n = S.info.negocio;
    return flow(`<h2>Lista de espera</h2><p class="ag2-lead">Se vagar um horário${S.data ? ` em ${esc(dayLong(S.data))}` : ''}, ${esc(n.nome)} chama você pelo WhatsApp.</p>
      <form id="waitForm" class="ag2-form" novalidate>
        <p class="ag2-label">Qual período?</p>
        <div class="ag-chips" role="radiogroup" aria-label="Período">${[['any', 'Qualquer hora'], ['manha', 'Manhã'], ['tarde', 'Tarde'], ['noite', 'Noite']].map(([k, t], i) => `<label class="ag-chip-r"><input type="radio" name="periodo" value="${k}" ${i ? '' : 'checked'}><span>${t}</span></label>`).join('')}</div>
        ${S.data ? '<label class="switch"><input type="checkbox" name="qualquer"><span>Pode ser outro dia também</span></label>' : ''}
        <label>Seu nome<input name="nome" autocomplete="name" maxlength="80" required value="${esc(S.nome)}"></label>
        <label>Seu WhatsApp (com DDD)<input name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" required placeholder="(11) 91234-5678" value="${esc(S.tel)}"></label>
        <label class="ag-hp" aria-hidden="true">Não preencha<input name="empresa_url" tabindex="-1" autocomplete="off"></label>
      </form>`,
    '<button type="submit" form="waitForm" class="ag2-go">Entrar na lista de espera</button>');
  }

  // Tela de fim (pedido enviado, lista de espera, meu horário): logo do negócio em cima, confete, resumo
  const endPage = (inner, party = true) => {
    const n = S.info.negocio;
    return `<div class="ag2 ag2-end">${party ? confetti() : ''}
      <div class="ag2-endtop"><span class="ag2-mini">${logoOf(n)}</span><b>${esc(n.nome)}</b></div>${inner}</div>`;
  };

  function show(html, quiet = false) {
    root.innerHTML = html;
    const n = S.info.negocio, c = $('.ag2-cover.photo');
    if (c) c.style.backgroundImage = `linear-gradient(rgba(18,36,31,.05), rgba(18,36,31,.35)), url(${JSON.stringify(String(n.capa))})`;
    const sc = $('.ag2-screen') || $('.ag2-home') || $('.ag2-end');
    if (sc && !quiet) sc.classList.add(S.dir < 0 ? 'in-back' : 'in');
    syncThemeColor();
  }

  function render(quiet = false) {
    if (S.done) return renderDone();
    if (S.esperaDone) {
      show(endPage(`<span class="ag2-ok">${CHECK}</span><h2>Você está na lista!</h2>
        <p class="ag2-lead">Quando vagar um horário, ${esc(S.info.negocio.nome)} chama você pelo WhatsApp.</p>
        <button type="button" class="ag2-go ghost" id="again">Voltar ao começo</button>`));
      $('#again').onclick = () => { Object.assign(S, { esperaDone: false, step: 'home', svc: null, prof: null, dias: null, data: null, horarios: null, hora: null }); S.dir = -1; render(); window.scrollTo(0, 0); };
      return;
    }
    const v = { home: viewHome, servico: viewServico, prof: viewProf, quando: viewQuando, dados: viewDados, espera: viewEspera }[S.step] || viewHome;
    show(v(), quiet);
    $('.ag-day.sel')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    const form = $('#agForm');
    if (form) {
      form.onsubmit = (e) => { e.preventDefault(); send(form); };
      form.oninput = () => { const f = new FormData(form); S.nome = String(f.get('nome')); S.tel = String(f.get('tel')); S.obs = String(f.get('obs')); };
    }
    const wf = $('#waitForm');
    if (wf) wf.onsubmit = (e) => { e.preventDefault(); sendWait(wf); };
  }

  // Um ouvinte só para os toques da página
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b.disabled || !S.info) return;
    tick(); buzz(6);
    const d = b.dataset;
    if (b.id === 'start') return go('servico');
    if (b.id === 'back') return back();
    if (b.id === 'share') return navigator.share?.({ title: S.info.negocio.nome, url: location.href }).catch(() => {});
    if (d.svc) return pickService(d.svc);
    if ('prof' in d) return pickProf(d.prof);
    if (d.day) return pickDay(d.day);
    if (d.hora) { S.hora = d.hora; return go('dados'); }
    if (d.wait) { S.hora = null; return go('espera'); }
    if (d.ph) {
      const v = document.createElement('div');
      v.className = 'ag-view';
      v.innerHTML = `<img alt="" src="${esc(S.info.negocio.galeria[Number(d.ph)])}"><button type="button" class="icon-btn" aria-label="Fechar">✕</button>`;
      v.onclick = () => v.remove();
      document.body.appendChild(v);
    }
  });

  // ---- "Adicionar à minha agenda" (arquivo .ics para iPhone/Android e link do Google Agenda)
  const icsDate = (iso) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  function calendarLinks(title, inicio, fim, place) {
    if (!inicio || !fim) return '';
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Entre//Agendamento//PT', 'BEGIN:VEVENT',
      `UID:${icsDate(inicio)}-${Math.random().toString(36).slice(2)}@entre`, `DTSTAMP:${icsDate(new Date().toISOString())}`,
      `DTSTART:${icsDate(inicio)}`, `DTEND:${icsDate(fim)}`, `SUMMARY:${title.replace(/[,;\\]/g, ' ')}`,
      place ? `LOCATION:${place.replace(/[,;\\]/g, ' ')}` : '', 'BEGIN:VALARM', 'TRIGGER:-PT2H', 'ACTION:DISPLAY', 'DESCRIPTION:Lembrete', 'END:VALARM',
      'END:VEVENT', 'END:VCALENDAR'].filter(Boolean).join('\r\n');
    const href = 'data:text/calendar;charset=utf-8,' + encodeURIComponent(ics);
    const g = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${icsDate(inicio)}/${icsDate(fim)}${place ? '&location=' + encodeURIComponent(place) : ''}`;
    return `<div class="ag-cal"><a class="btn small ghost" href="${esc(href)}" download="horario.ics">Salvar na agenda do celular</a>
      <a class="btn small ghost" target="_blank" rel="noopener" href="${esc(g)}">Google Agenda</a></div>`;
  }
  const mineUrl = (token) => `${location.origin}${location.pathname}?n=${encodeURIComponent(SLUG)}&b=${encodeURIComponent(token)}`;

  // ---- "Meu horário": aberto pelo link secreto (ver e cancelar)
  function renderMine() {
    const m = S.mine, n = S.info.negocio;
    const label = { aguardando: 'Aguardando confirmação', confirmado: 'Confirmado', cancelado: 'Cancelado', encerrado: 'Já passou' }[m.situacao] || m.situacao;
    show(endPage(`<h2>Seu horário</h2>${ticket(m.servico, m.com || '', m.data, m.hora)}
        <p><span class="chip ${m.situacao === 'confirmado' ? 'ok' : m.situacao === 'cancelado' ? 'muted' : 'warn'}">${esc(label)}</span></p>
        ${m.pode_cancelar ? calendarLinks(`${m.servico} · ${n.nome}`, m.inicio, m.fim, n.endereco) : ''}
        <button type="button" class="ag2-go" id="mineNew">Marcar ${m.situacao === 'cancelado' ? 'outro' : 'mais um'} horário</button>
        ${n.whatsapp ? `<a class="ag2-go ghost" target="_blank" rel="noopener" href="https://wa.me/${esc(n.whatsapp)}">Falar no WhatsApp</a>` : ''}
        ${m.pode_cancelar ? '<button type="button" class="ag2-cancel" id="mineCancel">Cancelar este horário</button>' : ''}`, false));
    $('#mineNew').onclick = () => { S.mine = null; S.step = 'home'; history.replaceState(null, '', `${location.pathname}?n=${encodeURIComponent(SLUG)}`); render(); window.scrollTo(0, 0); };
    const c = $('#mineCancel');
    if (c) c.onclick = async () => {
      if (!confirm('Cancelar este horário? Ele fica livre para outra pessoa.')) return;
      c.disabled = true; c.textContent = 'Cancelando…';
      try { S.mine = (await api(null, { acao: 'cancelar', n: SLUG, b: TOKEN })).agendamento; toast('Horário cancelado.', 'ok'); renderMine(); } catch (e) { toast(e.message, 'bad'); c.disabled = false; c.textContent = 'Cancelar este horário'; }
    };
  }

  function renderDone() {
    const d = S.done, n = S.info.negocio;
    const ok = d.status === 'confirmed';
    const msg = `Oi! Acabei de ${ok ? 'marcar' : 'pedir'} um horário pelo link: ${d.servico}${d.com ? ' com ' + d.com : ''}, ${dayLong(d.data)} às ${d.hora}. Meu nome é ${d.nome}.`;
    show(endPage(`<span class="ag2-ok">${CHECK}</span>
        <h2>${ok ? 'Horário marcado!' : 'Pedido enviado!'}</h2>
        <p class="ag2-lead">${ok ? 'Está tudo certo. Até lá!' : `Agora é só esperar: a confirmação de ${esc(n.nome)} chega pelo WhatsApp.`}</p>
        ${ticket(d.servico, d.com, d.data, d.hora)}
        ${n.whatsapp ? `<a class="ag2-go" target="_blank" rel="noopener" href="https://wa.me/${esc(n.whatsapp)}?text=${encodeURIComponent(msg + (d.token ? '\nMeu horário: ' + mineUrl(d.token) : ''))}">Mandar um oi no WhatsApp</a>
          <p class="ag2-fine">Mandando um oi, a confirmação chega certinho no seu WhatsApp.</p>` : ''}
        ${calendarLinks(`${d.servico} · ${n.nome}`, d.inicio, d.fim, n.endereco)}
        ${d.token ? `<p class="ag2-fine">Precisa cancelar? Use <a href="${esc(mineUrl(d.token))}">este link do seu horário</a> (guarde ou mande no WhatsApp).</p>` : ''}
        <button type="button" class="ag2-go ghost" id="again">Marcar outro horário</button>`));
    $('#again').onclick = () => { Object.assign(S, { done: null, step: 'home', svc: null, prof: null, dias: null, data: null, horarios: null, hora: null, obs: '' }); S.dir = -1; render(); window.scrollTo(0, 0); };
  }

  boot();
})();
