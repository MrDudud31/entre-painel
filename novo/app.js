/* Entre — o app de quem é dono do negócio (salão, barbearia, clínica…). HTML/JS puro + Supabase (sem build).
   Telas: Início, Agenda, Conversas, Clientes, Ajustes. Tudo que vem do WhatsApp passa por esc(). */
(() => {
  'use strict';
  const CFG = window.ENTRE_CONFIG;
  let splash = 'on', splashTo = null; // abertura: 'on' desenhando → 'wait' já sabe a tela → 'off'
  // Tela inicial: mostra "Carregando…" ou um erro com botão, em vez de ficar em branco.
  function bootMsg(text, retry) {
    const el = document.getElementById('boot');
    if (!el) return;
    splash = 'error';
    el.hidden = false;
    el.classList.remove('leave', 'out');
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
    dentista: { label: 'Dentista', health: true, services: [['Avaliação', 30, null], ['Limpeza', 45, 180], ['Restauração', 60, null], ['Clareamento', 60, null]] },
    pet: { label: 'Pet shop / veterinário', health: true, services: [['Banho', 60, 15], ['Banho e tosa', 90, 30], ['Consulta veterinária', 30, null], ['Vacina', 20, null]] },
    academia: { label: 'Academia, pilates ou personal', services: [['Aula experimental', 60, null], ['Avaliação física', 45, 90], ['Aula de pilates', 50, 7], ['Treino com personal', 60, 7]] },
    spa: { label: 'Spa e massagem', services: [['Massagem relaxante', 60, 30], ['Drenagem linfática', 60, 7], ['Day spa', 180, null]] },
    tatuagem: { label: 'Estúdio de tatuagem', services: [['Orçamento', 30, null], ['Sessão de tatuagem', 180, null], ['Retoque', 60, null], ['Piercing', 30, null]] },
    terapia: { label: 'Psicologia / terapia', health: true, services: [['Primeira sessão', 50, null], ['Sessão', 50, 7]] },
    outro: { label: 'Outro tipo de negócio', services: [['Atendimento', 60, null]] },
  };
  // Tema desenhado de cada ramo (fundo com ícones do ramo). Vem escolhido no primeiro acesso; dá para trocar em Ajustes.
  const KIND_THEME = { salao: 'salao', manicure: 'unhas', barbearia: 'navalha', estetica: 'olhar', clinica: 'consultorio', dentista: 'sorriso', pet: 'pet', academia: 'movimento', spa: 'pele', tatuagem: 'tattoo', terapia: 'terapia' };

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
    // Temas por ramo: cores e fundo desenhado ficam no style.css (bloco gerado por real/ferramentas/temas_ramo.py).
    navalha: { ramo: true, nome: 'Navalha', desc: 'Barbearia: tesoura, navalha e bigode.', fonts: 'Bebas+Neue&family=Barlow:wght@400;500;600', disp: '"Bebas Neue", sans-serif', bg: '#F1ECE4', ink: '#1C2430', sw: ['#A3322A', '#1F4E79', '#1C2430'] },
    pet: { ramo: true, nome: 'Pet', desc: 'Patinha, cão e gato.', fonts: 'Fredoka:wght@500;600&family=Nunito:wght@400;600;700', disp: '"Fredoka", sans-serif', bg: '#EDF4F1', ink: '#183B39', sw: ['#1F6F6A', '#C8641F', '#DCEBE7'] },
    sorriso: { ramo: true, nome: 'Sorriso', desc: 'Dentista: dente, escova e brilho.', fonts: 'Lexend:wght@400;500;600', disp: '"Lexend", sans-serif', bg: '#EEF5F9', ink: '#123049', sw: ['#1D6FA3', '#1E8A82', '#DCEAF4'] },
    salao: { ramo: true, nome: 'Salão', desc: 'Secador, mechas e tesoura.', fonts: 'Playfair+Display:wght@500;600&family=Lato:wght@400;700', disp: '"Playfair Display", serif', bg: '#F7EEF0', ink: '#3B1D2E', sw: ['#8E3460', '#A9652C', '#F2DDE6'] },
    unhas: { ramo: true, nome: 'Unhas', desc: 'Esmalte, lixa e brilho.', fonts: 'DM+Serif+Display&family=Poppins:wght@400;500;600', disp: '"DM Serif Display", serif', bg: '#FBEFEB', ink: '#46202B', sw: ['#C23F57', '#9C7020', '#F7DEDF'] },
    olhar: { ramo: true, nome: 'Olhar', desc: 'Sobrancelhas e cílios.', fonts: 'Prata&family=Mulish:wght@400;600;700', disp: '"Prata", serif', bg: '#F4EDE6', ink: '#36271F', sw: ['#6E4B36', '#8E6A33', '#EBDDD0'] },
    pele: { ramo: true, nome: 'Pele', desc: 'Estética e spa: gota, folha e pedras.', fonts: 'Lora:wght@500;600&family=Quicksand:wght@400;500;600', disp: '"Lora", serif', bg: '#F1EFF5', ink: '#2C2843', sw: ['#5F4FA0', '#4C7A60', '#E5E0F2'] },
    consultorio: { ramo: true, nome: 'Consultório', desc: 'Saúde: estetoscópio e batimento.', fonts: 'IBM+Plex+Sans:wght@400;500;600', disp: '"IBM Plex Sans", sans-serif', bg: '#EEF4F5', ink: '#15333D', sw: ['#1E6F78', '#B54542', '#DAEBED'] },
    movimento: { ramo: true, nome: 'Movimento', desc: 'Academia e pilates: halter e cronômetro.', fonts: 'Archivo:wght@400;500;600;800', disp: '"Archivo", sans-serif', bg: '#F0F2EA', ink: '#1D2617', sw: ['#3E6B16', '#C2531A', '#E1EBD3'] },
    tattoo: { ramo: true, nome: 'Tattoo', desc: 'Rosa, âncora e estrela.', fonts: 'Abril+Fatface&family=Space+Grotesk:wght@400;500;600', disp: '"Abril Fatface", serif', bg: '#EFECE7', ink: '#191716', sw: ['#1A1A1A', '#A8261D', '#E3DED6'] },
    terapia: { ramo: true, nome: 'Terapia', desc: 'Conversa, sol e broto.', fonts: 'Young+Serif&family=Figtree:wght@400;500;600', disp: '"Young Serif", serif', bg: '#F4EEE8', ink: '#3A302B', sw: ['#A65F43', '#5B7757', '#EFDDD2'] },
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
    syncThemeColor();
    if (persist) store.set('style', st);
  }
  /** Cor da barrinha do celular acompanha o fundo do app. */
  function syncThemeColor() {
    $('meta[name="theme-color"]')?.setAttribute('content', getComputedStyle(document.body).backgroundColor);
  }
  // Modo claro/escuro: 'auto' segue o celular; 'light'/'dark' fixam (guardado só neste aparelho).
  const darkQuery = window.matchMedia?.('(prefers-color-scheme: dark)');
  function applyMode(m = store.get('mode') || 'auto') {
    const dark = m === 'dark' || (m !== 'light' && !!darkQuery?.matches);
    document.documentElement.dataset.mode = dark ? 'dark' : 'light';
    syncThemeColor();
  }
  darkQuery?.addEventListener?.('change', () => applyMode());
  const MODES = [['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']];
  const modePickerHtml = () => `<div class="seg mode-seg" role="group" aria-label="Claro ou escuro">${MODES.map(([k, t]) =>
    `<button type="button" data-mode-opt="${k}" class="${(store.get('mode') || 'auto') === k ? 'sel' : ''}">${t}</button>`).join('')}</div>`;
  function bindModePicker(root) {
    $$('[data-mode-opt]', root).forEach((b) => {
      b.onclick = () => {
        store.set('mode', b.dataset.modeOpt);
        applyMode(b.dataset.modeOpt);
        $$('[data-mode-opt]', root).forEach((x) => x.classList.toggle('sel', x === b));
      };
    });
  }
  // iPhone ignora "sem zoom" da página: bloqueia o gesto de pinça direto.
  ['gesturestart', 'gesturechange', 'gestureend'].forEach((ev) => document.addEventListener(ev, (e) => e.preventDefault(), { passive: false }));

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
  const ORIGIN = { assistant: 'Secretária (WhatsApp)', link: 'Link de agendamento', owner: 'Você' };
  const money = (c) => 'R$ ' + ((c || 0) / 100).toLocaleString('pt-BR', { minimumFractionDigits: (c || 0) % 100 ? 2 : 0, maximumFractionDigits: 2 });
  const ymOf = (d) => d.slice(0, 7);
  const ymAdd = (ym, n) => { const [y, m] = ym.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return t.toISOString().slice(0, 7); };
  const monthName = (ym) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
  // Link de agendamento: endereço público (agendar.html) e sugestão de endereço a partir do nome.
  const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
  const slugify = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40).replace(/-+$/, '');
  // A página de agendamento fica na mesma pasta deste app.js (funciona na raiz, em /novo/ e no teste).
  const APP_BASE = (document.currentScript && document.currentScript.src) || location.href;
  const bookingUrl = (slug) => new URL('agendar.html?n=' + encodeURIComponent(slug), APP_BASE).href;
  const linkOn = () => !!(S.biz?.booking_link_enabled && S.biz?.booking_slug);
  const svcName = (id) => S.services.find((s) => s.id === id)?.name || '';
  const staffName = (id) => S.staff.find((p) => p.id === id)?.name || '';
  const BOOK_SEL = 'id, starts_at, ends_at, status, client_name, client_id, price_cents, paid_cents, paid_method, paid_at, note, created_by, service_id, staff_id, clients(name, phone, username)';
  // Caixa: forma de pagamento e valor de verdade do atendimento (o recebido, se já recebeu; senão o preço)
  const PAY = { pix: 'Pix', cartao: 'Cartão', dinheiro: 'Dinheiro', outro: 'Outro' };
  const charged = (b) => (b.paid_at ? b.paid_cents || 0 : b.price_cents || 0);
  const centsIn = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
  /** Valor digitado ("50", "49,90", "R$ 1.200") em centavos; aceita 0 (cortesia). null = vazio/ inválido. */
  const parseMoney = (v) => {
    const s = String(v ?? '').replace(/r\$/i, '').trim();
    if (!s) return null;
    if (/^[0\s.,]+$/.test(s)) return 0;
    return parsePrice(s);
  };
  /** Já foi atendido? ("Atendimento feito" ou confirmado com horário que já terminou) */
  const attended = (b, now = Date.now()) => b.status === 'done' || (b.status === 'confirmed' && new Date(b.ends_at || b.starts_at).getTime() < now);
  // Lembretes e parabéns já mandados (ficam só neste aparelho)
  const sentGet = (k) => { try { return new Set(JSON.parse(store.get(k) || '[]')); } catch { return new Set(); } };
  const sentAdd = (k, id) => { const s = [...sentGet(k), id].slice(-300); store.set(k, JSON.stringify(s)); };
  // Mensagem que começa com o nome do negócio sem "do/da" (serve para qualquer negócio)
  const hi = (name) => `Oi${name ? ', ' + firstName(name) : ''}! Tudo bem? 😊 ${S.biz.name} aqui.`;

  // ---- Pix "copia e cola" (padrão BR Code do Banco Central). O dinheiro vai direto para a chave do dono.
  const pixField = (id, v) => id + String(v.length).padStart(2, '0') + v;
  const pixAscii = (s, n) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ').trim().toUpperCase().slice(0, n);
  function crc16(s) {
    let c = 0xffff;
    for (let i = 0; i < s.length; i++) {
      c ^= s.charCodeAt(i) << 8;
      for (let j = 0; j < 8; j++) c = c & 0x8000 ? ((c << 1) ^ 0x1021) & 0xffff : (c << 1) & 0xffff;
    }
    return c.toString(16).toUpperCase().padStart(4, '0');
  }
  function pixCode({ key, name, city, cents }) {
    const p = pixField('00', '01') + pixField('26', pixField('00', 'br.gov.bcb.pix') + pixField('01', key))
      + pixField('52', '0000') + pixField('53', '986') + (cents ? pixField('54', (cents / 100).toFixed(2)) : '')
      + pixField('58', 'BR') + pixField('59', pixAscii(name, 25) || 'RECEBEDOR') + pixField('60', pixAscii(city, 15) || 'BRASIL')
      + pixField('62', pixField('05', '***')) + '6304';
    return p + crc16(p);
  }
  const cpfOk = (d) => {
    if (!/^\d{11}$/.test(d) || /^(\d)\1+$/.test(d)) return false;
    const dv = (n) => { let s = 0; for (let i = 0; i < n; i++) s += Number(d[i]) * (n + 1 - i); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
    return dv(9) === Number(d[9]) && dv(10) === Number(d[10]);
  };
  /** Chave Pix digitada → formato que o banco espera (e-mail, +55 celular, CPF/CNPJ só números, aleatória). null = não reconheci. */
  function normPixKey(raw) {
    const s = String(raw || '').trim();
    if (!s) return '';
    if (s.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s) ? s.toLowerCase() : null;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) return s.toLowerCase();
    const d = s.replace(/\D/g, '');
    if (s.startsWith('+')) return d.length >= 12 && d.length <= 13 ? '+' + d : null;
    if (d.length === 14) return d; // CNPJ
    if (d.length === 11 && (cpfOk(d) && !/[()]/.test(s))) return d; // CPF
    if (d.length === 10 || d.length === 11) return '+55' + d; // celular com DDD
    if ((d.length === 12 || d.length === 13) && d.startsWith('55')) return '+' + d;
    return null;
  }

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
    // Enquanto a abertura roda, só guarda pra onde ir; ela troca de tela quando o símbolo terminar.
    if (splash === 'on' || splash === 'wait') {
      splashTo = id;
      if (splash === 'on') { splash = 'wait'; splashReady.then(leaveSplash); }
      return;
    }
    for (const s of ['login', 'onboard', 'main']) $('#' + s).hidden = s !== id;
    const boot = $('#boot');
    if (boot) boot.hidden = true;
  }

  // Abertura (toda vez que o app abre, logado ou não): o símbolo se desenha sozinho no meio
  // da tela enquanto o resto carrega por trás. Terminou o desenho (e o carregamento):
  // - sem login: o símbolo desliza pro cantinho dele e aparecem o nome, os campos e o botão;
  // - logado: a abertura some suave e o painel já está pronto embaixo.
  const splashReady = new Promise((res) => {
    const dot = document.querySelector('#boot .entre-logo .d:last-of-type');
    const a = dot && dot.getAnimations ? dot.getAnimations()[0] : null;
    if (a) a.finished.then(() => setTimeout(res, 300), res); // vale mesmo se o desenho já acabou
    setTimeout(res, 3000); // segurança: nunca prende a pessoa aqui
  });
  function leaveSplash() {
    if (splash !== 'wait') return; // um aviso de erro já tomou a tela
    splash = 'off';
    const id = splashTo, boot = $('#boot'), badge = $('.boot-logo .logo-badge', boot);
    for (const s of ['login', 'onboard', 'main']) $('#' + s).hidden = s !== id;
    const sec = $('#' + id);
    let done = false;
    const end = (reveal) => {
      if (done) return;
      done = true;
      boot.hidden = true;
      boot.classList.remove('leave', 'out');
      if (badge) badge.style.transform = '';
      if (reveal) { sec.classList.remove('intro'); sec.classList.add('reveal'); }
    };
    const target = id === 'login' && $('.brand .logo-badge', sec);
    if (target && badge && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      sec.classList.add('intro');
      const to = target.getBoundingClientRect(), from = badge.getBoundingClientRect();
      boot.classList.add('leave');
      badge.style.transform = `translate(${to.left + to.width / 2 - from.left - from.width / 2}px, ${to.top + to.height / 2 - from.top - from.height / 2}px) scale(${to.width / from.width})`;
      badge.addEventListener('transitionend', () => end(true), { once: true });
      setTimeout(() => end(true), 1100);
    } else {
      if (id === 'login') sec.classList.add('reveal');
      boot.classList.add('out');
      setTimeout(() => end(false), 450);
    }
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
    applyMode();
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
  // Primeiro os temas desenhados por ramo (o do ramo do negócio na frente), depois os estilos lisos.
  function stylePickerHtml(selected, kind) {
    Object.keys(STYLES).forEach(loadFonts);
    const mine = KIND_THEME[kind];
    const opt = ([id, s]) => `
      <button type="button" class="style-opt" data-style-opt="${id}" aria-pressed="${id === selected}" style="background-color:${s.bg};color:${s.ink}">
        <span class="sw">${s.sw.map((c) => `<i style="background:${c}"></i>`).join('')}</span>
        <b style="font-family:${esc(s.disp)}">${esc(s.nome)}${id === mine ? ' <em class="style-mine">seu ramo</em>' : ''}</b><small>${esc(s.desc)}</small></button>`;
    const all = Object.entries(STYLES);
    const ramo = all.filter(([, s]) => s.ramo).sort(([a], [b]) => (b === mine) - (a === mine));
    const lisos = all.filter(([, s]) => !s.ramo);
    return `<p class="label">Desenhados para cada ramo</p><div class="style-grid" role="group" aria-label="Temas por ramo">${ramo.map(opt).join('')}</div>
      <p class="label">Estilos lisos</p><div class="style-grid" role="group" aria-label="Estilos">${lisos.map(opt).join('')}</div>`;
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

  // ------------------------------------------------------------------ foto da tabela de preços
  // O dono tira foto da tabela (ou escolhe um print); a função "ler-tabela" (IA) devolve os serviços com preço.
  // Nada é salvo sem o dono conferir a lista. Usado em Ajustes › Serviços e no início guiado.
  const CAM = '<svg viewBox="0 0 24 24" class="ico" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>';
  const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const durLabel = (m) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`);
  const DURS = [15, 20, 30, 40, 45, 50, 60, 75, 90, 120, 150, 180, 240];
  function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result).split(',')[1] || '');
      r.onerror = () => reject(new Error('Não consegui ler a foto.'));
      r.readAsDataURL(blob);
    });
  }
  /** Abre a câmera/galeria do celular e devolve a foto escolhida (ou null). */
  function pickPhoto() {
    if (typeof window.ENTRE_FAKE_PHOTO === 'function') return Promise.resolve(window.ENTRE_FAKE_PHOTO()); // só no painel-teste
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.accept = 'image/*';
      inp.onchange = () => resolve(inp.files?.[0] || null);
      inp.click();
    });
  }
  async function readMenuPhoto(file, kind) {
    if (file.size > 20 * 1024 * 1024) throw new Error('Essa foto é grande demais (máx. 20 MB).');
    const imagem = await blobToBase64(await shrinkImage(file, 1600, 'image/jpeg'));
    const { data, error } = await sb.functions.invoke('ler-tabela', { body: { imagem, tipo: KINDS[kind]?.label || '' } });
    if (error) {
      let msg = 'Não consegui ler a foto agora. Tente de novo.';
      try { msg = (await error.context.json()).erro || msg; } catch { /* sem detalhe */ }
      throw new Error(msg);
    }
    const tpl = KINDS[kind]?.services || [];
    const items = (data?.servicos || []).map((s) => {
      const t = tpl.find(([n]) => normName(n) === normName(s.nome)); // duração e retorno do modelo do ramo, quando bate o nome
      return { name: String(s.nome || ''), price: s.preco > 0 ? Math.round(s.preco * 100) : null, dur: s.duracao_min || t?.[1] || 60, ret: t?.[2] ?? null, obs: String(s.obs || ''), on: true };
    });
    return { items, aviso: String(data?.aviso || '') };
  }
  const parsePrice = (v) => {
    const s = String(v || '').replace(/[^\d.,]/g, '');
    const n = s.includes(',') ? parseFloat(s.replace(/\./g, '').replace(',', '.')) : parseFloat(s);
    return Number.isFinite(n) && n > 0 ? Math.round(n * 100) : null;
  };
  function menuReviewHtml(items) {
    return `<div class="menu-list">${items.map((it, i) => `<div class="menu-row ${it.on ? '' : 'off'}" data-mi="${i}">
      <input type="checkbox" class="menu-on" data-mf="on" ${it.on ? 'checked' : ''} aria-label="Incluir ${esc(it.name)}">
      <div class="menu-fields">
        <input data-mf="name" value="${esc(it.name)}" maxlength="80" aria-label="Nome do serviço">
        <div class="menu-sub">
          <label class="money-in"><span>R$</span><input data-mf="price" inputmode="decimal" placeholder="sob consulta" value="${it.price != null ? esc((it.price / 100).toFixed(2).replace('.', ',')) : ''}" aria-label="Preço"></label>
          <select data-mf="dur" aria-label="Duração">${[...new Set([...DURS, it.dur])].sort((a, b) => a - b).map((m) => `<option value="${m}" ${m === it.dur ? 'selected' : ''}>${durLabel(m)}</option>`).join('')}</select>
        </div>
        ${it.obs ? `<small class="muted">${esc(it.obs)}</small>` : ''}
      </div></div>`).join('')}</div>`;
  }
  function bindMenuReview(root, items, onChange) {
    $$('[data-mi]', root).forEach((row) => {
      const it = items[Number(row.dataset.mi)];
      const upd = (e) => {
        const f = e.target.dataset.mf;
        if (f === 'on') { it.on = e.target.checked; row.classList.toggle('off', !it.on); }
        if (f === 'name') it.name = e.target.value;
        if (f === 'price') it.price = parsePrice(e.target.value);
        if (f === 'dur') it.dur = Number(e.target.value);
        onChange?.();
      };
      row.addEventListener('input', upd); row.addEventListener('change', upd);
    });
  }
  const chosenMenu = (items) => items.filter((it) => it.on && it.name.trim().length >= 2);
  const readingHtml = (txt) => `<div class="menu-loading"><span class="logo-badge">${LOGO('loop')}</span><p>${esc(txt)}</p></div>`;

  /** Ajustes › Serviços: foto -> conferir -> salvar (atualiza o que já existe com o mesmo nome). */
  async function openMenuReader() {
    const file = await pickPhoto();
    if (!file) return;
    sheet('Lendo sua tabela…', readingHtml('Lendo os serviços e os preços da foto. Leva uns segundos.'));
    let res;
    try { res = await readMenuPhoto(file, S.biz.kind); } catch (err) { closeSheet(); return toast(friendly(err), 'bad'); }
    if (!res.items.length) {
      const f = sheet('Não encontrei serviços', `<p>${esc(res.aviso || 'Não consegui achar serviços com preço nessa foto.')}</p>
        <p class="hint">Dica: foto de frente, com boa luz e a tabela inteira aparecendo. Print do Instagram também serve.</p>
        <button type="button" class="btn primary block" id="menuAgain">${CAM} Tentar outra foto</button>`);
      $('#menuAgain', f).onclick = () => openMenuReader();
      return;
    }
    const items = res.items;
    const count = () => chosenMenu(items).length;
    const known = (it) => S.services.some((s) => normName(s.name) === normName(it.name));
    const form = sheet('Confira o que eu li', `<p class="hint">Achei <b>${items.length}</b> serviço${items.length === 1 ? '' : 's'}. Arrume o que precisar e desmarque o que você não faz.${res.aviso ? ' ' + esc(res.aviso) : ''}</p>
      ${menuReviewHtml(items)}
      <p class="hint">${items.some(known) ? 'Os que já existem com o mesmo nome ganham o preço novo. ' : ''}${S.staff.some((p) => p.active) ? 'Os serviços novos ficam com todo mundo da equipe (dá para ajustar em cada um).' : ''}</p>`,
    { submitText: `Salvar ${count()} serviços`, onSubmit: async () => {
      const chosen = chosenMenu(items);
      if (!chosen.length) throw new Error('Marque pelo menos um serviço.');
      const staffIds = S.staff.filter((p) => p.active).map((p) => p.id);
      const fresh = [];
      for (const it of chosen) {
        const old = S.services.find((s) => normName(s.name) === normName(it.name));
        if (old) {
          must(await sb.from('services').update({ price_cents: it.price, duration_min: it.dur, active: true, notes: old.notes || it.obs }).eq('id', old.id));
          if (!S.links.some((l) => l.service_id === old.id) && staffIds.length) fresh.push(old.id);
        } else {
          const row = must(await sb.from('services').insert({ business_id: S.biz.id, name: it.name.trim().slice(0, 80), price_cents: it.price, duration_min: it.dur, return_days: it.ret, notes: it.obs, active: true }).select('id').single());
          fresh.push(row.id);
        }
      }
      if (fresh.length && staffIds.length) must(await sb.from('staff_services').insert(fresh.flatMap((sid) => staffIds.map((p) => ({ staff_id: p, service_id: sid })))));
      await loadBizData();
      toast(`${chosen.length} serviço${chosen.length === 1 ? '' : 's'} salvo${chosen.length === 1 ? '' : 's'} ✅ A secretária já pode oferecer.`, 'ok');
      go('ajustes', { quiet: true, open: 'servicos' });
    } });
    bindMenuReview(form, items, () => { $('[type=submit]', form).textContent = `Salvar ${count()} serviço${count() === 1 ? '' : 's'}`; });
  }

  // ------------------------------------------------------------------ primeiro acesso
  // Primeiro acesso: um passo por tela, como uma conversa. Nada é salvo até o último passo.
  const KIND_ICON = {
    salao: '<circle cx="6" cy="7" r="2.5"/><circle cx="6" cy="17" r="2.5"/><path d="M8.2 8.3L20 17M8.2 15.7L20 7"/>',
    manicure: '<rect x="8" y="11" width="8" height="9" rx="2"/><path d="M10 11V5h4v6M10 15h4"/>',
    barbearia: '<path d="M12 10.5c-1.6-2.4-5.2-2.6-7.2-.2-.9 1.1-1.9 1.4-2.8.9.6 2.9 4.6 4.1 7.4 2.3 1.2-.8 2-1.6 2.6-2.6.6 1 1.4 1.8 2.6 2.6 2.8 1.8 6.8.6 7.4-2.3-.9.5-1.9.2-2.8-.9-2-2.4-5.6-2.2-7.2.2z"/>',
    estetica: '<path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8zM18.5 15.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
    clinica: '<circle cx="12" cy="12" r="8.5"/><path d="M12 8v8M8 12h8"/>',
    dentista: '<path d="M12 5.6C10.6 4.2 9.1 3.6 7.6 3.6 5 3.6 3.5 5.6 3.5 8.2c0 2.3 1 3.8 1.5 5.8.6 2.6 1 6.4 2.5 6.4s1.9-3.1 2.5-5c.4-1.2 1.1-1.5 2-1.5s1.6.3 2 1.5c.6 1.9 1 5 2.5 5s1.9-3.8 2.5-6.4c.5-2 1.5-3.5 1.5-5.8 0-2.6-1.5-4.6-4.1-4.6-1.5 0-3 .6-4.4 2z"/>',
    pet: '<ellipse cx="6.5" cy="10" rx="1.7" ry="2.1"/><ellipse cx="10.2" cy="6.6" rx="1.7" ry="2.2"/><ellipse cx="14.6" cy="6.6" rx="1.7" ry="2.2"/><ellipse cx="18.1" cy="10" rx="1.7" ry="2.1"/><path d="M12.4 11.5c-2.6 0-5.2 3.4-5.2 5.9 0 1.6 1.2 2.4 2.6 2.1 1-.2 1.7-.6 2.6-.6s1.6.4 2.6.6c1.4.3 2.6-.5 2.6-2.1 0-2.5-2.6-5.9-5.2-5.9z"/>',
    academia: '<path d="M6.5 7v10M3.8 9.4v5.2M17.5 7v10M20.2 9.4v5.2M6.5 12h11"/>',
    spa: '<path d="M12 5.5c2.5 2.6 2.5 8.4 0 12.5-2.5-4.1-2.5-9.9 0-12.5zM12 18c-3.2 0-7.2-2.2-8.2-7.2 3.2 0 6.8 2.2 8.2 7.2zM12 18c3.2 0 7.2-2.2 8.2-7.2-3.2 0-6.8 2.2-8.2 7.2z"/>',
    tatuagem: '<path d="M7 6.5c0 4.3 2.2 7 5 7s5-2.7 5-7c-1.4.9-2.9 1-3.7.1L12 4.5l-1.3 2.1c-.8.9-2.3.8-3.7-.1zM9.8 8.8c.5 1.1 1.3 1.7 2.2 1.7s1.7-.6 2.2-1.7M12 13.5V21M12 17.5c-2-2-4.2-2.1-5.4-1.1 1.6 1.6 3.4 1.7 5.4 1.1zM12 18.8c1.6-2 3.8-2.5 5.3-1.6-1.5 1.5-3.2 1.9-5.3 1.6z"/>',
    terapia: '<path d="M3 4.5h11v7.5H8l-3 3v-3H3zM10 15v2.5h6l3 3v-3h2V10h-4.5"/>',
    outro: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  };
  const HOURS_PRESETS = {
    comercial: { label: 'Seg a sex, 9h às 18h · sáb, 9h às 13h', rows: [[1, '09:00', '18:00'], [2, '09:00', '18:00'], [3, '09:00', '18:00'], [4, '09:00', '18:00'], [5, '09:00', '18:00'], [6, '09:00', '13:00']] },
    terca: { label: 'Ter a sáb, 9h às 19h', rows: [2, 3, 4, 5, 6].map((w) => [w, '09:00', '19:00']) },
    longo: { label: 'Seg a sáb, 8h às 20h', rows: [1, 2, 3, 4, 5, 6].map((w) => [w, '08:00', '20:00']) },
    semana: { label: 'Seg a sex, 8h às 18h', rows: [1, 2, 3, 4, 5].map((w) => [w, '08:00', '18:00']) },
  };
  const WIZ_STEPS = ['oi', 'tipo', 'nome', 'voce', 'whats', 'estilo', 'imagens', 'horario', 'tabela', 'pronto'];

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
          <input class="wiz-input" id="wName" maxlength="80" autocomplete="organization" placeholder="Ex.: ${({ barbearia: 'Barbearia do Zé', salao: 'Salão da Rê', clinica: 'Clínica Bem Viver', dentista: 'Sorriso Odontologia', pet: 'Pet Amigo', academia: 'Studio Movimento', spa: 'Spa Serenidade', tatuagem: 'Tinta Preta Tattoo', terapia: 'Espaço Escuta', estetica: 'Olhar Studio' })[W.kind] || 'Studio Bela Unha'}" value="${esc(W.name)}">`;
      } else if (step === 'voce') {
        body = `<h2>E como podemos te chamar?</h2><p class="wiz-sub">Aparece na saudação, tipo "Bom dia, ${esc(firstName(W.owner) || 'Ana')}."</p>
          <input class="wiz-input" id="wOwner" maxlength="60" autocomplete="given-name" placeholder="Seu nome" value="${esc(W.owner)}">`;
      } else if (step === 'whats') {
        body = `<h2>Seu WhatsApp, para receber avisos</h2><p class="wiz-sub">A secretária avisa você quando chegar um pedido novo ou quando alguém precisar de você.</p>
          <input class="wiz-input" id="wWa" inputmode="tel" autocomplete="tel" placeholder="(11) 91234-5678" value="${esc(W.wa)}">`;
        canSkip = true;
      } else if (step === 'estilo') {
        body = `<h2>Escolha a cara do app</h2><p class="wiz-sub">Já separamos o tema do seu ramo. Toque em outro para ver na hora. Todos têm versão clara e escura.</p>${stylePickerHtml(W.theme, W.kind)}
          <p class="label">Claro ou escuro</p>${modePickerHtml()}`;
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
      } else if (step === 'tabela') {
        if (W.reading) {
          body = `<h2>Lendo sua tabela…</h2>${readingHtml('Estou lendo os serviços e os preços da foto. Leva uns segundos.')}`;
        } else if (W.menu?.items.length) {
          body = `<h2>Achei ${W.menu.items.length} serviço${W.menu.items.length === 1 ? '' : 's'}!</h2>
            <p class="wiz-sub">Confira, arrume o que precisar e desmarque o que você não faz.</p>
            ${menuReviewHtml(W.menu.items)}
            <button type="button" class="btn ghost block" id="wMenuAgain">${CAM} Tirar outra foto</button>`;
        } else {
          body = `<h2>Tem uma tabela de preços?</h2>
            <p class="wiz-sub">Tire uma foto da tabela (ou escolha um print do Instagram) e eu cadastro seus serviços com os preços. Você confere antes.</p>
            ${W.menu ? `<p class="banner warn">${esc(W.menu.aviso || 'Não encontrei serviços nessa foto.')} Tente outra, de frente e com boa luz.</p>` : ''}
            <button type="button" class="photo-cta" id="wMenu">${CAM}<b>Tirar foto da tabela</b><small>ou escolher da galeria</small></button>`;
          canSkip = true;
        }
        next = W.menu?.items.length ? 'Continuar' : 'Continuar sem foto';
      } else if (step === 'pronto') {
        const menuN = W.menu ? chosenMenu(W.menu.items).length : 0;
        body = `<h2>Tudo pronto, ${esc(firstName(W.owner))}!</h2><p class="wiz-sub">Assim vai ficar o seu app:</p>
          <div class="wiz-preview big">${url.cover ? '<div class="wp-cover" id="wpCover"></div>' : ''}
            <div class="wp-bar"><span class="wp-logo" id="wpLogo">${url.logo ? '' : LOGO()}</span><b>${esc(W.name)}</b></div>
            <div class="wp-greet">${(() => { const hr = new Date().getHours(); return hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite'; })()}, ${esc(firstName(W.owner))}.</div></div>
          <ul class="wiz-sum"><li><b>Ramo:</b> ${esc(KINDS[W.kind]?.label || '')}</li><li><b>Estilo:</b> ${esc(STYLES[W.theme].nome)}</li><li><b>Horário:</b> ${esc(HOURS_PRESETS[W.hours].label)}</li>
            <li><b>Serviços:</b> ${menuN ? `${menuN} da sua tabela, já com preço e prontos para a secretária oferecer.` : 'criamos alguns de exemplo, <b>desativados e sem preço</b>. Você coloca seus preços e ativa só o que faz.'}</li></ul>`;
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
      $('#wSkip', box)?.addEventListener('click', () => { if (step === 'whats') W.wa = ''; if (step === 'tabela') W.menu = null; W.i++; render(); });
      $$('[data-kind]', box).forEach((b) => { b.onclick = () => {
        W.kind = b.dataset.kind;
        // o tema do ramo já vem escolhido (até a pessoa escolher outro na tela de estilo)
        if (!W.themePicked) { W.theme = KIND_THEME[W.kind] || 'entre'; applyStyle(W.theme, { persist: false }); }
        W.i++; render();
      }; });
      $$('[data-hours]', box).forEach((b) => { b.onclick = () => { W.hours = b.dataset.hours; $$('[data-hours]', box).forEach((x) => x.setAttribute('aria-pressed', String(x === b))); }; });
      if (step === 'estilo') { bindStylePicker(form, (id) => { W.theme = id; W.themePicked = true; applyStyle(id, { persist: false }); }); bindModePicker(form); }
      if (step === 'tabela') {
        if (W.menu?.items.length) bindMenuReview(form, W.menu.items);
        const readPhoto = async () => {
          const f = await pickPhoto();
          if (!f) return;
          W.reading = true; render();
          try { W.menu = await readMenuPhoto(f, W.kind); } catch (e) { W.menu = null; W.reading = false; render(); return $('#wErr', box) && ($('#wErr', box).textContent = friendly(e)); }
          W.reading = false; render();
        };
        $('#wMenu', box)?.addEventListener('click', readPhoto);
        $('#wMenuAgain', box)?.addEventListener('click', readPhoto);
        if (W.reading) $('button[type=submit]', form).disabled = true;
      }
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
    // Serviços: os da foto da tabela (já ativos, com preço) ou os de exemplo do ramo (desativados, sem preço).
    const fromPhoto = W.menu ? chosenMenu(W.menu.items) : [];
    const svcs = must(await sb.from('services').insert(fromPhoto.length
      ? fromPhoto.map((it) => ({ business_id: id, name: it.name.trim().slice(0, 80), duration_min: it.dur, return_days: it.ret, price_cents: it.price, notes: it.obs, active: true }))
      : KINDS[W.kind].services.map(([name, dur, ret]) => ({ business_id: id, name, duration_min: dur, return_days: ret, price_cents: null, active: false }))).select('id'));
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
    else toast(fromPhoto.length ? 'Pronto! Seus serviços já estão com preço.' : 'Pronto! Agora ative seus serviços e coloque os preços.', 'ok');
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
    const risk = noShowRisk(b);
    const paid = (b.paid_at && b.status !== 'block' ? ` · <span class="paid">pago${PAY[b.paid_method] ? ' (' + PAY[b.paid_method] + ')' : ''}</span>` : '')
      + (risk ? ` · <span class="risk r-${risk.level === 'alto' ? 'alto' : 'medio'}">pode faltar</span>` : '');
    return `<button type="button" class="row booking st-${b.status}" data-booking="${b.id}">
      <span class="time"><b>${p.time}</b><small>${e.time}</small></span>
      <span class="grow"><b>${esc(bookingName(b))}</b><small>${esc(sub)}${showDay ? ' · ' + relDay(p.date) : ''}${paid}</small></span>
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
    if (data?.avisada) toast(`${okMsg} e a pessoa foi avisada no WhatsApp ✅`, 'ok');
    else toast(`${okMsg}. A pessoa NÃO foi avisada pelo WhatsApp${data?.aviso ? ': ' + data.aviso : '.'}`, 'warn');
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
      b.status !== 'block' && b.status !== 'cancelled' && ['Pagamento', b.paid_at
        ? `<span class="paid">${esc(money(b.paid_cents))} · ${esc(PAY[b.paid_method] || '')}</span>`
        : '<span class="muted">ainda não recebido</span>'],
      ['Situação', `<span class="chip ${cls}">${lab}</span>`],
      b.note && ['Observação', esc(b.note)],
      ['Criado por', ORIGIN[b.created_by] || 'Você'],
    ].filter(Boolean);
    const risk = noShowRisk(b);
    if (risk) rows.splice(rows.length - 1, 0, ['Risco de falta', `<span class="risk r-${risk.level === 'alto' ? 'alto' : 'medio'}">${risk.level}</span> <small class="muted">${esc(risk.why.join('; '))}</small>`]);
    const acts = [];
    const future = !past && ['pending', 'confirmed'].includes(b.status);
    if (b.status === 'pending') acts.push(['confirmed', 'Confirmar e avisar', 'primary']);
    if (future && phone && !b.paid_at) acts.push(['deposit', risk ? 'Pedir sinal por Pix (recomendado)' : 'Pedir sinal por Pix', risk && b.status === 'confirmed' ? 'primary' : '']);
    if (future && phone && b.status === 'confirmed') acts.push(['remind', 'Lembrar agora pelo WhatsApp', '']);
    if (b.status === 'pending') acts.push(['cancelled', 'Recusar e avisar', 'danger']);
    if (b.status === 'confirmed') {
      if (past) acts.push(['done', 'Atendimento feito', 'primary'], ['noshow', 'Faltou', '']);
      if (!past || b.paid_at) acts.push(['pay', b.paid_at ? 'Ver pagamento' : 'Registrar sinal recebido', '']);
      acts.push(['cancelled', b.client_id && !past ? 'Cancelar e avisar' : 'Cancelar', 'danger']);
    }
    if (b.status === 'done') acts.push(['pay', b.paid_at ? 'Ver pagamento' : 'Receber pagamento', b.paid_at ? '' : 'primary']);
    if ((b.status === 'done' || b.status === 'noshow')) acts.push(['confirmed-back', 'Desfazer', '']);
    if (b.status === 'block') acts.push(['unblock', 'Remover bloqueio', 'danger']);
    if (b.client_id) acts.push(['conversa', 'Abrir conversa', 'ghost']);
    const form = sheet(b.status === 'block' ? 'Bloqueio' : 'Agendamento', `<dl class="details">${rows.map(([k, v]) => `<dt>${k}</dt><dd>${v}</dd>`).join('')}</dl>
      <div class="stack">${acts.map(([a, t, c]) => `<button type="button" class="btn block ${c}" data-act="${a}">${t}</button>`).join('')}</div>`);
    $$('[data-act]', form).forEach((btn) => {
      btn.onclick = () => busy(btn, async () => {
        const a = btn.dataset.act;
        if (a === 'pay') return openPayment(b);
        if (a === 'deposit') return openDeposit(b);
        if (a === 'remind') { window.open(waLink(phone, remindMsg(b)), '_blank', 'noopener'); sentAdd('lembrados', b.id); return; }
        if (a === 'conversa') {
          const conv = must(await sb.from('conversations').select('id').eq('business_id', S.biz.id).eq('client_id', b.client_id).maybeSingle());
          closeSheet();
          if (!conv) return toast('Essa pessoa ainda não tem conversa.', 'warn');
          S.conv = conv.id; return go('conversas');
        }
        if (a === 'confirmed' || (a === 'cancelled' && b.client_id && !past)) {
          if (a === 'cancelled' && !confirm('Cancelar este horário e avisar no WhatsApp?')) return;
          await decide(b.id, a);
        } else if (a === 'unblock') {
          must(await sb.from('bookings').delete().eq('id', b.id));
          toast('Bloqueio removido.', 'ok');
        } else {
          const st = a === 'confirmed-back' ? 'confirmed' : a;
          if (st === 'cancelled' && !confirm('Cancelar este horário?')) return;
          must(await sb.from('bookings').update({ status: st }).eq('id', b.id));
          // Atendimento feito e ainda não pago: já pergunta quanto recebeu (dá para pular)
          if (st === 'done' && !b.paid_at) {
            S.ins = null;
            go(S.tab, { quiet: true, keepScroll: true });
            return openPayment({ ...b, status: 'done' }, { justDone: true });
          }
          toast('Pronto.', 'ok');
        }
        S.ins = null; // o histórico mudou
        closeSheet();
        go(S.tab, { quiet: true, keepScroll: true });
        if (a === 'cancelled' && !past) offerWaitlist(b);
      });
    });
  }

  // ------------------------------------------------------------------ O que o app sabe de cada cliente
  // Histórico do último ano, resumido por cliente: visitas, faltas, última e próxima vez, e o costume
  // (dia da semana, hora, serviço, profissional). Serve para o risco de falta e para "Encher a agenda".
  // Guardado por 3 minutos para não pesar nas atualizações automáticas.
  async function loadInsights(force = false) {
    if (!force && S.ins && S.ins.biz === S.biz.id && Date.now() - S.ins.t < 3 * MIN) return S.ins;
    const [cl, bk] = await Promise.all([
      sb.from('clients').select('id, name, phone, username, birthday').eq('business_id', S.biz.id).limit(5000),
      sb.from('bookings').select('client_id, starts_at, ends_at, status, service_id, staff_id').eq('business_id', S.biz.id)
        .not('client_id', 'is', null).in('status', ['pending', 'confirmed', 'done', 'noshow'])
        .gte('starts_at', dayStartIso(addDays(today(), -365))).order('starts_at').limit(10000),
    ]);
    const clients = new Map(must(cl).map((c) => [c.id, c]));
    const now = Date.now();
    const stats = new Map();
    for (const b of must(bk)) {
      const x = stats.get(b.client_id) || { visits: 0, noshow: 0, last: null, next: null, past: [] };
      if (b.status === 'noshow') x.noshow++;
      else if (attended(b, now)) { x.visits++; x.last = b; x.past.push(b); } else if (new Date(b.starts_at).getTime() >= now && !x.next) x.next = b;
      stats.set(b.client_id, x);
    }
    for (const x of stats.values()) {
      x.habit = habitOf(x.past);
      delete x.past;
    }
    S.ins = { t: Date.now(), biz: S.biz.id, clients, stats };
    return S.ins;
  }
  const modeOf = (xs) => { const m = new Map(); xs.forEach((v) => v != null && m.set(v, (m.get(v) || 0) + 1)); let best = null, n = 0; m.forEach((c, v) => { if (c > n) { best = v; n = c; } }); return [best, n]; };
  /** Costume: só com 2+ visitas no mesmo dia da semana (e pelo menos metade delas). */
  function habitOf(past) {
    if (past.length < 2) return null;
    const parts = past.map((b) => partsOf(b.starts_at));
    const [wd, n] = modeOf(parts.map((p) => p.weekday));
    if (n < 2 || n < past.length / 2) return null;
    const onDay = past.filter((_, i) => parts[i].weekday === wd);
    const mins = onDay.map((b) => { const t = partsOf(b.starts_at).time; return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)); }).sort((a, b) => a - b);
    const mid = mins[Math.floor(mins.length / 2)];
    return { wd, min: mid, svc: modeOf(onDay.map((b) => b.service_id))[0], staff: modeOf(onDay.map((b) => b.staff_id))[0] };
  }
  const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
  const hourWords = (m) => `${Math.floor(m / 60)}h${m % 60 ? String(m % 60).padStart(2, '0') : ''}`;

  /** Risco de falta de um horário marcado, pelo histórico da pessoa. null = sem risco ou sem dado. */
  function noShowRisk(b) {
    if (!S.ins || !b.client_id || b.paid_at || !['pending', 'confirmed'].includes(b.status) || new Date(b.starts_at).getTime() < Date.now()) return null;
    const x = S.ins.stats.get(b.client_id) || { visits: 0, noshow: 0 };
    let score = 0;
    const why = [];
    if (x.noshow) { score += x.noshow >= 2 ? 3 : 2; why.push(`faltou ${x.noshow} ${x.noshow === 1 ? 'vez' : 'vezes'}${x.visits ? ` e veio ${x.visits}` : ''}`); }
    if (!x.visits && !x.noshow && b.created_by !== 'owner') { score += 1; why.push('primeira vez, marcou sozinho'); }
    else if (!x.visits && x.noshow) score += 1; // nunca veio, só faltou
    const ahead = daysBetween(today(), partsOf(b.starts_at).date);
    if (ahead >= 14) { score += 1; why.push(`marcado com ${ahead} dias de antecedência`); }
    const level = score >= 3 ? 'alto' : score >= 2 ? 'médio' : null;
    return level ? { level, why } : null;
  }

  // ------------------------------------------------------------------ Encher a agenda
  // Os buracos de hoje e de amanhã e quem chamar para cada um: quem está na lista de espera para o dia,
  // quem costuma vir nesse dia e horário, e quem já passou do tempo de voltar. Mensagem pronta para cada pessoa.
  function freeWindows(date, busy) {
    const staffIds = S.staff.filter((p) => p.active).map((p) => p.id);
    const act = S.services.filter((s) => s.active);
    if (!staffIds.length || !act.length) return [];
    const step = S.biz.slot_minutes;
    const minDur = Math.min(...act.map((s) => s.duration_min));
    const slots = freeSlots({
      date, tz: tz(), durationMin: step, slotMinutes: step, hours: S.hours.filter((h) => h.weekday === weekdayOf(date)),
      busy, staffIds, now: new Date(), minNoticeMin: Math.max(60, S.biz.min_notice_minutes || 0),
    });
    const wins = [];
    for (const s of slots) {
      const t = new Date(s.startsAt).getTime();
      const w = wins[wins.length - 1];
      if (w && w.endMs === t) { w.endMs = t + step * MIN; w.end = localParts(new Date(w.endMs), tz()).time; s.staffIds.forEach((id) => w.staff.add(id)); }
      else wins.push({ date, start: s.time, startMs: t, endMs: t + step * MIN, end: localParts(new Date(t + step * MIN), tz()).time, staff: new Set(s.staffIds) });
    }
    return wins.filter((w) => (w.endMs - w.startMs) / MIN >= minDur);
  }
  const minOf = (t) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  /** Plano para encher a agenda de hoje (o que resta) e de amanhã. */
  async function fillPlan(waitRows) {
    const ins = await loadInsights();
    const t = today(), days = [t, addDays(t, 1)];
    const busyBy = await Promise.all(days.map((d) => busyOn(d)));
    const windows = days.flatMap((d, i) => freeWindows(d, busyBy[i]));
    if (!windows.length) return { windows, invites: [] };
    const used = new Set();
    const invites = [];
    const add = (w, c, time, svcId, reason, kind) => {
      if (!c?.phone || used.has(c.id || c.phone)) return;
      used.add(c.id || c.phone);
      invites.push({ w, c, time, svcId, reason, kind });
    };
    // 1) Lista de espera para o dia (ou qualquer dia)
    const PER = { any: [0, 1440], manha: [0, 720], tarde: [720, 1080], noite: [1080, 1440] };
    for (const wl of waitRows.filter((x) => !x.day)) { // quem pediu um dia certo aparece em "Vagou horário"
      const [p0, p1] = PER[wl.period] || PER.any;
      const w = windows.find((x) => (!wl.day || wl.day === x.date) && (!wl.staff_id || x.staff.has(wl.staff_id))
        && Math.max(minOf(x.start), p0) < Math.min(minOf(x.end), p1));
      if (w) add(w, { id: wl.client_id || 'w' + wl.id, name: wl.name, phone: wl.phone }, hhmm(Math.max(minOf(w.start), p0)), wl.service_id, 'está na lista de espera', 'espera');
    }
    // 2) Quem costuma vir nesse dia da semana e nesse horário (e não tem nada marcado)
    const now = Date.now();
    for (const [cid, x] of ins.stats) {
      const h = x.habit;
      if (!h || x.next) continue;
      const last = x.last ? new Date(x.last.starts_at).getTime() : 0;
      if (now - last < 10 * 24 * 3600e3) continue; // acabou de vir
      const w = windows.find((win) => weekdayOf(win.date) === h.wd && minOf(win.start) <= h.min + 60 && minOf(win.end) >= h.min);
      if (!w) continue;
      const time = hhmm(Math.max(minOf(w.start), Math.min(h.min, minOf(w.end) - (S.services.find((s) => s.id === h.svc)?.duration_min || S.biz.slot_minutes))));
      const snapped = hhmm(minOf(w.start) + Math.round((minOf(time) - minOf(w.start)) / S.biz.slot_minutes) * S.biz.slot_minutes);
      add(w, ins.clients.get(cid), snapped, h.svc, `costuma vir ${WD[h.wd].toLowerCase()} por volta das ${hourWords(h.min)}`, 'costume');
    }
    // 3) Quem passou do tempo de voltar (retorno do último serviço)
    for (const [cid, x] of ins.stats) {
      if (x.next || !x.last) continue;
      const svc = S.services.find((s) => s.id === x.last.service_id);
      if (!svc?.return_days) continue;
      const days2 = daysBetween(partsOf(x.last.starts_at).date, t);
      if (days2 < svc.return_days) continue;
      add(windows[0], ins.clients.get(cid), windows[0].start, svc.id, `${svc.name} há ${days2} dias (retorno: ${svc.return_days})`, 'retorno');
    }
    return { windows, invites };
  }
  function inviteMsg(inv) {
    const svc = svcName(inv.svcId);
    const link = linkOn() ? `\nSe preferir outro horário, escolha por aqui: ${bookingUrl(S.biz.booking_slug)}` : '';
    return `${hi(inv.c.name)} Vagou um horário ${dayWords(inv.w.date)} às ${inv.time}${svc ? ' para ' + svc : ''}. Quer que eu reserve para você?${link}`;
  }
  const winLabel = (w) => `${dayWords(w.date)} · ${w.start} às ${w.end}${S.staff.filter((p) => p.active).length > 1 ? ' (' + [...w.staff].map(staffName).filter(Boolean).join(', ') + ')' : ''}`;
  function fillCard(plan) {
    if (!plan.windows.length) return '';
    const sent = sentGet('convites');
    const key = (inv) => `${inv.c.id || inv.c.phone}-${inv.w.date}`;
    const open = plan.invites.filter((inv) => !sent.has(key(inv)));
    if (!open.length && !linkOn()) return '';
    return `<section class="card fill-card"><h3>Encher a agenda ${open.length ? `<span class="count">${open.length}</span>` : ''}</h3>
      <p class="hint fill-lead">Horários livres de hoje e amanhã:</p>
      <p class="fill-wins">${plan.windows.slice(0, 4).map((w) => `<span>${esc(winLabel(w))}</span>`).join('')}</p>
      ${open.length ? `<p class="hint">Quem chamar para esses horários (um toque abre o <b>seu</b> WhatsApp com a mensagem pronta):</p>
        ${open.slice(0, 5).map((inv) => `<div class="pend"><div class="pend-info"><b>${esc(clientLabel(inv.c))}</b>
          <small>${esc(inv.reason)}</small><small class="free">Sugestão: ${esc(dayWords(inv.w.date))} às ${esc(inv.time)}${svcName(inv.svcId) ? ' · ' + esc(svcName(inv.svcId)) : ''}</small></div>
          <div class="actions"><a class="btn small primary" target="_blank" rel="noopener" data-invite="${esc(key(inv))}" href="${waLink(inv.c.phone, inviteMsg(inv))}">Convidar</a></div></div>`).join('')}
        ${open.length > 5 ? `<button type="button" class="btn ghost block" id="fillAll">Ver todos (${open.length})</button>` : ''}`
        : '<p class="hint">Ninguém da sua lista combina com esses horários agora.</p>'}
      ${linkOn() ? '<button type="button" class="btn ghost block" id="fillShare">Divulgar os horários livres</button>' : ''}
    </section>`;
  }
  function openFillAll(plan) {
    const sent = sentGet('convites');
    const key = (inv) => `${inv.c.id || inv.c.phone}-${inv.w.date}`;
    const body = plan.windows.map((w) => {
      const invs = plan.invites.filter((inv) => inv.w === w);
      return `<h4>${esc(winLabel(w))}</h4>${invs.length ? invs.map((inv) => { const done = sent.has(key(inv)); return `<div class="pend${done ? ' sent' : ''}"><div class="pend-info"><b>${esc(clientLabel(inv.c))}</b>
        <small>${esc(inv.reason)} · sugestão ${esc(inv.time)}</small></div>
        <div class="actions">${done ? '<span class="chip ok">✓ Convidado</span>' : ''}<a class="btn small ${done ? 'ghost' : 'primary'}" target="_blank" rel="noopener" data-invite="${esc(key(inv))}" href="${waLink(inv.c.phone, inviteMsg(inv))}">${done ? 'De novo' : 'Convidar'}</a></div></div>`; }).join('')
        : '<p class="muted small">Ninguém combina com este horário.</p>'}`;
    }).join('');
    const form = sheet('Encher a agenda', `<p class="hint">Horários livres de hoje e amanhã e quem costuma vir nesses horários.</p>${body}`);
    $$('[data-invite]', form).forEach((a) => { a.addEventListener('click', () => sentAdd('convites', a.dataset.invite)); });
  }
  function fillShareText(plan) {
    const byDay = {};
    plan.windows.forEach((w) => { (byDay[w.date] ||= []).push(`${w.start} às ${w.end}`); });
    const lines = Object.entries(byDay).map(([d, ws]) => `${dayWords(d).replace(/^./, (c) => c.toUpperCase())}: ${ws.join(', ')}`);
    return `Tenho horário livre 👇\n${lines.join('\n')}\nMarque pelo link: ${bookingUrl(S.biz.booking_slug)}`;
  }

  // ------------------------------------------------------------------ Caixa (pagamentos)
  /** Registrar/alterar o que foi recebido de um atendimento. `back` reabre a tela de onde veio (o caixa). */
  function openPayment(b, { justDone = false, back = null } = {}) {
    const last = store.get('payMethod');
    const sel = b.paid_method || (PAY[last] ? last : 'pix');
    const val = b.paid_at ? b.paid_cents : b.price_cents;
    const what = [svcName(b.service_id), staffName(b.staff_id)].filter(Boolean).join(' · ');
    const form = sheet(justDone ? 'Atendimento feito ✓' : b.paid_at ? 'Pagamento' : 'Receber pagamento', `
      <p class="pay-who"><b>${esc(bookingName(b))}</b><small>${esc(what)}${what ? ' · ' : ''}${esc(whenLabel(b.starts_at))}</small></p>
      <label>${justDone ? 'Quanto você recebeu?' : 'Valor recebido'}<span class="money-big"><span>R$</span><input name="value" inputmode="decimal" autocomplete="off" maxlength="12" value="${esc(centsIn(val))}" placeholder="0,00"></span></label>
      <div class="pay-opts" role="radiogroup" aria-label="Como pagou">${Object.entries(PAY).map(([k, t]) =>
        `<label><input type="radio" name="method" value="${k}" ${k === sel ? 'checked' : ''}><span>${t}</span></label>`).join('')}</div>
      ${b.paid_at ? `<p class="hint">Registrado ${esc(whenLabel(b.paid_at))}.</p><button type="button" class="btn ghost block" id="unpay">Desfazer pagamento</button>`
        : justDone ? '<button type="button" class="btn ghost block" id="payLater">Receber depois</button>' : ''}`,
    { submitText: b.paid_at ? 'Salvar' : 'Recebido', onSubmit: async (f) => {
      const cents = parseMoney(f.get('value'));
      if (cents == null) throw new Error('Escreva o valor recebido (ex.: 50 ou 49,90).');
      const method = PAY[f.get('method')] ? String(f.get('method')) : 'pix';
      must(await sb.from('bookings').update({ paid_cents: cents, paid_method: method, paid_at: b.paid_at || new Date().toISOString() }).eq('id', b.id));
      store.set('payMethod', method);
      toast(`Recebido ${money(cents)} · ${PAY[method]} ✅`, 'ok');
      go(S.tab, { quiet: true, keepScroll: true });
      if (back) { back(); return false; }
    } });
    $('#unpay', form)?.addEventListener('click', (e) => busy(e.currentTarget, async () => {
      if (!confirm('Desfazer este pagamento?')) return;
      must(await sb.from('bookings').update({ paid_cents: null, paid_method: null, paid_at: null }).eq('id', b.id));
      toast('Pagamento desfeito.', 'ok');
      go(S.tab, { quiet: true, keepScroll: true });
      if (back) back(); else closeSheet();
    }));
    $('#payLater', form)?.addEventListener('click', () => { toast('Ok, fica em "A receber" no caixa do dia.'); closeSheet(); });
  }

  /** Pedir sinal por Pix: gera o "copia e cola" com o valor e abre o WhatsApp com a mensagem pronta. */
  function openDeposit(b) {
    const phone = b.clients?.phone;
    if (!S.biz.pix_key) {
      const form = sheet('Pedir sinal por Pix', `<p>Para pedir sinal, cadastre a sua chave Pix uma vez só.</p>
        <p class="hint">O código Pix é gerado aqui no app e o dinheiro cai direto na sua conta. O Entre não recebe esse dinheiro e não cobra taxa sobre ele.</p>
        <button type="button" class="btn primary block" id="toPix">Cadastrar chave Pix</button>`);
      $('#toPix', form).onclick = () => { closeSheet(); go('ajustes', { open: 'negocio' }); };
      return;
    }
    const price = b.price_cents || 0;
    const def = price ? Math.max(1000, Math.round((price * 0.3) / 500) * 500) : 2000; // ~30%, arredondado de R$ 5 em R$ 5
    const p = partsOf(b.starts_at);
    const msgFor = (cents) => {
      const code = pixCode({ key: S.biz.pix_key, name: S.biz.name, city: S.biz.pix_city || 'BRASIL', cents });
      return {
        code,
        text: `${hi(b.client_name || b.clients?.name)} Para segurar o seu horário ${dayWords(p.date)} às ${p.time}${svcName(b.service_id) ? ' (' + svcName(b.service_id) + ')' : ''}, pedimos um sinal de ${money(cents)} pelo Pix. `
          + `É só copiar o código abaixo e colar no app do seu banco, em "Pix copia e cola". O valor entra como parte do pagamento.\n\n${code}`,
      };
    };
    const form = sheet('Pedir sinal por Pix', `
      <p class="pay-who"><b>${esc(bookingName(b))}</b><small>${esc(svcName(b.service_id))} · ${esc(whenLabel(b.starts_at))}${price ? ' · ' + esc(brl(price)) : ''}</small></p>
      <label>Valor do sinal<span class="money-big"><span>R$</span><input name="value" inputmode="decimal" autocomplete="off" maxlength="10" value="${esc(centsIn(def))}"></span></label>
      <p class="hint">O Pix vai para a sua chave (${esc(S.biz.pix_key)}). Quando cair na conta, abra o agendamento e toque em "Registrar sinal recebido".</p>
      <a class="btn primary block" id="depWa" target="_blank" rel="noopener">Mandar pelo WhatsApp</a>
      <button type="button" class="btn ghost block" id="depCopy">Copiar só o código Pix</button>`);
    const upd = () => {
      const cents = parseMoney(form.elements.value.value) || 0;
      const m = msgFor(cents);
      $('#depWa', form).href = waLink(phone, m.text);
      $('#depWa', form).classList.toggle('disabled', !cents);
      form._code = m.code;
    };
    form.elements.value.oninput = upd;
    upd();
    $('#depWa', form).addEventListener('click', (e) => { if (!(parseMoney(form.elements.value.value) > 0)) { e.preventDefault(); toast('Escreva o valor do sinal.', 'bad'); } });
    $('#depCopy', form).onclick = async () => {
      try { await navigator.clipboard.writeText(form._code); toast('Código Pix copiado ✅', 'ok'); } catch { prompt('Copie o código Pix:', form._code); }
    };
  }

  /** Caixa de um dia: o que entrou (por forma de pagamento) e o que ainda falta receber. */
  async function openCash(date = today()) {
    const from = dayStartIso(date), to = dayStartIso(addDays(date, 1));
    const [dayRes, paidRes] = await Promise.all([
      sb.from('bookings').select(BOOK_SEL).eq('business_id', S.biz.id).in('status', ['pending', 'confirmed', 'done'])
        .gte('starts_at', from).lt('starts_at', to).order('starts_at'),
      sb.from('bookings').select(BOOK_SEL).eq('business_id', S.biz.id).gte('paid_at', from).lt('paid_at', to).order('paid_at'),
    ]);
    const dayRows = must(dayRes), paid = must(paidRes);
    const now = Date.now();
    const toGet = dayRows.filter((b) => attended(b, now) && !b.paid_at);
    const coming = dayRows.filter((b) => !attended(b, now) && !b.paid_at);
    const total = paid.reduce((s, b) => s + (b.paid_cents || 0), 0);
    const byM = Object.keys(PAY).map((k) => [k, paid.filter((b) => b.paid_method === k).reduce((s, b) => s + (b.paid_cents || 0), 0)]).filter(([, v]) => v);
    const toGetSum = toGet.reduce((s, b) => s + (b.price_cents || 0), 0);
    const comingSum = coming.reduce((s, b) => s + (b.price_cents || 0), 0);
    const isToday = date === today();
    [...dayRows, ...paid].forEach((b) => S.bk.set(b.id, b));
    const line = (b, btn) => `<div class="pend"><button type="button" class="pend-info" data-pay="${b.id}"><b>${esc(bookingName(b))}</b>
        <small>${esc([partsOf(b.starts_at).time, svcName(b.service_id), staffName(b.staff_id)].filter(Boolean).join(' · '))}</small></button>
        ${btn}</div>`;
    const body = `<div class="rep-nav">
        <button type="button" class="icon-btn" data-cash="${addDays(date, -1)}" aria-label="Dia anterior">‹</button>
        <b>${isToday ? 'Hoje' : esc(dayLabel(date))}</b>
        <button type="button" class="icon-btn" data-cash="${addDays(date, 1)}" aria-label="Próximo dia" ${isToday ? 'disabled style="visibility:hidden"' : ''}>›</button>
      </div>
      <div class="rep-tiles">
        <div class="big"><small>Recebido</small><b>${esc(money(total))}</b>
          <small>${byM.length ? byM.map(([k, v]) => `${PAY[k]} ${esc(money(v))}`).join(' · ') : 'nada registrado ainda'}</small></div>
        <div><b>${esc(money(toGetSum))}</b><small>a receber (${toGet.length} atendido${toGet.length === 1 ? '' : 's'})</small></div>
        <div><b>${esc(money(comingSum))}</b><small>${isToday ? 'ainda na agenda hoje' : 'não atendido'}</small></div>
      </div>
      ${toGet.length ? `<h4>A receber</h4>${toGet.map((b) => line(b, `<div class="actions"><b class="amt">${esc(brl(b.price_cents))}</b><button type="button" class="btn small primary" data-pay="${b.id}">Receber</button></div>`)).join('')}` : ''}
      ${paid.length ? `<h4>Recebido</h4>${paid.map((b) => line(b, `<div class="actions"><span class="paid amt">${esc(money(b.paid_cents))} · ${esc(PAY[b.paid_method] || '')}</span></div>`)).join('')}` : ''}
      ${!toGet.length && !paid.length ? '<p class="muted">Nenhum pagamento neste dia.</p>' : ''}
      <p class="hint">Para registrar: toque no atendimento › "Receber pagamento". Quando você marca "Atendimento feito", o app já pergunta quanto recebeu.</p>`;
    const form = sheet('Caixa do dia', body);
    const reopen = () => openCash(date).catch(fatal);
    $$('[data-pay]', form).forEach((el) => { el.onclick = () => openPayment(S.bk.get(el.dataset.pay), { back: reopen }); });
    $$('[data-cash]', form).forEach((el) => { el.onclick = () => { el.disabled = true; openCash(el.dataset.cash).catch(fatal); }; });
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

  /** O negócio estava aberto neste instante? (pelos horários de funcionamento) */
  function wasOpen(iso) {
    const p = partsOf(iso);
    return S.hours.some((h) => h.weekday === p.weekday && h.opens.slice(0, 5) <= p.time && p.time < h.closes.slice(0, 5));
  }
  /** "Feito pela secretária": mostra em reais o que ela marcou sozinha (e quanto foi com o negócio fechado). */
  function winCard(rows) {
    if (!rows.length) return '';
    const total = rows.reduce((s, b) => s + (b.price_cents || 0), 0);
    const night = rows.filter((b) => !wasOpen(b.created_at));
    const nightTotal = night.reduce((s, b) => s + (b.price_cents || 0), 0);
    // nota de dinheiro (duas notas, a da frente na cor do tema) e lua desenhada: nada de emoji
    const NOTE = `<svg class="win-note" viewBox="0 0 64 42" aria-hidden="true"><rect class="n2" x="9" y="2" width="53" height="30" rx="4"/><rect class="n1" x="2" y="10" width="53" height="30" rx="4"/>
      <circle class="nl" cx="28.5" cy="25" r="7.5"/><path class="nl" d="M28.5 20.6v8.8M31.2 22.3h-3.6a1.6 1.6 0 0 0 0 3.2h1.8a1.6 1.6 0 0 1 0 3.2h-3.6"/><circle class="nd" cx="9.5" cy="17" r="1.7"/><circle class="nd" cx="47.5" cy="33" r="1.7"/></svg>`;
    const MOON = '<svg class="moon" viewBox="0 0 24 24" aria-hidden="true"><path d="M19.5 14.8A7.8 7.8 0 1 1 9.2 4.5a6.2 6.2 0 0 0 10.3 10.3z"/><path class="st" d="M17 4.2l.5 1.3 1.3.5-1.3.5-.5 1.3-.5-1.3-1.3-.5 1.3-.5z"/></svg>';
    return `<section class="card win-card"><div class="win-head"><h3>Feito pela secretária</h3>${NOTE}</div>
      <b class="win-val">${esc(money(total))}</b>
      <p class="win-sub">${rows.length} horário${rows.length === 1 ? '' : 's'} em 7 dias · sem você responder</p>
      ${night.length ? `<p class="win-night">${MOON}<span>${night.length === rows.length ? 'Todos' : night.length} ${night.length === 1 ? 'foi marcado' : 'foram marcados'} com o negócio fechado${nightTotal ? ` (${esc(money(nightTotal))})` : ''}.</span></p>` : ''}
    </section>`;
  }

  /** Caixa de hoje (resumo; o toque abre o caixa completo). Só aparece se teve atendimento ou pagamento hoje. */
  function cashCard(H, paidToday) {
    const now = Date.now();
    const toGet = H.filter((b) => b.status !== 'block' && attended(b, now) && !b.paid_at);
    const got = paidToday.reduce((s, b) => s + (b.paid_cents || 0), 0);
    if (!toGet.length && !paidToday.length) return '';
    const toGetSum = toGet.reduce((s, b) => s + (b.price_cents || 0), 0);
    const byM = Object.keys(PAY).map((k) => [k, paidToday.filter((b) => b.paid_method === k).reduce((s, b) => s + (b.paid_cents || 0), 0)]).filter(([, v]) => v);
    return `<button type="button" class="card rep-card cash-card" id="toCash">
      <span class="grow"><small>Caixa de hoje</small><b>${esc(money(got))} <span class="muted small">recebido</span></b>
      <small>${toGet.length ? `<span class="due">${esc(money(toGetSum))} a receber (${toGet.length})</span>` : 'Tudo recebido ✓'}${byM.length ? ' · ' + byM.map(([k, v]) => `${PAY[k]} ${esc(money(v))}`).join(' · ') : ''}</small></span><b class="go">›</b></button>`;
  }
  /** Lembrar quem vem amanhã (só confirmados com WhatsApp; some quando todos foram lembrados). */
  function remindCard(rows) {
    const sent = sentGet('lembrados');
    const list = rows.filter((b) => b.status === 'confirmed' && b.clients?.phone);
    if (!list.length || list.every((b) => sent.has(b.id))) return '';
    const left = list.filter((b) => !sent.has(b.id)).length;
    return `<section class="card"><h3>Lembrar quem vem amanhã <span class="count">${left}</span></h3>
      <p class="hint">Um toque abre o <b>seu</b> WhatsApp com o lembrete pronto. Diminui as faltas.</p>
      ${list.map((b) => { S.bk.set(b.id, b); const done = sent.has(b.id); return `<div class="pend${done ? ' sent' : ''}"><button type="button" class="pend-info" data-booking="${b.id}"><b>${esc(bookingName(b))}</b>
        <small>${esc(partsOf(b.starts_at).time)}${svcName(b.service_id) ? ' · ' + esc(svcName(b.service_id)) : ''}</small></button>
        <div class="actions">${done ? '<span class="chip ok">✓ Lembrado</span>' : ''}<a class="btn small ${done ? 'ghost' : 'primary'}" target="_blank" rel="noopener" data-remind="${b.id}" href="${waLink(b.clients.phone, remindMsg(b))}">${done ? 'De novo' : 'Lembrar'}</a></div></div>`; }).join('')}
    </section>`;
  }
  /** Aniversários dos próximos 7 dias; o botão de parabéns aparece no dia. */
  function bdayCard(clients) {
    const up = upcomingBirthdays(clients);
    if (!up.length) return '';
    const year = today().slice(0, 4);
    const sent = sentGet('parabens');
    return `<section class="card"><h3>Aniversários 🎂 <span class="count">${up.length}</span></h3>
      ${up.slice(0, 12).map(({ c, d, i }) => { const key = c.id + '-' + year; const done = sent.has(key); return `<div class="pend"><button type="button" class="pend-info" data-client-open="${c.id}"><b>${esc(clientLabel(c))}</b>
        <small>${i === 0 ? '<b class="today-tag">hoje</b>' : esc(dayWords(d))}</small></button>
        <div class="actions">${i === 0 && c.phone ? `${done ? '<span class="chip ok">✓ Enviado</span>' : ''}<a class="btn small ${done ? 'ghost' : 'primary'}" target="_blank" rel="noopener" data-bday="${esc(key)}" href="${waLink(c.phone, bdayMsg(c))}">${done ? 'De novo' : 'Dar parabéns'}</a>` : ''}</div></div>`; }).join('')}
    </section>`;
  }
  /** Vagou horário no dia que alguém da lista de espera queria. */
  function waitCard(rows, slots) {
    const hits = rows.filter((w) => slots.has(w.id));
    if (!hits.length) return '';
    return `<section class="card wait-card"><h3>Vagou horário · lista de espera <span class="count">${hits.length}</span></h3>
      ${hits.map((w) => { const sl = slots.get(w.id); return `<div class="pend"><div class="pend-info"><b>${esc(w.name || phoneText(w.phone))}</b>
        <small>${esc(waitSub(w))}</small><small class="free">Livre: ${esc(sl.slice(0, 4).map((s) => s.time).join(', '))}${sl.length > 4 ? '…' : ''}</small></div>
        <div class="actions">${w.phone ? `<a class="btn small primary" target="_blank" rel="noopener" href="${waLink(w.phone, waitMsg(w, sl))}">Avisar</a>` : ''}<button type="button" class="btn small ghost" data-wbook="${w.id}">Marcar</button></div></div>`; }).join('')}
      <button type="button" class="btn ghost block" data-open-wait>Ver lista de espera</button>
    </section>`;
  }

  VIEWS.inicio = async (opts = {}) => {
    const id = S.biz.id, t = today(), ym = ymOf(t);
    const [pend, hoje, convs, mes, sec, pago, amanha, aniv, espera] = await Promise.all([
      sb.from('bookings').select(BOOK_SEL).eq('business_id', id).eq('status', 'pending').gte('starts_at', new Date().toISOString()).order('starts_at').limit(50),
      sb.from('bookings').select(BOOK_SEL).eq('business_id', id).gte('starts_at', dayStartIso(t)).lt('starts_at', dayStartIso(addDays(t, 1))).in('status', ['pending', 'confirmed', 'done', 'noshow', 'block']).order('starts_at'),
      sb.from('conversations').select('id, last_message_at, clients(name, phone, username)').eq('business_id', id).eq('needs_human', true).order('last_message_at', { ascending: false }).limit(20),
      sb.from('bookings').select('starts_at, ends_at, status, price_cents, paid_cents, paid_at').eq('business_id', id).in('status', ['done', 'confirmed'])
        .gte('starts_at', dayStartIso(ym + '-01')).lt('starts_at', new Date().toISOString()).limit(5000),
      // O que a secretária (WhatsApp) e o link marcaram sozinhos nos últimos 7 dias
      sb.from('bookings').select('created_at, price_cents').eq('business_id', id).in('created_by', ['assistant', 'link'])
        .neq('status', 'cancelled').gte('created_at', dayStartIso(addDays(t, -6))).limit(2000),
      // Caixa: o que foi recebido hoje (de atendimentos de qualquer dia, inclusive sinal)
      sb.from('bookings').select('paid_cents, paid_method').eq('business_id', id).gte('paid_at', dayStartIso(t)).lt('paid_at', dayStartIso(addDays(t, 1))).limit(2000),
      sb.from('bookings').select(BOOK_SEL).eq('business_id', id).eq('status', 'confirmed')
        .gte('starts_at', dayStartIso(addDays(t, 1))).lt('starts_at', dayStartIso(addDays(t, 2))).order('starts_at').limit(100),
      sb.from('clients').select('id, name, phone, username, birthday').eq('business_id', id).not('birthday', 'is', null).limit(5000),
      sb.from('waitlist').select('*').eq('business_id', id).eq('status', 'waiting').order('created_at').limit(100),
      loadInsights().catch((e) => { console.warn('histórico indisponível', e); return null; }),
    ]);
    const P = must(pend), H = must(hoje), C = must(convs), M = must(mes).filter((b) => attended(b)), W = must(sec);
    const PG = must(pago), AM = must(amanha), BD = must(aniv), WL = must(espera);
    const [WS, FP] = await Promise.all([
      WL.length ? waitSlots(WL) : new Map(),
      S.ins ? fillPlan(WL).catch((e) => { console.warn('encher a agenda indisponível', e); return { windows: [], invites: [] }; }) : { windows: [], invites: [] },
    ]);
    const mesTotal = M.reduce((s, b) => s + charged(b), 0);
    const list = checklist();
    const done = list.filter((x) => x[0]).length;
    const hojeAtend = H.filter((b) => b.status !== 'block');
    const total = hojeAtend.filter((b) => b.status !== 'noshow').reduce((s, b) => s + (b.price_cents || 0), 0);
    const hr = Number(localParts(new Date(), tz()).time.slice(0, 2));
    const hello = hr < 5 ? 'Boa noite' : hr < 12 ? 'Bom dia' : hr < 18 ? 'Boa tarde' : 'Boa noite';

    const who = firstName(S.biz.owner_name);
    const dateLong = (() => { const p = localParts(new Date(), tz()); return `${WD[p.weekday]}, ${Number(p.date.slice(8, 10))} de ${MONTHS[Number(p.date.slice(5, 7)) - 1]}`; })();
    let html = S.biz.cover_url ? `<div class="cover"><img alt="" src="${esc(S.biz.cover_url)}"></div>` : '';
    html += `<div class="greet"><h2>${hello}${who ? ', ' + esc(who) : ''}.</h2>
      <p>${esc(dateLong)} · ${hojeAtend.length ? `${hojeAtend.length} atendimento${hojeAtend.length > 1 ? 's' : ''} hoje` : 'nenhum atendimento hoje até agora'}</p></div>`;
    const stIc = (d) => `<svg class="st-ic" viewBox="0 0 24 24" aria-hidden="true">${d}</svg>`;
    html += `<div class="stats">
      <div>${stIc('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>')}<b>${P.length}</b><small>para confirmar</small></div>
      <div>${stIc('<path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H10l-4.5 4v-4A1.5 1.5 0 0 1 4 14.5z"/>')}<b>${C.length}</b><small>${C.length === 1 ? 'conversa esperando você' : 'conversas esperando você'}</small></div>
      <div>${stIc('<rect x="2.5" y="6.5" width="19" height="11" rx="2"/><circle cx="12" cy="12" r="2.6"/><path d="M6 9.5h.01M18 14.5h.01"/>')}<b>${total % 100 === 0 ? 'R$ ' + (total / 100).toLocaleString('pt-BR') : esc(brl(total))}</b><small>previsto hoje</small></div>
    </div>`;
    html += winCard(W);
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
          <small>${b.created_by === 'link' ? 'Pelo link · ' : ''}${esc(svcName(b.service_id))}${staffName(b.staff_id) ? ' com ' + esc(staffName(b.staff_id)) : ''} · ${esc(whenLabel(b.starts_at))}</small></button>
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
    html += waitCard(WL, WS);
    html += fillCard(FP);
    html += `<section class="card"><h3>Hoje, ${esc(dayLabel(t))}</h3>
      ${H.length ? `<div class="list">${H.map((b) => bookingRow(b)).join('')}</div>` : '<p class="muted">Agenda livre hoje.</p>'}
      <button type="button" class="btn ghost block" id="toAgenda">Ver agenda completa</button></section>`;
    html += cashCard(H, PG);
    html += remindCard(AM);
    html += bdayCard(BD);
    html += `<button type="button" class="card rep-card" id="toReport">
      <span class="grow"><small>${esc(MONTHS[Number(ym.slice(5, 7)) - 1])} até agora</small><b>${esc(money(mesTotal))}</b>
      <small>${M.length} atendimento${M.length === 1 ? '' : 's'} · ver relatório do mês</small></span><b class="go">›</b></button>`;

    if (stale(opts)) return;
    const v = $('#view');
    v.innerHTML = html;
    bindBookingRows(v);
    $$('[data-goto]', v).forEach((b) => { b.onclick = () => go('ajustes', { open: b.dataset.goto }); });
    $$('[data-conv]', v).forEach((b) => { b.onclick = () => { S.conv = b.dataset.conv; go('conversas'); }; });
    $('#toAgenda').onclick = () => go('agenda');
    $('#toCash')?.addEventListener('click', (e) => {
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      openCash().catch(fatal).finally(() => { b.disabled = false; });
    });
    // Abriu o WhatsApp: marca como lembrado/parabenizado (neste aparelho) e atualiza o cartão
    $$('[data-remind]', v).forEach((a) => { a.addEventListener('click', () => { sentAdd('lembrados', a.dataset.remind); setTimeout(() => S.tab === 'inicio' && go('inicio', { quiet: true, keepScroll: true }), 800); }); });
    $$('[data-bday]', v).forEach((a) => { a.addEventListener('click', () => { sentAdd('parabens', a.dataset.bday); setTimeout(() => S.tab === 'inicio' && go('inicio', { quiet: true, keepScroll: true }), 800); }); });
    $$('[data-client-open]', v).forEach((el) => { el.onclick = () => openClientById(el.dataset.clientOpen).catch(fatal); });
    $$('[data-wbook]', v).forEach((el) => { el.onclick = () => { const w = WL.find((x) => x.id === el.dataset.wbook); bookFromWait(w, WS.get(w.id)); }; });
    $('[data-open-wait]', v)?.addEventListener('click', () => openWaitlist().catch(fatal));
    // Encher a agenda: convite enviado some do cartão; "Ver todos" e "Divulgar"
    $$('[data-invite]', v).forEach((a) => { a.addEventListener('click', () => { sentAdd('convites', a.dataset.invite); setTimeout(() => S.tab === 'inicio' && go('inicio', { quiet: true, keepScroll: true }), 800); }); });
    $('#fillAll', v)?.addEventListener('click', () => openFillAll(FP));
    $('#fillShare', v)?.addEventListener('click', async () => {
      const text = fillShareText(FP);
      try { if (navigator.share) { await navigator.share({ text }); return; } } catch { return; }
      try { await navigator.clipboard.writeText(text); toast('Texto copiado. Cole no status do WhatsApp ou no Instagram.', 'ok'); } catch { prompt('Copie o texto:', text); }
    });
    $('#toReport').onclick = (e) => {
      const b = e.currentTarget;
      if (b.disabled) return;
      b.disabled = true;
      openReport(ym).catch(fatal).finally(() => { b.disabled = false; });
    };
    $$('[data-decide]', v).forEach((btn) => {
      btn.onclick = () => busy(btn, async () => {
        if (btn.dataset.decide === 'cancelled' && !confirm('Recusar este pedido? A pessoa recebe uma mensagem pedindo para escolher outro horário.')) return;
        await decide(btn.dataset.id, btn.dataset.decide);
        go('inicio', { quiet: true });
        if (btn.dataset.decide === 'cancelled' && S.bk.get(btn.dataset.id)) offerWaitlist(S.bk.get(btn.dataset.id));
      });
    });
  };

  // ------------------------------------------------------------------ Relatório do mês
  // Atendido = marcado como "Atendimento feito" ou confirmado com horário que já passou (muita gente não marca).
  // Faltas e cancelados ficam fora do faturamento.
  async function openReport(ym) {
    const cur = ymOf(today());
    const from = dayStartIso(ymAdd(ym, -1) + '-01'), mid = dayStartIso(ym + '-01'), to = dayStartIso(ymAdd(ym, 1) + '-01');
    const [bk, nc, pg] = await Promise.all([
      sb.from('bookings').select('starts_at, ends_at, status, price_cents, paid_cents, paid_method, paid_at, service_id, staff_id, client_id, client_name, created_by')
        .eq('business_id', S.biz.id).neq('status', 'block').gte('starts_at', from).lt('starts_at', to).limit(10000),
      sb.from('clients').select('id', { count: 'exact', head: true }).eq('business_id', S.biz.id).gte('created_at', mid).lt('created_at', to),
      // Recebido no mês (pela data do pagamento, inclui sinal de horário de outro mês)
      sb.from('bookings').select('paid_cents, paid_method').eq('business_id', S.biz.id).gte('paid_at', mid).lt('paid_at', to).limit(10000),
    ]);
    const all = must(bk), paidRows = must(pg);
    if (nc.error) throw new Error(friendly(nc.error));
    const now = Date.now();
    const inMonth = all.filter((b) => b.starts_at >= mid);
    const prevRev = all.filter((b) => b.starts_at < mid && attended(b, now)).reduce((s, b) => s + charged(b), 0);
    const A = inMonth.filter((b) => attended(b, now));
    const rev = A.reduce((s, b) => s + charged(b), 0);
    const ahead = inMonth.filter((b) => ['pending', 'confirmed'].includes(b.status) && new Date(b.starts_at).getTime() >= now);
    const aheadRev = ahead.reduce((s, b) => s + (b.price_cents || 0), 0);
    const noshow = inMonth.filter((b) => b.status === 'noshow').length;
    const cancelled = inMonth.filter((b) => b.status === 'cancelled').length;
    const priced = A.filter((b) => b.paid_at || b.price_cents != null);
    const ticket = priced.length ? Math.round(priced.reduce((s, b) => s + charged(b), 0) / priced.length) : 0;
    const people = new Set(A.map((b) => b.client_id).filter(Boolean)).size;
    const diff = prevRev ? Math.round(((rev - prevRev) / prevRev) * 100) : null;

    const group = (list, key) => {
      const m = new Map();
      for (const b of list) { const k = key(b); if (k == null) continue; const x = m.get(k) || { n: 0, c: 0 }; x.n++; x.c += charged(b); m.set(k, x); }
      return m;
    };
    // Comissão: % de cada profissional sobre o valor dos atendimentos dela no mês
    const pctOf = (sid) => { const v = S.staff.find((p) => p.id === sid)?.commission_pct; return v == null ? null : Number(v); };
    const comRows = [...group(A, (b) => b.staff_id)].map(([k, v]) => ({ id: k, name: staffName(k) || '—', ...v, pct: pctOf(k) }))
      .filter((r) => r.pct != null).sort((a, b) => b.c - a.c);
    const comTotal = comRows.reduce((s, r) => s + Math.round((r.c * r.pct) / 100), 0);
    const recTotal = paidRows.reduce((s, b) => s + (b.paid_cents || 0), 0);
    const recRows = Object.keys(PAY).map((k) => ({ label: PAY[k], n: paidRows.filter((b) => b.paid_method === k).reduce((s, b) => s + (b.paid_cents || 0), 0) })).filter((r) => r.n);
    const bars = (rows, fmt = (r) => `${r.n}`) => {
      const max = Math.max(1, ...rows.map((r) => r.n));
      return `<div class="rep-bars">${rows.map((r) => `<div class="rep-bar"><span>${esc(r.label)}</span><i style="--w:${Math.round((r.n / max) * 100)}%"></i><em>${esc(fmt(r))}</em></div>`).join('')}</div>`;
    };
    const bySvc = [...group(A, (b) => b.service_id)].map(([k, v]) => ({ label: svcName(k) || 'Serviço apagado', ...v })).sort((a, b) => b.n - a.n || b.c - a.c).slice(0, 6);
    const byWd = group(A, (b) => partsOf(b.starts_at).weekday);
    const wdRows = WEEK_ORDER.filter((w) => byWd.has(w) || S.hours.some((h) => h.weekday === w)).map((w) => ({ label: WD[w], n: byWd.get(w)?.n || 0 }));
    const byHour = group(A, (b) => partsOf(b.starts_at).time.slice(0, 2));
    const hourRows = [...byHour].sort((a, b) => a[0].localeCompare(b[0])).map(([h, v]) => ({ label: `${Number(h)}h`, ...v }));
    const byStaff = [...group(A, (b) => b.staff_id)].map(([k, v]) => ({ label: staffName(k) || '—', ...v })).sort((a, b) => b.n - a.n);
    const valid = inMonth.filter((b) => b.status !== 'cancelled');
    const byOrigin = group(valid, (b) => b.created_by);
    const originRows = ['assistant', 'link', 'owner'].filter((k) => byOrigin.has(k)).map((k) => ({ label: ORIGIN[k], n: byOrigin.get(k).n }));
    const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

    const body = `<div class="rep-nav">
        <button type="button" class="icon-btn" data-ym="${ymAdd(ym, -1)}" aria-label="Mês anterior">‹</button>
        <b>${esc(monthName(ym))}</b>
        <button type="button" class="icon-btn" data-ym="${ymAdd(ym, 1)}" aria-label="Próximo mês" ${ym >= cur ? 'disabled style="visibility:hidden"' : ''}>›</button>
      </div>
      <div class="rep-tiles">
        <div class="big"><small>Faturamento${ym === cur ? ' até agora' : ''}</small><b>${esc(money(rev))}</b>
          <small>${diff == null ? '' : `<span class="${diff >= 0 ? 'up' : 'down'}">${diff >= 0 ? '▲' : '▼'} ${Math.abs(diff)}%</span> em relação a ${esc(MONTHS[Number(ymAdd(ym, -1).slice(5, 7)) - 1])}`}${ahead.length ? `${diff == null ? '' : ' · '}+ ${esc(money(aheadRev))} ainda agendado` : ''}</small></div>
        <div><b>${A.length}</b><small>atendimentos</small></div>
        <div><b>${people}</b><small>pessoas atendidas</small></div>
        <div><b>${esc(money(ticket))}</b><small>valor médio por atendimento</small></div>
        <div><b>${nc.count || 0}</b><small>clientes novos</small></div>
        <div><b>${noshow}</b><small>faltas${noshow ? ` (${pct(noshow, noshow + A.length)}%)` : ''}</small></div>
        <div><b>${cancelled}</b><small>cancelados</small></div>
      </div>
      ${A.length ? `<h4>Serviços que mais saem</h4>${bars(bySvc, (r) => `${r.n}× · ${money(r.c)}`)}
        <h4>Dias mais cheios</h4>${bars(wdRows)}
        <h4>Horários mais procurados</h4>${bars(hourRows)}
        ${byStaff.length > 1 ? `<h4>Quem atendeu</h4>${bars(byStaff, (r) => `${r.n} · ${money(r.c)}`)}` : ''}`
        : '<p class="muted">Nenhum atendimento neste mês.</p>'}
      ${comRows.length ? `<h4>Comissões</h4><div class="com-list">${comRows.map((r) => `<div class="com-row"><span><b>${esc(r.name)}</b><small>${r.n} atendimento${r.n === 1 ? '' : 's'} · ${esc(money(r.c))} × ${String(r.pct).replace('.', ',')}%</small></span><b>${esc(money(Math.round((r.c * r.pct) / 100)))}</b></div>`).join('')}
        ${comRows.length > 1 ? `<div class="com-row total"><span><b>Total de comissões</b></span><b>${esc(money(comTotal))}</b></div>` : ''}</div>` : ''}
      ${recRows.length ? `<h4>Recebido no mês · ${esc(money(recTotal))}</h4>${bars(recRows, (r) => money(r.n))}` : ''}
      ${originRows.length ? `<h4>De onde vieram os agendamentos</h4>${bars(originRows)}` : ''}
      <p class="hint">Conta como atendimento o que foi marcado como "Atendimento feito" ou confirmado com horário que já passou. Faltas e cancelados ficam fora do faturamento. Quando você registra o pagamento, vale o valor recebido.${comRows.length ? ' A comissão é calculada sobre esse valor.' : ''}</p>`;
    const form = sheet('Relatório do mês', body + (inMonth.length ? '<button type="button" class="btn ghost block" id="repCsv">Baixar planilha do mês</button>' : ''));
    $$('[data-ym]', form).forEach((b) => { b.onclick = () => { b.disabled = true; openReport(b.dataset.ym).catch(fatal); }; });
    // Planilha (abre no Excel e no Google Planilhas): um atendimento por linha
    $('#repCsv', form)?.addEventListener('click', () => {
      const cell = (v) => { const s = String(v ?? ''); return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
      const num = (c) => (c == null ? '' : (c / 100).toFixed(2).replace('.', ','));
      const lines = [['Data', 'Hora', 'Cliente', 'Serviço', 'Profissional', 'Situação', 'Preço', 'Recebido', 'Forma', 'Origem'].join(';')];
      [...inMonth].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).forEach((b) => {
        const p = partsOf(b.starts_at);
        lines.push([`${p.date.slice(8, 10)}/${p.date.slice(5, 7)}/${p.date.slice(0, 4)}`, p.time, b.client_name, svcName(b.service_id), staffName(b.staff_id),
          STATUS[b.status]?.[0] || b.status, num(b.price_cents), b.paid_at ? num(b.paid_cents) : '', PAY[b.paid_method] || '', ORIGIN[b.created_by] || ''].map(cell).join(';'));
      });
      const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `entre-${ym}.csv`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    });
  }

  // ------------------------------------------------------------------ Agenda
  VIEWS.agenda = async (opts = {}) => {
    const d = S.day || today();
    const start = addDays(d, -weekdayOf(d)); // domingo da semana
    const end = addDays(start, 7);
    const [bkRes, waitRes] = await Promise.all([
      sb.from('bookings').select(BOOK_SEL).eq('business_id', S.biz.id)
        .gte('starts_at', dayStartIso(start)).lt('starts_at', dayStartIso(end)).neq('status', 'cancelled').order('starts_at'),
      sb.from('waitlist').select('id', { count: 'exact', head: true }).eq('business_id', S.biz.id).eq('status', 'waiting'),
    ]);
    const rows = must(bkRes);
    const waitN = waitRes.error ? 0 : waitRes.count || 0;
    await loadInsights().catch(() => null); // para mostrar "pode faltar" nos horários
    const byDay = {};
    rows.forEach((b) => { (byDay[partsOf(b.starts_at).date] ||= []).push(b); });
    const t = today();
    const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
    const list = byDay[d] || [];
    const open = S.hours.filter((h) => h.weekday === weekdayOf(d)).sort((a, b) => a.opens.localeCompare(b.opens));
    const m = Number(d.slice(5, 7)) - 1;
    const multi = S.staff.filter((p) => p.active).length > 1;
    const aview = store.get('agendaView') === 'grade' ? 'grade' : 'lista';

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
        ${multi && open.length ? `<div class="seg ag-view-seg" role="group" aria-label="Como ver o dia"><button type="button" data-aview="lista" class="${aview === 'lista' ? 'sel' : ''}">Lista</button><button type="button" data-aview="grade" class="${aview === 'grade' ? 'sel' : ''}">Por pessoa</button></div>` : ''}
        ${multi && open.length && aview === 'grade' ? dayGrid(d, list, open)
          : list.length ? `<div class="list">${list.map((b) => bookingRow(b)).join('')}</div>` : `<p class="muted">${open.length ? 'Nenhum horário marcado neste dia.' : 'Fechado neste dia.'}</p>`}
      </section>
      <button type="button" class="card wait-link" id="waitBtn"><span class="grow"><b>Lista de espera</b><small>${waitN ? `${waitN} pessoa${waitN > 1 ? 's' : ''} esperando vaga` : 'Ninguém esperando · toque para colocar alguém'}</small></span>${waitN ? `<span class="count">${waitN}</span>` : ''}<b class="go">›</b></button>
      <div class="fab-row"><button type="button" class="btn primary" id="newBk">+ Marcar horário</button><button type="button" class="btn ghost" id="newBlock">Bloquear horário</button></div>`;
    const v = $('#view');
    bindBookingRows(v);
    $$('[data-day]', v).forEach((b) => { b.onclick = () => { S.day = b.dataset.day; go('agenda', { quiet: true }); }; });
    $('#prevW').onclick = () => { S.day = addDays(d, -7); go('agenda', { quiet: true }); };
    $('#nextW').onclick = () => { S.day = addDays(d, 7); go('agenda', { quiet: true }); };
    $('#todayBtn')?.addEventListener('click', () => { S.day = t; go('agenda', { quiet: true }); });
    $('#newBk').onclick = () => newBooking(d);
    $('#newBlock').onclick = () => newBlock(d);
    $$('[data-aview]', v).forEach((b) => { b.onclick = () => { store.set('agendaView', b.dataset.aview); go('agenda', { quiet: true, keepScroll: true }); }; });
    // Grade: toque num espaço vazio abre "Marcar horário" já com a pessoa e a hora
    $$('[data-gstaff]', v).forEach((col) => {
      col.addEventListener('click', (e) => {
        if (e.target !== col && !e.target.classList.contains('gnow')) return; // bloco marcado ou horário fechado: não abre
        const rect = col.getBoundingClientRect();
        const t0 = minOf(col.closest('.grid-wrap').querySelector('.gtimes span').textContent.replace('h', '').padStart(2, '0') + ':00');
        const step = S.biz.slot_minutes;
        const mins = t0 + Math.floor(((e.clientY - rect.top) / GRID_PX) / step) * step;
        newBooking(d, { staff_id: col.dataset.gstaff, time: hhmm(mins) });
      });
    });
    $('#waitBtn').onclick = (e) => { const b = e.currentTarget; if (b.disabled) return; b.disabled = true; openWaitlist().catch(fatal).finally(() => { b.disabled = false; }); };
  };

  /** Dia em colunas, uma por pessoa (como nas agendas grandes). Toque num espaço vazio = marcar ali. */
  const GRID_PX = 1.15; // pixels por minuto
  function dayGrid(d, list, open) {
    const staff = S.staff.filter((p) => p.active);
    let t0 = Math.min(...open.map((h) => minOf(h.opens.slice(0, 5)))), t1 = Math.max(...open.map((h) => minOf(h.closes.slice(0, 5))));
    const span = (b) => { const s = minOf(partsOf(b.starts_at).time); const e = partsOf(b.ends_at).date > d ? 1440 : minOf(partsOf(b.ends_at).time); return [s, Math.max(e, s + 10)]; };
    list.forEach((b) => { const [s, e] = span(b); t0 = Math.min(t0, s); t1 = Math.max(t1, e); });
    t0 = Math.floor(t0 / 60) * 60; t1 = Math.ceil(t1 / 60) * 60;
    const H = (t1 - t0) * GRID_PX;
    const y = (m) => ((m - t0) * GRID_PX).toFixed(1);
    const shifts = [...open].sort((a, b) => a.opens.localeCompare(b.opens)).map((h) => [minOf(h.opens.slice(0, 5)), minOf(h.closes.slice(0, 5))]);
    const closedBands = [];
    let cur = t0;
    for (const [a, b] of shifts) { if (a > cur) closedBands.push([cur, a]); cur = Math.max(cur, b); }
    if (cur < t1) closedBands.push([cur, t1]);
    const now = localParts(new Date(), tz());
    const nowLine = now.date === d ? minOf(now.time) : null;
    const hoursCol = Array.from({ length: (t1 - t0) / 60 }, (_, i) => `<span style="top:${y(t0 + i * 60)}px">${(t0 / 60) + i}h</span>`).join('');
    const col = (p) => {
      const mine = list.filter((b) => b.staff_id === p.id || (b.status === 'block' && !b.staff_id));
      return `<div class="gcol"><div class="ghead">${esc(firstName(p.name))}</div>
        <div class="gbody" data-gstaff="${p.id}" style="height:${H}px">
          ${closedBands.map(([a, b]) => `<i class="gclosed" style="top:${y(a)}px;height:${((b - a) * GRID_PX).toFixed(1)}px"></i>`).join('')}
          ${nowLine != null && nowLine >= t0 && nowLine <= t1 ? `<i class="gnow" style="top:${y(nowLine)}px"></i>` : ''}
          ${mine.map((b) => { S.bk.set(b.id, b); const [s, e] = span(b); const risk = noShowRisk(b);
            return `<button type="button" class="gb st-${b.status}${risk ? ' risky' : ''}" data-booking="${b.id}" style="top:${y(s)}px;height:${Math.max(20, (e - s) * GRID_PX - 2).toFixed(1)}px">
              <b>${partsOf(b.starts_at).time} ${esc(bookingName(b))}</b>${b.status !== 'block' ? `<small>${esc(svcName(b.service_id))}${b.paid_at ? ' · pago' : ''}</small>` : ''}</button>`; }).join('')}
        </div></div>`;
    };
    return `<div class="grid-wrap"><div class="gtimes" style="height:${H}px;margin-top:28px">${hoursCol}</div>
      <div class="gcols" style="--cols:${staff.length}">${staff.map(col).join('')}</div></div>
      <p class="hint">Toque num espaço vazio para marcar ali.</p>`;
  }

  async function busyOn(date) {
    return must(await sb.from('bookings').select('staff_id, starts_at, ends_at').eq('business_id', S.biz.id)
      .in('status', ['pending', 'confirmed', 'block']).lt('starts_at', dayStartIso(addDays(date, 1))).gt('ends_at', dayStartIso(date)));
  }
  const staffFor = (serviceId) => S.links.filter((l) => l.service_id === serviceId).map((l) => l.staff_id).filter((sid) => S.staff.some((p) => p.id === sid && p.active));

  function newBooking(date, pre = {}) {
    const act = S.services.filter((s) => s.active);
    if (!act.length) { toast('Ative pelo menos um serviço em Ajustes primeiro.', 'warn'); return go('ajustes', { open: 'servicos' }); }
    // Veio da agenda em colunas: começa por um serviço que essa pessoa faz
    if (!pre.service_id && pre.staff_id) pre = { ...pre, service_id: act.find((s) => staffFor(s.id).includes(pre.staff_id))?.id };
    const form = sheet('Marcar horário', `
      <label>Serviço<select name="service">${act.map((s) => `<option value="${s.id}" ${s.id === pre.service_id ? 'selected' : ''}>${esc(s.name)} · ${s.duration_min} min · ${esc(brl(s.price_cents))}</option>`).join('')}</select></label>
      <label>Com quem<select name="staff"></select></label>
      <label>Dia<input type="date" name="date" value="${date}" required></label>
      <label>Horário<select name="slot"></select></label>
      <label class="other-time" hidden>Outro horário (encaixe)<input type="time" name="time" step="300"></label>
      <p class="hint" id="slotHint"></p>
      <button type="button" class="btn ghost block" id="toWait" hidden>Colocar na lista de espera</button>
      <div class="two"><label>Repetir<select name="repeat"><option value="0">Não repetir</option><option value="7">Toda semana</option><option value="14">A cada 2 semanas</option><option value="28">A cada 4 semanas</option></select></label>
        <label class="rep-times" hidden>Quantas vezes<select name="times">${[2, 3, 4, 5, 6, 8, 10, 12].map((n) => `<option value="${n}" ${n === 4 ? 'selected' : ''}>${n} vezes</option>`).join('')}</select></label></div>
      <label>Nome<input name="name" required maxlength="80" value="${esc(pre.name || '')}"></label>
      <label>WhatsApp (opcional)<input name="phone" inputmode="tel" placeholder="(11) 91234-5678" value="${esc(pre.phone ? phoneText(pre.phone) : '')}"></label>
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
      const clientId = await clientFor(phoneDigits(f.get('phone')), name);
      must(await sb.from('bookings').insert({
        business_id: S.biz.id, client_id: clientId, service_id: svc.id, staff_id: staffId,
        starts_at: starts.toISOString(), ends_at: ends.toISOString(), status: 'confirmed',
        client_name: name, price_cents: svc.price_cents, note: String(f.get('note') || '').trim(), created_by: 'owner',
      }));
      if (pre.waitId) await sb.from('waitlist').update({ status: 'done' }).eq('id', pre.waitId); // saiu da lista de espera
      S.ins = null;
      // Horário fixo: repete no mesmo dia da semana e hora, pulando as datas que já estão ocupadas.
      const every = Number(f.get('repeat')) || 0;
      if (every) {
        const times = Math.min(12, Math.max(2, Number(f.get('times')) || 4));
        const made = [day], skipped = [];
        for (let k = 1; k < times; k++) {
          const d = addDays(day, every * k);
          const s = localToUtc(d, time, tz()), e = new Date(s.getTime() + svc.duration_min * MIN);
          const clash = (await busyOn(d)).some((x) => (x.staff_id === staffId || x.staff_id == null) && new Date(x.starts_at) < e && new Date(x.ends_at) > s);
          const open = S.hours.some((h) => h.weekday === weekdayOf(d) && h.opens.slice(0, 5) <= time && localParts(e, tz()).time <= h.closes.slice(0, 5));
          if (clash || !open) { skipped.push(d); continue; }
          const r = await sb.from('bookings').insert({
            business_id: S.biz.id, client_id: clientId, service_id: svc.id, staff_id: staffId,
            starts_at: s.toISOString(), ends_at: e.toISOString(), status: 'confirmed',
            client_name: name, price_cents: svc.price_cents, note: String(f.get('note') || '').trim(), created_by: 'owner',
          });
          if (r.error) skipped.push(d); else made.push(d);
        }
        toast(`Marcado ${made.length} vezes ✅${skipped.length ? ` · ficaram de fora (ocupado ou fechado): ${skipped.map(dayLabel).join(', ')}` : ''}`, skipped.length ? 'warn' : 'ok');
        S.day = day;
        go('agenda', { quiet: true });
        return;
      }
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
      const prevStaff = form.staff.value || form._preStaff;
      form._preStaff = null;
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
      else if (form._preTime && slots.some((s) => s.time === form._preTime)) form.slot.value = form._preTime;
      form._preTime = null;
      $('.other-time', form).hidden = form.slot.value !== 'outro';
      $('#toWait', form).hidden = !!slots.length || !ids.length || !!pre.waitId;
    };
    form._preStaff = pre.staff_id || null;
    form._preTime = pre.time || null;
    form.service.onchange = fill; form.staff.onchange = fill; form.date.onchange = fill;
    form.slot.onchange = () => { $('.other-time', form).hidden = form.slot.value !== 'outro'; };
    form.repeat.onchange = () => { $('.rep-times', form).hidden = form.repeat.value === '0'; };
    $('#toWait', form).onclick = () => openWaitAdd({
      service_id: form.service.value, staff_id: form.staff.value || null, day: form.date.value,
      name: form.elements.name.value.trim(), phone: phoneDigits(form.elements.phone.value),
    });
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

  /** Acha a cliente pelo telefone (com e sem o 9) ou cadastra. Sem telefone, devolve null. */
  async function clientFor(phone, name) {
    if (!phone) return null;
    const found = must(await sb.from('clients').select('id, name').eq('business_id', S.biz.id).in('phone', phoneVariants(phone)).order('created_at').limit(1).maybeSingle());
    if (found) { if (!found.name && name) await sb.from('clients').update({ name }).eq('id', found.id); return found.id; }
    return must(await sb.from('clients').insert({ business_id: S.biz.id, phone, name }).select('id').single()).id;
  }

  // ------------------------------------------------------------------ Lista de espera
  // Quem queria um horário que estava cheio. Quando vaga (cancelamento, falta de pedido…), o app mostra
  // no Início e um toque abre o WhatsApp do dono com a mensagem pronta.
  const PERIODS = { any: 'Qualquer horário', manha: 'Manhã', tarde: 'Tarde', noite: 'Noite' };
  const inPeriod = (time, p) => (p === 'manha' ? time < '12:00' : p === 'tarde' ? time >= '12:00' && time < '18:00' : p === 'noite' ? time >= '18:00' : true);
  const dayWords = (d) => { const r = relDay(d); return r === 'hoje' || r === 'amanhã' ? r : `${WD[weekdayOf(d)].toLowerCase()} (${d.slice(8, 10)}/${d.slice(5, 7)})`; };
  const joinOr = (xs) => (xs.length <= 1 ? xs.join('') : xs.slice(0, -1).join(', ') + ' ou ' + xs[xs.length - 1]);

  /** Horários livres no dia que cada pessoa da lista queria (só quem escolheu um dia, de hoje em diante). */
  async function waitSlots(entries, maxDays = 6) {
    const t = today();
    const withDay = entries.filter((w) => w.day && w.day >= t);
    const days = [...new Set(withDay.map((w) => w.day))].sort().slice(0, maxDays);
    const busyBy = new Map(await Promise.all(days.map(async (d) => [d, await busyOn(d)])));
    const out = new Map();
    for (const w of withDay) {
      if (!busyBy.has(w.day)) continue;
      const svc = S.services.find((s) => s.id === w.service_id && s.active);
      const staffIds = w.staff_id ? (S.staff.some((p) => p.id === w.staff_id && p.active) ? [w.staff_id] : [])
        : svc ? staffFor(svc.id) : S.staff.filter((p) => p.active).map((p) => p.id);
      const slots = freeSlots({
        date: w.day, tz: tz(), durationMin: svc ? svc.duration_min : S.biz.slot_minutes, slotMinutes: S.biz.slot_minutes,
        hours: S.hours.filter((h) => h.weekday === weekdayOf(w.day)), busy: busyBy.get(w.day), staffIds,
        now: new Date(), minNoticeMin: S.biz.min_notice_minutes || 0,
      }).filter((s) => inPeriod(s.time, w.period));
      if (slots.length) out.set(w.id, slots);
    }
    return out;
  }
  function waitMsg(w, slots) {
    const svc = svcName(w.service_id);
    const times = (slots || []).slice(0, 3).map((s) => s.time);
    const link = linkOn() ? `\nSe preferir, escolha por aqui: ${bookingUrl(S.biz.booking_slug)}` : '';
    return `${hi(w.name)} Abriu um horário${svc ? ' para ' + svc : ''}${w.day ? ' ' + dayWords(w.day) : ''}${times.length ? ' às ' + joinOr(times) : ''}. Quer que eu reserve para você?${link}`;
  }
  const waitSub = (w) => [svcName(w.service_id) || 'Qualquer serviço', w.staff_id && staffName(w.staff_id) ? 'com ' + staffName(w.staff_id) : '',
    w.day ? dayWords(w.day) : 'qualquer dia', w.period !== 'any' ? PERIODS[w.period]?.toLowerCase() : ''].filter(Boolean).join(' · ');
  const bookFromWait = (w, slots) => { closeSheet(); newBooking(w.day && w.day >= today() ? w.day : today(), { service_id: w.service_id, staff_id: w.staff_id, name: w.name, phone: w.phone, waitId: w.id, time: slots?.[0]?.time }); };

  async function openWaitlist() {
    const rows = must(await sb.from('waitlist').select('*').eq('business_id', S.biz.id).eq('status', 'waiting').order('created_at').limit(200));
    const slots = await waitSlots(rows, 10);
    const t = today();
    const rank = (w) => (slots.has(w.id) ? 0 : w.day && w.day < t ? 3 : w.day ? 1 : 2);
    rows.sort((a, b) => rank(a) - rank(b) || String(a.day || '9').localeCompare(String(b.day || '9')));
    const body = `<p class="hint">Quem queria um horário que estava cheio. Quando vagar, aparece no Início e você avisa com um toque.</p>
      <button type="button" class="btn primary block" id="waitAdd">+ Colocar alguém na lista</button>
      ${rows.length ? rows.map((w) => {
        const sl = slots.get(w.id);
        const past = w.day && w.day < t;
        return `<div class="pend wait-item${past ? ' past' : ''}"><div class="pend-info"><b>${esc(w.name || phoneText(w.phone) || 'Sem nome')}</b>
          <small>${esc(waitSub(w))}${w.note ? ' · ' + esc(w.note) : ''}</small>
          ${sl ? `<small class="free">Vagou: ${esc(sl.slice(0, 4).map((s) => s.time).join(', '))}${sl.length > 4 ? '…' : ''}</small>` : past ? '<small class="muted">O dia já passou</small>' : `<small class="muted">Na lista desde ${esc(relDay(partsOf(w.created_at).date))}</small>`}</div>
          <div class="actions">${w.phone ? `<a class="btn small ${sl ? 'primary' : 'ghost'}" target="_blank" rel="noopener" href="${waLink(w.phone, waitMsg(w, sl))}">Avisar</a>` : ''}
            <button type="button" class="btn small ghost" data-wbook="${w.id}">Marcar</button>
            <button type="button" class="icon-btn small" data-wdel="${w.id}" aria-label="Tirar da lista" title="Tirar da lista">✕</button></div></div>`;
      }).join('') : '<p class="muted center">Ninguém na lista agora.</p>'}`;
    const form = sheet('Lista de espera', body);
    $('#waitAdd', form).onclick = () => openWaitAdd();
    $$('[data-wbook]', form).forEach((el) => { el.onclick = () => { const w = rows.find((x) => x.id === el.dataset.wbook); bookFromWait(w, slots.get(w.id)); }; });
    $$('[data-wdel]', form).forEach((el) => { el.onclick = () => busy(el, async () => {
      must(await sb.from('waitlist').update({ status: 'done' }).eq('id', el.dataset.wdel));
      toast('Saiu da lista.', 'ok');
      await openWaitlist();
      if (['inicio', 'agenda'].includes(S.tab)) go(S.tab, { quiet: true, keepScroll: true });
    }); });
  }

  function openWaitAdd(pre = {}) {
    const act = S.services.filter((s) => s.active);
    const staff = S.staff.filter((p) => p.active);
    const form = sheet('Colocar na lista de espera', `
      <label>Nome<input name="name" required maxlength="80" value="${esc(pre.name || '')}"></label>
      <label>WhatsApp<input name="phone" inputmode="tel" placeholder="(11) 91234-5678" value="${esc(pre.phone ? phoneText(pre.phone) : '')}"></label>
      <label>Serviço<select name="service"><option value="">Qualquer serviço</option>${act.map((s) => `<option value="${s.id}" ${s.id === pre.service_id ? 'selected' : ''}>${esc(s.name)}</option>`).join('')}</select></label>
      ${staff.length > 1 ? `<label>Com quem<select name="staff"><option value="">Qualquer pessoa</option>${staff.map((p) => `<option value="${p.id}" ${p.id === pre.staff_id ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}</select></label>` : ''}
      <label>Dia que queria <span class="muted small">(vazio = qualquer dia)</span><input type="date" name="day" min="${today()}" value="${esc(pre.day || '')}"></label>
      <div class="seg" role="radiogroup" aria-label="Período">${Object.entries(PERIODS).map(([k, t]) => `<label class="seg-opt"><input type="radio" name="period" value="${k}" ${k === 'any' ? 'checked' : ''}><span>${k === 'any' ? 'Qualquer' : t}</span></label>`).join('')}</div>
      <label>Observação (opcional)<input name="note" maxlength="200" placeholder="Ex.: só depois das 17h"></label>`,
    { submitText: 'Colocar na lista', onSubmit: async (f) => {
      const name = String(f.get('name')).trim();
      const phone = phoneDigits(f.get('phone'));
      if (!name) throw new Error('Escreva o nome.');
      if (f.get('phone') && !phone) throw new Error('Confira o WhatsApp.');
      const day = String(f.get('day') || '') || null;
      if (day && day < today()) throw new Error('Escolha um dia de hoje em diante.');
      const clientId = await clientFor(phone, name);
      must(await sb.from('waitlist').insert({
        business_id: S.biz.id, client_id: clientId, name, phone: phone || null, service_id: f.get('service') || null,
        staff_id: f.get('staff') || null, day, period: PERIODS[f.get('period')] ? String(f.get('period')) : 'any', note: String(f.get('note') || '').trim(),
      }));
      toast('Na lista de espera ✅ Quando vagar, aparece no Início.', 'ok');
      if (['inicio', 'agenda'].includes(S.tab)) go(S.tab, { quiet: true, keepScroll: true });
    } });
    return form;
  }

  /** Depois de cancelar um horário: se tem gente esperando por aquele dia (ou qualquer dia), mostra a lista. */
  async function offerWaitlist(b) {
    try {
      const d = partsOf(b.starts_at).date;
      const rows = must(await sb.from('waitlist').select('id, day').eq('business_id', S.biz.id).eq('status', 'waiting').limit(200));
      const n = rows.filter((w) => !w.day || w.day === d).length;
      if (!n) return;
      toast(`Vagou um horário e tem ${n} pessoa${n > 1 ? 's' : ''} na lista de espera.`, 'ok');
      await openWaitlist();
    } catch (err) { console.error(err); }
  }

  // ------------------------------------------------------------------ Lembretes e aniversários
  // Enquanto a Meta não libera mensagem automática, o app abre o WhatsApp do dono com o texto pronto.
  function remindMsg(b) {
    const p = partsOf(b.starts_at);
    const svc = svcName(b.service_id), pro = staffName(b.staff_id);
    const many = S.staff.filter((x) => x.active).length > 1;
    return `${hi(b.client_name || b.clients?.name)} Passando para lembrar do seu horário ${dayWords(p.date)} às ${p.time}${svc ? ': ' + svc : ''}${pro && many ? ' com ' + pro : ''}.`
      + `${S.biz.address ? `\n📍 ${S.biz.address}` : ''}\nSe precisar remarcar, é só responder aqui. Até lá!`;
  }
  const bdayMsg = (c) => `Feliz aniversário${c.name ? ', ' + firstName(c.name) : ''}! 🎉 Desejamos um dia incrível e um ano cheio de coisas boas. Um abraço de ${S.biz.name}!`;
  const mdOf = (d) => d.slice(5, 10);
  const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  /** Aniversários de hoje até daqui a `n` dias (29/02 cai em 28/02 nos anos que não são bissextos). */
  function upcomingBirthdays(clients, n = 6) {
    const t = today();
    const out = [];
    for (let i = 0; i <= n; i++) {
      const d = addDays(t, i);
      const md = mdOf(d);
      for (const c of clients) {
        const b = c.birthday === '02-29' && !isLeap(Number(d.slice(0, 4))) ? '02-28' : c.birthday;
        if (b === md) out.push({ c, d, i });
      }
    }
    return out;
  }

  // ------------------------------------------------------------------ Conversas
  VIEWS.conversas = async (opts = {}) => (S.conv ? viewThread(opts) : viewConvList(opts));

  /** Texto da mensagem; foto da cliente aparece como "📷 Foto" (a imagem fica no WhatsApp). */
  function msgBody(body) {
    const s = String(body ?? '');
    if (/^\[foto\]/.test(s)) return `<span class="msg-photo">📷 Foto</span>${s.length > 6 ? ' ' + esc(s.slice(7)) : ''}`;
    return esc(s);
  }
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
          <span class="grow"><b>${esc(clientLabel(c.clients))}</b><small>${m ? esc((who[m.author] + String(m.body).replace(/^\[foto\]/, '📷 Foto')).slice(0, 90)) : ''}</small></span>
          <span class="meta"><small>${esc(ago(c.last_message_at))}</small>${c.needs_human ? '<i class="chip warn">Você</i>' : paused ? '<i class="chip muted">Pausada</i>' : ''}</span></button>`;
      }).join('')}</div>` : `<div class="empty">${S.convFilter === 'ajuda' ? 'Nenhuma conversa esperando você. 🎉' : 'Ainda não há conversas. Quando alguém mandar mensagem no WhatsApp do negócio, a conversa aparece aqui.'}</div>`}`;
    $$('[data-f]').forEach((b) => { b.onclick = () => { S.convFilter = b.dataset.f; go('conversas', { quiet: true }); }; });
    $$('[data-conv]').forEach((b) => { b.onclick = () => { S.conv = b.dataset.conv; go('conversas'); }; });
  }

  // Erros comuns da Meta em português
  function sendErrorText(e) {
    const s = String(e);
    if (s.includes('131047')) return 'Passou de 24 h desde a última mensagem da pessoa; o WhatsApp bloqueia.';
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
      return `${sep}<div class="msg ${m.author}">${label[m.author] ? `<small class="who">${label[m.author]}</small>` : ''}<p>${msgBody(m.body)}</p>
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
        ${expired ? `<p class="hint">Passaram 24 h desde a última mensagem da pessoa: o WhatsApp não deixa responder por aqui. ${phone ? `<a href="${waLink(phone)}" target="_blank" rel="noopener">Chamar pelo seu WhatsApp</a>` : ''}</p>` : ''}
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
      sb.from('clients').select('id, name, phone, username, notes, birthday, created_at').eq('business_id', id).order('name').limit(2000),
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
    // Clientes sumidas: já vieram, não voltam há N dias e não têm horário marcado (quem já está em "chamar de volta" não repete).
    const goneDays = Number(S.goneDays || store.get('goneDays') || 60);
    const dueIds = new Set(due.map((d) => d.c.id));
    const gone = clients.map((c) => {
      const x = info.get(c.id);
      if (!x.last || x.next || !c.phone || dueIds.has(c.id)) return null;
      const days = daysBetween(partsOf(x.last.starts_at).date, t);
      return days >= goneDays ? { c, x, days } : null;
    }).filter(Boolean).sort((a, b) => b.x.visits - a.x.visits || b.days - a.days);
    const everCame = clients.some((c) => info.get(c.id).last);
    S.clientCache = { clients, info, books };

    const q = S.clientQuery.toLowerCase();
    const qd = q.replace(/\D/g, '');
    const shown = clients.filter((c) => !q || (c.name || '').toLowerCase().includes(q) || (c.username || '').toLowerCase().includes(q) || (qd && (c.phone || '').includes(qd)));
    const linkLine = linkOn() ? `\nSe preferir, escolha o melhor horário por aqui: ${bookingUrl(S.biz.booking_slug)}` : '';
    const msgFor = ({ c, svc, days }) => `${hi(c.name)} Já faz ${days} dias desde o seu último atendimento (${svc.name}). Quer que eu reserve um horário para você?${linkLine}`;
    const goneMsg = ({ c }) => `${hi(c.name)} Faz tempo que você não aparece, sentimos sua falta! Quer que eu reserve um horário para você?${linkLine}`;
    const goneShown = S.goneAll ? gone : gone.slice(0, 8);

    if (stale(opts)) return;
    $('#view').innerHTML = `
      ${due.length ? `<section class="card"><h3>Hora de chamar de volta <span class="count">${due.length}</span></h3>
        <p class="hint">Clientes que já passaram do tempo de retorno do serviço e não têm horário marcado. O botão abre o <b>seu</b> WhatsApp com a mensagem pronta.</p>
        ${due.slice(0, 30).map((d) => `<div class="pend"><div class="pend-info"><b>${esc(clientLabel(d.c))}</b><small>${esc(d.svc.name)} há ${d.days} dias · retorno sugerido: ${d.svc.return_days} dias</small></div>
          <div class="actions"><a class="btn small primary" target="_blank" rel="noopener" href="${waLink(d.c.phone, msgFor(d))}">Chamar no WhatsApp</a></div></div>`).join('')}
      </section>` : ''}
      ${everCame ? `<section class="card"><h3>Quem sumiu ${gone.length ? `<span class="count">${gone.length}</span>` : ''}</h3>
        <p class="hint">Já vieram aqui, não voltam há mais de ${goneDays} dias e não têm horário marcado. O botão abre o <b>seu</b> WhatsApp com a mensagem pronta${linkOn() ? ' (com o seu link de agendamento)' : ''}.</p>
        <div class="seg gone-seg" role="group" aria-label="Sumiu há quanto tempo">${[30, 60, 90].map((n) => `<button type="button" data-gone="${n}" class="${goneDays === n ? 'sel' : ''}">${n} dias</button>`).join('')}</div>
        ${gone.length ? goneShown.map((g) => `<div class="pend"><div class="pend-info"><b>${esc(clientLabel(g.c))}</b><small>${g.x.visits} visita${g.x.visits === 1 ? '' : 's'} · última há ${g.days} dias (${esc(dayLabel(partsOf(g.x.last.starts_at).date))})</small></div>
          <div class="actions"><a class="btn small primary" target="_blank" rel="noopener" href="${waLink(g.c.phone, goneMsg(g))}">Chamar no WhatsApp</a></div></div>`).join('')
          + (gone.length > goneShown.length ? `<button type="button" class="btn ghost block" id="goneAll">Ver todas (${gone.length})</button>` : '')
        : `<p class="muted">Ninguém sumido há mais de ${goneDays} dias. 🎉</p>`}
      </section>` : ''}
      <label class="search"><input type="search" id="cq" placeholder="Buscar por nome ou telefone" value="${esc(S.clientQuery)}"></label>
      <p class="muted small">${clients.length} cliente${clients.length === 1 ? '' : 's'}</p>
      ${shown.length ? `<div class="card list flush">${shown.slice(0, 300).map((c) => {
        const x = info.get(c.id);
        const sub = [c.birthday && c.birthday === mdOf(t) ? 'aniversário hoje 🎂' : '', x.visits ? `${x.visits} visita${x.visits > 1 ? 's' : ''}` : 'sem visitas ainda', x.last ? 'última ' + relDay(partsOf(x.last.starts_at).date) : '', x.next ? 'próxima ' + whenLabel(x.next.starts_at) : '', x.noshow ? `${x.noshow} falta${x.noshow > 1 ? 's' : ''}` : ''].filter(Boolean).join(' · ');
        return `<button type="button" class="row" data-client="${c.id}"><span class="avatar">${esc(initials(clientLabel(c)))}</span>
          <span class="grow"><b>${esc(clientLabel(c))}</b><small>${esc(sub)}</small></span><b class="go">›</b></button>`;
      }).join('')}</div>` : `<div class="empty">${clients.length ? 'Ninguém encontrado.' : 'As clientes aparecem aqui sozinhas quando mandam mensagem ou são marcadas.'}</div>`}`;
    const cq = $('#cq');
    cq.oninput = () => { S.clientQuery = cq.value; clearTimeout(cq.t); cq.t = setTimeout(() => S.tab === 'clientes' && go('clientes', { quiet: true }).then(() => { const n = $('#cq'); if (!n || S.tab !== 'clientes') return; n.focus(); n.setSelectionRange(n.value.length, n.value.length); }), 250); };
    $$('[data-client]').forEach((b) => { b.onclick = () => openClient(b.dataset.client); });
    $$('[data-gone]').forEach((b) => { b.onclick = () => { S.goneDays = Number(b.dataset.gone); store.set('goneDays', b.dataset.gone); S.goneAll = false; go('clientes', { quiet: true, keepScroll: true }); }; });
    $('#goneAll')?.addEventListener('click', () => { S.goneAll = true; go('clientes', { quiet: true, keepScroll: true }); });
  };

  /** Abre a ficha de qualquer cliente (de fora da aba Clientes, ex.: aniversários no Início). */
  async function openClientById(id) {
    if (!S.clientCache?.clients.some((c) => c.id === id)) {
      const c = must(await sb.from('clients').select('id, name, phone, username, notes, birthday, created_at').eq('id', id).single());
      const bk = must(await sb.from('bookings').select('starts_at, status').eq('client_id', id).in('status', ['confirmed', 'done', 'noshow']).limit(1000));
      const now = new Date(), x = { visits: 0, noshow: 0, last: null, next: null };
      for (const b of bk) { if (b.status === 'noshow') x.noshow++; else if (new Date(b.starts_at) < now) x.visits++; }
      S.clientCache = { clients: [c], info: new Map([[id, x]]), books: [] };
    }
    return openClient(id);
  }

  async function openClient(id) {
    const { clients, info } = S.clientCache;
    const c = clients.find((x) => x.id === id);
    const x = info.get(id);
    const hist = must(await sb.from('bookings').select(BOOK_SEL).eq('client_id', id).order('starts_at', { ascending: false }).limit(30));
    const conv = must(await sb.from('conversations').select('id').eq('business_id', S.biz.id).eq('client_id', id).maybeSingle());
    const [bm, bd] = c.birthday ? c.birthday.split('-').map(Number) : [0, 0];
    const form = sheet(clientLabel(c), `
      <label>Nome<input name="name" value="${esc(c.name)}" maxlength="80"></label>
      <div class="bday-row"><span>Aniversário <span class="muted small">(opcional)</span></span>
        <div class="two"><select name="bd" aria-label="Dia"><option value="">Dia</option>${Array.from({ length: 31 }, (_, i) => `<option value="${i + 1}" ${bd === i + 1 ? 'selected' : ''}>${i + 1}</option>`).join('')}</select>
        <select name="bm" aria-label="Mês"><option value="">Mês</option>${MONTHS.map((m, i) => `<option value="${i + 1}" ${bm === i + 1 ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></div></div>
      <label>Anotações <span class="muted small">(só você e a secretária veem)</span>
        <textarea name="notes" rows="2" maxlength="500" placeholder="Ex.: prefere horário cedo; tem alergia a…; gosta de conversar">${esc(c.notes || '')}</textarea></label>
      <dl class="details">
        ${c.phone ? `<dt>WhatsApp</dt><dd><a href="${waLink(c.phone)}" target="_blank" rel="noopener">${esc(phoneText(c.phone))}</a></dd>` : ''}
        ${c.username ? `<dt>Usuário</dt><dd>@${esc(c.username)}</dd>` : ''}
        <dt>Visitas</dt><dd>${x.visits}</dd><dt>Faltas</dt><dd>${x.noshow}</dd>
        <dt>Cliente desde</dt><dd>${esc(dayLabel(partsOf(c.created_at).date))}/${c.created_at.slice(0, 4)}</dd>
      </dl>
      ${conv ? '<button type="button" class="btn ghost block" id="openConv">Abrir conversa</button>' : ''}
      <h4>Histórico</h4>
      ${hist.length ? `<div class="list">${hist.map((b) => bookingRow(b, { showDay: true })).join('')}</div>` : '<p class="muted">Nenhum agendamento ainda.</p>'}`,
    { submitText: 'Salvar', onSubmit: async (f) => {
      const d = Number(f.get('bd')) || 0, m = Number(f.get('bm')) || 0;
      if (!!d !== !!m) throw new Error('Para o aniversário, escolha o dia e o mês (ou deixe os dois vazios).');
      if (d && d > [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]) throw new Error(`Esse dia não existe em ${MONTHS[m - 1]}.`);
      const birthday = d ? `${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
      must(await sb.from('clients').update({ name: String(f.get('name')).trim(), notes: String(f.get('notes') || '').trim().slice(0, 500), birthday }).eq('id', id));
      toast('Salvo.', 'ok');
      go(S.tab, { quiet: true, keepScroll: true });
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
          <p class="hint">Toque num estilo para ver como fica. Cada um tem versão clara e escura.</p>
          ${stylePickerHtml(S.previewStyle || b.theme || 'entre', b.kind)}
          <p class="label">Claro ou escuro (vale para este aparelho)</p>
          ${modePickerHtml()}
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
      <details class="card" data-sec="link" ${open('link')}><summary>Link de agendamento</summary>
        <form id="linkForm">
          <p class="hint">Uma página onde a pessoa escolhe o serviço, o dia e o horário, sem precisar conversar. Coloque na bio do Instagram, no Google e no status do WhatsApp.</p>
          <label class="switch"><input type="checkbox" name="on" ${b.booking_link_enabled ? 'checked' : ''}><span>Deixar clientes marcarem pelo link</span></label>
          <label>Endereço do link<span class="slug-field"><span>agendar.html?n=</span><input name="slug" maxlength="40" autocapitalize="off" autocomplete="off" spellcheck="false" value="${esc(b.booking_slug || slugify(b.name))}"></span></label>
          <p class="hint">Só letras minúsculas, números e tracinho. Ex.: studio-da-ana</p>
          ${b.booking_slug ? `<div class="link-box">${esc(bookingUrl(b.booking_slug))}</div>
            <div class="link-actions"><button type="button" class="btn small" id="linkCopy">Copiar link</button>
            ${navigator.share ? '<button type="button" class="btn small" id="linkShare">Compartilhar</button>' : ''}
            <a class="btn small ghost" target="_blank" rel="noopener" href="${esc(bookingUrl(b.booking_slug))}">Abrir</a></div>
            ${b.booking_link_enabled ? '' : '<p class="banner warn">O link está <b>desligado</b>: quem abrir vê um aviso. Marque a opção acima e salve para ligar.</p>'}` : ''}
          <p class="label">Fotos dos seus trabalhos <span class="muted small">(aparecem na sua página · até 12)</span></p>
          <div class="gal-edit">${(b.gallery || []).map((u, i) => `<span class="gal-th"><img alt="" loading="lazy" src="${esc(u)}"><button type="button" data-gal-del="${i}" aria-label="Tirar esta foto">✕</button></span>`).join('')}
            ${(b.gallery || []).length < 12 ? '<label class="gal-add" aria-label="Adicionar fotos"><span>+</span><small>Fotos</small><input type="file" id="galAdd" accept="image/png,image/jpeg,image/webp" multiple hidden></label>' : ''}</div>
          <p class="hint">Os pedidos chegam em Início › Pedidos para confirmar${b.auto_confirm ? ' (já confirmados, porque "Confirmar automaticamente" está ligado)' : ''}. Só aparecem serviços ativos com alguém que faz.</p>
          <button type="submit" class="btn primary block">Salvar link</button>
        </form>
      </details>
      <details class="card" data-sec="servicos" ${open('servicos') || (!opts.open ? 'open' : '')}><summary>Serviços e preços</summary>
        <p class="hint">A secretária só oferece serviços <b>ativos</b> e só informa os preços que estão aqui.</p>
        <div class="list">${svcRows || '<p class="muted">Nenhum serviço.</p>'}</div>
        <div class="svc-actions"><button type="button" class="btn primary" id="readMenu">${CAM} Foto da tabela de preços</button>
          <button type="button" class="btn ghost" id="addSvc">+ Novo serviço</button></div>
      </details>
      <details class="card" data-sec="horarios" ${open('horarios')}><summary>Horário de funcionamento</summary>
        <form id="hoursForm">${WEEK_ORDER.map(hoursRow).join('')}
          <button type="submit" class="btn primary block">Salvar horários</button></form>
      </details>
      <details class="card" data-sec="equipe" ${open('equipe')}><summary>Quem atende</summary>
        <div class="list">${S.staff.map((p) => `<div class="row static ${p.active ? '' : 'inactive'}"><span class="avatar">${esc(initials(p.name))}</span>
          <span class="grow"><b>${esc(p.name)}</b><small>${S.links.filter((l) => l.staff_id === p.id).length} serviço(s)${p.commission_pct != null ? ` · comissão ${esc(String(Number(p.commission_pct)).replace('.', ','))}%` : ''}</small></span>
          <button type="button" class="btn small ghost" data-staff-edit="${p.id}">Editar</button></div>`).join('') || '<p class="muted">Ninguém cadastrado.</p>'}</div>
        <form id="addStaff" class="inline"><input name="name" placeholder="Nome de quem atende" maxlength="60" required><button class="btn" type="submit">Adicionar</button></form>
      </details>
      <details class="card" data-sec="negocio" ${open('negocio')}><summary>Dados do negócio e da secretária</summary>
        <form id="bizForm">
          <label>Nome do negócio<input name="name" value="${esc(b.name)}" required maxlength="80"></label>
          <label>Tipo<select name="kind">${kindOpts}</select></label>
          <label>Endereço<input name="address" value="${esc(b.address)}" maxlength="200" placeholder="Rua, número, bairro, cidade"></label>
          <label>Seu WhatsApp (recebe avisos de pedido novo)<input name="owner_whatsapp" inputmode="tel" value="${esc(phoneText(b.owner_whatsapp))}"></label>
          <div class="pix-row"><label>Chave Pix <span class="muted small">(para pedir sinal)</span><input name="pix_key" maxlength="77" autocomplete="off" value="${esc(b.pix_key || '')}" placeholder="CPF, CNPJ, e-mail, celular ou aleatória"></label>
            <label>Cidade<input name="pix_city" maxlength="15" value="${esc(b.pix_city || '')}" placeholder="Ex.: São Paulo"></label></div>
          <p class="hint">Com a chave, o app gera o Pix "copia e cola" do sinal. O dinheiro cai direto na sua conta, sem taxa.</p>
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
    bindModePicker(look);
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

    // ---- Link de agendamento
    const linkForm = $('#linkForm');
    linkForm.onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(linkForm);
      const slug = slugify(f.get('slug'));
      const on = !!f.get('on');
      if (!SLUG_RE.test(slug)) return toast('O endereço precisa ter de 3 a 40 letras ou números (pode usar tracinho).', 'bad');
      await busy($('button[type=submit]', linkForm), async () => {
        const { error } = await sb.from('businesses').update({ booking_slug: slug, booking_link_enabled: on }).eq('id', b.id);
        if (error) throw new Error(error.code === '23505' ? 'Esse endereço já está em uso por outro negócio. Escolha outro.' : friendly(error));
        await reloadBiz();
        S.bizList = S.bizList.map((x) => (x.id === S.biz.id ? S.biz : x));
        toast(on ? 'Link ligado ✅ Copie e compartilhe.' : 'Link salvo (desligado).', 'ok');
        go('ajustes', { quiet: true, open: 'link' });
      });
    };
    // Fotos dos trabalhos (vitrine da página de agendamento)
    const saveGallery = async (list) => {
      must(await sb.from('businesses').update({ gallery: list.slice(0, 12) }).eq('id', b.id));
      await reloadBiz();
      S.bizList = S.bizList.map((x) => (x.id === S.biz.id ? S.biz : x));
      go('ajustes', { quiet: true, open: 'link', keepScroll: true });
    };
    const galAdd = $('#galAdd');
    if (galAdd) galAdd.onchange = async () => {
      const files = [...(galAdd.files || [])].slice(0, 12 - (b.gallery || []).length);
      if (!files.length) return;
      toast(files.length > 1 ? `Enviando ${files.length} fotos…` : 'Enviando a foto…');
      const urls = [];
      for (const f of files) {
        if (f.size > 15 * 1024 * 1024) { toast('Uma foto é grande demais (máx. 15 MB) e ficou de fora.', 'warn'); continue; }
        try { urls.push(await uploadBrandImage('galeria', f)); } catch (err) { toast(friendly(err), 'bad'); }
      }
      if (urls.length) { await saveGallery([...(b.gallery || []), ...urls]); toast(urls.length > 1 ? `${urls.length} fotos adicionadas ✅` : 'Foto adicionada ✅', 'ok'); }
      galAdd.value = '';
    };
    $$('[data-gal-del]', v).forEach((x) => {
      x.onclick = () => busy(x, async () => {
        const list = [...(b.gallery || [])];
        const [gone] = list.splice(Number(x.dataset.galDel), 1);
        await saveGallery(list);
        const path = String(gone || '').split('/object/public/marca/')[1];
        if (path) sb.storage.from('marca').remove([decodeURIComponent(path)]).catch(() => { /* fica só o arquivo sobrando */ });
        toast('Foto tirada.', 'ok');
      });
    });
    const copyLink = async () => {
      const url = bookingUrl(S.biz.booking_slug);
      try { await navigator.clipboard.writeText(url); toast('Link copiado ✅', 'ok'); } catch { toast('Não consegui copiar. Toque e segure no link para copiar.', 'warn'); }
    };
    $('#linkCopy')?.addEventListener('click', copyLink);
    $('#linkShare')?.addEventListener('click', () => {
      navigator.share({ title: S.biz.name, text: `Agende seu horário em ${S.biz.name}:`, url: bookingUrl(S.biz.booking_slug) }).catch(() => { /* cancelou */ });
    });

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
    $('#readMenu').onclick = () => openMenuReader();
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
      const pixKey = normPixKey(f.get('pix_key'));
      if (pixKey === null) return toast('Não reconheci a chave Pix. Use CPF ou CNPJ (só números), e-mail, celular com DDD ou a chave aleatória.', 'bad');
      const pixCity = String(f.get('pix_city') || '').trim().slice(0, 15);
      if (pixKey && pixCity.length < 2) return toast('Escreva a cidade do Pix (o banco pede).', 'bad');
      await busy($('button[type=submit]', e.target), async () => {
        must(await sb.from('businesses').update({
          pix_key: pixKey || null, pix_city: pixKey ? pixCity : null,
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
      <p class="hint">Os horários já marcados com essa pessoa continuam na agenda.</p>
      <label>Comissão <span class="muted small">(opcional)</span><span class="pct-in"><input name="pct" inputmode="decimal" maxlength="5" value="${p.commission_pct == null ? '' : esc(String(Number(p.commission_pct)).replace('.', ','))}" placeholder="Ex.: 40"><span>%</span></span></label>
      <p class="hint">Quanto essa pessoa ganha de cada atendimento. O relatório do mês mostra quanto pagar. Deixe vazio se não tiver comissão.</p>`,
    { onSubmit: async (f) => {
      const raw = String(f.get('pct') || '').replace('%', '').replace(',', '.').trim();
      const pct = raw === '' ? null : Number(raw);
      if (pct != null && !(pct >= 0 && pct <= 100)) throw new Error('A comissão precisa ser um número de 0 a 100.');
      must(await sb.from('staff').update({ name: String(f.get('name')).trim(), active: !!f.get('active'), commission_pct: pct == null ? null : Math.round(pct * 100) / 100 }).eq('id', id));
      toast('Salvo.', 'ok');
      go('ajustes', { quiet: true, open: 'equipe' });
    } });
  }

  boot();
})();
