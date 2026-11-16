/* Entre — página pública de agendamento (agendar.html?n=<endereço>). A cliente escolhe serviço, dia e horário
   e manda o pedido. Fala só com a função "agendar" do Supabase (nada de login). Tudo que vem do banco passa por esc(). */
(() => {
  'use strict';
  const CFG = window.ENTRE_CONFIG;
  const API = window.ENTRE_AGENDAR_API || (CFG ? CFG.url + '/functions/v1/agendar' : '');
  const SLUG = (new URLSearchParams(location.search).get('n') || location.hash.slice(1) || '').trim().toLowerCase();
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

  // Fontes de cada estilo (as cores ficam no style.css). Mesma lista do painel (STYLES em app.js).
  const FONTS = {
    spa: 'Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500;600',
    marmore: 'Bodoni+Moda:opsz,wght@6..96,500&family=Manrope:wght@400;500;600;700',
    nude: 'Gilda+Display&family=Nunito+Sans:wght@400;600;700',
    botanico: 'Marcellus&family=Karla:wght@400;600;700',
    editorial: 'Instrument+Serif&family=Inter+Tight:wght@400;500;600;700',
    barbearia: 'Oswald:wght@500;600&family=Work+Sans:wght@400;500;600',
  };
  function applyStyle(id) {
    if (FONTS[id]) {
      const l = document.createElement('link');
      l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?display=swap&family=' + FONTS[id];
      document.head.appendChild(l);
      document.documentElement.dataset.style = id;
    }
    syncThemeColor();
  }
  const syncThemeColor = () => $('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
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
  const S = {
    info: null, svc: null, prof: null, dias: null, data: null, horarios: null, hora: null,
    nome: local.get('nome'), tel: local.get('tel'), obs: '', done: null, loading: '',
  };
  const svc = () => S.info.servicos.find((s) => s.id === S.svc);
  const profName = (id) => S.info.profissionais.find((p) => p.id === id)?.nome || '';

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
    applyStyle(S.info.negocio.estilo);
    document.title = `Agendar · ${S.info.negocio.nome}`;
    render();
  }

  // ------------------------------------------------------------------ escolhas
  async function pickService(id) {
    S.svc = id; S.prof = null; S.data = null; S.horarios = null; S.hora = null;
    await loadDays();
  }
  async function pickProf(id) {
    S.prof = id || null; S.data = null; S.horarios = null; S.hora = null;
    await loadDays();
  }
  async function loadDays() {
    S.dias = null; S.loading = 'dias'; render('dia');
    try {
      const r = await api({ n: SLUG, servico: S.svc, ...(S.prof ? { prof: S.prof } : {}) });
      S.dias = r.dias;
      const first = r.dias.find((d) => d.livres > 0);
      if (first) return pickDay(first.data, false);
    } catch (e) { toast(e.message, 'bad'); }
    S.loading = ''; render();
  }
  async function pickDay(d, scroll = true) {
    S.data = d; S.horarios = null; S.hora = null; S.loading = 'horas'; render(scroll ? 'hora' : 'dia');
    try {
      const r = await api({ n: SLUG, servico: S.svc, data: d, ...(S.prof ? { prof: S.prof } : {}) });
      if (S.data === d) S.horarios = r.horarios;
    } catch (e) { toast(e.message, 'bad'); }
    S.loading = ''; render();
  }

  async function send(form) {
    const f = new FormData(form);
    S.nome = String(f.get('nome') || '').trim(); S.tel = String(f.get('tel') || '').trim(); S.obs = String(f.get('obs') || '').trim();
    if (S.nome.length < 2) return toast('Escreva seu nome.', 'bad');
    if (S.tel.replace(/\D/g, '').length < 10) return toast('Escreva seu WhatsApp com DDD.', 'bad');
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = 'Enviando…';
    try {
      const r = await api(null, {
        n: SLUG, servico: S.svc, prof: S.prof, data: S.data, hora: S.hora,
        nome: S.nome, telefone: S.tel, obs: S.obs, empresa_url: String(f.get('empresa_url') || ''),
      });
      local.set('nome', S.nome); local.set('tel', S.tel);
      S.done = { status: r.status, servico: svc().nome, com: r.resumo?.com || (S.prof ? profName(S.prof) : ''), data: S.data, hora: S.hora, nome: S.nome };
      render(); window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      toast(e.message, 'bad');
      btn.disabled = false; btn.textContent = S.info.negocio.confirma_sozinho ? 'Marcar horário' : 'Pedir horário';
      if (e.status === 409 && S.data) pickDay(S.data); // horário ocupado: mostra os livres de novo
    }
  }

  // ------------------------------------------------------------------ tela
  function header() {
    const n = S.info.negocio;
    return `${n.capa ? `<div class="cover ag-cover"><img alt="" src="${esc(n.capa)}"></div>` : ''}
      <header class="ag-head">
        <span class="ag-logo">${n.logo ? `<img alt="" src="${esc(n.logo)}">` : `<i>${esc(initials(n.nome))}</i>`}</span>
        <div><h1 class="display">${esc(n.nome)}</h1>${n.endereco ? `<p class="muted">${esc(n.endereco)}</p>` : ''}</div>
      </header>`;
  }

  function render(scrollTo) {
    if (S.done) return renderDone();
    const I = S.info, s = S.svc && svc();
    let html = header();
    if (!I.servicos.length) {
      root.innerHTML = html + '<div class="card empty">Ainda não há serviços disponíveis para marcar por aqui. Fale com o estabelecimento pelo WhatsApp.</div>';
      return;
    }
    html += `<section class="card" data-step="servico"><h3><span class="ag-n">1</span>Escolha o serviço</h3><div class="list">
      ${I.servicos.map((x) => `<button type="button" class="row ag-opt ${S.svc === x.id ? 'sel' : ''}" data-svc="${esc(x.id)}" aria-pressed="${S.svc === x.id}">
        <span class="grow"><b>${esc(x.nome)}</b><small>${esc(dur(x.duracao))} · ${esc(brl(x.preco))}${x.obs ? ' · ' + esc(x.obs) : ''}</small></span>
        <i class="ag-check" aria-hidden="true"></i></button>`).join('')}</div></section>`;

    let n = 2;
    if (s && s.profissionais.length > 1) {
      html += `<section class="card" data-step="prof"><h3><span class="ag-n">${n++}</span>Com quem?</h3><div class="ag-chips">
        <button type="button" class="ag-chip ${!S.prof ? 'sel' : ''}" data-prof="">Tanto faz</button>
        ${s.profissionais.map((id) => `<button type="button" class="ag-chip ${S.prof === id ? 'sel' : ''}" data-prof="${esc(id)}">${esc(profName(id))}</button>`).join('')}
      </div></section>`;
    }
    if (s) {
      const dias = S.dias;
      html += `<section class="card" data-step="dia"><h3><span class="ag-n">${n++}</span>Escolha o dia</h3>
        ${!dias ? '<p class="muted">Procurando dias com vaga…</p>'
          : !dias.some((d) => d.livres) ? '<p class="muted">Não há horários livres nos próximos dias. Fale com o estabelecimento pelo WhatsApp.</p>'
          : `<div class="ag-days">${dias.map((d) => `<button type="button" class="ag-day ${S.data === d.data ? 'sel' : ''}" data-day="${d.data}" ${d.livres ? '' : 'disabled'}>
              <small>${WDS[weekdayOf(d.data)]}</small><b>${Number(d.data.slice(8, 10))}</b><small>${MS[Number(d.data.slice(5, 7)) - 1]}</small></button>`).join('')}</div>`}
      </section>`;
    }
    if (s && S.data) {
      const hs = S.horarios;
      html += `<section class="card" data-step="hora"><h3><span class="ag-n">${n++}</span>Horário · ${esc(dayLong(S.data))}</h3>
        ${!hs ? '<p class="muted">Carregando horários…</p>' : !hs.length ? '<p class="muted">Esse dia lotou. Escolha outro dia.</p>'
          : `<div class="ag-times">${hs.map((h) => `<button type="button" class="ag-time ${S.hora === h.hora ? 'sel' : ''}" data-hora="${esc(h.hora)}">${esc(h.hora)}</button>`).join('')}</div>`}
      </section>`;
    }
    if (s && S.hora) {
      const auto = I.negocio.confirma_sozinho;
      html += `<section class="card" data-step="dados"><h3><span class="ag-n">${n++}</span>Seus dados</h3>
        <form id="agForm" novalidate>
          <label>Seu nome<input name="nome" autocomplete="name" maxlength="80" required value="${esc(S.nome)}"></label>
          <label>Seu WhatsApp (com DDD)<input name="tel" type="tel" inputmode="tel" autocomplete="tel" maxlength="20" required placeholder="(11) 91234-5678" value="${esc(S.tel)}"></label>
          <label>Alguma observação? <span class="muted small">(opcional)</span><input name="obs" maxlength="200" value="${esc(S.obs)}"></label>
          <label class="ag-hp" aria-hidden="true">Não preencha<input name="empresa_url" tabindex="-1" autocomplete="off"></label>
          <div class="ag-sum"><b>${esc(s.nome)}</b>${S.prof ? ' com ' + esc(profName(S.prof)) : ''}<br>${esc(dayLong(S.data))} às ${esc(S.hora)} · ${esc(brl(s.preco))}</div>
          <button type="submit" class="btn primary block">${auto ? 'Marcar horário' : 'Pedir horário'}</button>
          <p class="hint center">${auto ? 'O horário fica marcado na hora.' : `A confirmação chega pelo WhatsApp (${esc(I.negocio.nome)}).`}</p>
        </form></section>`;
    }
    root.innerHTML = html;

    $$('[data-svc]').forEach((b) => { b.onclick = () => pickService(b.dataset.svc); });
    $$('[data-prof]').forEach((b) => { b.onclick = () => pickProf(b.dataset.prof); });
    $$('[data-day]').forEach((b) => { b.onclick = () => pickDay(b.dataset.day); });
    $$('[data-hora]').forEach((b) => { b.onclick = () => { S.hora = b.dataset.hora; render('dados'); }; });
    const form = $('#agForm');
    if (form) {
      form.onsubmit = (e) => { e.preventDefault(); send(form); };
      form.oninput = () => { const f = new FormData(form); S.nome = String(f.get('nome')); S.tel = String(f.get('tel')); S.obs = String(f.get('obs')); };
    }
    $('.ag-day.sel')?.scrollIntoView({ block: 'nearest', inline: 'center' });
    if (scrollTo) $(`[data-step="${scrollTo}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  function renderDone() {
    const d = S.done, n = S.info.negocio;
    const ok = d.status === 'confirmed';
    const quando = `${dayLong(d.data)} às ${d.hora}`;
    const msg = `Oi! Acabei de ${ok ? 'marcar' : 'pedir'} um horário pelo link: ${d.servico}${d.com ? ' com ' + d.com : ''}, ${quando}. Meu nome é ${d.nome}.`;
    root.innerHTML = `${header()}
      <section class="card ag-done">
        <span class="ag-ok" aria-hidden="true">✓</span>
        <h2 class="display">${ok ? 'Horário marcado!' : 'Pedido enviado!'}</h2>
        <p class="ag-sum"><b>${esc(d.servico)}</b>${d.com ? ' com ' + esc(d.com) : ''}<br>${esc(quando)}</p>
        <p>${ok ? 'Está tudo certo. Se precisar remarcar ou cancelar, fale com o estabelecimento pelo WhatsApp.'
          : `Agora é só esperar: a confirmação de ${esc(n.nome)} chega pelo WhatsApp.`}</p>
        ${n.whatsapp ? `<a class="btn primary block" target="_blank" rel="noopener" href="https://wa.me/${esc(n.whatsapp)}?text=${encodeURIComponent(msg)}">Mandar um oi no WhatsApp</a>
          <p class="hint center">Mandando um oi, a confirmação chega certinho no seu WhatsApp.</p>` : ''}
        <button type="button" class="btn ghost block" id="again">Marcar outro horário</button>
      </section>`;
    $('#again').onclick = () => { Object.assign(S, { done: null, svc: null, prof: null, dias: null, data: null, horarios: null, hora: null, obs: '' }); render(); window.scrollTo(0, 0); };
  }

  boot();
})();
