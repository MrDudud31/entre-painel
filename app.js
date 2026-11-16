/* Entre — o app de quem é dono do negócio (salão, barbearia, clínica…). HTML/JS puro + Supabase (sem build).
   Telas: Início, Agenda, Conversas, Clientes, Ajustes. Tudo que vem do WhatsApp passa por esc(). */
(() => {
  'use strict';
  const CFG = window.ENTRE_CONFIG;
  // Tela inicial: mostra "Carregando…" ou um erro com botão, em vez de ficar em branco.
  function bootMsg(text, retry) {
    const el = document.getElementById('boot');
    if (!el) return;
    el.hidden = false;
    el.innerHTML = '<div class="card narrow center"><p></p></div>';
    el.querySelector('p').textContent = text;
    if (retry) {
      const b = document.createElement('button');
      b.className = 'btn primary block'; b.type = 'button'; b.textContent = 'Tentar de novo';
      b.onclick = () => location.reload();
      el.firstElementChild.appendChild(b);
    }
  }
  if (!window.supabase || !CFG) { bootMsg('Não consegui carregar o painel. Confira a internet e tente de novo.', true); return; }
  const sb = window.supabase.createClient(CFG.url, CFG.key);
  const MIN = 60000;
  const POLL_MS = 30000;
  const WD = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  const WDS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];
  const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
  const STATUS = {
    pending: ['Aguardando', 'warn'], confirmed: ['Confirmado', 'ok'], cancelled: ['Cancelado', 'muted'],
    done: ['Atendido', 'ok2'], noshow: ['Faltou', 'bad'], block: ['Bloqueado', 'muted'],
  };
  // Modelos por tipo de negócio. Os serviços entram DESATIVADOS e sem preço: a dona completa e ativa.
  const KINDS = {
    salao: { label: 'Salão de beleza', services: [['Corte feminino', 60, 45], ['Escova', 45, null], ['Hidratação', 60, 30], ['Coloração', 120, 40]] },
    manicure: { label: 'Manicure / nail designer', services: [['Mão', 45, 14], ['Pé', 45, 21], ['Pé e mão', 90, 14], ['Alongamento em gel', 120, 21], ['Manutenção de alongamento', 90, 21]] },
    barbearia: { label: 'Barbearia', services: [['Corte', 30, 21], ['Barba', 30, 14], ['Corte + barba', 60, 21]] },
    estetica: { label: 'Estética, sobrancelhas e cílios', services: [['Design de sobrancelhas', 30, 20], ['Extensão de cílios', 120, 21], ['Limpeza de pele', 60, 30]] },
    clinica: { label: 'Clínica / consultório (saúde)', health: true, services: [['Consulta', 50, null], ['Retorno', 30, null]] },
    outro: { label: 'Outro tipo de negócio', services: [['Atendimento', 60, null]] },
  };

  // ------------------------------------------------------------------ aparência (estilos que a dona escolhe)
  // As cores de cada estilo ficam no style.css (html[data-style]); aqui só nome, fontes e as cores da miniatura.
  const GF = 'https://fonts.googleapis.com/css2?display=swap&family=';
  const STYLES = {
    entre: { nome: 'Entre', desc: 'Verde-floresta e cobre. O oficial.', fonts: 'Fraunces:opsz,wght@9..144,400..600&family=DM+Sans:opsz,wght@9..40,400..700', disp: '"Fraunces", serif', bg: '#F6F7F3', ink: '#163A32', sw: ['#163A32', '#E0A36B', '#E8EFE6'], theme: '#163A32' },
    spa: { nome: 'Spa', desc: 'Areia, creme e grafite.', fonts: 'Cormorant+Garamond:wght@500;600&family=Jost:wght@400;500;600', disp: '"Cormorant Garamond", serif', bg: '#EFE9E1', ink: '#2E2A26', sw: ['#2E2A26', '#8C7460', '#E2D3C2'], theme: '#EFE9E1' },
    marmore: { nome: 'Mármore', desc: 'Branco, veios e dourado.', fonts: 'Bodoni+Moda:opsz,wght@6..96,500&family=Manrope:wght@400;500;600;700', disp: '"Bodoni Moda", serif', bg: '#F7F6F3', ink: '#1E1E1E', sw: ['#1E1E1E', '#A8844C', '#E2D4B6'], theme: '#F7F6F3' },
    nude: { nome: 'Nude', desc: 'Rosa queimado e champanhe.', fonts: 'Gilda+Display&family=Nunito+Sans:wght@400;600;700', disp: '"Gilda Display", serif', bg: '#F4E6DC', ink: '#4A2E2B', sw: ['#A4544E', '#E9C9A0', '#F1DDD2'], theme: '#F4E6DC' },
    botanico: { nome: 'Botânico', desc: 'Sálvia, creme e folhas.', fonts: 'Marcellus&family=Karla:wght@400;600;700', disp: '"Marcellus", serif', bg: '#E7ECE2', ink: '#243326', sw: ['#4E6B4A', '#A9C79C', '#DFE7D8'], theme: '#E7ECE2' },
    editorial: { nome: 'Editorial', desc: 'Preto e off-white, cara de revista.', fonts: 'Instrument+Serif&family=Inter+Tight:wght@400;500;600;700', disp: '"Instrument Serif", serif', bg: '#F2F0EB', ink: '#111111', sw: ['#111111', '#2433C7', '#E4E1DA'], theme: '#F2F0EB' },
    barbearia: { nome: 'Barbearia', desc: 'Verde-garrafa, couro e creme.', fonts: 'Oswald:wght@500;600&family=Work+Sans:wght@400;500;600', disp: '"Oswald", sans-serif', bg: '#EFE6D8', ink: '#1F3B2D', sw: ['#1F3B2D', '#8B5A3C', '#E7DAC6'], theme: '#EFE6D8' },
  };
  const LOGO = (cls = '') => `<svg class="entre-logo ${cls}" viewBox="26 16 68 70" aria-hidden="true"><path class="b" d="M30 70 V34 A14 14 0 0 1 44 20 H76 A14 14 0 0 1 90 34 V56 A14 14 0 0 1 76 70 H48 L34 82 Z"/><circle class="d" cx="47" cy="45" r="5"/><circle class="d" cx="60" cy="45" r="5"/><circle class="d" cx="73" cy="45" r="5"/></svg>`;
  const loadedFonts = new Set(['entre']);
  function loadFonts(id) {
    if (!STYLES[id] || loadedFonts.has(id)) return;
    loadedFonts.add(id);
    const l = document.createElement('link');
    l.rel = 'stylesheet'; l.href = GF + STYLES[id].fonts;
    document.head.appendChild(l);
  }
  /** Troca o estilo da tela. persist=false é só a prévia (Ajustes); o salvo fica em businesses.theme. */
  function applyStyle(id, { persist = true } = {}) {
    const st = STYLES[id] ? id : 'entre';
    loadFonts(st);
    if (st === 'entre') delete document.documentElement.dataset.style; else document.documentElement.dataset.style = st;
    const dark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    $('meta[name="theme-color"]')?.setAttribute('content', dark ? getComputedStyle(document.body).backgroundColor : STYLES[st].theme);
    if (persist) store.set('style', st);
  }

  // ------------------------------------------------------------------ utilidades
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
  const brl = (c) => (c == null ? 'sob consulta' : 'R$ ' + (c / 100).toFixed(2).replace('.', ','));
  const phoneDigits = (raw) => { const d = String(raw || '').replace(/\D/g, '').replace(/^0+/, ''); if (!d) return ''; return d.length <= 11 ? '55' + d : d; };
  // Celular do Brasil com e sem o 9 (o WhatsApp entrega sem o 9 em muitos DDDs). Mesma regra do robô.
  const phoneVariants = (raw) => {
    const p = phoneDigits(raw);
    if (!p) return [];
    const m = /^55(\d{2})(\d{8,9})$/.exec(p);
    if (!m) return [p];
    if (m[2].length === 9 && m[2][0] === '9') return [p, '55' + m[1] + m[2].slice(1)];
    if (m[2].length === 8 && /[6-9]/.test(m[2][0])) return [p, '55' + m[1] + '9' + m[2]];
    return [p];
  };
  const phoneText = (p) => {
    if (!p) return '';
    const d = String(p).replace(/^55/, '');
    if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
    if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
    return '+' + p;
  };
  const clientLabel = (c) => c?.name || (c?.username ? '@' + c.username : '') || phoneText(c?.phone) || 'Cliente do WhatsApp';
  const firstName = (n) => String(n || '').trim().split(/\s+/)[0] || '';
  const initials = (n) => String(n || '?').replace(/[^\p{L}\s]/gu, '').trim().split(/\s+/).slice(0, 2).map((x) => x[0]).join('').toUpperCase() || '?';
  const waLink = (phone, text = '') => `https://wa.me/${phoneDigits(phone)}${text ? '?text=' + encodeURIComponent(text) : ''}`;
  const store = {
    get(k) { try { return localStorage.getItem('entre.painel.' + k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem('entre.painel.' + k, v); } catch { /* sem armazenamento */ } },
  };

  // Datas no fuso do negócio (mesmas regras do robô: real/supabase/functions/whatsapp/agenda.js)
  function tzOffsetMinutes(instant, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const p = Object.fromEntries(dtf.formatToParts(instant).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUtc - Math.floor(instant.getTime() / 1000) * 1000) / MIN);
  }
  function localToUtc(dateStr, timeStr, tz) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [h, mi] = timeStr.split(':').map(Number);
    const guess = Date.UTC(y, m - 1, d, h, mi);
    const off = tzOffsetMinutes(new Date(guess), tz);
    let t = guess - off * MIN;
    const off2 = tzOffsetMinutes(new Date(t), tz);
    if (off2 !== off) t = guess - off2 * MIN;
    return new Date(t);
  }
  function localParts(instant, tz) {
    const shifted = new Date(instant.getTime() + tzOffsetMinutes(instant, tz) * MIN);
    const iso = shifted.toISOString();
    return { date: iso.slice(0, 10), time: iso.slice(11, 16), weekday: shifted.getUTCDay() };
  }
  function addDays(dateStr, n) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10); }
  function weekdayOf(dateStr) { const [y, m, d] = dateStr.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).getUTCDay(); }
  function daysBetween(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }
  function freeSlots({ date, durationMin, hours, slotMinutes, busy, staffIds, now, minNoticeMin = 0, tz }) {
    const out = [];
    if (!staffIds.length) return out;
    const earliest = now.getTime() + minNoticeMin * MIN;
    const ranges = busy.map((b) => ({ staff: b.staff_id ?? null, s: new Date(b.starts_at).getTime(), e: new Date(b.ends_at).getTime() }));
    for (const h of [...hours].sort((a, b) => a.opens.localeCompare(b.opens))) {
      const open = localToUtc(date, h.opens.slice(0, 5), tz).getTime();
      const close = localToUtc(date, h.closes.slice(0, 5), tz).getTime();
      for (let t = open; t + durationMin * MIN <= close; t += slotMinutes * MIN) {
        if (t < earliest) continue;
        const end = t + durationMin * MIN;
        const free = staffIds.filter((sid) => !ranges.some((r) => (r.staff === sid || r.staff === null) && r.s < end && r.e > t));
        if (free.length) out.push({ time: localParts(new Date(t), tz).time, startsAt: new Date(t).toISOString(), staffIds: free });
      }
    }
    return out;
  }

  const tz = () => S.biz?.timezone || 'America/Sao_Paulo';
  const today = () => localParts(new Date(), tz()).date;
  const partsOf = (iso) => localParts(new Date(iso), tz());
  const dayLabel = (d) => `${WDS[weekdayOf(d)]} ${d.slice(8, 10)}/${d.slice(5, 7)}`;
  const dayStartIso = (d) => localToUtc(d, '00:00', tz()).toISOString();
  function relDay(d) {
    const t = today();
    if (d === t) return 'hoje';
    if (d === addDays(t, 1)) return 'amanhã';
    if (d === addDays(t, -1)) return 'ontem';
    return dayLabel(d);
  }
  const whenLabel = (iso) => { const p = partsOf(iso); return `${relDay(p.date)} às ${p.time}`; };
  function ago(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / MIN;
    if (diff < 1) return 'agora';
    if (diff < 60) return `há ${Math.floor(diff)} min`;
    const p = partsOf(iso);
    if (p.date === today()) return p.time;
    return relDay(p.date);
  }

  // ------------------------------------------------------------------ estado
  const S = {
    session: null, bizList: [], biz: null, services: [], staff: [], links: [], hours: [],
    tab: 'inicio', day: null, conv: null, convFilter: 'todas', clientQuery: '', bk: new Map(), started: false,
  };
  const svcName = (id) => S.services.find((s) => s.id === id)?.name || '';
  const staffName = (id) => S.staff.find((p) => p.id === id)?.name || '';
  const BOOK_SEL = 'id, starts_at, ends_at, status, client_name, client_id, price_cents, note, created_by, service_id, staff_id, clients(name, phone, username)';

  function friendly(error) {
    const msg = error?.message || String(error);
    if (error?.code === '23P01') return 'Esse horário já está ocupado para essa pessoa.';
    if (error?.code === '23505') return 'Isso já existe.';
    if (error?.code === '42501' || /permission denied|row-level security/i.test(msg)) return 'Você não tem permissão para isso.';
    if (/Failed to fetch|NetworkError/i.test(msg)) return 'Sem internet. Tente de novo.';
    return msg;
  }
  const must = ({ data, error }) => { if (error) throw new Error(friendly(error)); return data; };

  function toast(msg, kind = '') {
    const t = $('#toast');
    t.textContent = msg;
    t.className = 'toast show ' + kind;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { t.className = 'toast'; }, 4500);
  }

  // Janela de baixo (formulários e detalhes)
  function sheet(title, bodyHtml, { onSubmit, submitText = 'Salvar' } = {}) {
    const d = $('#sheet');
    d.innerHTML = `<form class="sheet-form" novalidate>
      <header><h2>${esc(title)}</h2><button type="button" class="icon-btn" data-close aria-label="Fechar">✕</button></header>
      <div class="sheet-body">${bodyHtml}</div>
      ${onSubmit ? `<footer><button type="submit" class="btn primary block">${esc(submitText)}</button></footer>` : ''}
    </form>`;
    const form = $('form', d);
    $('[data-close]', d).onclick = () => d.close();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (!onSubmit) return;
      if (!form.reportValidity()) return;
      const btn = $('[type=submit]', form);
      btn.disabled = true;
      try {
        const ok = await onSubmit(new FormData(form), form);
        if (ok !== false) d.close();
      } catch (err) { toast(friendly(err), 'bad'); } finally { btn.disabled = false; }
    };
    if (!d.open) d.showModal();
    return form;
  }
  const closeSheet = () => { const d = $('#sheet'); if (d.open) d.close(); };
  $('#sheet').addEventListener('click', (e) => { if (e.target.id === 'sheet') closeSheet(); });

  // Botão que mostra "..." enquanto trabalha
  async function busy(btn, fn) {
    if (btn.disabled) return;
    const txt = btn.textContent;
    btn.disabled = true; btn.textContent = '…';
    try { await fn(); } catch (err) { toast(friendly(err), 'bad'); } finally { btn.disabled = false; btn.textContent = txt; }
  }

  function show(id) {
    for (const s of ['login', 'onboard', 'main']) $('#' + s).hidden = s !== id;
    const boot = $('#boot');
    if (boot) boot.hidden = true;
  }

  // ------------------------------------------------------------------ login
  $('#loginForm').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const btn = $('button[type=submit]', e.target);
    $('#loginError').textContent = '';
    btn.disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: String(f.get('email')).trim(), password: String(f.get('password')) });
    btn.disabled = false;
    if (error) $('#loginError').textContent = /invalid/i.test(error.message) ? 'E-mail ou senha errados.' : friendly(error);
  };

  async function boot() {
    loadFonts(store.get('style')); // o estilo salvo neste celular já vale na primeira tela
    sb.auth.onAuthStateChange((event, session) => {
      S.session = session;
      if (!session) { S.started = false; show('login'); return; }
      if (!S.started) {
        S.started = true;
        // Se a primeira carga falhar (sem internet), mostra o erro com botão em vez de tela em branco.
        setTimeout(() => start().catch((err) => {
          console.error(err);
          S.started = false;
          if ($('#main').hidden && $('#onboard').hidden) { $('#login').hidden = true; bootMsg(friendly(err), true); } else toast(friendly(err), 'bad');
        }), 0);
      }
    });
  }
  function fatal(err) { console.error(err); toast(friendly(err), 'bad'); }

  async function start() {
    S.bizList = must(await sb.from('businesses').select('*').order('created_at'));
    if (!S.bizList.length) return showOnboarding();
    const saved = store.get('biz');
    S.biz = S.bizList.find((b) => b.id === saved) || S.bizList[0];
    applyStyle(S.biz.theme);
    await loadBizData();
    S.day = today();
    show('main');
    renderTop();
    go(S.tab);
  }

  async function loadBizData() {
    const id = S.biz.id;
    const [services, staff, hours] = await Promise.all([
      sb.from('services').select('*').eq('business_id', id).order('name'),
      sb.from('staff').select('*').eq('business_id', id).order('name'),
      sb.from('opening_hours').select('*').eq('business_id', id),
    ]);
    S.services = must(services); S.staff = must(staff); S.hours = must(hours);
    S.links = S.staff.length ? must(await sb.from('staff_services').select('staff_id, service_id').in('staff_id', S.staff.map((p) => p.id))) : [];
  }
  async function reloadBiz() {
    S.biz = must(await sb.from('businesses').select('*').eq('id', S.biz.id).single());
    renderTop();
  }

  function renderTop() {
    // Logo do salão (se ela subiu uma) ou o símbolo do Entre
    const mark = $('#bizMark');
    if (mark) {
      mark.innerHTML = S.biz.logo_url ? '<img alt="">' : LOGO();
      if (S.biz.logo_url) $('img', mark).src = S.biz.logo_url;
    }
    $('#bizName').textContent = S.biz.name;
    $('#bizKind').textContent = KINDS[S.biz.kind]?.label || 'Meu negócio';
    const on = S.biz.assistant_enabled;
    const pill = $('#botPill');
    pill.className = 'pill ' + (on ? 'on' : 'off');
    pill.innerHTML = `<i></i><span class="pl-long">Secretária </span>${on ? 'ligada' : 'desligada'}`;
  }
  $('#botPill').onclick = () => {
    const on = S.biz.assistant_enabled;
    sheet(on ? 'Desligar a secretária?' : 'Ligar a secretária?', on
      ? '<p>Com ela desligada, as mensagens continuam chegando e ficam salvas em Conversas, mas <b>ninguém responde automaticamente</b>. Você responde pelo painel ou pelo celular.</p>'
      : '<p>Ela volta a responder as clientes no WhatsApp na hora, usando seus serviços, preços e horários.</p>',
    { submitText: on ? 'Desligar' : 'Ligar', onSubmit: async () => {
      must(await sb.from('businesses').update({ assistant_enabled: !on }).eq('id', S.biz.id));
      await reloadBiz();
      toast(on ? 'Secretária desligada.' : 'Secretária ligada ✅', on ? 'warn' : 'ok');
      if (S.tab === 'inicio') go('inicio');
    } });
  };

  // Grade de estilos: cada opção é desenhada com as cores e a fonte do próprio estilo.
  function stylePickerHtml(selected) {
    Object.keys(STYLES).forEach(loadFonts);
    return `<div class="style-grid" role="group" aria-label="Estilos">${Object.entries(STYLES).map(([id, s]) => `
      <button type="button" class="style-opt" data-style-opt="${id}" aria-pressed="${id === selected}" style="background:${s.bg};color:${s.ink}">
        <span class="sw">${s.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <b style="font-family:${esc(s.disp)}">${esc(s.nome)}</b><small>${esc(s.desc)}</small></button>`).join('')}</div>`;
  }
  function bindStylePicker(root, onPick) {
    $$('[data-style-opt]', root).forEach((b) => {
      b.onclick = () => {
        $$('[data-style-opt]', root).forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        onPick(b.dataset.styleOpt);
      };
    });
  }

  /** Reduz a foto no próprio celular antes de subir (fica leve e rápida). */
  function shrinkImage(file, maxSide, type) {
    return new Promise((resolve, reject) => {
      if (!/^image\//.test(file.type)) return reject(new Error('Escolha uma imagem (foto ou PNG).'));
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const k = Math.min(1, maxSide / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error('Não consegui ler essa imagem.'))), type, 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Não consegui abrir essa imagem.')); };
      img.src = url;
    });
  }
  /** Sobe a logo ou a capa para a pasta do negócio e devolve o endereço público. */
  async function uploadBrandImage(kind, file, bizId = S.biz.id) {
    const isLogo = kind === 'logo';
    const blob = await shrinkImage(file, isLogo ? 512 : 1600, isLogo ? 'image/png' : 'image/jpeg');
    const path = `${bizId}/${kind}-${Date.now()}.${isLogo ? 'png' : 'jpg'}`;
    const { error } = await sb.storage.from('marca').upload(path, blob, { contentType: blob.type, upsert: false });
    if (error) throw new Error(/size|large/i.test(error.message) ? 'A imagem é grande demais.' : friendly(error));
    return sb.storage.from('marca').getPublicUrl(path).data.publicUrl;
  }

  // ------------------------------------------------------------------ primeiro acesso
  // Primeiro acesso: um passo por tela, como uma conversa. Nada é salvo até o último passo.
  const KIND_ICON = {
    salao: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.2 8.3L20 17M8.2 15.7L20 7"/>',
    manicure: '<rect x="8" y="11" width="8" height="9" rx="2"/><path d="M10 11V5h4v6M10 15h4"/>',
    barbearia: '<path d="M4 6h16l-2 4H6zM6 10v8a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8M10 14h4"/>',
    estetica: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    clinica: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    outro: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  };
  const HOURS_PRESETS = {
    comercial: { label: 'Seg a sex, 9h às 18h · sáb, 9h às 13h', rows: [[1, '09:00', '18:00'], [2, '09:00', '18:00'], [3, '09:00', '18:00'], [4, '09:00', '18:00'], [5, '09:00', '18:00'], [6, '09:00', '13:00']] },
    terca: { label: 'Ter a sáb, 9h às 19h', rows: [2, 3, 4, 5, 6].map((w) => [w, '09:00', '19:00']) },
    longo: { label: 'Seg a sáb, 8h às 20h', rows: [1, 2, 3, 4, 5, 6].map((w) => [w, '08:00', '20:00']) },
    semana: { label: 'Seg a sex, 8h às 18h', rows: [1, 2, 3, 4, 5].map((w) => [w, '08:00', '18:00']) },
  };
  const WIZ_STEPS = ['oi', 'tipo', 'nome', 'voce', 'whats', 'estilo', 'imagens', 'horario', 'pronto'];

  function showOnboarding() {
    show('onboard');
    const W = { i: 0, kind: '', name: '', owner: '', wa: '', theme: 'entre', logo: null, cover: null, hours: 'comercial' };
    const url = { logo: null, cover: null }; // prévia das imagens escolhidas (ainda não enviadas)
    const box = $('#onboard');

    const render = () => {
      const step = WIZ_STEPS[W.i];
      const total = WIZ_STEPS.length - 1;
      let body = '';
      let next = 'Continuar';
      let canSkip = false;
      if (step === 'oi') {
        body = `<div class="wiz-hero"><span class="logo-badge big">${LOGO('anim')}</span></div>
          <h2>Boas-vindas ao Entre</h2>
          <p class="wiz-sub">Vamos deixar o app com a cara do seu negócio. São poucas perguntas e você pode mudar tudo depois.</p>`;
        next = 'Começar';
      } else if (step === 'tipo') {
        body = `<h2>Com o que você trabalha?</h2><p class="wiz-sub">Assim já trazemos serviços de exemplo do seu ramo.</p>
          <div class="kind-grid">${Object.entries(KINDS).map(([k, v]) => `<button type="button" class="kind-opt" data-kind="${k}" aria-pressed="${W.kind === k}">
            <svg viewBox="0 0 24 24" aria-hidden="true">${KIND_ICON[k]}</svg><span>${esc(v.label)}</span></button>`).join('')}</div>`;
      } else if (step === 'nome') {
        body = `<h2>Como se chama o seu negócio?</h2><p class="wiz-sub">É o nome que aparece no topo do app e que a secretária usa no WhatsApp.</p>
          <input class="wiz-input" id="wName" maxlength="80" autocomplete="organization" placeholder="${W.kind === 'barbearia' ? 'Ex.: Barbearia do Zé' : 'Ex.: Studio Bela Unha'}" value="${esc(W.name)}">`;
      } else if (step === 'voce') {
        body = `<h2>E como podemos te chamar?</h2><p class="wiz-sub">Aparece na saudação, tipo "Bom dia, ${esc(firstName(W.owner) || 'Ana')}."</p>
          <input class="wiz-input" id="wOwner" maxlength="60" autocomplete="given-name" placeholder="Seu nome" value="${esc(W.owner)}">`;
      } else if (step === 'whats') {
        body = `<h2>Seu WhatsApp, para receber avisos</h2><p class="wiz-sub">A secretária avisa você quando chegar um pedido novo ou quando alguém precisar de você.</p>
          <input class="wiz-input" id="wWa" inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678" value="${esc(W.wa)}">`;
        canSkip = true;
      } else if (step === 'estilo') {
        body = `<h2>Escolha a cara do app</h2><p class="wiz-sub">Toque para ver na hora. Cada estilo tem versão clara e escura.</p>${stylePickerHtml(W.theme)}`;
      } else if (step === 'imagens') {
        body = `<h2>Logo e capa</h2><p class="wiz-sub">A logo aparece no topo; a capa, no início do app. Se não tiver agora, pode pular.</p>
          <div class="wiz-preview"><div class="wp-cover" id="wpCover">${url.cover ? '' : '<span>Capa</span>'}</div>
            <div class="wp-bar"><span class="wp-logo" id="wpLogo">${url.logo ? '' : LOGO()}</span><b>${esc(W.name || 'Seu negócio')}</b></div></div>
          <div class="wiz-files">
            <label class="btn ghost">${url.logo ? 'Trocar a logo' : 'Escolher logo'}<input type="file" id="wLogo" accept="image/png,image/jpeg,image/webp" hidden></label>
            <label class="btn ghost">${url.cover ? 'Trocar a capa' : 'Escolher capa'}<input type="file" id="wCover" accept="image/png,image/jpeg,image/webp" hidden></label>
          </div>`;
        canSkip = !W.logo && !W.cover;
      } else if (step === 'horario') {
        body = `<h2>Quando vocês atendem?</h2><p class="wiz-sub">Escolha o mais perto. Dá para ajustar dia por dia depois, em Ajustes.</p>
          <div class="hours-opts">${Object.entries(HOURS_PRESETS).map(([k, h]) => `<button type="button" class="hours-opt" data-hours="${k}" aria-pressed="${W.hours === k}">${esc(h.label)}</button>`).join('')}</div>`;
      } else if (step === 'pronto') {
        body = `<h2>Tudo pronto, ${esc(firstName(W.owner))}!</h2><p class="wiz-sub">Assim vai ficar o seu app:</p>
          <div class="wiz-preview big">${url.cover ? '<div class="wp-cover" id="wpCover"></div>' : ''}
            <div class="wp-bar"><span class="wp-logo" id="wpLogo">${url.logo ? '' : LOGO()}</span><b>${esc(W.name)}</b></div>
            <div class="wp-greet">${(() => { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; })()}, ${esc(firstName(W.owner))}.</div></div>
          <ul class="wiz-sum"><li><b>Ramo:</b> ${esc(KINDS[W.kind]?.label || '')}</li><li><b>Estilo:</b> ${esc(STYLES[W.theme].nome)}</li><li><b>Horário:</b> ${esc(HOURS_PRESETS[W.hours].label)}</li>
            <li><b>Serviços:</b> criamos alguns de exemplo, <b>desativados e sem preço</b>. Você coloca seus preços e ativa só o que faz.</li></ul>`;
        next = 'Entrar no meu app';
      }
      box.innerHTML = `<form class="wiz card narrow" novalidate>
        <div class="wiz-top">${W.i > 0 ? '<button type="button" class="icon-btn" id="wBack" aria-label="Voltar">‹</button>' : '<span></span>'}
          ${W.i > 0 ? `<div class="wiz-progress" aria-label="Passo ${W.i} de ${total}"><i style="width:${Math.round((W.i / total) * 100)}%"></i></div><small>${W.i}/${total}</small>` : ''}</div>
        <div class="wiz-step">${body}</div>
        <p class="error" id="wErr" role="alert"></p>
        <div class="wiz-nav"><button type="submit" class="btn primary block">${next}</button>
          ${canSkip ? '<button type="button" class="btn ghost block" id="wSkip">Pular</button>' : ''}
          ${W.i === 0 ? '<button type="button" class="btn ghost block" id="wOut">Sair</button>' : ''}</div>
      </form>`;
      const form = $('form', box);
      const err = (m) => { $('#wErr', box).textContent = m; };
      // imagens escolhidas aparecem na prévia
      const pc = $('#wpCover', box), pl = $('#wpLogo', box);
      if (pc && url.cover) pc.style.backgroundImage = `url("${url.cover}")`;
      if (pl && url.logo) pl.style.backgroundImage = `url("${url.logo}")`;
      $('#wBack', box)?.addEventListener('click', () => { W.i--; render(); });
      $('#wOut', box)?.addEventListener('click', () => sb.auth.signOut());
      $('#wSkip', box)?.addEventListener('click', () => { if (step === 'whats') W.wa = ''; W.i++; render(); });
      $$('[data-kind]', box).forEach((b) => { b.onclick = () => { W.kind = b.dataset.kind; W.i++; render(); }; });
      $$('[data-hours]', box).forEach((b) => { b.onclick = () => { W.hours = b.dataset.hours; $$('[data-hours]', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
      if (step === 'estilo') bindStylePicker(form, (id) => { W.theme = id; applyStyle(id, { persist: false }); });
      for (const [kind, id] of [['logo', '#wLogo'], ['cover', '#wCover']]) {
        const input = $(id, box);
        if (!input) continue;
        input.onchange = () => {
          const f = input.files?.[0];
          if (!f) return;
          if (!/^image\//.test(f.type)) return err('Escolha uma imagem (foto ou PNG).');
          if (f.size > 15 * 1024 * 1024) return err('Essa imagem é grande demais (máx. 15 MB).');
          if (url[kind]) URL.revokeObjectURL(url[kind]);
          W[kind] = f; url[kind] = URL.createObjectURL(f);
          render();
        };
      }
      const firstInput = $('.wiz-input', box);
      if (firstInput) setTimeout(() => firstInput.focus(), 50);

      form.onsubmit = async (e) => {
        e.preventDefault();
        err('');
        if (step === 'tipo' && !W.kind) return err('Toque numa das opções.');
        if (step === 'nome') { W.name = $('#wName', box).value.trim(); if (W.name.length < 2) return err('Escreva o nome do negócio.'); }
        if (step === 'voce') { W.owner = $('#wOwner', box).value.trim(); if (!W.owner) return err('Escreva seu nome.'); }
        if (step === 'whats') {
          W.wa = $('#wWa', box).value.trim();
          const d = W.wa.replace(/\D/g, '');
          if (d && (d.length < 10 || d.length > 13)) return err('Confira o número, com DDD. Ou toque em "Pular".');
        }
        if (step !== 'pronto') { W.i++; return render(); }
        await busy($('button[type=submit]', form), () => finishOnboarding(W));
      };
    };
    render();
  }

  async function finishOnboarding(W) {
    const id = crypto.randomUUID();
    must(await sb.from('businesses').insert({
      id, owner_id: S.session.user.id, name: W.name.slice(0, 80), kind: W.kind,
      health_business: !!KINDS[W.kind].health, owner_whatsapp: phoneDigits(W.wa),
      theme: STYLES[W.theme] ? W.theme : 'entre', owner_name: W.owner.slice(0, 60),
    }));
    const person = must(await sb.from('staff').insert({ business_id: id, name: W.owner.slice(0, 60) }).select().single());
    must(await sb.from('opening_hours').insert(HOURS_PRESETS[W.hours].rows.map(([w, o, c]) => ({ business_id: id, weekday: w, opens: o, closes: c }))));
    const svcs = must(await sb.from('services').insert(KINDS[W.kind].services.map(([name, dur, ret]) => ({
      business_id: id, name, duration_min: dur, return_days: ret, price_cents: null, active: false,
    }))).select('id'));
    if (svcs.length) must(await sb.from('staff_services').insert(svcs.map((s) => ({ staff_id: person.id, service_id: s.id }))));
    // Imagens só sobem agora (a pasta é do negócio, que acabou de nascer). Se falhar, o negócio já existe: dá para subir depois.
    let imgFail = false;
    for (const [kind, col] of [['logo', 'logo_url'], ['cover', 'cover_url']]) {
      if (!W[kind]) continue;
      try {
        const u = await uploadBrandImage(kind, W[kind], id);
        must(await sb.from('businesses').update({ [col]: u }).eq('id', id));
      } catch (e) { console.error(e); imgFail = true; }
    }
    store.set('biz', id);
    S.tab = 'inicio';
    await start();
    if (imgFail) toast('Tudo criado, mas uma imagem não subiu. Tente de novo em Ajustes › Aparência.', 'warn');
    else toast('Pronto! Agora ative seus serviços e coloque os preços.', 'ok');
  }

  // ------------------------------------------------------------------ navegação
  const VIEWS = {};
  let rendering = null;
  let goSeq = 0;
  // Com internet lenta, uma tela antiga podia terminar de carregar depois da nova e aparecer por cima.
  // Cada tela confere `stale(opts)` antes de desenhar: só a última pedida desenha.
  const stale = (opts) => !!opts?.alive && !opts.alive();
  async function go(tab, opts = {}) {
    const seq = ++goSeq;
    opts.alive = () => seq === goSeq;
    S.tab = tab;
    if (tab !== 'conversas') S.conv = null;
    // Saiu de Ajustes sem salvar o estilo? Volta para o estilo salvo.
    if (tab !== 'ajustes' && S.biz) { S.previewStyle = null; applyStyle(S.biz.theme); }
    $$('.tabs button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
    const view = $('#view');
    view.classList.toggle('enter', !opts.quiet);
    if (!opts.quiet) { view.innerHTML = '<div class="loading">Carregando…</div>'; window.scrollTo(0, 0); }
    const run = (rendering = VIEWS[tab](opts));
    try { await run; } catch (err) {
      fatal(err);
      if (rendering === run && !opts.quiet) view.innerHTML = `<div class="empty">Não consegui carregar. <button class="btn small" id="retry">Tentar de novo</button></div>`;
      $('#retry')?.addEventListener('click', () => go(tab));
    }
    refreshBadges();
  }
  $$('.tabs button').forEach((b) => { b.onclick = () => go(b.dataset.tab); });

  async function refreshBadges() {
    if (!S.biz) return;
    const [p, c] = await Promise.all([
      sb.from('bookings').select('id', { count: 'exact', head: true }).eq('business_id', S.biz.id).eq('status', 'pending').gte('starts_at', new Date().toISOString()),
      sb.from('conversations').select('id', { count: 'exact', head: true }).eq('business_id', S.biz.id).eq('needs_human', true),
    ]);
    const set = (id, n) => { const el = $('#' + id); el.hidden = !n; el.textContent = n > 9 ? '9+' : String(n || ''); };
    set('badgeInicio', p.count || 0);
    set('badgeConversas', c.count || 0);
  }

  // Atualiza sozinho a cada 30 s (se a pessoa não estiver digitando nem com uma janela aberta)
  setInterval(() => {
    if (!S.biz || document.hidden || $('#sheet').open || $('#main').hidden) return;
    const a = document.activeElement;
    if (a && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) return;
    if ($('#composer textarea')?.value) return;
    if (['inicio', 'agenda', 'conversas'].includes(S.tab)) go(S.tab, { quiet: true, keepScroll: true });
    else refreshBadges();
  }, POLL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || !S.biz || $('#sheet').open || !['inicio', 'agenda', 'conversas'].includes(S.tab)) return;
    // Não redesenha no meio de uma resposta sendo escrita (o cursor sumia do campo).
    if ($('#composer textarea')?.value || /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '')) return;
    go(S.tab, { quiet: true, keepScroll: true });
  });

  // ------------------------------------------------------------------ agendamentos (comum)
  function bookingName(b) {
    if (b.status === 'block') return b.note || 'Horário bloqueado';
    return b.client_name || clientLabel(b.clients);
  }
  function bookingRow(b, { showDay = false } = {}) {
    S.bk.set(b.id, b);
    const p = partsOf(b.starts_at), e = partsOf(b.ends_at);
    const [lab, cls] = STATUS[b.status] || ['', ''];
    const sub = [b.status === 'block' ? (b.staff_id ? staffName(b.staff_id) : 'Todos') : svcName(b.service_id), b.status === 'block' ? '' : staffName(b.staff_id)].filter(Boolean).join(' · ');
    return `<button type="button" class="row booking st-${b.status}" data-booking="${b.id}">
      <span class="time"><b>${p.time}</b><small>${e.time}</small></span>
      <span class="grow"><b>${esc(bookingName(b))}</b><small>${esc(sub)}${showDay ? ' · ' + relDay(p.date) : ''}</small></span>
      <span class="chip ${cls}">${lab}</span></button>`;
  }
  function bindBookingRows(root) { $$('[data-booking]', root).forEach((el) => { el.onclick = () => openBooking(el.dataset.booking); }); }

  async function decide(id, status) {
    const { data, error } = await sb.functions.invoke('enviar', { body: { agendamento_id: id, status } });
    if (error) {
      let msg = 'Não deu certo. Tente de novo.';
      try { msg = (await error.context.json()).erro || msg; } catch { /* sem detalhe */ }
      throw new Error(msg);
    }
    const okMsg = status === 'confirmed' ? 'Confirmado' : 'Cancelado';
    if (data?.avisada) toast(`${okMsg} e a cliente foi avisada no WhatsApp ✅`, 'ok');
    else toast(`${okMsg}. A cliente NÃO foi avisada pelo WhatsApp${data?.aviso ? ': ' + data.aviso : '.'}`, 'warn');
  }

  function openBooking(id) {
    const b = S.bk.get(id);
    if (!b) return;
    const p = partsOf(b.starts_at), e = partsOf(b.ends_at);
    const past = new Date(b.starts_at) < new Date();
    const phone = b.clients?.phone;
    const [lab, cls] = STATUS[b.status];
    const rows = [
      b.status !== 'block' && ['Cliente', esc(bookingName(b))],
      phone && ['WhatsApp', `<a href="${waLink(phone)}" target="_blank" rel="noopener">${esc(phoneText(phone))}</a>`],
      b.service_id && ['Serviço', esc(svcName(b.service_id))],
      ['Profissional', esc(staffName(b.staff_id) || (b.status === 'block' ? 'Todos' : '—'))],
      ['Quando', `${esc(WD[weekdayOf(p.date)])}, ${p.date.slice(8, 10)}/${p.date.slice(5, 7)} · ${p.time}–${e.time}`],
      b.status !== 'block' && ['Valor', esc(brl(b.price_cents))],
      ['Situação', `<span class="chip ${cls}">${lab}</span>`],
      b.note && ['Observação', esc(b.note)],
      ['Criado por', b.created_by === 'assistant' ? 'Secretária (WhatsApp)' : 'Você'],
    ].filter(Boolean);
    const acts = [];
    if (b.status === 'pending') acts.push(['confirmed', 'Confirmar e avisar', 'primary'], ['cancelled', 'Recusar e avisar', 'danger']);
    if (b.status === 'confirmed') {
      if (past) acts.push(['done', 'Foi atendida', 'primary'], ['noshow', 'Faltou', '']);
      acts.push(['cancelled', b.client_id && !past ? 'Cancelar e avisar' : 'Cancelar', 'danger']);
    }
    if ((b.status === 'done' || b.status === 'noshow')) acts.push(['confirmed-back', 'Desfazer', '']);
    if (b.status === 'block') acts.push(['unblock', 'Remover bloqueio', 'danger']);
    if (b.client_id) acts.push(['conversa', 'Abrir conversa', 'ghost']);
    const form = sheet(b.status === 'block' ? 'Bloqueio' : 'Agendamento', `<dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="stack">${acts.map(([a, t, c]) => `<button type="button" class="btn block ${c}" data-act="${a}">${t}</button>`).join('')}</div>`);
    $$('[data-act]', form).forEach((btn) => {
      btn.onclick = () => busy(btn, async () => {
        const a = btn.dataset.act;
        if (a === 'conversa') {
          const conv = must(await sb.from('conversations').select('id').eq('business_id', S.biz.id).eq('client_id', b.client_id).maybeSingle());
          closeSheet();
          if (!conv) return toast('Essa cliente ainda não tem conversa.', 'warn');
          S.conv = conv.id; return go('conversas');
        }
        if (a === 'confirmed' || (a === 'cancelled' && b.client_id && !past)) {
          if (a === 'cancelled' && !confirm('Cancelar este horário e avisar a cliente no WhatsApp?')) return;
          await decide(b.id, a);
        } else if (a === 'unblock') {
          must(await sb.from('bookings').delete().eq('id', b.id));
          toast('Bloqueio removido.', 'ok');
        } else {
          const st = a === 'confirmed-back' ? 'confirmed' : a;
          if (st === 'cancelled' && !confirm('Cancelar este horário?')) return;
          must(await sb.from('bookings').update({ status: st }).eq('id', b.id));
          toast('Pronto.', 'ok');
        }
        closeSheet();
        go(S.tab, { quiet: true });
      });
    });
  }

  // ------------------------------------------------------------------ Início
  function checklist() {
    const act = S.services.filter((s) => s.active);
    const activeStaff = S.staff.filter((p) => p.active);
    return [
      [act.length > 0, 'Ativar seus serviços com preço e duração', 'servicos'],
      [activeStaff.length > 0, 'Cadastrar quem atende (pode ser só você)', 'equipe'],
      [act.length > 0 && act.every((s) => S.links.some((l) => l.service_id === s.id && activeStaff.some((p) => p.id === l.staff_id))), 'Dizer quem faz cada serviço', 'servicos'],
      [S.hours.length > 0, 'Definir os horários de funcionamento', 'horarios'],
      [!!S.biz.owner_whatsapp, 'Informar seu WhatsApp para receber avisos', 'negocio'],
      [!!S.biz.wa_phone_number_id, 'Conectar o WhatsApp do negócio (a equipe Entre faz com você)', 'whatsapp'],
    ];
  }

  VIEWS.inicio = async (opts = {}) => {
    const id = S.biz.id, t = today();
    const [pend, hoje, convs] = await Promise.all([
      sb.from('bookings').select(BOOK_SEL).eq('business_id', id).eq('status', 'pending').gte('starts_at', new Date().toISOString()).order('starts_at').limit(50),
      sb.from('bookings').select(BOOK_SEL).eq('business_id', id).gte('starts_at', dayStartIso(t)).lt('starts_at', dayStartIso(addDays(t, 1))).in('status', ['pending', 'confirmed', 'done', 'noshow', 'block']).order('starts_at'),
      sb.from('conversations').select('id, last_message_at, clients(name, phone, username)').eq('business_id', id).eq('needs_human', true).order('last_message_at', { ascending: false }).limit(20),
    ]);
    const P = must(pend), H = must(hoje), C = must(convs);
    const list = checklist();
    const done = list.filter((x) => x[0]).length;
    const hojeAtend = H.filter((b) => b.status !== 'block');
    const total = hojeAtend.filter((b) => b.status !== 'noshow').reduce((s, b) => s + (b.price_cents || 0), 0);
    const hr = Number(localParts(new Date(), tz()).time.slice(0, 2));
    const hello = hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';

    const who = firstName(S.biz.owner_name);
    const dateLong = (() => { const p = localParts(new Date(), tz()); return `${WD[p.weekday]}, ${Number(p.date.slice(8, 10))} de ${MONTHS[Number(p.date.slice(5, 7)) - 1]}`; })();
    let html = S.biz.cover_url ? `<div class="cover"><img alt="" src="${esc(S.biz.cover_url)}"></div>` : '';
    html += `<div class="greet"><h2>${hello}${who ? ', ' + esc(who) : ''}.</h2>
      <p>${esc(dateLong)} · ${hojeAtend.length ? `${hojeAtend.length} atendimento${hojeAtend.length > 1 ? 's' : ''} hoje` : 'nenhum atendimento hoje até agora'}</p></div>`;
    html += `<div class="stats">
      <div><b>${P.length}</b><small>para confirmar</small></div>
      <div><b>${C.length}</b><small>conversas esperando você</small></div>
      <div><b>${total % 100 === 0 ? 'R$ ' + (total / 100).toLocaleString('pt-BR') : esc(brl(total))}</b><small>previsto hoje</small></div>
    </div>`;
    if (done < list.length) {
      html += `<section class="card checklist"><h3>Para a secretária funcionar <span class="muted">${done}/${list.length}</span></h3>
        <div class="progress"><i style="width:${Math.round((done / list.length) * 100)}%"></i></div>
        ${list.map(([ok, txt, sec]) => `<button type="button" class="check ${ok ? 'ok' : ''}" data-goto="${sec}"><i>${ok ? '✓' : ''}</i><span>${esc(txt)}</span>${ok ? '' : '<b>›</b>'}</button>`).join('')}
      </section>`;
    }
    if (!S.biz.assistant_enabled) html += `<div class="banner warn">A secretária está <b>desligada</b>: ninguém está respondendo automaticamente. Toque no botão lá em cima para ligar.</div>`;
    html += `<section class="card"><h3>Pedidos para confirmar ${P.length ? `<span class="count">${P.length}</span>` : ''}</h3>
      ${P.length ? P.map((b) => { S.bk.set(b.id, b); return `<div class="pend">
          <button type="button" class="pend-info" data-booking="${b.id}"><b>${esc(bookingName(b))}</b>
          <small>${esc(svcName(b.service_id))}${staffName(b.staff_id) ? ' com ' + esc(staffName(b.staff_id)) : ''} · ${esc(whenLabel(b.starts_at))}</small></button>
          <div class="actions"><button type="button" class="btn small primary" data-decide="confirmed" data-id="${b.id}">Confirmar</button>
          <button type="button" class="btn small ghost" data-decide="cancelled" data-id="${b.id}">Recusar</button></div></div>`; }).join('')
        : '<p class="muted">Nenhum pedido esperando. Quando a secretária marcar algo pelo WhatsApp, aparece aqui.</p>'}
    </section>`;
    if (C.length) {
      html += `<section class="card"><h3>Conversas que precisam de você <span class="count">${C.length}</span></h3>
        ${C.map((c) => `<button type="button" class="row" data-conv="${c.id}"><span class="avatar">${esc(initials(clientLabel(c.clients)))}</span>
          <span class="grow"><b>${esc(clientLabel(c.clients))}</b><small>${esc(ago(c.last_message_at))}</small></span><b class="go">›</b></button>`).join('')}
      </section>`;
    }
    html += `<section class="card"><h3>Hoje, ${esc(dayLabel(t))}</h3>
      ${H.length ? `<div class="list">${H.map((b) => bookingRow(b)).join('')}</div>` : '<p class="muted">Agenda livre hoje.</p>'}
      <button type="button" class="btn ghost block" id="toAgenda">Ver agenda completa</button></section>`;

    if (stale(opts)) return;
    const v = $('#view');
    v.innerHTML = html;
    bindBookingRows(v);
    $$('[data-goto]', v).forEach((b) => { b.onclick = () => go('ajustes', { open: b.dataset.goto }); });
    $$('[data-conv]', v).forEach((b) => { b.onclick = () => { S.conv = b.dataset.conv; go('conversas'); }; });
    $('#toAgenda').onclick = () => go('agenda');
    $$('[data-decide]', v).forEach((btn) => {
      btn.onclick = () => busy(btn, async () => {
        if (btn.dataset.decide === 'cancelled' && !confirm('Recusar este pedido? A cliente recebe uma mensagem pedindo para escolher outro horário.')) return;
        await decide(btn.dataset.id, btn.dataset.decide);
        go('inicio', { quiet: true });
      });
    });
  };

  // ------------------------------------------------------------------ Agenda
  VIEWS.agenda = async (opts = {}) => {
    const d = S.day || today();
    const start = addDays(d, -weekdayOf(d)); // domingo da semana
    const end = addDays(start, 7);
    const rows = must(await sb.from('bookings').select(BOOK_SEL).eq('business_id', S.biz.id)
      .gte('starts_at', dayStartIso(start)).lt('starts_at', dayStartIso(end)).neq('status', 'cancelled').order('starts_at'));
    const byDay = {};
    rows.forEach((b) => { (byDay[partsOf(b.starts_at).date] ||= []).push(b); });
    const t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const list = byDay[d] || [];
    const open = S.hours.filter((h) => h.weekday === weekdayOf(d)).sort((a, b) => a.opens.localeCompare(b.opens));
    const m = Number(d.slice(5, 7)) - 1;

    if (stale(opts)) return;
    $('#view').innerHTML = `<div class="agenda-head">
        <button type="button" class="icon-btn" id="prevW" aria-label="Semana anterior">‹</button>
        <b>${MONTHS[m]} ${d.slice(0, 4)}</b>
        <button type="button" class="icon-btn" id="nextW" aria-label="Próxima semana">›</button>
        ${d !== t ? '<button type="button" class="btn small ghost" id="todayBtn">Hoje</button>' : ''}
      </div>
      <div class="week">${days.map((x) => {
        const n = (byDay[x] || []).filter((b) => b.status !== 'block').length;
        const closed = !S.hours.some((h) => h.weekday === weekdayOf(x));
        return `<button type="button" data-day="${x}" class="${x === d ? 'sel' : ''} ${x === t ? 'today' : ''} ${closed ? 'closed' : ''}">
          <small>${WDS[weekdayOf(x)]}</small><b>${x.slice(8, 10)}</b><i>${n ? n : ''}</i></button>`;
      }).join('')}</div>
      <section class="card">
        <h3>${esc(WD[weekdayOf(d)])}, ${d.slice(8, 10)}/${d.slice(5, 7)} <span class="muted small">${open.length ? open.map((h) => `${h.opens.slice(0, 5)}–${h.closes.slice(0, 5)}`).join(' e ') : 'fechado'}</span></h3>
        ${list.length ? `<div class="list">${list.map((b) => bookingRow(b)).join('')}</div>` : `<p class="muted">${open.length ? 'Nenhum horário marcado neste dia.' : 'Fechado neste dia.'}</p>`}
      </section>
      <div class="fab-row"><button type="button" class="btn primary" id="newBk">+ Marcar horário</button><button type="button" class="btn ghost" id="newBlock">Bloquear horário</button></div>`;
    const v = $('#view');
    bindBookingRows(v);
    $$('[data-day]', v).forEach((b) => { b.onclick = () => { S.day = b.dataset.day; go('agenda', { quiet: true }); }; });
    $('#prevW').onclick = () => { S.day = addDays(d, -7); go('agenda', { quiet: true }); };
    $('#nextW').onclick = () => { S.day = addDays(d, 7); go('agenda', { quiet: true }); };
    $('#todayBtn')?.addEventListener('click', () => { S.day = t; go('agenda', { quiet: true }); });
    $('#newBk').onclick = () => newBooking(d);
    $('#newBlock').onclick = () => newBlock(d);
  };

  async function busyOn(date) {
    return must(await sb.from('bookings').select('staff_id, starts_at, ends_at').eq('business_id', S.biz.id)
      .in('status', ['pending', 'confirmed', 'block']).lt('starts_at', dayStartIso(addDays(date, 1))).gt('ends_at', dayStartIso(date)));
  }
  const staffFor = (serviceId) => S.links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id).filter((sid) => S.staff.some((p) => p.id === sid && p.active));

  function newBooking(date) {
    const act = S.services.filter((s) => s.active);
    if (!act.length) { toast('Ative pelo menos um serviço em Ajustes primeiro.', 'warn'); return go('ajustes', { open: 'servicos' }); }
    const form = sheet('Marcar horário', `
      <label>Serviço<select name="service">${act.map((s) => `<option value="${s.id}">${esc(s.name)} · ${s.duration_min} min · ${esc(brl(s.price_cents))}</option>`).join('')}</select></label>
      <label>Com quem<select name="staff"></select></label>
      <label>Dia<input type="date" name="date" value="${date}" required></label>
      <label>Horário<select name="slot"></select></label>
      <label class="other-time" hidden>Outro horário (encaixe)<input type="time" name="time" step="300"></label>
      <p class="hint" id="slotHint"></p>
      <label>Nome da cliente<input name="name" required maxlength="80"></label>
      <label>WhatsApp da cliente (opcional)<input name="phone" inputmode="tel" placeholder="(11) 91234-5678"></label>
      <label>Observação (opcional)<input name="note" maxlength="200"></label>`, { submitText: 'Marcar', onSubmit: async (f) => {
      const svc = S.services.find((s) => s.id === f.get('service'));
      const chosenStaff = f.get('staff') || null;
      const day = String(f.get('date'));
      let time, staffId;
      if (f.get('slot') === 'outro') {
        time = String(f.get('time') || '');
        if (!/^\d{2}:\d{2}$/.test(time)) throw new Error('Escolha o horário do encaixe.');
        staffId = chosenStaff || staffFor(svc.id)[0] || null;
        // Sem profissional, o horário travaria a agenda de todo mundo (vira um bloqueio geral).
        if (!staffId) throw new Error('Ninguém está marcado para fazer esse serviço. Ajuste em Ajustes › Serviços.');
      } else {
        const slot = form._slots.find((s) => s.time === f.get('slot'));
        if (!slot) throw new Error('Escolha um horário.');
        time = slot.time;
        staffId = chosenStaff || slot.staffIds[0];
      }
      const starts = localToUtc(day, time, tz());
      const ends = new Date(starts.getTime() + svc.duration_min * MIN);
      const name = String(f.get('name')).trim();
      let clientId = null;
      const phone = phoneDigits(f.get('phone'));
      if (phone) {
        const found = must(await sb.from('clients').select('id, name').eq('business_id', S.biz.id).in('phone', phoneVariants(phone)).order('created_at').limit(1).maybeSingle());
        clientId = found?.id || must(await sb.from('clients').insert({ business_id: S.biz.id, phone, name }).select('id').single()).id;
        if (found && !found.name) await sb.from('clients').update({ name }).eq('id', found.id);
      }
      must(await sb.from('bookings').insert({
        business_id: S.biz.id, client_id: clientId, service_id: svc.id, staff_id: staffId,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(), status: 'confirmed',
        client_name: name, price_cents: svc.price_cents, note: String(f.get('note') || '').trim(), created_by: 'owner',
      }));
      toast('Horário marcado ✅', 'ok');
      S.day = day;
      go('agenda', { quiet: true });
    } });

    form._slots = [];
    let fillSeq = 0;
    const fill = async () => {
      const seq = ++fillSeq; // se a pessoa trocar de dia/serviço rápido, só a última consulta vale
      const svc = S.services.find((s) => s.id === form.service.value);
      const ids = staffFor(svc.id);
      const prevStaff = form.staff.value;
      form.staff.innerHTML = `<option value="">Qualquer pessoa disponível</option>` + ids.map((sid) => `<option value="${sid}">${esc(staffName(sid))}</option>`).join('');
      if (ids.includes(prevStaff)) form.staff.value = prevStaff;
      const day = form.date.value;
      const hint = $('#slotHint', form);
      if (!day) return;
      form.slot.innerHTML = '<option>Carregando…</option>';
      const staffIds = form.staff.value ? [form.staff.value] : ids;
      const busyRows = await busyOn(day);
      if (seq !== fillSeq) return;
      const slots = freeSlots({
        date: day, tz: tz(), durationMin: svc.duration_min, slotMinutes: S.biz.slot_minutes,
        hours: S.hours.filter((h) => h.weekday === weekdayOf(day)), busy: busyRows, staffIds, now: new Date(),
      });
      form._slots = slots;
      form.slot.innerHTML = slots.map((s) => `<option value="${s.time}">${s.time}${form.staff.value ? '' : ' · ' + esc(s.staffIds.map(staffName).join(', '))}</option>`).join('') + '<option value="outro">Outro horário (encaixe)…</option>';
      hint.textContent = !ids.length ? 'Ninguém está marcado para fazer esse serviço (Ajustes › Serviços).' : slots.length ? `${slots.length} horário${slots.length > 1 ? 's' : ''} livre${slots.length > 1 ? 's' : ''}.` : 'Sem horário livre neste dia. Use "encaixe" se quiser marcar assim mesmo.';
      if (!slots.length) form.slot.value = 'outro';
      $('.other-time', form).hidden = form.slot.value !== 'outro';
    };
    form.service.onchange = fill; form.staff.onchange = fill; form.date.onchange = fill;
    form.slot.onchange = () => { $('.other-time', form).hidden = form.slot.value !== 'outro'; };
    fill().catch(fatal);
  }

  function newBlock(date) {
    sheet('Bloquear horário', `
      <p class="hint">A secretária não oferece horários bloqueados. Use para almoço, folga, compromisso…</p>
      <label>Dia<input type="date" name="date" value="${date}" required></label>
      <div class="two"><label>Das<input type="time" name="from" value="12:00" required></label><label>Até<input type="time" name="to" value="13:00" required></label></div>
      <label>Para quem<select name="staff"><option value="">Todo o negócio</option>${S.staff.filter((p) => p.active).map((p) => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
      <label>Motivo (só você vê)<input name="note" maxlength="80" placeholder="Ex.: almoço"></label>`, { submitText: 'Bloquear', onSubmit: async (f) => {
      const day = String(f.get('date'));
      const from = String(f.get('from')), to = String(f.get('to'));
      if (to <= from) throw new Error('O fim precisa ser depois do início.');
      must(await sb.from('bookings').insert({
        business_id: S.biz.id, staff_id: f.get('staff') || null, status: 'block', created_by: 'owner',
        starts_at: localToUtc(day, from, tz()).toISOString(), ends_at: localToUtc(day, to, tz()).toISOString(),
        note: String(f.get('note') || '').trim() || 'Bloqueado',
      }));
      toast('Horário bloqueado.', 'ok');
      S.day = day;
      go('agenda', { quiet: true });
    } });
  }

  // ------------------------------------------------------------------ Conversas
  VIEWS.conversas = async (opts = {}) => (S.conv ? viewThread(opts) : viewConvList(opts));

  async function viewConvList(opts = {}) {
    const id = S.biz.id;
    const [cv, ms] = await Promise.all([
      sb.from('conversations').select('id, needs_human, paused_until, last_message_at, clients(name, phone, username)').eq('business_id', id).order('last_message_at', { ascending: false }).limit(100),
      sb.from('messages').select('conversation_id, author, body, created_at').eq('business_id', id).order('created_at', { ascending: false }).limit(500),
    ]);
    const convs = must(cv);
    const last = {};
    must(ms).forEach((m) => { if (!last[m.conversation_id]) last[m.conversation_id] = m; });
    const need = convs.filter((c) => c.needs_human).length;
    const shown = S.convFilter === 'ajuda' ? convs.filter((c) => c.needs_human) : convs;
    const who = { client: '', assistant: 'Secretária: ', owner: 'Você: ' };
    if (stale(opts)) return;
    $('#view').innerHTML = `<div class="seg">
        <button type="button" data-f="todas" class="${S.convFilter === 'todas' ? 'sel' : ''}">Todas</button>
        <button type="button" data-f="ajuda" class="${S.convFilter === 'ajuda' ? 'sel' : ''}">Precisam de você${need ? ` (${need})` : ''}</button>
      </div>
      ${shown.length ? `<div class="card list flush">${shown.map((c) => {
        const m = last[c.id];
        const paused = c.paused_until && new Date(c.paused_until) > new Date();
        return `<button type="button" class="row conv ${c.needs_human ? 'need' : ''}" data-conv="${c.id}">
          <span class="avatar">${esc(initials(clientLabel(c.clients)))}</span>
          <span class="grow"><b>${esc(clientLabel(c.clients))}</b><small>${m ? esc((who[m.author] + m.body).slice(0, 90)) : ''}</small></span>
          <span class="meta"><small>${esc(ago(c.last_message_at))}</small>${c.needs_human ? '<i class="chip warn">Você</i>' : paused ? '<i class="chip muted">Pausada</i>' : ''}</span></button>`;
      }).join('')}</div>` : `<div class="empty">${S.convFilter === 'ajuda' ? 'Nenhuma conversa esperando você. 🎉' : 'Ainda não há conversas. Quando uma cliente mandar mensagem no WhatsApp do negócio, ela aparece aqui.'}</div>`}`;
    $$('[data-f]').forEach((b) => { b.onclick = () => { S.convFilter = b.dataset.f; go('conversas', { quiet: true }); }; });
    $$('[data-conv]').forEach((b) => { b.onclick = () => { S.conv = b.dataset.conv; go('conversas'); }; });
  }

  // Erros comuns da Meta em português
  function sendErrorText(e) {
    const s = String(e);
    if (s.includes('131047')) return 'Passou de 24 h desde a última mensagem da cliente; o WhatsApp bloqueia.';
    if (s.includes('131026')) return 'Esse número não recebe mensagens (pode não ter WhatsApp).';
    if (s.includes('131056')) return 'Muitas mensagens seguidas para essa pessoa. Espere um pouco.';
    if (s.includes('131031')) return 'A conta do WhatsApp do negócio está bloqueada ou restrita pela Meta. Avise a equipe Entre.';
    if (/^(190|10|200)\b/.test(s)) return 'Problema na conexão com o WhatsApp. Avise a equipe Entre.';
    return s;
  }

  async function viewThread(opts = {}) {
    const [cv, ms] = await Promise.all([
      sb.from('conversations').select('id, client_id, needs_human, paused_until, clients(name, phone, username)').eq('id', S.conv).single(),
      sb.from('messages').select('id, author, body, created_at, send_error').eq('conversation_id', S.conv).order('created_at', { ascending: false }).limit(200),
    ]);
    const c = must(cv);
    const msgs = must(ms).reverse();
    const paused = c.paused_until && new Date(c.paused_until) > new Date();
    const lastClient = [...msgs].reverse().find((m) => m.author === 'client');
    const expired = !lastClient || Date.now() - new Date(lastClient.created_at).getTime() > 24 * 3600e3;
    const phone = c.clients?.phone;
    const label = { client: '', assistant: 'Secretária', owner: 'Você' };
    let lastDay = '';
    const bubbles = msgs.map((m) => {
      const p = partsOf(m.created_at);
      const sep = p.date !== lastDay ? `<div class="day-sep">${esc(relDay(p.date))}</div>` : '';
      lastDay = p.date;
      return `${sep}<div class="msg ${m.author}">${label[m.author] ? `<small class="who">${label[m.author]}</small>` : ''}<p>${esc(m.body)}</p>
        <small class="at">${p.time}${m.send_error ? ' · <b class="err">não entregue</b>' : ''}</small>${m.send_error ? `<small class="err">${esc(sendErrorText(m.send_error))}</small>` : ''}</div>`;
    }).join('');

    if (stale(opts)) return;
    const draft = $('#composer textarea')?.value || '';
    $('#view').innerHTML = `<div class="thread-head">
        <button type="button" class="icon-btn" id="back" aria-label="Voltar">‹</button>
        <span class="avatar">${esc(initials(clientLabel(c.clients)))}</span>
        <span class="grow"><b>${esc(clientLabel(c.clients))}</b><small>${phone ? `<a href="${waLink(phone)}" target="_blank" rel="noopener">${esc(phoneText(phone))}</a>` : ''}</small></span>
      </div>
      <div class="thread-tools">
        ${c.needs_human ? '<div class="banner warn">A secretária pediu sua ajuda nesta conversa. <button type="button" class="btn small" id="resolve">Resolvido</button></div>' : ''}
        ${paused ? `<div class="banner">Secretária em silêncio aqui até ${esc(whenLabel(c.paused_until))}. <button type="button" class="btn small" id="resume">Devolver para a secretária</button></div>`
          : '<button type="button" class="btn small ghost" id="pause">Assumir esta conversa (secretária fica quieta 12 h)</button>'}
      </div>
      <div class="thread" id="thread">${bubbles || '<p class="muted center">Sem mensagens.</p>'}</div>
      <form id="composer" class="composer">
        ${expired ? `<p class="hint">Passaram 24 h desde a última mensagem da cliente: o WhatsApp não deixa responder por aqui. ${phone ? `<a href="${waLink(phone)}" target="_blank" rel="noopener">Chamar pelo seu WhatsApp</a>` : ''}</p>` : ''}
        <div class="compose-row"><textarea name="texto" rows="1" maxlength="4000" placeholder="Escreva sua resposta…">${esc(draft)}</textarea>
        <button type="submit" class="btn primary">Enviar</button></div>
        <small class="hint">Quando você responde, a secretária fica em silêncio nesta conversa por 12 h.</small>
      </form>`;
    if (!opts.keepScroll) $('#thread').lastElementChild?.scrollIntoView?.({ block: 'end' });
    $('#back').onclick = () => { S.conv = null; go('conversas'); };
    const upd = async (patch, msg) => { must(await sb.from('conversations').update(patch).eq('id', c.id)); toast(msg, 'ok'); go('conversas', { quiet: true }); };
    $('#resolve')?.addEventListener('click', (e) => busy(e.target, () => upd({ needs_human: false }, 'Marcado como resolvido.')));
    $('#resume')?.addEventListener('click', (e) => busy(e.target, () => upd({ paused_until: null }, 'A secretária voltou a responder aqui.')));
    $('#pause')?.addEventListener('click', (e) => busy(e.target, () => upd({ paused_until: new Date(Date.now() + 12 * 3600e3).toISOString() }, 'Você assumiu. A secretária fica quieta por 12 h.')));
    const ta = $('#composer textarea');
    ta.oninput = () => { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; };
    $('#composer').onsubmit = async (e) => {
      e.preventDefault();
      const texto = ta.value.trim();
      if (!texto) return;
      await busy($('#composer button[type=submit]'), async () => {
        const { error } = await sb.functions.invoke('enviar', { body: { conversa_id: c.id, texto } });
        if (error) {
          let msg = 'Não consegui enviar.';
          try { msg = (await error.context.json()).erro || msg; } catch { /* sem detalhe */ }
          throw new Error(msg);
        }
        ta.value = '';
        await go('conversas', { quiet: true });
      });
    };
  }

  // ------------------------------------------------------------------ Clientes
  VIEWS.clientes = async (opts = {}) => {
    const id = S.biz.id;
    const [cl, bk] = await Promise.all([
      sb.from('clients').select('id, name, phone, username, created_at').eq('business_id', id).order('name').limit(2000),
      sb.from('bookings').select('client_id, starts_at, status, service_id').eq('business_id', id).not('client_id', 'is', null).in('status', ['pending', 'confirmed', 'done', 'noshow']).order('starts_at').limit(5000),
    ]);
    const clients = must(cl), books = must(bk);
    const now = new Date(), t = today();
    const info = new Map(clients.map((c) => [c.id, { visits: 0, noshow: 0, last: null, next: null }]));
    for (const b of books) {
      const x = info.get(b.client_id);
      if (!x) continue;
      const past = new Date(b.starts_at) < now;
      if (b.status === 'noshow') x.noshow++;
      else if (past && (b.status === 'done' || b.status === 'confirmed')) { x.visits++; x.last = b; } else if (!past && !x.next) x.next = b;
    }
    const due = clients.map((c) => {
      const x = info.get(c.id);
      const svc = x.last && S.services.find((s) => s.id === x.last.service_id);
      if (!svc?.return_days || x.next || !c.phone) return null;
      const lastDay = partsOf(x.last.starts_at).date;
      const days = daysBetween(lastDay, t);
      return days >= svc.return_days ? { c, svc, days } : null;
    }).filter(Boolean).sort((a, b) => b.days - a.days);
    S.clientCache = { clients, info, books };

    const q = S.clientQuery.toLowerCase();
    const qd = q.replace(/\D/g, '');
    const shown = clients.filter((c) => !q || (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q) || (qd && (c.phone || '').includes(qd)));
    const msgFor = ({ c, svc, days }) => `Oi${c.name ? ', ' + firstName(c.name) : ''}! Tudo bem? Aqui é do ${S.biz.name} 😊 Já faz ${days} dias do seu último ${svc.name.toLowerCase()}. Quer que eu reserve um horário para você?`;

    if (stale(opts)) return;
    $('#view').innerHTML = `
      ${due.length ? `<section class="card"><h3>Hora de chamar de volta <span class="count">${due.length}</span></h3>
        <p class="hint">Clientes que já passaram do tempo de retorno do serviço e não têm horário marcado. O botão abre o <b>seu</b> WhatsApp com a mensagem pronta.</p>
        ${due.slice(0, 30).map((d) => `<div class="pend"><div class="pend-info"><b>${esc(clientLabel(d.c))}</b><small>${esc(d.svc.name)} há ${d.days} dias · retorno sugerido: ${d.svc.return_days} dias</small></div>
          <div class="actions"><a class="btn small primary" target="_blank" rel="noopener" href="${waLink(d.c.phone, msgFor(d))}">Chamar no WhatsApp</a></div></div>`).join('')}
      </section>` : ''}
      <label class="search"><input type="search" id="cq" placeholder="Buscar por nome ou telefone" value="${esc(S.clientQuery)}"></label>
      <p class="muted small">${clients.length} cliente${clients.length === 1 ? '' : 's'}</p>
      ${shown.length ? `<div class="card list flush">${shown.slice(0, 300).map((c) => {
        const x = info.get(c.id);
        const sub = [x.visits ? `${x.visits} visita${x.visits > 1 ? 's' : ''}` : 'nova', x.last ? 'última ' + relDay(partsOf(x.last.starts_at).date) : '', x.next ? 'próxima ' + whenLabel(x.next.starts_at) : '', x.noshow ? `${x.noshow} falta${x.noshow > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        return `<button type="button" class="row" data-client="${c.id}"><span class="avatar">${esc(initials(clientLabel(c)))}</span>
          <span class="grow"><b>${esc(clientLabel(c))}</b><small>${esc(sub)}</small></span><b class="go">›</b></button>`;
      }).join('')}</div>` : `<div class="empty">${clients.length ? 'Ninguém encontrado.' : 'As clientes aparecem aqui sozinhas quando mandam mensagem ou são marcadas.'}</div>`}`;
    const cq = $('#cq');
    cq.oninput = () => { S.clientQuery = cq.value; clearTimeout(cq.t); cq.t = setTimeout(() => S.tab === 'clientes' && go('clientes', { quiet: true }).then(() => { const n = $('#cq'); if (!n || S.tab !== 'clientes') return; n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 250); };
    $$('[data-client]').forEach((b) => { b.onclick = () => openClient(b.dataset.client); });
  };

  async function openClient(id) {
    const { clients, info } = S.clientCache;
    const c = clients.find((x) => x.id === id);
    const x = info.get(id);
    const hist = must(await sb.from('bookings').select(BOOK_SEL).eq('client_id', id).order('starts_at', { ascending: false }).limit(30));
    const conv = must(await sb.from('conversations').select('id').eq('business_id', S.biz.id).eq('client_id', id).maybeSingle());
    const form = sheet(clientLabel(c), `
      <label>Nome<input name="name" value="${esc(c.name)}" maxlength="80"></label>
      <dl class="details">
        ${c.phone ? `<dt>WhatsApp</dt><dd><a href="${waLink(c.phone)}" target="_blank" rel="noopener">${esc(phoneText(c.phone))}</a></dd>` : ''}
        ${c.username ? `<dt>Usuário</dt><dd>@${esc(c.username)}</dd>` : ''}
        <dt>Visitas</dt><dd>${x.visits}</dd><dt>Faltas</dt><dd>${x.noshow}</dd>
        <dt>Cliente desde</dt><dd>${esc(dayLabel(partsOf(c.created_at).date))}/${c.created_at.slice(0, 4)}</dd>
      </dl>
      ${conv ? '<button type="button" class="btn ghost block" id="openConv">Abrir conversa</button>' : ''}
      <h4>Histórico</h4>
      ${hist.length ? `<div class="list">${hist.map((b) => bookingRow(b, { showDay: true })).join('')}</div>` : '<p class="muted">Nenhum agendamento ainda.</p>'}`,
    { submitText: 'Salvar nome', onSubmit: async (f) => {
      must(await sb.from('clients').update({ name: String(f.get('name')).trim() }).eq('id', id));
      toast('Salvo.', 'ok');
      go('clientes', { quiet: true });
    } });
    $('#openConv', form)?.addEventListener('click', () => { closeSheet(); S.conv = conv.id; go('conversas'); });
    bindBookingRows(form);
  }

  // ------------------------------------------------------------------ Ajustes
  VIEWS.ajustes = async (opts = {}) => {
    await loadBizData();
    const b = S.biz;
    const open = (k) => (opts.open === k ? 'open' : '');
    const kindOpts = Object.entries(KINDS).map(([k, v]) => `<option value="${k}" ${b.kind === k ? 'selected' : ''}>${esc(v.label)}</option>`).join('');
    const svcRows = S.services.map((s) => {
      const who = S.links.filter((l) => l.service_id === s.id).map((l) => staffName(l.staff_id)).filter(Boolean);
      return `<button type="button" class="row ${s.active ? '' : 'inactive'}" data-svc="${s.id}"><span class="grow"><b>${esc(s.name)}</b>
        <small>${esc(brl(s.price_cents))} · ${s.duration_min} min${who.length ? ' · ' + esc(who.join(', ')) : ' · <span class="err">ninguém faz</span>'}</small></span>
        ${s.active ? '' : '<i class="chip muted">Desativado</i>'}<b class="go">›</b></button>`;
    }).join('');
    if (stale(opts)) return;
    const hoursRow = (w) => {
      const hs = S.hours.filter((h) => h.weekday === w).sort((a, c) => a.opens.localeCompare(c.opens));
      const v = (i, k) => (hs[i] ? hs[i][k].slice(0, 5) : '');
      return `<div class="hours-row" data-w="${w}">
        <label class="switch"><input type="checkbox" name="open${w}" ${hs.length ? 'checked' : ''}><span>${WD[w]}</span></label>
        <div class="ranges">
          <span><input type="time" name="a${w}" value="${v(0, 'opens') || '09:00'}"> às <input type="time" name="b${w}" value="${v(0, 'closes') || '18:00'}"></span>
          <span class="second"><input type="time" name="c${w}" value="${v(1, 'opens')}"> às <input type="time" name="d${w}" value="${v(1, 'closes')}"><small>2º turno (opcional)</small></span>
        </div></div>`;
    };

    $('#view').innerHTML = `
      ${S.bizList.length > 1 ? `<label class="card">Negócio<select id="bizSel">${S.bizList.map((x) => `<option value="${x.id}" ${x.id === b.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>` : ''}
      <details class="card" data-sec="aparencia" ${open('aparencia')}><summary>Aparência do app</summary>
        <form id="lookForm">
          <p class="hint">Toque num estilo para ver como fica. Cada um tem versão clara e escura, que troca sozinha conforme o celular.</p>
          ${stylePickerHtml(S.previewStyle || b.theme || 'entre')}
          <label>Seu nome (aparece em "Bom dia, …")<input name="owner_name" maxlength="60" value="${esc(b.owner_name || '')}" placeholder="Ex.: Ana"></label>
          <p class="label">Logo do negócio (aparece no topo)</p>
          <div class="img-pick"><span class="thumb" id="logoThumb"></span><div class="grow"><input type="file" id="logoFile" accept="image/png,image/jpeg,image/webp">
            ${b.logo_url ? '<button type="button" class="btn small ghost" id="logoDel">Tirar a logo</button>' : ''}</div></div>
          <p class="label">Foto de capa (aparece no Início)</p>
          <div class="img-pick"><span class="thumb wide" id="coverThumb"></span><div class="grow"><input type="file" id="coverFile" accept="image/png,image/jpeg,image/webp">
            ${b.cover_url ? '<button type="button" class="btn small ghost" id="coverDel">Tirar a capa</button>' : ''}</div></div>
          <button type="submit" class="btn primary block">Salvar aparência</button>
        </form>
      </details>
      <details class="card" data-sec="servicos" ${open('servicos') || (!opts.open ? 'open' : '')}><summary>Serviços e preços</summary>
        <p class="hint">A secretária só oferece serviços <b>ativos</b> e só informa os preços que estão aqui.</p>
        <div class="list">${svcRows || '<p class="muted">Nenhum serviço.</p>'}</div>
        <button type="button" class="btn ghost block" id="addSvc">+ Novo serviço</button>
      </details>
      <details class="card" data-sec="horarios" ${open('horarios')}><summary>Horário de funcionamento</summary>
        <form id="hoursForm">${WEEK_ORDER.map(hoursRow).join('')}
          <button type="submit" class="btn primary block">Salvar horários</button></form>
      </details>
      <details class="card" data-sec="equipe" ${open('equipe')}><summary>Quem atende</summary>
        <div class="list">${S.staff.map((p) => `<div class="row static ${p.active ? '' : 'inactive'}"><span class="avatar">${esc(initials(p.name))}</span>
          <span class="grow"><b>${esc(p.name)}</b><small>${S.links.filter((l) => l.staff_id === p.id).length} serviço(s)</small></span>
          <button type="button" class="btn small ghost" data-staff-edit="${p.id}">Editar</button></div>`).join('') || '<p class="muted">Ninguém cadastrado.</p>'}</div>
        <form id="addStaff" class="inline"><input name="name" placeholder="Nome de quem atende" maxlength="60" required><button class="btn" type="submit">Adicionar</button></form>
      </details>
      <details class="card" data-sec="negocio" ${open('negocio')}><summary>Dados do negócio e da secretária</summary>
        <form id="bizForm">
          <label>Nome do negócio<input name="name" value="${esc(b.name)}" required maxlength="80"></label>
          <label>Tipo<select name="kind">${kindOpts}</select></label>
          <label>Endereço<input name="address" value="${esc(b.address)}" maxlength="200" placeholder="Rua, número, bairro, cidade"></label>
          <label>Seu WhatsApp (recebe avisos de pedido novo)<input name="owner_whatsapp" inputmode="tel" value="${esc(phoneText(b.owner_whatsapp))}"></label>
          <label>Regras do negócio<textarea name="policy" rows="3" maxlength="1000" placeholder="Ex.: tolerância de 15 min de atraso; cancelamento até 2 h antes; sinal de 30% para alongamento">${esc(b.policy)}</textarea></label>
          <label>Outras informações para a secretária<textarea name="extra_info" rows="3" maxlength="1500" placeholder="Ex.: aceitamos Pix e cartão; tem estacionamento na rua; atendemos só mulheres">${esc(b.extra_info)}</textarea></label>
          <label>Jeito de falar<input name="tone" value="${esc(b.tone)}" maxlength="120"></label>
          <label class="switch"><input type="checkbox" name="auto_confirm" ${b.auto_confirm ? 'checked' : ''}><span>Confirmar automaticamente os horários marcados pela secretária</span></label>
          <p class="hint">Desligado: a secretária cria um <b>pedido</b> e você confirma aqui. Ligado: já fica confirmado.</p>
          <label class="switch"><input type="checkbox" name="health_business" ${b.health_business ? 'checked' : ''}><span>É serviço de saúde (a secretária nunca dá orientação de saúde)</span></label>
          <div class="two">
            <label>Intervalo da agenda<select name="slot_minutes">${[10, 15, 20, 30, 60].map((m) => `<option value="${m}" ${b.slot_minutes === m ? 'selected' : ''}>${m} min</option>`).join('')}</select></label>
            <label>Antecedência mínima<select name="min_notice_minutes">${[[0, 'nenhuma'], [30, '30 min'], [60, '1 h'], [120, '2 h'], [240, '4 h'], [720, '12 h'], [1440, '1 dia']].map(([m, t]) => `<option value="${m}" ${b.min_notice_minutes === m ? 'selected' : ''}>${t}</option>`).join('')}</select></label>
          </div>
          <label>Marcar com até quantos dias de antecedência<input type="number" name="days_ahead" min="1" max="180" value="${b.days_ahead}"></label>
          <button type="submit" class="btn primary block">Salvar</button>
        </form>
      </details>
      <details class="card" data-sec="whatsapp" ${open('whatsapp')}><summary>Conexão com o WhatsApp</summary>
        ${b.wa_phone_number_id ? '<p><span class="chip ok">Conectado</span> O WhatsApp do negócio está ligado à secretária.</p>'
          : '<p><span class="chip warn">Ainda não conectado</span></p><p class="hint">A equipe Entre faz essa ligação com você (leva uns 15 minutos, pelo celular). Enquanto isso, você já pode deixar serviços, preços e horários prontos.</p>'}
      </details>
      <details class="card"><summary>Minha conta</summary>
        <p class="muted">Entrou como ${esc(S.session.user.email)}</p>
        <button type="button" class="btn ghost block" id="changePass">Trocar minha senha</button>
        <button type="button" class="btn ghost block" id="logout">Sair</button>
      </details>
      <p class="muted small center">Entre · painel versão 1</p>`;

    const v = $('#view');
    if (opts.open) v.querySelector(`[data-sec="${opts.open}"]`)?.scrollIntoView({ block: 'start' });
    $('#bizSel')?.addEventListener('change', async (e) => {
      S.biz = S.bizList.find((x) => x.id === e.target.value);
      store.set('biz', S.biz.id);
      await loadBizData(); renderTop(); go('inicio');
    });
    // ---- Aparência: prévia ao vivo; só fica salvo ao tocar em "Salvar aparência"
    const look = $('#lookForm');
    const thumb = (el, url) => { el.style.backgroundImage = url ? `url("${String(url).replace(/["\\]/g, '')}")` : ''; };
    thumb($('#logoThumb'), b.logo_url); thumb($('#coverThumb'), b.cover_url);
    bindStylePicker(look, (id) => { S.previewStyle = id; applyStyle(id, { persist: false }); });
    look.onsubmit = async (e) => {
      e.preventDefault();
      await busy($('button[type=submit]', look), async () => {
        const theme = S.previewStyle || b.theme || 'entre';
        must(await sb.from('businesses').update({ theme, owner_name: String(new FormData(look).get('owner_name') || '').trim().slice(0, 60) }).eq('id', b.id));
        await reloadBiz();
        S.bizList = S.bizList.map((x) => (x.id === S.biz.id ? S.biz : x));
        S.previewStyle = null;
        applyStyle(S.biz.theme);
        toast('Aparência salva ✅', 'ok');
      });
    };
    const setImage = async (col, url) => {
      must(await sb.from('businesses').update({ [col]: url }).eq('id', b.id));
      await reloadBiz();
      S.bizList = S.bizList.map((x) => (x.id === S.biz.id ? S.biz : x));
      go('ajustes', { quiet: true, open: 'aparencia' });
    };
    for (const [kind, col] of [['logo', 'logo_url'], ['cover', 'cover_url']]) {
      const input = $(`#${kind}File`);
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return;
        if (file.size > 15 * 1024 * 1024) { toast('Essa imagem é grande demais (máx. 15 MB).', 'bad'); input.value = ''; return; }
        toast('Enviando a imagem…');
        try { await setImage(col, await uploadBrandImage(kind, file)); toast(kind === 'logo' ? 'Logo atualizada ✅' : 'Capa atualizada ✅', 'ok'); } catch (err) { toast(friendly(err), 'bad'); input.value = ''; }
      };
      $(`#${kind}Del`)?.addEventListener('click', (e) => busy(e.target, async () => { await setImage(col, null); toast('Pronto.', 'ok'); }));
    }

    $('#logout').onclick = () => sb.auth.signOut();
    $('#changePass').onclick = () => sheet('Trocar minha senha', `
      <label>Senha nova<input name="p1" type="password" autocomplete="new-password" minlength="8" required></label>
      <label>Repita a senha nova<input name="p2" type="password" autocomplete="new-password" minlength="8" required></label>
      <p class="hint">Use pelo menos 8 caracteres, com letras e números. Não use a mesma senha de outro site.</p>`, { submitText: 'Trocar senha', onSubmit: async (f) => {
      const p1 = String(f.get('p1'));
      if (p1 !== String(f.get('p2'))) throw new Error('As duas senhas não são iguais.');
      if (p1.length < 8 || !/[a-z]/i.test(p1) || !/\d/.test(p1)) throw new Error('A senha precisa ter pelo menos 8 caracteres, com letras e números.');
      const { error } = await sb.auth.updateUser({ password: p1 });
      if (error) throw new Error(error.code === 'weak_password' || /weak|pwned|leaked|password should/i.test(error.message) ? 'Essa senha é fraca ou já vazou na internet. Use pelo menos 8 caracteres, com letras e números.' : friendly(error));
      toast('Senha trocada ✅', 'ok');
    } });
    $('#addSvc').onclick = () => editService(null);
    $$('[data-svc]', v).forEach((x) => { x.onclick = () => editService(x.dataset.svc); });
    $$('[data-staff-edit]', v).forEach((x) => { x.onclick = () => editStaff(x.dataset.staffEdit); });

    $('#addStaff').onsubmit = async (e) => {
      e.preventDefault();
      await busy($('button', e.target), async () => {
        const name = String(new FormData(e.target).get('name')).trim();
        const p = must(await sb.from('staff').insert({ business_id: b.id, name }).select().single());
        const act = S.services.filter((s) => s.active);
        if (act.length && confirm(`${name} faz todos os serviços ativos? (Você pode ajustar depois em cada serviço.)`)) {
          must(await sb.from('staff_services').insert(act.map((s) => ({ staff_id: p.id, service_id: s.id }))));
        }
        toast('Adicionado.', 'ok');
        go('ajustes', { quiet: true, open: 'equipe' });
      });
    };

    $('#hoursForm').onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const rows = [];
      for (const w of WEEK_ORDER) {
        if (!f.get('open' + w)) continue;
        const a = f.get('a' + w), bb = f.get('b' + w), c = f.get('c' + w), d = f.get('d' + w);
        if (!a || !bb || bb <= a) return toast(`${WD[w]}: o fechamento precisa ser depois da abertura.`, 'bad');
        rows.push({ business_id: b.id, weekday: w, opens: a, closes: bb });
        if (c || d) {
          if (!c || !d || d <= c) return toast(`${WD[w]}: confira o 2º turno.`, 'bad');
          if (c < bb) return toast(`${WD[w]}: o 2º turno precisa começar depois do 1º terminar.`, 'bad');
          rows.push({ business_id: b.id, weekday: w, opens: c, closes: d });
        }
      }
      await busy($('button[type=submit]', e.target), async () => {
        // Salva só o que mudou, e apaga por último: se a internet cair no meio, o negócio nunca fica
        // sem horário nenhum (antes apagava tudo e depois gravava de novo).
        const key = (h) => h.weekday + '|' + String(h.opens).slice(0, 5);
        const old = new Map(S.hours.map((h) => [key(h), h]));
        const fresh = new Map(rows.map((h) => [key(h), h]));
        const add = rows.filter((h) => !old.has(key(h)));
        if (add.length) must(await sb.from('opening_hours').insert(add));
        for (const h of rows) {
          const o = old.get(key(h));
          if (o && String(o.closes).slice(0, 5) !== h.closes) must(await sb.from('opening_hours').update({ closes: h.closes }).eq('business_id', b.id).eq('weekday', o.weekday).eq('opens', o.opens));
        }
        for (const o of S.hours) {
          if (!fresh.has(key(o))) must(await sb.from('opening_hours').delete().eq('business_id', b.id).eq('weekday', o.weekday).eq('opens', o.opens));
        }
        toast('Horários salvos ✅', 'ok');
        go('ajustes', { quiet: true, open: 'horarios' });
      });
    };

    $('#bizForm').onsubmit = async (e) => {
      e.preventDefault();
      if (!e.target.reportValidity()) return;
      const f = new FormData(e.target);
      const days = Math.max(1, Math.min(180, parseInt(f.get('days_ahead'), 10) || 30));
      await busy($('button[type=submit]', e.target), async () => {
        must(await sb.from('businesses').update({
          name: String(f.get('name')).trim(), kind: String(f.get('kind')), address: String(f.get('address')).trim(),
          owner_whatsapp: phoneDigits(f.get('owner_whatsapp')), policy: String(f.get('policy')).trim(),
          extra_info: String(f.get('extra_info')).trim(), tone: String(f.get('tone')).trim() || 'simpática, educada e objetiva',
          auto_confirm: !!f.get('auto_confirm'), health_business: !!f.get('health_business'),
          slot_minutes: Number(f.get('slot_minutes')), min_notice_minutes: Number(f.get('min_notice_minutes')), days_ahead: days,
        }).eq('id', b.id));
        await reloadBiz();
        S.bizList = S.bizList.map((x) => (x.id === S.biz.id ? S.biz : x));
        toast('Salvo ✅', 'ok');
        go('ajustes', { quiet: true, open: 'negocio' });
      });
    };
  };

  function editService(id) {
    const s = S.services.find((x) => x.id === id) || { name: '', price_cents: null, duration_min: 60, return_days: null, notes: '', active: true };
    const linked = id ? S.links.filter((l) => l.service_id === id).map((l) => l.staff_id) : S.staff.filter((p) => p.active).map((p) => p.id);
    const price = s.price_cents == null ? '' : (s.price_cents / 100).toFixed(2).replace('.', ',');
    sheet(id ? 'Editar serviço' : 'Novo serviço', `
      <label>Nome<input name="name" value="${esc(s.name)}" required maxlength="80"></label>
      <div class="two">
        <label>Preço (R$)<input name="price" inputmode="decimal" value="${esc(price)}" placeholder="vazio = sob consulta"></label>
        <label>Duração (min)<input name="duration" type="number" min="5" max="600" step="5" value="${s.duration_min}" required></label>
      </div>
      <label>Retorno sugerido (dias)<input name="return_days" type="number" min="1" max="365" value="${s.return_days ?? ''}" placeholder="Ex.: 21 para unha"></label>
      <p class="hint">Usado em Clientes › "Hora de chamar de volta".</p>
      <label>Observações para a secretária<textarea name="notes" rows="2" maxlength="500" placeholder="Ex.: inclui esmaltação; trazer cabelo lavado">${esc(s.notes)}</textarea></label>
      <fieldset><legend>Quem faz</legend>${S.staff.filter((p) => p.active || linked.includes(p.id)).map((p) => `<label class="switch"><input type="checkbox" name="staff" value="${p.id}" ${linked.includes(p.id) ? 'checked' : ''}><span>${esc(p.name)}</span></label>`).join('') || '<p class="muted">Cadastre quem atende em "Quem atende".</p>'}</fieldset>
      <label class="switch"><input type="checkbox" name="active" ${s.active ? 'checked' : ''}><span>Ativo (a secretária oferece)</span></label>`,
    { onSubmit: async (f) => {
      const raw = String(f.get('price') || '').trim().replace(/[^\d,.]/g, '');
      let cents = null;
      if (raw) {
        const n = Number(raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw);
        if (!Number.isFinite(n) || n < 0) throw new Error('Preço inválido. Ex.: 85 ou 85,50');
        cents = Math.round(n * 100);
      }
      const dur = parseInt(f.get('duration'), 10);
      if (!(dur >= 5 && dur <= 600)) throw new Error('Duração entre 5 e 600 minutos.');
      const ret = parseInt(f.get('return_days'), 10);
      const row = { name: String(f.get('name')).trim(), price_cents: cents, duration_min: dur, return_days: ret > 0 ? ret : null, notes: String(f.get('notes') || '').trim(), active: !!f.get('active') };
      const staffIds = f.getAll('staff').map(String);
      if (row.active && !staffIds.length) throw new Error('Marque quem faz esse serviço (senão a secretária não consegue marcar).');
      const saved = id
        ? must(await sb.from('services').update(row).eq('id', id).select().single())
        : must(await sb.from('services').insert({ ...row, business_id: S.biz.id }).select().single());
      // Grava só a diferença (primeiro inclui, depois tira): uma falha no meio não deixa o serviço sem ninguém.
      const had = id ? S.links.filter((l) => l.service_id === id).map((l) => l.staff_id) : [];
      const addIds = staffIds.filter((sid) => !had.includes(sid));
      if (addIds.length) must(await sb.from('staff_services').insert(addIds.map((sid) => ({ staff_id: sid, service_id: saved.id }))));
      for (const sid of had.filter((x) => !staffIds.includes(x))) must(await sb.from('staff_services').delete().eq('service_id', saved.id).eq('staff_id', sid));
      toast('Serviço salvo ✅', 'ok');
      go('ajustes', { quiet: true, open: 'servicos' });
    } });
  }

  function editStaff(id) {
    const p = S.staff.find((x) => x.id === id);
    sheet('Editar pessoa', `
      <label>Nome<input name="name" value="${esc(p.name)}" required maxlength="60"></label>
      <label class="switch"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span>Atendendo (desligue em férias ou se saiu)</span></label>
      <p class="hint">Os horários já marcados com essa pessoa continuam na agenda.</p>`,
    { onSubmit: async (f) => {
      must(await sb.from('staff').update({ name: String(f.get('name')).trim(), active: !!f.get('active') }).eq('id', id));
      toast('Salvo.', 'ok');
      go('ajustes', { quiet: true, open: 'equipe' });
    } });
  }

  boot();
})();
