// ==UserScript==
// @name         Central de Defesa TW (Completo)
// @namespace    tw-central-defesa-completo
// @version      2.4.0
// @description  Painel: ataques, renomear, calculadora de defesa, snipe finder, minimapa, Discord, servidor
// @author       Você
// @match        *://*.tribalwars.com.br/game.php*
// @match        *://*.guerrastribais.com.br/game.php*
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_xmlhttpRequest
// @connect      192.168.100.18
// @connect      ngrok-free.dev
// @connect      ngrok-free.app
// @connect      ngrok.io
// @connect      raw.githubusercontent.com
// @run-at       document-end
// @noframes
// ==/UserScript==

(function () {
  'use strict';
  if (window.__TW_CENTRAL_V2__) return;
  window.__TW_CENTRAL_V2__ = true;

  const worldMatch = location.hostname.match(/(?:^|\.)([a-z]{2}\d{1,3})\./i);
  const WORLD = worldMatch ? worldMatch[1].toLowerCase() : '';
  if (!WORLD) return;

  const VERSION = '2.4.0';

  // ── URLs remotas (GitHub) ──────────────────────────
  const GITHUB_CONFIG_URL = 'https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/tw-config.json';
  const GITHUB_AUTH_URL   = 'https://raw.githubusercontent.com/allankardekprm/coleta-redondo/main/autorizados.json';
  const MESTRES = ['DONNLouco', 'Onne'];

  let SESSION_ID = sessionStorage.getItem('tw_cd_session');
  if (!SESSION_ID) {
    SESSION_ID = 'ses_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);
    sessionStorage.setItem('tw_cd_session', SESSION_ID);
  }

  const CFG_KEY = 'tw_cd2_config_' + WORLD;

  const DEFAULT_RENAME_BUTTONS = [
    { label: 'M',   cmd: '[Morto]',           bg: '#31c908', color: '#fff' },
    { label: 'FA',  cmd: '[Fake]',             bg: '#FFC0CB', color: '#000' },
    { label: 'D!',  cmd: '[Desviado]',         bg: '#ef8b10', color: '#fff' },
    { label: 'D',   cmd: '[Desviar]',          bg: '#9232a8', color: '#fff' },
    { label: 'R',   cmd: '[Reconquistar]',     bg: '#adb6c6', color: '#fff' },
    { label: 'RR',  cmd: '[Reconquistado]',    bg: '#fff',    color: '#000' },
    { label: 'S!',  cmd: '[Snipado]',          bg: '#22e5db', color: '#fff' },
    { label: 'S',   cmd: '[Snipar]',           bg: '#0d83dd', color: '#fff' },
    { label: 'V!',  cmd: ' | Vigiar',          bg: '#ffd91c', color: '#000' },
    { label: 'RF',  cmd: '[Reforçar]',         bg: '#892929', color: '#fff' },
    { label: 'OK',  cmd: '[OK]',               bg: '#28a745', color: '#fff' },
    { label: 'WT',  cmd: '[Esperar Torre]',    bg: '#892929', color: '#fff' },
    { label: '✓',   cmd: ' | ✓',              bg: '#004c00', color: '#fff' },
  ];

  const DEFAULT_STACK_CONFIG = {
    OK:         { fulls: 10, pop: 100000, color: '#28a745', msg: 'Bunkada'      },
    STACK_MORE: { fulls: 5,  pop: 60000,  color: '#007bff', msg: 'Semi Bunkada' },
    NOK:        { fulls: 0,  pop: 0,      color: '#dc3545', msg: 'Escasso'      },
  };

  const DEFAULT_CLEAR = {
    axe: 6500, spy: 50, light: 2200, marcher: 0,
    heavy: 0, ram: 300, catapult: 100,
  };

  const DEFAULT_OFF_BOOSTS = { axe: 8, light: 8, marcher: 8 };

  // ── Bônus padrão ──────────────────────────────────
  const DEFAULT_BONUS = {
    flagAtt: 0,        // % bônus bandeira atacante
    flagDef: 0,        // % bônus bandeira defensor
    knightAtt: 0,      // % bônus paladino atacante
    knightDef: 0,      // % bônus paladino defensor
    nightBonus: false,  // bônus noturno (100% defesa)
    moral: 100,         // moral %
    luck: 0,            // sorte (-25 a +25)
    church: false,      // bônus de igreja
    churchAtt: 100,     // % efetividade igreja atacante
    churchDef: 100,     // % efetividade igreja defensor
    // Efeitos personalizados (como no simulador do jogo)
    effects: [],        // [{name, type:'att'|'def', magnitude:number}]
  };

  function loadConfig() {
    try { return JSON.parse(GM_getValue(CFG_KEY, '{}')); } catch { return {}; }
  }
  function saveConfig(cfg) { GM_setValue(CFG_KEY, JSON.stringify(cfg)); }

  // ══════════════════════════════════════════════════
  // CONFIG REMOTO — GitHub (ngrok URL, versão, etc.)
  // ══════════════════════════════════════════════════
  async function loadRemoteConfig() {
    try {
      const res = await gmFetchRaw(GITHUB_CONFIG_URL);
      if (!res.ok) return;
      const remote = JSON.parse(res.text);
      if (remote.serverURL && !CFG._serverURLOverride) {
        CFG.serverURL   = remote.serverURL;
        CFG.authToken   = remote.authToken || CFG.authToken;
        CFG.serverEnabled = true;
      }
      // Checa atualização de versão — só mostra se não foi dispensada
      if (remote.version && remote.version !== VERSION) {
        const dismissed = GM_getValue('tw_cd2_dismissed_ver_' + WORLD, '');
        if (dismissed !== remote.version) {
          showUpdateBanner(remote.version, remote.changelog || '', remote.updateURL || '');
        }
      }
      log('RemoteConfig carregado:', remote);
    } catch(e) { log('loadRemoteConfig erro:', e); }
  }

  // ══════════════════════════════════════════════════
  // AUTORIZAÇÃO
  // ══════════════════════════════════════════════════
  let _authOk = false;
  async function checkAuthorization(playerName) {
    if (MESTRES.includes(playerName)) { _authOk = true; return true; }
    try {
      const res = await gmFetchRaw(GITHUB_AUTH_URL);
      if (!res.ok) { _authOk = true; return true; }
      const data  = JSON.parse(res.text);
      const jogadores = data.jogadores || {};
      const expiry = jogadores[playerName];
      if (!expiry) {
        showBlockScreen(playerName, 'Jogador não autorizado.');
        return false;
      }
      if (new Date(expiry) < new Date()) {
        showBlockScreen(playerName, `Acesso expirado em ${expiry}.`);
        return false;
      }
      _authOk = true;
      return true;
    } catch(e) {
      log('checkAuth erro:', e);
      _authOk = true;
      return true;
    }
  }

  function showBlockScreen(player, motivo) {
    const el = document.createElement('div');
    el.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.92);z-index:9999999;display:flex;align-items:center;justify-content:center;font-family:Verdana,sans-serif';
    el.innerHTML = `<div style="background:#1a0a00;border:2px solid #7b4a16;border-radius:8px;padding:32px;max-width:420px;text-align:center;color:#f4e4bc">
      <div style="font-size:48px;margin-bottom:12px">🛡️</div>
      <h2 style="color:#ff6b35;margin:0 0 8px">Acesso Bloqueado</h2>
      <p style="color:#ccc;font-size:13px;margin:0 0 16px"><strong style="color:#fff">${esc(player)}</strong><br>${esc(motivo)}</p>
      <p style="color:#888;font-size:11px">Central de Defesa TW v${VERSION}<br>Contate o administrador da tribo para solicitar acesso.</p>
    </div>`;
    document.body.appendChild(el);
  }

  function showUpdateBanner(newVer, changelog, updateURL) {
    if (document.getElementById('tw-cd-update-banner')) return; // Não duplica
    const el = document.createElement('div');
    el.id = 'tw-cd-update-banner';
    el.style.cssText = 'position:fixed;top:0;left:0;right:0;background:#1a472a;color:#fff;padding:8px 16px;z-index:9999998;font-size:12px;font-family:Verdana,sans-serif;display:flex;align-items:center;gap:12px;box-shadow:0 2px 8px rgba(0,0,0,.5)';
    const dlUrl = updateURL || `https://raw.githubusercontent.com/allankardekprm/coleta-redondo/refs/heads/main/coletaredonda.js`;
    el.innerHTML = `<span style="font-size:16px">🔔</span>
      <strong>Nova versão disponível: v${esc(newVer)}</strong>
      ${changelog ? `<span style="color:#aaffaa;font-size:11px">${esc(changelog)}</span>` : ''}
      <span style="flex:1"></span>
      <a href="${esc(dlUrl)}" target="_blank"
         style="background:#28a745;color:#fff;padding:4px 12px;border-radius:4px;text-decoration:none;font-size:11px">
        ⬇️ Atualizar
      </a>
      <button id="tw-cd-dismiss-update" style="background:transparent;border:none;color:#fff;cursor:pointer;font-size:16px;padding:0">✕</button>`;
    document.body.prepend(el);
    document.getElementById('tw-cd-dismiss-update').onclick = () => {
      GM_setValue('tw_cd2_dismissed_ver_' + WORLD, newVer);
      el.remove();
    };
  }

  function gmFetchRaw(url) {
    return new Promise((resolve) => {
      GM_xmlhttpRequest({
        method: 'GET', url,
        headers: { 'Cache-Control': 'no-cache' },
        onload:  r => resolve({ ok: r.status >= 200 && r.status < 300, text: r.responseText }),
        onerror: () => resolve({ ok: false, text: '' }),
      });
    });
  }

  let CFG = {
    serverURL:      'http://192.168.100.18:3000',
    authToken:      'K@031031',
    serverEnabled:  true,
    discordWebhook: '',
    discordEnabled: false,
    colorize:       true,
    showSupports:   true,
    showIgnored:    false,
    debug:          false,
    renameButtons:  DEFAULT_RENAME_BUTTONS,
    stackConfig:    DEFAULT_STACK_CONFIG,
    clearConfig:    DEFAULT_CLEAR,
    offBoosts:      DEFAULT_OFF_BOOSTS,
    bonus:          DEFAULT_BONUS,
    ...loadConfig(),
  };
  if (!Array.isArray(CFG.renameButtons)) CFG.renameButtons = DEFAULT_RENAME_BUTTONS;
  if (!CFG.stackConfig)  CFG.stackConfig  = DEFAULT_STACK_CONFIG;
  if (!CFG.clearConfig)  CFG.clearConfig  = DEFAULT_CLEAR;
  if (!CFG.offBoosts)    CFG.offBoosts    = DEFAULT_OFF_BOOSTS;
  if (!CFG.bonus)        CFG.bonus        = DEFAULT_BONUS;
  // Migra campos antigos para novo objeto bonus
  if (CFG.nightBonus !== undefined && CFG.bonus) {
    CFG.bonus.nightBonus = CFG.nightBonus;
  }
  if (CFG.flagBonusAtt !== undefined && CFG.bonus) { CFG.bonus.flagAtt = CFG.flagBonusAtt; }
  if (CFG.flagBonusDef !== undefined && CFG.bonus) { CFG.bonus.flagDef = CFG.flagBonusDef; }
  if (CFG.knightBonusAtt !== undefined && CFG.bonus) { CFG.bonus.knightAtt = CFG.knightBonusAtt; }
  if (CFG.knightBonusDef !== undefined && CFG.bonus) { CFG.bonus.knightDef = CFG.knightBonusDef; }

  let allAttacks     = [];
  let collapsedPlayers = new Set();
  let collapsedVillages= new Set();
  let onlineMembers  = new Map();
  let worldData      = { villages: [], players: new Map(), tribes: new Map(), byCoord: new Map(), loaded: false };
  let panelReady     = false;
  let collapsed      = GM_getValue('tw_cd2_collapsed_' + WORLD, false);
  let panelEl        = null, tbodyEl = null, statusEl = null, statsEl = null;

  const log = (...a) => CFG.debug && console.log('[TW-CD2]', ...a);

  function esc(s) {
    return (s || '').replace(/[&<>"']/g, c =>
      ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function fmtCd(ms) {
    if (ms <= 0) return 'CHEGOU';
    const s = Math.floor(ms / 1000);
    return `${String(Math.floor(s/3600)).padStart(2,'0')}:${String(Math.floor(s%3600/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  }

  function fmtDate(ts) {
    if (!ts) return 'N/A';
    return new Date(ts).toLocaleString('pt-BR', { timeZone:'America/Sao_Paulo', day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit' });
  }

  function hashStr(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    return Math.abs(h).toString();
  }

  function parseCoord(s) {
    const m = String(s || '').match(/(\d+)\|(\d+)/);
    return m ? { x: +m[1], y: +m[2] } : null;
  }

  // ══════════════════════════════════════════════════
  // FETCH com GM_xmlhttpRequest
  // ══════════════════════════════════════════════════
  function gmFetch(url, opts = {}) {
    return new Promise((resolve, reject) => {
      const baseHeaders = { 'ngrok-skip-browser-warning': '1' };
      GM_xmlhttpRequest({
        method:  opts.method || 'GET',
        url:     url,
        headers: Object.assign(baseHeaders, opts.headers || {}),
        data:    opts.body || null,
        onload:  r => resolve({
          ok:     r.status >= 200 && r.status < 300,
          status: r.status,
          json:   () => Promise.resolve(JSON.parse(r.responseText)),
          text:   () => Promise.resolve(r.responseText),
        }),
        onerror: () => reject(new Error('Falha na requisição: ' + url)),
      });
    });
  }

  // Rate limiter
  let _tok = 4;
  setInterval(() => { _tok = Math.min(4, _tok + 1); }, 800);
  async function rateFetch(url, opts) {
    while (_tok <= 0) await new Promise(r => setTimeout(r, 100));
    _tok--;
    if (url.includes('192.168') || url.includes('localhost') || (CFG.serverURL && url.startsWith(CFG.serverURL))) {
      return gmFetch(url, opts);
    }
    return fetch(url, opts);
  }

  // ══════════════════════════════════════════════════
  // PARSE DE HORÁRIO DE CHEGADA
  // ══════════════════════════════════════════════════
  function parseArrival(cell) {
    if (!cell) return 0;
    const da = parseInt(cell.getAttribute?.('data-arrival') || '');
    if (!isNaN(da) && da > 1e12) return da;
    const text = (cell.textContent || '').replace(/\s+/g,' ').trim().toLowerCase();
    const tm   = text.match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (!tm) return 0;
    const d = new Date();
    if (text.includes('amanhã')) d.setDate(d.getDate()+1);
    else if (text.includes('ontem')) d.setDate(d.getDate()-1);
    else if (text.match(/hoje/i)) { /* hoje = data atual, não muda */ }
    else {
      const dm = text.match(/(\d{1,2})[\/.](\d{1,2})/);
      if (dm) { d.setMonth(parseInt(dm[2])-1); d.setDate(parseInt(dm[1])); }
    }
    d.setHours(+tm[1], +tm[2], +tm[3], 0);
    const now = Date.now();
    if (!text.match(/amanhã|ontem|hoje|\d+\/\d+/) && d.getTime() < now - 60000) d.setDate(d.getDate()+1);
    return d.getTime();
  }

  // ══════════════════════════════════════════════════
  // CLASSIFICADOR DE ATAQUES
  // ══════════════════════════════════════════════════
  const ICON_AXE   = 'https://dsbr.innogamescdn.com/asset/636f8dd3/graphic/command/attack.webp';
  const ICON_NOBLE = 'https://dsbr.innogamescdn.com/asset/d78cd800/graphic/unit/tiny/snob.webp';
  const ICON_SUPP  = 'https://dsbr.innogamescdn.com/asset/4e165360/graphic/command/support.webp';

  function classifyCell(cell) {
    const r = { type:'Ataque', isNoble:false, isSupport:false, isRam:false, axeSize:'unknown', iconSrc:ICON_AXE, watchtower:false };
    if (!cell) return r;
    const imgs = Array.from(cell.querySelectorAll('img'));
    r.watchtower = /torre\s*de\s*vigia|watchtower/i.test(cell.textContent||'') ||
                   !!(cell.querySelector('span[class*="commandicon"]')?.classList?.contains('commandicon-wt'));
    for (const img of imgs) {
      const src = (img.src||'').toLowerCase(), alt = (img.alt||'').toLowerCase();
      const all = src + ' ' + alt;
      if (all.includes('snob')||all.includes('noble')||src.includes('/unit/noble')) {
        r.isNoble = true; r.iconSrc = ICON_NOBLE;
        for (const i2 of imgs) {
          const s2 = i2.src.toLowerCase();
          if (s2.includes('attack')) {
            r.axeSize = s2.includes('_large') ? 'large' : s2.includes('_medium') ? 'medium' : s2.includes('_small') ? 'small' : r.axeSize;
          }
        }
        break;
      }
      if (src.includes('/unit/tiny/ram')||alt.includes('ariete')) { r.isRam=true; r.iconSrc=img.src; r.type='Ataque com Ariete'; break; }
      if (src.includes('/graphic/command/support')||alt.includes('apoio')) { r.isSupport=true; r.iconSrc=ICON_SUPP; r.type='Apoio'; break; }
      if (src.includes('/graphic/command/attack')) {
        r.iconSrc = img.src;
        r.axeSize = src.includes('_large') ? 'large' : src.includes('_medium') ? 'medium' : src.includes('_small') ? 'small' : 'base';
      }
    }
    if (r.isNoble) { const sz = r.axeSize!=='unknown'?` (${r.axeSize})`:''; r.type = `Ataque com Nobre${sz}`; }
    else if (!r.isRam && !r.isSupport) {
      if      (r.axeSize==='large')  r.type='Ataque (Large)';
      else if (r.axeSize==='medium') r.type='Ataque (Medium)';
      else if (r.axeSize==='small')  r.type='Ataque (Small)';
    }
    return r;
  }

  function getCmdId(cell) {
    if (!cell) return null;
    // FIX: Busca em toda a row, não só na primeira cell
    const row = cell.closest ? cell.closest('tr') : cell.parentElement;
    const searchIn = row || cell;
    const checks = [
      ()=>searchIn.querySelector('.quickedit[data-id]')?.getAttribute('data-id'),
      ()=>searchIn.querySelector('[data-command-id]')?.getAttribute('data-command-id'),
      ()=>searchIn.querySelector('[data-id]')?.getAttribute('data-id'),
      ()=>searchIn.querySelector('input[name*="command_ids"]')?.getAttribute('name')?.match(/\[(\d+)\]/)?.[1],
      ()=>searchIn.querySelector('a[href*="command_id="]')?.href?.match(/command_id=(\d+)/)?.[1],
      ()=>cell.querySelector('[data-command-id]')?.getAttribute('data-command-id'),
      ()=>cell.querySelector('[data-id]')?.getAttribute('data-id'),
      ()=>cell.querySelector('input[name*="command_ids"]')?.getAttribute('name')?.match(/\[(\d+)\]/)?.[1],
      ()=>cell.querySelector('a[href*="command_id="]')?.href?.match(/command_id=(\d+)/)?.[1],
    ];
    for (const fn of checks) { const v=fn(); if (v&&/^\d+$/.test(String(v))) return String(v); }
    return null;
  }

  // ══════════════════════════════════════════════════
  // JOGADOR LOGADO
  // ══════════════════════════════════════════════════
  let _cachedPlayer = null;
  function getPlayer() {
    if (_cachedPlayer) return _cachedPlayer;
    // Tenta via game_data (mais confiável)
    if (typeof window.game_data !== 'undefined' && window.game_data?.player?.name) {
      _cachedPlayer = window.game_data.player.name;
      return _cachedPlayer;
    }
    const sels = ['#menu_row2 a[href*="info_player"]:not([href*="mode="])','.menu-column-item a[href*="info_player"]:not([href*="mode="])','.player_info a'];
    for (const sel of sels) {
      const el = document.querySelector(sel);
      if (el) { const n=(el.textContent||'').replace(/\s+/g,' ').trim(); if(n&&n.length>1) { _cachedPlayer=n; return n; } }
    }
    const m = document.title.match(/^(.+?)\s*-\s*(Guerras Tribais|Tribal Wars)/);
    if (m && m[1].length > 2) { _cachedPlayer = m[1].trim(); return _cachedPlayer; }
    return 'Desconhecido';
  }

  // ══════════════════════════════════════════════════
  // COLETOR DE ATAQUES DO DOM
  // ══════════════════════════════════════════════════
  function collectDOM(doc = document) {
    const table = doc.querySelector('#incomings_table');
    if (!table) return [];
    const rows   = table.querySelectorAll('tbody > tr.nowrap, tbody > tr[class*="row_"], tbody > tr:has(td)');
    const now    = Date.now();
    const player = getPlayer();
    const result = [];
    rows.forEach((row, idx) => {
      try {
        const cells = row.querySelectorAll('td');
        if (cells.length < 6) return;
        const info    = classifyCell(cells[0]);
        const target  = (cells[1]?.textContent||'').replace(/\s+/g,' ').trim();
        const origin  = (cells[2]?.textContent||'').replace(/\s+/g,' ').trim();
        const attacker= (cells[3]?.textContent||'').replace(/\s+/g,' ').trim();
        const dist    = (cells[4]?.textContent||'').trim();
        const arrTxt  = (cells[5]?.textContent||'').replace(/\s+/g,' ').trim();
        const arrAt   = parseArrival(cells[5]);
        if (!target || !origin || !arrAt || arrAt <= now) return;
        let cmdId = getCmdId(cells[0]) || getCmdId(row) || hashStr(`${origin}|${target}|${Math.floor(arrAt/1000)}`);
        // Captura o label atual (para preservar renomeações)
        const labelEl = row.querySelector('.quickedit-label');
        const currentLabel = (labelEl?.textContent || '').trim();
        result.push({ command_id:String(cmdId), world:WORLD, type:info.type, target, defender:player, origin, attacker, distance:dist, arrival_text:arrTxt, arrival_at:arrAt, captured_at:now, source:'local', icon_src:info.iconSrc, axe_size:info.axeSize, is_noble:info.isNoble, is_support:info.isSupport, watchtower:info.watchtower, label: currentLabel });
      } catch(e) { log('linha',idx,e); }
    });
    return result;
  }

  // ══════════════════════════════════════════════════
  // DADOS DO MUNDO
  // ══════════════════════════════════════════════════
  async function loadWorld() {
    const KD = 'tw_cd2_wd_'+WORLD, KT = 'tw_cd2_wt_'+WORLD;
    const TTL = 12*3600*1000;
    const cached = GM_getValue(KD), ts = GM_getValue(KT, 0);
    if (cached && Date.now()-ts < TTL) {
      try {
        const d = JSON.parse(cached);
        worldData.villages = d.villages||[];
        worldData.players  = new Map(d.players||[]);
        worldData.tribes   = new Map(d.tribes||[]);
        worldData.byCoord  = new Map(d.byCoord||[]);
        worldData.loaded   = true; return;
      } catch {}
    }
    try {
      const base = location.origin + '/map';
      const [vT,pT,aT] = await Promise.all([
        rateFetch(base+'/village.txt').then(r=>r.ok?r.text():null).catch(()=>null),
        rateFetch(base+'/player.txt') .then(r=>r.ok?r.text():null).catch(()=>null),
        rateFetch(base+'/ally.txt')   .then(r=>r.ok?r.text():null).catch(()=>null),
      ]);
      if (vT) vT.split('\n').forEach(l=>{ const p=l.split(','); if(p.length<5)return; const v={id:p[0],name:decodeURIComponent((p[1]||'').replace(/\+/g,' ')),x:+p[2],y:+p[3],playerId:p[4],points:+p[5]||0}; worldData.villages.push(v); worldData.byCoord.set(`${v.x}|${v.y}`,v); });
      if (pT) pT.split('\n').forEach(l=>{ const p=l.split(','); if(p.length<5)return; worldData.players.set(p[0],{id:p[0],name:decodeURIComponent((p[1]||'').replace(/\+/g,' ')),tribeId:p[2],villages:+p[3],points:+p[4]}); });
      if (aT) aT.split('\n').forEach(l=>{ const p=l.split(','); if(p.length<5)return; worldData.tribes.set(p[0],{id:p[0],tag:decodeURIComponent((p[1]||'').replace(/\+/g,' ')),name:decodeURIComponent((p[2]||'').replace(/\+/g,' '))}); });
      worldData.loaded = true;
      GM_setValue(KD, JSON.stringify({ villages:worldData.villages, players:Array.from(worldData.players.entries()), tribes:Array.from(worldData.tribes.entries()), byCoord:Array.from(worldData.byCoord.entries()) }));
      GM_setValue(KT, Date.now());
    } catch(e) { log('worldData',e); }
  }

  // ══════════════════════════════════════════════════
  // SERVIDOR — UPLOAD / DOWNLOAD
  // ══════════════════════════════════════════════════
  const uploadQ = new Map(); let uploadTimer = null;
  function queueUpload(attacks) {
    if (!CFG.serverEnabled||!CFG.serverURL||!CFG.authToken) return;
    attacks.forEach(a=>{ if(a.command_id) uploadQ.set(a.command_id,a); });
    if (!uploadTimer) uploadTimer = setTimeout(flush, 3000);
  }
  async function flush() {
    uploadTimer = null;
    if (!uploadQ.size) return;
    const batch = Array.from(uploadQ.values()).slice(0,500);
    batch.forEach(a=>uploadQ.delete(a.command_id));
    try {
      const res = await rateFetch(CFG.serverURL.replace(/\/$/,'')+'/api/attacks',{ method:'POST', headers:{'Content-Type':'application/json','X-Auth-Token':CFG.authToken}, body:JSON.stringify({ world:WORLD, player:getPlayer(), sessionId:SESSION_ID, version:VERSION, attacks:batch }) });
      if (!res.ok) throw new Error('HTTP '+res.status);
    } catch(e) { log('upload',e); batch.forEach(a=>uploadQ.set(a.command_id,a)); }
    if (uploadQ.size) uploadTimer = setTimeout(flush, 5000);
  }

  async function fetchServerAttacks() {
    if (!CFG.serverEnabled||!CFG.serverURL||!CFG.authToken) return [];
    try {
      const res = await rateFetch(`${CFG.serverURL.replace(/\/$/,'')}/api/attacks?world=${WORLD}&_t=${Date.now()}`, { headers:{'X-Auth-Token':CFG.authToken} });
      if (!res.ok) return [];
      return (await res.json()).attacks || [];
    } catch { return []; }
  }

  async function sendHeartbeat() {
    if (!CFG.serverEnabled||!CFG.serverURL||!CFG.authToken) return;
    const params = new URLSearchParams(location.search);
    const page   = params.get('screen') || params.get('mode') || 'lobby';
    try {
      await rateFetch(CFG.serverURL.replace(/\/$/,'')+'/api/heartbeat', { method:'POST', headers:{'Content-Type':'application/json','X-Auth-Token':CFG.authToken}, body:JSON.stringify({ world:WORLD, player:getPlayer(), session_id:SESSION_ID, page, last_seen:Date.now(), version:VERSION }) });
    } catch {}
  }

  async function fetchOnline() {
    if (!CFG.serverEnabled||!CFG.serverURL||!CFG.authToken) return;
    try {
      const res = await rateFetch(`${CFG.serverURL.replace(/\/$/,'')}/api/online?world=${WORLD}`, { headers:{'X-Auth-Token':CFG.authToken} });
      if (!res.ok) return;
      const d = await res.json();
      onlineMembers.clear();
      (d.members||[]).forEach(m=>onlineMembers.set(m.player,m));
      renderOnline();
    } catch {}
  }

  // ══════════════════════════════════════════════════
  // DISCORD
  // ══════════════════════════════════════════════════
  const _notified    = new Set();
  const _soundAlerted = new Set();

  function playNobleAlert() {
    try {
      const ctx = new (window.AudioContext||window.webkitAudioContext)();
      [440,554,659,880].forEach((freq, i) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.connect(g); g.connect(ctx.destination);
        o.frequency.value = freq; o.type = 'sine';
        g.gain.setValueAtTime(0, ctx.currentTime + i*0.12);
        g.gain.linearRampToValueAtTime(0.3, ctx.currentTime + i*0.12 + 0.05);
        g.gain.linearRampToValueAtTime(0, ctx.currentTime + i*0.12 + 0.2);
        o.start(ctx.currentTime + i*0.12);
        o.stop(ctx.currentTime + i*0.12 + 0.25);
      });
    } catch(e) {}
  }

  async function notifyDiscord(attacks) {
    if (!CFG.discordEnabled||!CFG.discordWebhook) return;
    const now = Date.now();
    const byTarget = new Map();
    attacks.forEach(a=>{ if(!a.is_noble||a.arrival_at<=now)return; const k=(a.target||'').trim(); if(!byTarget.has(k))byTarget.set(k,[]); byTarget.get(k).push(a); });
    for (const [tgt,nobles] of byTarget) {
      const key = `${tgt}_${nobles.map(n=>n.command_id).sort().join('_')}`;
      if (_notified.has(key)) continue;
      _notified.add(key);
      const ms = nobles[0].arrival_at - now;
      const atk = [...new Set(nobles.map(n=>n.attacker))].join(', ')||'?';
      const isTrain = nobles.length > 1;
      const fields = [
        {name:'👤 Atacante(s)',value:atk,inline:true},
        {name:'🎯 Alvo',value:tgt||'?',inline:true},
        {name:'🌍 Mundo',value:WORLD.toUpperCase(),inline:true},
        {name:'⏰ Chegada',value:fmtDate(nobles[0].arrival_at),inline:true},
        {name:'⏱️ Tempo',value:fmtCd(ms),inline:true},
        {name:'🛡️ Defensor',value:nobles[0].defender||'?',inline:true},
      ];
      if (isTrain) fields.push({ name:`📋 ${nobles.length} Horários`, inline:false, value: nobles.map((n,i)=>`${i+1}. ${fmtDate(n.arrival_at)} ⏱ ${fmtCd(n.arrival_at-now)}`).join('\n') });
      try {
        await fetch(CFG.discordWebhook,{ method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ embeds:[{ title: isTrain?`🏰 NOBRE TRAIN (${nobles.length}x) → ${tgt}`:`🏰 NOBRE → ${tgt}`, color:0xFF0000, fields, footer:{text:`TW Central Defesa v${VERSION}`} }] }) });
        await new Promise(r=>setTimeout(r,600));
      } catch {}
    }
  }

  // ══════════════════════════════════════════════════
  // RENOMEAR ATAQUES — FIX COMPLETO
  // ══════════════════════════════════════════════════
  function renameCommand(commandId, newName) {
    const csrf   = window.game_data?.csrf;
    const villId = window.game_data?.village?.id;
    if (!csrf || !villId) {
      log('❌ renameCommand: CSRF ou village ID não encontrado', { csrf: !!csrf, villId });
      return Promise.resolve(false);
    }

    // FIX: Usa TribalWars.post nativo se disponível (mais confiável)
    if (typeof window.TribalWars !== 'undefined' && window.TribalWars.post) {
      return new Promise((resolve) => {
        try {
          window.TribalWars.post('overview_villages', {
            ajaxaction: 'edit_other_comment',
            id: commandId,
            mode: 'incomings'
          }, { text: newName }, function(data) {
            log('✅ rename via TW.post OK:', commandId);
            updateLabelInDOM(commandId, newName);
            resolve(true);
          }, function() {
            log('⚠️ TW.post falhou, tentando fetch...');
            renameFallback(commandId, newName, csrf, villId).then(resolve);
          });
        } catch(e) {
          log('⚠️ TW.post erro:', e);
          renameFallback(commandId, newName, csrf, villId).then(resolve);
        }
      });
    }

    return renameFallback(commandId, newName, csrf, villId);
  }

  function renameFallback(commandId, newName, csrf, villId) {
    // Endpoints em ordem de prioridade
    const endpoints = [
      `/game.php?village=${villId}&screen=overview_villages&mode=incomings&ajaxaction=edit_other_comment&id=${commandId}&h=${csrf}`,
      `/game.php?village=${villId}&screen=info_command&ajaxaction=edit_other_comment&id=${commandId}&h=${csrf}`,
      `/game.php?village=${villId}&screen=overview_villages&mode=incomings&action=edit_other_comment&id=${commandId}&h=${csrf}`,
    ];

    function tryEndpoint(i) {
      if (i >= endpoints.length) {
        log('❌ renameCommand: todos os endpoints falharam para', commandId);
        return Promise.resolve(false);
      }
      return fetch(location.origin + endpoints[i], {
        method: 'POST',
        headers: {
          'Content-Type':'application/x-www-form-urlencoded',
          'X-Requested-With':'XMLHttpRequest',
          'Accept': 'application/json, text/javascript, */*; q=0.01',
          'TribalWars-Ajax': '1',
        },
        body: `text=${encodeURIComponent(newName)}`,
        credentials: 'same-origin',
      }).then(r => {
        log(`rename endpoint[${i}] status: ${r.status}`, endpoints[i]);
        if (r.ok) {
          updateLabelInDOM(commandId, newName);
          return true;
        }
        return tryEndpoint(i+1);
      }).catch((e) => {
        log(`rename endpoint[${i}] erro:`, e);
        return tryEndpoint(i+1);
      });
    }
    return tryEndpoint(0);
  }

  function updateLabelInDOM(commandId, newName) {
    // Atualiza label em TODOS os quickedits com esse ID
    document.querySelectorAll(`.quickedit[data-id="${commandId}"] .quickedit-label`).forEach(el => {
      el.textContent = newName;
    });
    // Também busca pelo input hidden
    document.querySelectorAll(`input[name="id_${commandId}"], input[value="${commandId}"]`).forEach(inp => {
      const tr = inp.closest('tr');
      if (tr) {
        const lbl = tr.querySelector('.quickedit-label');
        if (lbl) lbl.textContent = newName;
        colorRow(tr, newName);
      }
    });
    // Colore a row
    document.querySelectorAll('#incomings_table tr').forEach(tr => {
      const ql = tr.querySelector(`.quickedit[data-id="${commandId}"]`);
      if (ql) {
        const lbl = ql.querySelector('.quickedit-label');
        if (lbl) lbl.textContent = newName;
        colorRow(tr, newName);
      }
    });
  }

  function injectRenameButtons(row) {
    if (!row || row.dataset.cdButtons) return;
    row.dataset.cdButtons = '1';
    const qe = row.querySelector('.quickedit-content');
    if (!qe) return;
    const cmdId = () => {
      const span = row.querySelector('.quickedit[data-id]');
      return span?.getAttribute('data-id') || '';
    };
    const wrap = document.createElement('span');
    wrap.style.cssText = 'float:right;display:flex;flex-wrap:wrap;gap:2px;margin-left:8px';
    CFG.renameButtons.forEach(btn => {
      const b = document.createElement('button');
      b.type = 'button'; b.title = btn.cmd; b.textContent = btn.label;
      b.style.cssText = `background:${btn.bg};color:${btn.color};border:none;padding:1px 5px;border-radius:3px;font-size:9px;cursor:pointer;font-weight:bold`;
      b.onclick = (e) => {
        e.preventDefault();
        e.stopPropagation();
        const id = cmdId();
        if (!id) {
          log('❌ command ID não encontrado na row');
          return;
        }
        const label = row.querySelector('.quickedit-label');
        const current = (label?.textContent||'').trim();
        let newName;
        if (btn.cmd.startsWith('|') || btn.cmd.startsWith(' |')) {
          newName = current + btn.cmd;
        } else {
          const base = current.split(' ')[0] || current;
          newName = base + ' ' + btn.cmd;
        }
        newName = newName.trim();
        log('Renomeando', id, '→', newName);
        // Feedback visual imediato
        b.style.opacity = '0.5';
        b.textContent = '⏳';
        renameCommand(id, newName).then((ok) => {
          b.style.opacity = '1';
          b.textContent = btn.label;
          if (ok) {
            // Flash verde de sucesso
            b.style.outline = '2px solid #28a745';
            setTimeout(() => { b.style.outline = ''; }, 800);
          } else {
            b.style.outline = '2px solid #dc3545';
            setTimeout(() => { b.style.outline = ''; }, 800);
          }
        });
        colorRow(row, newName);
      };
      wrap.appendChild(b);
    });
    qe.appendChild(wrap);
  }

  function colorRow(row, cmdText) {
    if (!CFG.colorize) return;
    const td0 = row.querySelector('td:first-child'); if (!td0) return;
    const text = (cmdText||'').toLowerCase();
    let matched = null;
    for (const btn of CFG.renameButtons) { if (text.includes(btn.cmd.toLowerCase())) { matched = btn; break; } }
    if (matched) {
      td0.style.cssText = `background:${matched.bg} !important`;
      const a = td0.querySelector('a');
      if (a) a.style.cssText = `color:${matched.color} !important;text-shadow:-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000,1px 1px 0 #000`;
    } else {
      td0.style.cssText = `background:#f0e2be !important`;
    }
  }

  function applyRenameToTable(doc = document) {
    const rows = doc.querySelectorAll('#incomings_table tr.nowrap, #incomings_table .row_a, #incomings_table .row_b');
    rows.forEach(row => {
      injectRenameButtons(row);
      const label = row.querySelector('.quickedit-label');
      if (label) colorRow(row, label.textContent||'');
    });
  }

  function normalizeColor(c) {
    if (!c) return '#000000';
    c = c.trim().toLowerCase();
    if (c === 'white' || c === '#fff' || c === '#ffffff') return '#ffffff';
    if (c === 'black' || c === '#000' || c === '#000000') return '#000000';
    const m3 = c.match(/^#([0-9a-f])([0-9a-f])([0-9a-f])$/);
    if (m3) return `#${m3[1]}${m3[1]}${m3[2]}${m3[2]}${m3[3]}${m3[3]}`;
    return c.startsWith('#') ? c : '#000000';
  }

  // ══════════════════════════════════════════════════
  // SIMULADOR
  // ══════════════════════════════════════════════════
  function estimateAttacker(attack) {
    const size  = attack.axe_size || 'base';
    const full  = CFG.clearConfig;
    const scale = size === 'large' ? 1.0 : size === 'medium' ? 0.6 : size === 'small' ? 0.3 : 0.5;
    const units = {};
    Object.entries(full).forEach(([u, v]) => { units[u] = Math.round(v * scale); });
    if (attack.is_noble) { units.snob = 1; units.axe = Math.round((full.axe||0) * 0.3); }
    return units;
  }

  function openSimulator(attack) {
    sessionStorage.setItem('tw_cd_sim', JSON.stringify({
      attUnits:   estimateAttacker(attack),
      attackType: attack.type,
      origin:     attack.origin,
      target:     attack.target,
      axeSize:    attack.axe_size,
      isNoble:    attack.is_noble,
      bonus:      CFG.bonus,
    }));
    const villId = window.game_data?.village?.id || '';
    window.open(`game.php?village=${villId}&screen=place&mode=sim`, '_blank');
  }

  function fillSimulatorFromSession() {
    const raw = sessionStorage.getItem('tw_cd_sim');
    if (!raw) return;
    sessionStorage.removeItem('tw_cd_sim');
    try {
      const data = JSON.parse(raw);
      Object.entries(data.attUnits || {}).forEach(([unit, count]) => {
        const inp = document.querySelector(`input[name="att_${unit}"]`);
        if (inp && count > 0) inp.value = String(count);
      });
      const defSel = document.getElementById('def_fill_select');
      if (defSel) { defSel.value = 'current_village'; defSel.dispatchEvent(new Event('change')); }

      // Aplica bônus do config
      const bonus = data.bonus || {};
      if (bonus.nightBonus) {
        const nightCb = document.querySelector('input[name="night_bonus"], #night_bonus');
        if (nightCb) nightCb.checked = true;
      }
      if (bonus.moral && bonus.moral !== 100) {
        const moralInput = document.querySelector('input[name="moral"]');
        if (moralInput) moralInput.value = String(bonus.moral);
      }
      if (bonus.luck) {
        const luckInput = document.querySelector('input[name="luck"]');
        if (luckInput) luckInput.value = String(bonus.luck);
      }

      const form = document.getElementById('simulator_form');
      if (form) {
        const banner = document.createElement('div');
        banner.style.cssText = 'background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px 12px;margin-bottom:10px;font-size:12px';
        const bonusInfo = [];
        if (bonus.flagAtt)   bonusInfo.push(`🏴 Bandeira ATK +${bonus.flagAtt}%`);
        if (bonus.flagDef)   bonusInfo.push(`🏴 Bandeira DEF +${bonus.flagDef}%`);
        if (bonus.knightAtt) bonusInfo.push(`🏇 Paladino ATK +${bonus.knightAtt}%`);
        if (bonus.knightDef) bonusInfo.push(`🏇 Paladino DEF +${bonus.knightDef}%`);
        if (bonus.nightBonus) bonusInfo.push(`🌙 Bônus Noturno`);
        banner.innerHTML = `🎮 <strong>Central de Defesa</strong> — Origem: <strong>${esc(data.origin||'?')}</strong> → Alvo: <strong>${esc(data.target||'?')}</strong> | Tipo: <strong>${esc(data.attackType||'?')}</strong> (${esc(data.axeSize||'?')})
          ${bonusInfo.length ? '<br>📊 Bônus: ' + bonusInfo.join(' | ') : ''}
          <br><span style="color:#888;font-size:11px">⚠️ Tropas do atacante são estimativas — ajuste se necessário</span>`;
        form.before(banner);
      }
    } catch(e) { log('fillSimulator', e); }
  }

  // ══════════════════════════════════════════════════
  // CALCULADORA DE DEFESA
  // ══════════════════════════════════════════════════
  function calcDefense(stackPop, wallLevel) {
    const { stackConfig, bonus } = CFG;
    let multiplier = 1.0;
    if (bonus?.nightBonus) multiplier += 1.0;
    if (bonus?.flagDef)    multiplier += (bonus.flagDef / 100);
    if (bonus?.knightDef)  multiplier += (bonus.knightDef / 100);
    const effectivePop = stackPop * multiplier;
    const wallBonus = 1 + wallLevel * 0.05;
    const clears = Math.round(effectivePop / 50000 * wallBonus);
    if      (clears >= stackConfig.OK.fulls)         return { ...stackConfig.OK,        clears };
    else if (clears >= stackConfig.STACK_MORE.fulls) return { ...stackConfig.STACK_MORE, clears };
    else                                             return { ...stackConfig.NOK,         clears };
  }

  function buildDefWidget(villageEl) {
    if (!villageEl) return;
    if (document.getElementById('tw-cd-def-widget')) return;
    const wallEl = document.querySelector('.visual-label-wall')
      || document.querySelector('#l_wall td:nth-child(2)')
      || Array.from(document.querySelectorAll('#l_wall td')).find(td => /\d+/.test(td.textContent));
    const wall = parseInt(wallEl?.textContent?.match(/\d+/)?.[0] || '0');
    let totalPop = 0;
    document.querySelectorAll('.all_unit [data-count]').forEach(el => {
      const unit = el.getAttribute('data-count');
      const amt  = parseInt(el.textContent) || 0;
      const pop  = { spear:1,sword:1,axe:1,archer:1,spy:2,light:4,marcher:5,heavy:4,ram:5,catapult:8,knight:1 };
      totalPop  += amt * (pop[unit] || 0);
    });
    const result    = calcDefense(totalPop, wall);
    const totalAtks = document.querySelectorAll('#commands_incomings .command-row img[src*="attack"]').length;
    const totalNobles = document.querySelectorAll('#commands_incomings .command-row img[src*="snob"]').length;
    const widget = document.createElement('div');
    widget.id = 'tw-cd-def-widget'; widget.className = 'vis moveable widget';
    widget.innerHTML = `
      <h4 class="head with-button" style="background:#7b4a16;color:#fff">
        🛡️ Resistência: <strong style="color:${result.color}">${result.msg}</strong>
      </h4>
      <div class="widget_content" style="display:block;padding:8px">
        <table style="width:100%;font-size:12px">
          <tr><td><strong>${result.clears}</strong> Full(s) para limpar</td></tr>
          <tr><td><img src="graphic/buildings/wall.png" style="vertical-align:bottom"> Muralha: <strong>${wall}</strong> &nbsp;|&nbsp; <span class="icon header population"></span> <strong>${totalPop.toLocaleString('pt-BR')}</strong></td></tr>
          <tr style="border-top:1px solid #ccc"><td><img src="graphic/command/attack.png" style="height:14px"> Ataques: <strong>${totalAtks}</strong> &nbsp;|&nbsp; Nobres: <strong style="color:#c00">${totalNobles}</strong></td></tr>
        </table>
      </div>`;
    const target = document.querySelector('#show_buildqueue') || document.querySelector('.widget');
    if (target) target.after(widget);
  }

  // ══════════════════════════════════════════════════
  // SNIPE FINDER
  // ══════════════════════════════════════════════════
  async function openSnipeFinder(targetCoord, arrivalTimeText) {
    if (!worldData.loaded) {
      const ld = document.createElement('div');
      ld.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999999;display:flex;align-items:center;justify-content:center;color:#fff;font-size:14px;font-family:Verdana';
      ld.textContent = '⏳ Carregando dados do mundo...';
      document.body.appendChild(ld);
      await loadWorld();
      ld.remove();
    }
    let arrivalTs = 0;
    const tm = (arrivalTimeText||'').match(/(\d{1,2}):(\d{2}):(\d{2})/);
    if (tm) {
      const d = new Date();
      const dm = (arrivalTimeText||'').match(/(\d{1,2})[\/.](\d{1,2})/);
      if (dm) { d.setMonth(parseInt(dm[2])-1); d.setDate(parseInt(dm[1])); }
      d.setHours(+tm[1], +tm[2], +tm[3], 0);
      if (d.getTime() < Date.now() - 60000) d.setDate(d.getDate()+1);
      arrivalTs = d.getTime();
    }
    const coord = parseCoord(targetCoord);
    if (!coord) { alert('Coordenadas não detectadas: ' + targetCoord); return; }
    const UNIDADES = {
      light:   { nome:'Cav. Leve',      vel:1.1 },
      knight:  { nome:'Paladino',       vel:1.1 },
      heavy:   { nome:'Cav. Pesada',    vel:1.6 },
      marcher: { nome:'Arq. a Cavalo',  vel:1.6 },
      archer:  { nome:'Arqueiro',       vel:1.8 },
      spear:   { nome:'Lanceiro',       vel:1.8 },
      axe:     { nome:'Bárbaro',        vel:1.8 },
      sword:   { nome:'Espadachim',     vel:2.2 },
    };
    const now = Date.now();
    const ms  = arrivalTs ? arrivalTs - now : 0;
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.75);z-index:999999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `<div style="background:#f4e4bc;border:2px solid #7b4a16;border-radius:8px;padding:16px;max-width:800px;width:97%;max-height:93vh;overflow-y:auto;box-shadow:0 6px 30px rgba(0,0,0,.5);font-family:Verdana,sans-serif">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">
        <h3 style="margin:0;color:#2b1a0f">🎯 Snipe Finder — ${esc(targetCoord)}</h3>
        <span style="background:${ms<900000?'#dc3545':ms<3600000?'#ff9800':'#28a745'};color:#fff;border-radius:4px;padding:2px 10px;font-weight:bold">${fmtCd(ms)}</span>
        <span style="font-size:11px;color:#555">Chegada: ${fmtDate(arrivalTs)}</span>
      </div>
      ${!arrivalTs?'<div style="background:#f8d7da;color:#721c24;padding:8px;border-radius:4px;margin-bottom:8px;font-size:12px">⚠️ Horário não detectado automaticamente.</div>':''}
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap;align-items:center;background:#ede0bc;padding:8px;border-radius:4px">
        <label style="font-size:12px">Unidade:
          <select id="sf-unit" style="padding:4px;border-radius:3px;border:1px solid #bbb">
            ${Object.entries(UNIDADES).map(([k,u])=>`<option value="${k}">${u.nome} (${u.vel} min/campo)</option>`).join('')}
          </select>
        </label>
        <label style="font-size:12px"><input type="checkbox" id="sf-boost"> OS +20%</label>
        <label style="font-size:12px"><input type="checkbox" id="sf-church"> Igreja +10%</label>
        <label style="font-size:12px">Raio: <input id="sf-radius" type="number" value="50" min="1" max="500" style="width:55px;padding:3px;border:1px solid #bbb;border-radius:3px"> campos</label>
        <button id="sf-calc" style="padding:5px 16px;background:#7b4a16;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold">🔍 Calcular</button>
      </div>
      <div id="sf-results" style="font-size:12px;color:#555">Aguardando...</div>
      <div style="text-align:right;margin-top:10px">
        <button id="sf-close" style="padding:5px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer">✕ Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#sf-close').onclick = () => overlay.remove();
    overlay.onclick = e => { if (e.target===overlay) overlay.remove(); };
    function calcSnipe() {
      const unitKey  = overlay.querySelector('#sf-unit').value;
      const unitInfo = UNIDADES[unitKey];
      const boost    = overlay.querySelector('#sf-boost').checked;
      const church   = overlay.querySelector('#sf-church').checked;
      const radius   = parseFloat(overlay.querySelector('#sf-radius').value) || 50;
      const results  = overlay.querySelector('#sf-results');
      const nowMs    = Date.now();
      if (!arrivalTs) { results.innerHTML = '<div style="color:#c00">❌ Horário inválido.</div>'; return; }
      let vel = unitInfo.vel;
      if (boost)  vel = vel / 1.2;
      if (church) vel = vel / 1.1;
      const rows = [];
      worldData.villages.forEach(v => {
        if (!v.playerId || v.playerId === '0') return;
        const dx = v.x - coord.x, dy = v.y - coord.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist > radius || dist <= 0) return;
        const travelMs     = dist * vel * 60000;
        const launchTs     = arrivalTs - travelMs;
        const timeToLaunch = launchTs - nowMs;
        if (timeToLaunch <= 0) return;
        const player = worldData.players.get(v.playerId);
        const rallyUrl = `game.php?village=${v.id}&screen=place&x=${coord.x}&y=${coord.y}&type=support`;
        rows.push({ dist, v, player, travelMs, launchTs, timeToLaunch, rallyUrl });
      });
      rows.sort((a,b) => a.dist - b.dist);
      if (!rows.length) {
        results.innerHTML = `<div style="color:#c00;padding:8px">❌ Nenhuma aldeia (raio ${radius} campos). Aumente o raio.</div>`;
        return;
      }
      const top = rows.slice(0, 60);
      const lFmt = ts => new Date(ts).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
      results.innerHTML = `<div style="margin-bottom:6px;font-size:11px">✅ <strong>${top.length}</strong> de ${rows.length} aldeias — <strong>${unitInfo.nome}</strong>${boost?' ⚡':''}</div>
        <div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead><tr style="background:#7b4a16;color:#fff">
            <th style="padding:4px 6px">#</th><th style="padding:4px 6px;text-align:left">Aldeia</th><th style="padding:4px 6px;text-align:left">Jogador</th>
            <th>Dist.</th><th>Viagem</th><th>Enviar em</th><th>Hora envio</th><th>🏛️</th>
          </tr></thead><tbody>
          ${top.map((r,i)=>{const cor=r.timeToLaunch<5*60000?'#dc3545':r.timeToLaunch<20*60000?'#ff9800':'#28a745';return `<tr style="background:${i%2?'#f9f1d7':'#f4e4bc'}">
            <td style="padding:2px 6px;color:#888">${i+1}</td>
            <td style="padding:2px 6px"><a href="game.php?screen=info_village&id=${r.v.id}" target="_blank" style="color:#0d83dd">${esc(r.v.name)}</a> <span style="color:#888">(${r.v.x}|${r.v.y})</span></td>
            <td style="padding:2px 6px">${esc(r.player?.name||'Bárbaro')}</td>
            <td style="text-align:center">${r.dist.toFixed(1)}</td><td style="text-align:center">${fmtCd(r.travelMs)}</td>
            <td style="text-align:center"><strong style="color:${cor}">${fmtCd(r.timeToLaunch)}</strong></td>
            <td style="text-align:center;font-weight:bold">${lFmt(r.launchTs)}</td>
            <td style="text-align:center"><a href="${r.rallyUrl}" target="_blank" style="background:#7b4a16;color:#fff;padding:1px 8px;border-radius:3px;text-decoration:none">Ir</a></td>
          </tr>`;}).join('')}
          </tbody></table></div><p style="color:#888;font-size:10px;margin:4px 0 0">🟢>20min 🟠<20min 🔴<5min</p>`;
    }
    overlay.querySelector('#sf-calc').addEventListener('click', calcSnipe);
    if (arrivalTs) setTimeout(calcSnipe, 300);
  }

  // ══════════════════════════════════════════════════
  // CSS
  // ══════════════════════════════════════════════════
  GM_addStyle(`
    #tw-cd-wrap { margin-bottom:14px;border:1px solid #7b4a16;background:#f4e4bc;padding:6px;border-radius:4px;font-family:Verdana,sans-serif;font-size:12px }
    #tw-cd-header { display:flex;align-items:center;gap:8px;flex-wrap:wrap;background:#d2b48c;border:1px solid #b89060;padding:6px 8px;border-radius:4px;margin-bottom:6px }
    #tw-cd-header h3 { margin:0;font-size:14px;color:#2b1a0f;flex:1;min-width:160px }
    .cd-badge { background:#7b4a16;color:#fff;border-radius:6px;padding:2px 6px;font-size:11px }
    #tw-cd-status { font-size:11px;color:#4a3a22 }
    #tw-cd-header button { padding:3px 9px;border-radius:5px;border:1px solid #999;background:#eee;color:#111;font-size:11px;cursor:pointer }
    #tw-cd-header button:hover { background:#ddd }
    #tw-cd-header label { display:flex;align-items:center;gap:5px;font-size:11px;cursor:pointer }
    #tw-cd-stats { display:flex;gap:6px;flex-wrap:wrap;margin-bottom:7px;align-items:center }
    .cd-pill { display:flex;align-items:center;gap:4px;padding:2px 8px;border:1px solid #ccc;border-radius:999px;background:#f8f8f8;font-size:12px;white-space:nowrap }
    .cd-pill.noble { background:#9232a8;color:#fff;border-color:#7b1fa2 }
    .cd-pill.large { background:#dc3545;color:#fff;border-color:#b71c1c }
    .cd-pill.medium { background:#8b4513;color:#fff;border-color:#5d2e0c }
    .cd-pill.small { background:#28a745;color:#fff;border-color:#1b5e20 }
    #tw-cd-filters { display:flex;gap:5px;flex-wrap:wrap;margin-bottom:7px }
    #tw-cd-filters input,#tw-cd-filters select { padding:4px 7px;border:1px solid #bbb;border-radius:4px;font-size:11px;background:#fffdf5 }
    #tw-cd-filters input { width:120px }
    .cd-tabs { display:flex;gap:3px;margin-bottom:0 }
    .cd-tab { padding:4px 12px;border:1px solid #bbb;border-bottom:none;border-radius:4px 4px 0 0;background:#e4d5a8;cursor:pointer;font-size:12px;color:#4a3a22 }
    .cd-tab:hover { background:#f0e8cc }
    .cd-tab.active { background:#f4e4bc;font-weight:bold;color:#2b1a0f }
    .cd-panel { border:1px solid #b89060;border-radius:0 4px 4px 4px;overflow:hidden }
    .cd-table { width:100%;border-collapse:collapse;background:#f4e4bc }
    .cd-table th { background:#d2b48c;color:#2b1a0f;border-bottom:2px solid #7b4a16;padding:5px 8px;text-align:left;white-space:nowrap }
    .cd-table td { padding:5px 8px;border-bottom:1px solid #e3d2a7;white-space:nowrap }
    .cd-table tr:nth-child(even) td { background:#f9f1d7 }
    .cd-table tr:hover td { background:#f0e8cc }
    .cd-player-row td { background:#edd9a8 !important;font-weight:bold }
    .cd-village-row td { background:#f5ecce !important }
    .cd-cd { display:inline-block;padding:1px 6px;border-radius:4px;font-weight:bold;font-size:11px }
    .cd-cd.arrived { background:#dc3545;color:#fff }
    .cd-cd.urgent  { background:#ff9800;color:#fff }
    .cd-cd.soon    { background:#ffeb3b;color:#333 }
    .cd-cd.ok      { background:transparent;color:#333 }
    #tw-cd-sidebtn { position:relative;width:26px;height:26px;display:flex;align-items:center;justify-content:center;font-weight:700;font-size:10px;background:#2b1a0f;color:#f4e4bc;border-radius:3px;cursor:pointer;margin-top:4px;user-select:none;border:1px solid #7b4a16 }
    #tw-cd-sidebtn:hover { background:#3d2710 }
    .cd-nbadge { position:absolute;top:-7px;right:-7px;background:#dc3545;color:#fff;border-radius:50%;width:17px;height:17px;display:none;align-items:center;justify-content:center;font-size:9px;font-weight:bold;border:2px solid #fff }
    .cd-nbadge.show { display:flex }
    #tab-online { padding:10px }
    .cd-online-pill { padding:3px 10px;border-radius:99px;font-size:11px;border:1px solid #4caf50;background:#e8f5e9;color:#1b5e20;display:inline-block;margin:3px }
    .cd-online-pill.off { border-color:#ccc;background:#f5f5f5;color:#888 }
    #tab-map { padding:6px }
    .cd-map-ctrl { display:flex;gap:8px;align-items:center;flex-wrap:wrap;padding:6px;background:#ede0bc;border:1px solid #c8a97a;border-radius:4px;margin-bottom:6px }
    .cd-map-ctrl label { font-size:11px;display:flex;align-items:center;gap:3px;cursor:pointer }
    #tw-cd-minimap { border:1px solid #7b4a16;background:#333;display:block;width:100%;cursor:grab;touch-action:none }
    #tw-cd-minimap:active { cursor:grabbing !important }
    #tw-cd-overlay { position:fixed;inset:0;background:rgba(0,0,0,.65);z-index:999999;display:flex;align-items:center;justify-content:center }
    #tw-cd-modal { background:#fff;border-radius:8px;padding:24px;max-width:660px;width:93%;max-height:92vh;overflow-y:auto;box-shadow:0 6px 30px rgba(0,0,0,.35) }
    #tw-cd-modal h2 { margin:0 0 4px 0;font-size:17px }
    .cfg-grp { margin-bottom:10px }
    .cfg-grp label { display:block;font-size:12px;font-weight:bold;color:#444;margin-bottom:3px }
    .cfg-grp input[type=text],.cfg-grp input[type=password] { width:100%;padding:7px;border:1px solid #ccc;border-radius:4px;font-size:12px;box-sizing:border-box }
    .cfg-check { display:flex !important;align-items:center;gap:6px;font-weight:normal !important;cursor:pointer }
    .cfg-btns { display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap }
    .cfg-btns button { padding:7px 16px;border:none;border-radius:4px;cursor:pointer;font-size:12px;font-weight:bold }
    .btn-save { background:#28a745;color:#fff } .btn-cancel { background:#6c757d;color:#fff } .btn-test { background:#007bff;color:#fff }
    .cfg-btn-row { display:flex;gap:4px;align-items:center;margin-bottom:5px;flex-wrap:wrap }
    .cfg-btn-row input { padding:3px 5px;border:1px solid #ccc;border-radius:3px;font-size:11px }
    .cfg-btn-row .preview-btn { padding:2px 7px;border:none;border-radius:3px;cursor:default;font-size:11px;font-weight:bold }
    .cfg-btn-row .del-btn { background:#dc3545;color:#fff;border:none;border-radius:3px;cursor:pointer;font-size:11px;padding:2px 6px }
    .cd-qf { padding:2px 10px;border:1px solid #bbb;border-radius:3px;background:#f4e4bc;font-size:11px;cursor:pointer;color:#4a3a22 }
    .cd-qf.active { background:#7b4a16;color:#fff;border-color:#7b4a16;font-weight:bold }
    .cd-qf:hover:not(.active) { background:#e0d0a0 }
    .cd-effect-row { display:flex;gap:6px;align-items:center;padding:4px 8px;background:#f9f1d7;border:1px solid #ddd;border-radius:4px;margin-bottom:4px;flex-wrap:wrap;font-size:12px }
  `);

  // ══════════════════════════════════════════════════
  // PAINEL
  // ══════════════════════════════════════════════════
  function buildPanel() {
    if (panelReady) return;
    panelEl = document.createElement('div');
    panelEl.id = 'tw-cd-wrap';
    panelEl.innerHTML = `
      <div id="tw-cd-header">
        <button id="tw-cd-collapse" style="font-size:16px;background:transparent;border:none;cursor:pointer">${collapsed?'▸':'▾'}</button>
        <h3>🛡️ Central de Defesa <span class="cd-badge">v${VERSION} • ${WORLD.toUpperCase()}</span></h3>
        <span id="tw-cd-status">iniciando...</span>
        <button id="tw-cd-cfg-btn">⚙️ Config</button>
        <button id="tw-cd-refresh-btn" title="Atualizar agora">🔄</button>
        <label><input type="checkbox" id="tw-cd-colorize" ${CFG.colorize?'checked':''}> Cores</label>
        <label><input type="checkbox" id="tw-cd-supports" ${CFG.showSupports?'checked':''}> Apoios</label>
        <label><input type="checkbox" id="tw-cd-ignored" ${CFG.showIgnored?'checked':''}> Ocultos</label>
      </div>
      <div id="tw-cd-body" ${collapsed?'style="display:none"':''}>
        <div id="tw-cd-stats"></div>
        <div id="tw-cd-quick-filters" style="display:flex;gap:4px;margin-bottom:6px;flex-wrap:wrap">
          <button class="cd-qf active" data-qf="">Todos</button>
          <button class="cd-qf" data-qf="noble">👑 Só Nobres</button>
          <button class="cd-qf" data-qf="large">🔴 Só Large</button>
          <button class="cd-qf" data-qf="urgent">⚡ Urgentes (&lt;1h)</button>
          <span style="flex:1"></span>
          <button id="cd-expand-all" title="Expandir tudo" style="padding:2px 8px;border:1px solid #bbb;border-radius:3px;background:#f4e4bc;font-size:11px;cursor:pointer">↕ Expandir tudo</button>
          <button id="cd-collapse-all" title="Colapsar tudo" style="padding:2px 8px;border:1px solid #bbb;border-radius:3px;background:#f4e4bc;font-size:11px;cursor:pointer">↕ Ocultar tudo</button>
        </div>
        <div id="tw-cd-filters">
          <input id="cd-f-type"     placeholder="Tipo...">
          <input id="cd-f-target"   placeholder="Destino...">
          <input id="cd-f-defender" placeholder="Defensor...">
          <input id="cd-f-origin"   placeholder="Origem...">
          <input id="cd-f-attacker" placeholder="Atacante...">
          <select id="cd-f-time">
            <option value="">Qualquer hora</option>
            <option value="15">≤ 15 min</option>
            <option value="30">≤ 30 min</option>
            <option value="60">≤ 1 h</option>
            <option value="180">≤ 3 h</option>
            <option value="720">≤ 12 h</option>
            <option value="1440">≤ 24 h</option>
          </select>
        </div>
        <div class="cd-tabs">
          <div class="cd-tab active" data-tab="attacks">⚔️ Ataques</div>
          <div class="cd-tab" data-tab="map">🗺️ Mapa</div>
          <div class="cd-tab" data-tab="online">👥 Online</div>
        </div>
        <div class="cd-panel">
          <div id="tab-attacks">
            <table class="cd-table">
              <colgroup><col style="width:38px"><col style="width:160px"><col style="width:200px"><col style="width:160px"><col style="width:200px"><col style="width:160px"><col style="width:140px"><col style="width:110px"></colgroup>
              <thead><tr><th>⚔</th><th>Tipo</th><th>Destino</th><th>Defensor</th><th>Origem</th><th>Atacante</th><th>Chegada</th><th>Chega em</th><th>Ações</th></tr></thead>
              <tbody id="tw-cd-tbody"></tbody>
            </table>
          </div>
          <div id="tab-map" style="display:none">
            <div class="cd-map-ctrl">
              <label><input type="checkbox" id="mf-noble"   checked> 👑</label>
              <label><input type="checkbox" id="mf-large"   checked> 🔴 Large</label>
              <label><input type="checkbox" id="mf-medium"  checked> 🟤 Medium</label>
              <label><input type="checkbox" id="mf-small"   checked> 🟢 Small</label>
              <label><input type="checkbox" id="mf-support" checked> 🛡️</label>
              <label><input type="checkbox" id="mf-world" checked> 🌍 Aldeias</label>
              <span style="flex:1"></span>
              <button id="map-minus">−</button>
              <span id="map-size-lbl" style="font-size:11px;min-width:50px;text-align:center">500px</span>
              <button id="map-plus">+</button>
            </div>
            <canvas id="tw-cd-minimap" width="800" height="500" style="height:500px"></canvas>
            <p style="font-size:10px;color:#888;margin:3px 0 0">🖱️ Arraste para navegar | 🔍 Scroll para zoom | ✅ Aldeias = mapa do mundo com cores por tribo</p>
          </div>
          <div id="tab-online" style="display:none">
            <div style="padding:10px">
              <div style="font-weight:bold;margin-bottom:8px">👥 Membros Online <span style="font-size:11px;color:#666;font-weight:normal">(requer servidor)</span></div>
              <div id="tw-cd-online-list"><span style="color:#888">Aguardando dados...</span></div>
            </div>
          </div>
        </div>
      </div>`;

    const inc = document.querySelector('#incomings_table');
    if (inc?.parentNode) inc.parentNode.insertBefore(panelEl, inc);
    else (document.querySelector('#content_value')||document.body).prepend(panelEl);

    tbodyEl  = panelEl.querySelector('#tw-cd-tbody');
    statsEl  = panelEl.querySelector('#tw-cd-stats');
    statusEl = panelEl.querySelector('#tw-cd-status');

    bindPanel();
    initMinimap(panelEl.querySelector('#tw-cd-minimap'));
    panelReady = true;
    document.documentElement.classList.toggle('tw-cd-show-ignored', CFG.showIgnored);
  }

  function bindPanel() {
    panelEl.querySelector('#tw-cd-collapse').onclick = () => {
      collapsed = !collapsed;
      panelEl.querySelector('#tw-cd-body').style.display = collapsed ? 'none' : '';
      panelEl.querySelector('#tw-cd-collapse').textContent = collapsed ? '▸' : '▾';
      GM_setValue('tw_cd2_collapsed_'+WORLD, collapsed);
    };
    panelEl.querySelector('#tw-cd-cfg-btn').onclick = openConfig;
    panelEl.querySelector('#tw-cd-refresh-btn').onclick = () => mainSync(true);
    panelEl.querySelector('#tw-cd-colorize').onchange = e => { CFG.colorize=e.target.checked; saveConfig(CFG); renderAttacks(); applyRenameToTable(); };
    panelEl.querySelector('#tw-cd-supports').onchange = e => { CFG.showSupports=e.target.checked; saveConfig(CFG); renderAttacks(); };
    panelEl.querySelector('#tw-cd-ignored').onchange  = e => { CFG.showIgnored=e.target.checked; saveConfig(CFG); document.documentElement.classList.toggle('tw-cd-show-ignored',CFG.showIgnored); };
    let ft;
    ['cd-f-type','cd-f-target','cd-f-defender','cd-f-origin','cd-f-attacker','cd-f-time'].forEach(id => {
      const el = panelEl.querySelector('#'+id);
      if (el) { el.addEventListener('input',()=>{clearTimeout(ft);ft=setTimeout(renderAttacks,200);}); el.addEventListener('change',renderAttacks); }
    });
    panelEl.querySelectorAll('.cd-tab').forEach(tab => {
      tab.onclick = () => {
        panelEl.querySelectorAll('.cd-tab').forEach(t=>t.classList.remove('active'));
        tab.classList.add('active');
        ['attacks','map','online'].forEach(n=>{ const e=panelEl.querySelector(`#tab-${n}`); if(e) e.style.display=n===tab.dataset.tab?'':'none'; });
        if (tab.dataset.tab==='map')    renderMinimap();
        if (tab.dataset.tab==='online') fetchOnline();
      };
    });
    let mapH = GM_getValue('tw_cd2_mapH_'+WORLD, 500);
    const canvas = panelEl.querySelector('#tw-cd-minimap'), lbl = panelEl.querySelector('#map-size-lbl');
    const setH = h => { mapH=Math.max(250,Math.min(1000,h)); canvas.height=mapH; canvas.style.height=mapH+'px'; if(lbl)lbl.textContent=mapH+'px'; GM_setValue('tw_cd2_mapH_'+WORLD,mapH); renderMinimap(); };
    setH(mapH);
    panelEl.querySelector('#map-minus').onclick = ()=>setH(mapH-50);
    panelEl.querySelector('#map-plus').onclick  = ()=>setH(mapH+50);
    ['mf-noble','mf-large','mf-medium','mf-small','mf-support','mf-world'].forEach(id=>panelEl.querySelector('#'+id)?.addEventListener('change',renderMinimap));

    panelEl.querySelectorAll('.cd-qf').forEach(btn => {
      btn.onclick = () => {
        panelEl.querySelectorAll('.cd-qf').forEach(b=>b.classList.remove('active'));
        btn.classList.add('active');
        quickFilter = btn.dataset.qf || '';
        renderAttacks();
      };
    });
    panelEl.querySelector('#cd-expand-all').onclick = () => {
      collapsedPlayers.clear(); collapsedVillages.clear(); renderAttacks();
    };
    panelEl.querySelector('#cd-collapse-all').onclick = () => {
      getFiltered().forEach(a => collapsedPlayers.add((a.defender||'?').trim()));
      renderAttacks();
    };
  }

  // ══════════════════════════════════════════════════
  // RENDERIZAR TABELA
  // ══════════════════════════════════════════════════
  function getTypeStyle(type) {
    if (!CFG.colorize||!type) return '';
    const t = type.toLowerCase();
    for (const btn of CFG.renameButtons) {
      if (t.includes(btn.cmd.toLowerCase())) return `background:${btn.bg};color:${btn.color};font-weight:bold;`;
    }
    if (/nobre/i.test(type))  return 'background:#9232a8;color:#fff;font-weight:bold;';
    if (/apoio/i.test(type))  return 'background:#0860a3;color:#fff;font-weight:bold;';
    if (/large/i.test(type))  return 'background:#c62828;color:#fff;font-weight:bold;';
    if (/medium/i.test(type)) return 'background:#5d2e0c;color:#fff;font-weight:bold;';
    if (/small/i.test(type))  return 'background:#1b5e20;color:#fff;font-weight:bold;';
    return '';
  }

  function getFiltered() {
    if (!panelEl) return [];
    const now   = Date.now();
    const fType = (panelEl.querySelector('#cd-f-type')    ?.value||'').toLowerCase();
    const fTgt  = (panelEl.querySelector('#cd-f-target')  ?.value||'').toLowerCase();
    const fDef  = (panelEl.querySelector('#cd-f-defender')?.value||'').toLowerCase();
    const fOri  = (panelEl.querySelector('#cd-f-origin')  ?.value||'').toLowerCase();
    const fAtk  = (panelEl.querySelector('#cd-f-attacker')?.value||'').toLowerCase();
    const fMins = parseInt(panelEl.querySelector('#cd-f-time')?.value||'0');
    return allAttacks.filter(a => {
      if ((a.arrival_at||0) <= now) return false;
      if (!CFG.showSupports && a.is_support) return false;
      if (fType && !(a.type    ||'').toLowerCase().includes(fType)) return false;
      if (fTgt  && !(a.target  ||'').toLowerCase().includes(fTgt))  return false;
      if (fDef  && !(a.defender||'').toLowerCase().includes(fDef))  return false;
      if (fOri  && !(a.origin  ||'').toLowerCase().includes(fOri))  return false;
      if (fAtk  && !(a.attacker||'').toLowerCase().includes(fAtk))  return false;
      if (fMins && (a.arrival_at-now > fMins*60000)) return false;
      return true;
    }).sort((a,b)=>(a.arrival_at||0)-(b.arrival_at||0));
  }

  let quickFilter = '';

  function renderAttacks() {
    if (!tbodyEl) return;
    const now     = Date.now();
    const attacks = getFiltered();

    const displayed = quickFilter ? attacks.filter(a => {
      if (quickFilter === 'noble')  return a.is_noble;
      if (quickFilter === 'large')  return a.axe_size === 'large';
      if (quickFilter === 'urgent') return (a.arrival_at - now) < 3600000;
      return true;
    }) : attacks;

    const byDef = new Map();
    displayed.forEach(a => {
      const d = (a.defender||'?').trim(), t = (a.target||'?').trim();
      if (!byDef.has(d)) byDef.set(d, new Map());
      if (!byDef.get(d).has(t)) byDef.get(d).set(t, []);
      byDef.get(d).get(t).push(a);
    });

    const sorted = [...byDef.entries()].sort((a,b) => {
      const aN = [...a[1].values()].flat().filter(x=>x.is_noble).length;
      const bN = [...b[1].values()].flat().filter(x=>x.is_noble).length;
      if (bN !== aN) return bN - aN;
      return [...b[1].values()].flat().length - [...a[1].values()].flat().length;
    });

    const frag = document.createDocumentFragment();

    if (!sorted.length) {
      const empty = document.createElement('tr');
      empty.innerHTML = `<td colspan="9" style="text-align:center;padding:20px;color:#888">
        ${quickFilter ? '🔍 Nenhum ataque para este filtro' : '✅ Sem ataques no momento'}
      </td>`;
      frag.appendChild(empty);
    }

    sorted.forEach(([def, vils]) => {
      const allAtks  = [...vils.values()].flat();
      const total    = allAtks.length;
      const nobles   = allAtks.filter(a=>a.is_noble).length;
      const larges   = allAtks.filter(a=>a.axe_size==='large').length;
      const nextMs   = Math.min(...allAtks.map(a=>a.arrival_at-now).filter(x=>x>0));
      const pCollapsed = collapsedPlayers.has(def);

      const dr = document.createElement('tr');
      dr.className = 'cd-player-row';
      dr.style.cssText = 'cursor:pointer;user-select:none';
      dr.innerHTML = `<td colspan="9" style="padding:5px 8px">
        <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
          <span style="font-size:11px;color:#7b4a16;font-weight:bold">${pCollapsed?'▸':'▾'}</span>
          <span>👤 <strong>${esc(def)}</strong></span>
          <span style="background:#7b4a16;color:#fff;border-radius:4px;padding:1px 7px;font-size:11px">${total} atk${total>1?'s':''}</span>
          ${nobles ? `<span style="background:#9232a8;color:#fff;border-radius:4px;padding:1px 7px;font-size:11px">👑 ${nobles} nobre${nobles>1?'s':''}</span>` : ''}
          ${larges ? `<span style="background:#dc3545;color:#fff;border-radius:4px;padding:1px 7px;font-size:11px">🔴 ${larges} large${larges>1?'s':''}</span>` : ''}
          ${nobles && nextMs > 0 ? `<span style="color:#c00;font-size:11px;font-weight:bold">⏰ próximo nobre em ${fmtCd(Math.min(...allAtks.filter(a=>a.is_noble).map(a=>a.arrival_at-now)))}</span>` : ''}
          <span style="flex:1;text-align:right;font-size:10px;color:#888">${pCollapsed?'▸ clique para expandir':''}</span>
        </div>
      </td>`;
      dr.onclick = () => {
        pCollapsed ? collapsedPlayers.delete(def) : collapsedPlayers.add(def);
        renderAttacks();
      };
      frag.appendChild(dr);
      if (pCollapsed) return;

      [...vils.entries()].sort((a,b)=>(a[1][0].arrival_at||0)-(b[1][0].arrival_at||0)).forEach(([vil, atks]) => {
        const vn      = atks.filter(a=>a.is_noble).length;
        const vkey    = def + '::' + vil;
        const vCollapsed = collapsedVillages.has(vkey);
        const nextVilMs  = Math.min(...atks.map(a=>a.arrival_at-now).filter(x=>x>0));
        const isUrgent   = nextVilMs < 900000;

        const vr = document.createElement('tr');
        vr.className = 'cd-village-row';
        vr.style.cssText = `cursor:pointer;user-select:none;${isUrgent && vn ? 'background:#ffe0e0 !important' : ''}`;
        vr.innerHTML = `<td colspan="9" style="padding:4px 8px 4px 24px">
          <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">
            <span style="font-size:10px;color:#7b4a16">${vCollapsed?'▸':'▾'}</span>
            <span>🏰 <strong>${esc(vil)}</strong></span>
            <span style="font-size:11px;color:#666">${atks.length} ataque${atks.length>1?'s':''}</span>
            ${vn ? `<span style="background:#9232a8;color:#fff;border-radius:3px;padding:0 6px;font-size:11px">👑 ${vn}</span>` : ''}
            ${isUrgent ? `<span style="color:#c00;font-size:11px;font-weight:bold">⚡ ${fmtCd(nextVilMs)}</span>` : ''}
            <span style="flex:1;text-align:right">
              <button class="cd-rename-all" data-def="${esc(def)}" data-vil="${esc(vil)}"
                style="background:#7b4a16;color:#fff;border:none;border-radius:3px;padding:1px 7px;font-size:10px;cursor:pointer"
                title="Renomear todos desta aldeia de uma vez">✏️ Todos</button>
            </span>
          </div>
        </td>`;
        vr.querySelector('.cd-rename-all').onclick = e => {
          e.stopPropagation();
          openMassRename(def, vil, atks);
        };
        vr.onclick = e => {
          if (e.target.tagName === 'BUTTON') return;
          vCollapsed ? collapsedVillages.delete(vkey) : collapsedVillages.add(vkey);
          renderAttacks();
        };
        frag.appendChild(vr);
        if (vCollapsed) return;

        atks.forEach(a => {
          const ms = (a.arrival_at||0) - now;
          const cc = ms<=0?'arrived':ms<=900000?'urgent':ms<=3600000?'soon':'ok';
          const ts = getTypeStyle(a.type);
          const tr = document.createElement('tr');
          tr.setAttribute('data-arrival', a.arrival_at||0);
          tr.innerHTML = `
            <td style="text-align:center;padding:3px 4px;width:20px">
              ${a.icon_src?`<img src="${esc(a.icon_src)}" style="height:16px;width:16px;image-rendering:pixelated" onerror="this.style.display='none'">`:''} ${a.watchtower?'👁':''}
            </td>
            <td><span style="${ts}">${esc(a.type)}</span></td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${esc(a.target)}</td>
            <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(a.defender)}</td>
            <td style="max-width:150px;overflow:hidden;text-overflow:ellipsis">${esc(a.origin)}</td>
            <td style="max-width:120px;overflow:hidden;text-overflow:ellipsis">${esc(a.attacker)}</td>
            <td style="font-size:11px;white-space:nowrap">${esc(a.arrival_text||fmtDate(a.arrival_at))}</td>
            <td style="white-space:nowrap">
              <span class="cd-cd ${cc}" data-ts="${Math.floor((a.arrival_at||0)/1000)}">${fmtCd(ms)}</span>
            </td>
            <td style="white-space:nowrap;padding:2px 4px">
              <button class="cd-sim-btn" title="Simulador" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:1px">🎮</button>
              <button class="cd-snipe-row-btn" title="Snipe Finder" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:1px">🎯</button>
              <button class="cd-copy-btn" title="Copiar para Discord" style="background:transparent;border:none;cursor:pointer;font-size:12px;padding:1px">📋</button>
            </td>`;
          tr.querySelector('.cd-sim-btn').onclick   = () => openSimulator(a);
          tr.querySelector('.cd-snipe-row-btn').onclick = () => {
            const coord = (a.target||'').match(/(\d{3})\|(\d{3})/)?.[0] || (a.origin||'').match(/(\d{3})\|(\d{3})/)?.[0] || '';
            openSnipeFinder(coord, a.arrival_text || fmtDate(a.arrival_at));
          };
          tr.querySelector('.cd-copy-btn').onclick  = () => copyAttackToClipboard(a);
          frag.appendChild(tr);
        });
      });
    });

    tbodyEl.innerHTML = '';
    tbodyEl.appendChild(frag);
    renderStats(displayed);
    updateBadge(attacks);
  }

  function openMassRename(defender, village, atks) {
    const ov = document.createElement('div');
    ov.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:999999;display:flex;align-items:center;justify-content:center';
    ov.innerHTML = `<div style="background:#f4e4bc;border:2px solid #7b4a16;border-radius:8px;padding:20px;max-width:480px;width:95%;font-family:Verdana,sans-serif">
      <h3 style="margin:0 0 12px;color:#2b1a0f">✏️ Renomear Todos — ${esc(village)}</h3>
      <p style="font-size:12px;color:#555;margin:0 0 12px">${atks.length} ataques serão renomeados de uma vez.</p>
      <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">
        ${CFG.renameButtons.map(btn=>`
          <button class="mass-btn" data-cmd="${esc(btn.cmd)}"
            style="background:${esc(btn.bg)};color:${esc(btn.color)};border:none;padding:3px 9px;border-radius:3px;font-size:11px;cursor:pointer;font-weight:bold">
            ${esc(btn.label)}
          </button>`).join('')}
      </div>
      <div style="display:flex;gap:8px;margin-bottom:10px">
        <input id="mass-custom" type="text" placeholder="Ou escreva aqui..." style="flex:1;padding:6px;border:1px solid #ccc;border-radius:4px;font-size:12px">
        <button id="mass-apply" style="background:#28a745;color:#fff;border:none;border-radius:4px;padding:6px 14px;cursor:pointer;font-weight:bold">Aplicar</button>
      </div>
      <div id="mass-status" style="font-size:11px;color:#555;min-height:16px"></div>
      <div style="text-align:right;margin-top:10px">
        <button id="mass-close" style="padding:5px 14px;background:#6c757d;color:#fff;border:none;border-radius:4px;cursor:pointer">Fechar</button>
      </div>
    </div>`;
    document.body.appendChild(ov);
    ov.querySelector('#mass-close').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target===ov) ov.remove(); };

    function applyMass(cmd) {
      const statusEl = ov.querySelector('#mass-status');
      statusEl.textContent = `⏳ Renomeando ${atks.length} ataques...`;
      let done = 0, failed = 0;
      const delay = (ms) => new Promise(r => setTimeout(r, ms));
      (async () => {
        for (const a of atks) {
          const id = a.command_id;
          if (!id || !/^\d+$/.test(id)) { failed++; continue; }
          let newName;
          if (cmd.startsWith('|') || cmd.startsWith(' |')) newName = (a.attacker||'') + cmd;
          else newName = cmd;
          const ok = await renameCommand(id, newName.trim());
          if (ok) done++; else failed++;
          statusEl.textContent = `⏳ ${done}/${atks.length} renomeados${failed ? ` (${failed} falhas)` : ''}...`;
          await delay(150); // Throttle para não sobrecarregar
        }
        statusEl.textContent = `✅ ${done} renomeados${failed ? `, ${failed} falhas` : ''}!`;
        applyRenameToTable();
      })();
    }

    ov.querySelectorAll('.mass-btn').forEach(btn => {
      btn.onclick = () => applyMass(btn.dataset.cmd);
    });
    ov.querySelector('#mass-apply').onclick = () => {
      const val = ov.querySelector('#mass-custom').value.trim();
      if (val) applyMass(val);
    };
  }

  function copyAttackToClipboard(a) {
    const now = Date.now();
    const ms  = (a.arrival_at||0) - now;
    const txt = [
      `⚔️ **${a.type}**`,
      `📍 Destino: **${a.target}** | Origem: ${a.origin}`,
      `👤 Atacante: **${a.attacker}** → Defensor: ${a.defender}`,
      `⏰ Chegada: **${fmtDate(a.arrival_at)}** (${fmtCd(ms)})`,
    ].join('\n');
    navigator.clipboard?.writeText(txt).then(() => {
      setStatus('📋 Copiado!');
      setTimeout(()=>setStatus(`✅ ${allAttacks.length} ataques`), 2000);
    }).catch(() => {
      const ta = document.createElement('textarea');
      ta.value = txt; document.body.appendChild(ta);
      ta.select(); document.execCommand('copy');
      ta.remove();
      setStatus('📋 Copiado!');
      setTimeout(()=>setStatus(`✅ ${allAttacks.length} ataques`), 2000);
    });
  }

  function renderStats(attacks) {
    if (!statsEl) return;
    let n=0,s=0,m=0,l=0,sm=0,nbl=0,sup=0,wt=0;
    attacks.forEach(a=>{
      if(a.watchtower)wt++;
      if(a.is_support){sup++;return;}
      if(a.is_noble){nbl++;return;}
      if(a.axe_size==='small')s++;
      else if(a.axe_size==='medium')m++;
      else if(a.axe_size==='large')l++;
      else if(a.axe_size==='small_medium')sm++;
      else n++;
    });
    const p=(cls,ic,v,lb)=>`<div class="cd-pill ${cls}">${ic} <strong>${v}</strong> ${lb}</div>`;
    statsEl.innerHTML=p('','⚔️',n,'Normal')+p('small','🟢',s,'Small')+p('medium','🟤',m,'Medium')+(sm?p('','🔵',sm,'S+M'):'')+p('large','🔴',l,'Large')+p('noble','👑',nbl,'Nobres')+p('','🛡️',sup,'Apoio')+(wt?p('','👁',wt,'Torre'):'')+`<div class="cd-pill"><strong>${attacks.length}</strong> total</div>`;
  }

  function updateBadge(attacks) {
    const now=Date.now(), n=attacks.filter(a=>a.is_noble&&a.arrival_at>now).length;
    const badge=document.querySelector('#tw-cd-sidebtn .cd-nbadge');
    if (!badge)return; badge.textContent=n>99?'99+':String(n); badge.classList.toggle('show',n>0);
  }

  function setStatus(msg,err=false) { if(!statusEl)return; statusEl.textContent=msg; statusEl.style.color=err?'#c00':'#4a3a22'; }

  function tickCountdowns() {
    const now=Math.floor(Date.now()/1000);
    document.querySelectorAll('.cd-cd[data-ts]').forEach(el=>{
      const diff=parseInt(el.dataset.ts||'0')-now;
      el.textContent=diff<=0?'CHEGOU':fmtCd(diff*1000);
      el.className=`cd-cd ${diff<=0?'arrived':diff<=900?'urgent':diff<=3600?'soon':'ok'}`;
    });
  }

  // ══════════════════════════════════════════════════
  // MINIMAPA — com mapa do mundo (cores por tribo)
  // ══════════════════════════════════════════════════
  let vp=null, drag={};

  // Cores por tribo (gera cores estáveis por ID da tribo)
  const TRIBE_COLORS = {};
  function getTribeColor(tribeId) {
    if (!tribeId || tribeId === '0') return '#4a6741'; // bárbaro = verde escuro
    if (TRIBE_COLORS[tribeId]) return TRIBE_COLORS[tribeId];
    // Gera cor baseada no hash do ID
    let hash = 0;
    for (let i = 0; i < tribeId.length; i++) { hash = tribeId.charCodeAt(i) + ((hash << 5) - hash); }
    const hue = Math.abs(hash) % 360;
    const sat = 50 + (Math.abs(hash >> 8) % 30);
    const lig = 35 + (Math.abs(hash >> 16) % 25);
    TRIBE_COLORS[tribeId] = `hsl(${hue},${sat}%,${lig}%)`;
    return TRIBE_COLORS[tribeId];
  }

  function initMinimap(canvas) {
    canvas.addEventListener('wheel',e=>{e.preventDefault();if(!vp)return;vp.size=Math.max(10,Math.min(500,vp.size*(e.deltaY>0?1.2:0.8)));clampVP();renderMinimap();},{passive:false});
    canvas.addEventListener('mousedown',e=>{if(e.button!==0)return;drag={sx:e.clientX,sy:e.clientY,active:false};canvas.style.cursor='grabbing';});
    canvas.addEventListener('mousemove',e=>{
      if(drag.sx===undefined)return;
      const dx=e.clientX-drag.sx,dy=e.clientY-drag.sy;
      if(!drag.active&&(Math.abs(dx)>3||Math.abs(dy)>3))drag.active=true;
      if(drag.active&&vp){vp.x-=dx*vp.size/canvas.width;vp.y-=dy*vp.size/canvas.height;clampVP();drag.sx=e.clientX;drag.sy=e.clientY;renderMinimap();}
    });
    const stop=()=>{drag={};canvas.style.cursor='grab';};
    canvas.addEventListener('mouseup',stop); canvas.addEventListener('mouseleave',stop);
  }
  function clampVP(){if(!vp)return;vp.size=Math.max(10,Math.min(500,vp.size));vp.x=Math.max(0,Math.min(1000-vp.size,vp.x));vp.y=Math.max(0,Math.min(1000-vp.size,vp.y));}
  function fitVP(pairs){let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;pairs.forEach(({o,t})=>{x0=Math.min(x0,o.x,t.x);x1=Math.max(x1,o.x,t.x);y0=Math.min(y0,o.y,t.y);y1=Math.max(y1,o.y,t.y);});const pad=20,size=Math.max(x1-x0,y1-y0,10)+2*pad;vp={x:x0-pad,y:y0-pad,size};clampVP();}

  // Cache do background do mapa (render uma vez, reutiliza)
  let _mapBgCache = null, _mapBgVP = null;

  function renderMinimapBackground(ctx, W, H) {
    if (!worldData.loaded || !worldData.villages.length) return;

    // Só re-renderiza se o viewport mudou
    const vpKey = `${vp.x.toFixed(1)}_${vp.y.toFixed(1)}_${vp.size.toFixed(1)}_${W}_${H}`;
    if (_mapBgCache && _mapBgVP === vpKey) {
      ctx.putImageData(_mapBgCache, 0, 0);
      return;
    }

    const sx = W / vp.size, sy = H / vp.size;
    const pixelSize = Math.max(1, Math.min(sx, sy) * 0.6);

    // Fundo escuro tipo o mapa do jogo
    ctx.fillStyle = '#2d4a2d';
    ctx.fillRect(0, 0, W, H);

    // Renderiza cada aldeia como um pixel colorido por tribo
    worldData.villages.forEach(v => {
      const px = (v.x - vp.x) * sx;
      const py = (v.y - vp.y) * sy;
      if (px < -2 || px > W + 2 || py < -2 || py > H + 2) return;

      const player = worldData.players.get(v.playerId);
      const tribeId = player?.tribeId || '0';
      ctx.fillStyle = getTribeColor(tribeId);
      ctx.fillRect(Math.round(px - pixelSize/2), Math.round(py - pixelSize/2), Math.ceil(pixelSize), Math.ceil(pixelSize));
    });

    // Cache o resultado
    try {
      _mapBgCache = ctx.getImageData(0, 0, W, H);
      _mapBgVP = vpKey;
    } catch(e) {}
  }

  function renderMinimap() {
    const canvas=panelEl?.querySelector('#tw-cd-minimap'); if(!canvas)return;
    const ctx=canvas.getContext('2d'),W=canvas.width,H=canvas.height;
    ctx.clearRect(0,0,W,H);
    const now=Date.now();
    const fNbl=panelEl.querySelector('#mf-noble')?.checked??true, fLg=panelEl.querySelector('#mf-large')?.checked??true;
    const fMd=panelEl.querySelector('#mf-medium')?.checked??true, fSm=panelEl.querySelector('#mf-small')?.checked??true;
    const fSup=panelEl.querySelector('#mf-support')?.checked??true;
    const showWorld=panelEl.querySelector('#mf-world')?.checked??true;
    const pairs=allAttacks.filter(a=>a.arrival_at>now).map(a=>({a,o:parseCoord(a.origin),t:parseCoord(a.target)})).filter(p=>p.o&&p.t);

    if(!pairs.length && !showWorld){
      ctx.fillStyle='#2d4a2d';ctx.fillRect(0,0,W,H);
      ctx.fillStyle='#ccc';ctx.font='13px Arial';ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.fillText('Sem ataques com coordenadas válidas',W/2,H/2);
      return;
    }

    if(!vp) {
      if (pairs.length) fitVP(pairs);
      else vp = { x: 300, y: 300, size: 400 };
    }
    clampVP();

    const sx=W/vp.size,sy=H/vp.size;

    // Fundo: mapa do mundo com aldeias coloridas por tribo
    if (showWorld && worldData.loaded) {
      renderMinimapBackground(ctx, W, H);
    } else {
      ctx.fillStyle='#2d4a2d';ctx.fillRect(0,0,W,H);
    }

    // Grid
    ctx.strokeStyle='rgba(255,255,255,0.08)';ctx.lineWidth=0.5;
    for(let g=Math.floor(vp.x/100)*100;g<=vp.x+vp.size;g+=100){const cx=(g-vp.x)*sx;ctx.beginPath();ctx.moveTo(cx,0);ctx.lineTo(cx,H);ctx.stroke();}
    for(let g=Math.floor(vp.y/100)*100;g<=vp.y+vp.size;g+=100){const cy=(g-vp.y)*sy;ctx.beginPath();ctx.moveTo(0,cy);ctx.lineTo(W,cy);ctx.stroke();}

    // Desenha ataques
    pairs.forEach(({a,o,t})=>{
      if(a.is_noble&&!fNbl)return; if(a.is_support&&!fSup)return;
      if(a.axe_size==='large'&&!fLg)return; if(a.axe_size==='medium'&&!fMd)return; if(a.axe_size==='small'&&!fSm)return;
      const ox=(o.x-vp.x)*sx,oy=(o.y-vp.y)*sy,tx=(t.x-vp.x)*sx,ty=(t.y-vp.y)*sy;
      let color=a.is_noble?'#ff00ff':a.is_support?'#ffdd00':a.axe_size==='large'?'#ff2222':a.axe_size==='medium'?'#ff8844':a.axe_size==='small'?'#44ff44':'#cccccc';
      ctx.beginPath();ctx.moveTo(ox,oy);ctx.lineTo(tx,ty);ctx.strokeStyle=color;ctx.lineWidth=a.is_noble?3:2;ctx.globalAlpha=0.9;ctx.stroke();ctx.globalAlpha=1;

      // Pontos de origem e destino
      ctx.fillStyle='#ffffff';
      ctx.beginPath();ctx.arc(ox,oy,2.5,0,Math.PI*2);ctx.fill();
      ctx.fillStyle=color;
      ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#ffffff';ctx.lineWidth=1;
      ctx.beginPath();ctx.arc(tx,ty,4,0,Math.PI*2);ctx.stroke();
    });

    // Info
    ctx.fillStyle='rgba(0,0,0,.7)';
    ctx.fillRect(0, 0, 260, 20);
    ctx.fillStyle='#fff';ctx.font='bold 10px Arial';ctx.textAlign='left';ctx.textBaseline='top';
    ctx.fillText(`${pairs.length} ataques | zoom ${(100/vp.size).toFixed(1)}x | ${Math.round(vp.x)},${Math.round(vp.y)}`,5,5);
  }

  // ══════════════════════════════════════════════════
  // PAINEL ONLINE
  // ══════════════════════════════════════════════════
  function renderOnline() {
    const el = document.getElementById('tw-cd-online-list'); if(!el)return;
    if (!onlineMembers.size) { el.innerHTML='<span style="color:#888">Nenhum dado (configure o servidor)</span>'; return; }
    const now=Date.now(), TTL=5*60*1000;
    const items=[];
    onlineMembers.forEach((m,name)=>{
      const on=(now-(m.lastSeen||m.last_seen||0))<TTL;
      items.push(`<div class="cd-online-pill ${on?'':'off'}">${on?'🟢':'⚫'} ${esc(name)} <span style="font-size:10px;opacity:.65">(${esc(m.page||'?')})</span></div>`);
    });
    el.innerHTML=items.sort((a,b)=>b.includes('🟢')?1:-1).join('');
  }

  // ══════════════════════════════════════════════════
  // MODAL DE CONFIGURAÇÃO — COM ABA BÔNUS COMPLETA
  // ══════════════════════════════════════════════════
  function openConfig() {
    document.getElementById('tw-cd-overlay')?.remove();
    const ov = document.createElement('div');
    ov.id = 'tw-cd-overlay';
    const bonus = CFG.bonus || DEFAULT_BONUS;

    function renderBtnRows() {
      return CFG.renameButtons.map((btn,i)=>`
        <div class="cfg-btn-row" data-btn-idx="${i}">
          <button class="preview-btn" style="background:${esc(btn.bg)};color:${esc(btn.color)}">${esc(btn.label)}</button>
          <label style="font-size:11px">Label:<input class="bi-label" type="text" value="${esc(btn.label)}" style="width:46px" data-idx="${i}"></label>
          <label style="font-size:11px">Cmd:<input class="bi-cmd" type="text" value="${esc(btn.cmd)}" style="width:130px" data-idx="${i}"></label>
          <label style="font-size:11px">Fundo:<input class="bi-bg" type="color" value="${esc(normalizeColor(btn.bg))}" data-idx="${i}" style="width:36px;height:22px;cursor:pointer"></label>
          <label style="font-size:11px">Texto:<input class="bi-fg" type="color" value="${esc(normalizeColor(btn.color))}" data-idx="${i}" style="width:36px;height:22px;cursor:pointer"></label>
          <button class="del-btn" data-idx="${i}">✕</button>
        </div>`).join('');
    }

    function renderEffectRows() {
      const effects = bonus.effects || [];
      if (!effects.length) return '<p style="font-size:11px;color:#888;margin:4px 0">Nenhum efeito personalizado. Clique em "+ Adicionar Efeito" para criar.</p>';
      return effects.map((ef,i) => `
        <div class="cd-effect-row" data-eff-idx="${i}">
          <select class="eff-type" data-idx="${i}" style="padding:3px;border-radius:3px;border:1px solid #ccc">
            <option value="att" ${ef.type==='att'?'selected':''}>⚔️ Atacante</option>
            <option value="def" ${ef.type==='def'?'selected':''}>🛡️ Defensor</option>
          </select>
          <select class="eff-name" data-idx="${i}" style="padding:3px;border-radius:3px;border:1px solid #ccc">
            <option value="flag" ${ef.name==='flag'?'selected':''}>🏴 Efeito da bandeira</option>
            <option value="knight_item" ${ef.name==='knight_item'?'selected':''}>🏇 Item do paladino</option>
            <option value="tribe_skill" ${ef.name==='tribe_skill'?'selected':''}>📜 Habilidade da tribo</option>
            <option value="rune" ${ef.name==='rune'?'selected':''}>💎 Runa</option>
            <option value="custom" ${ef.name==='custom'?'selected':''}>✏️ Personalizado</option>
          </select>
          <select class="eff-mag" data-idx="${i}" style="padding:3px;border-radius:3px;border:1px solid #ccc">
            ${[5,10,15,20,25,30,50,75,100].map(v => `<option value="${v}" ${ef.magnitude===v?'selected':''}>+${v}%</option>`).join('')}
          </select>
          <button class="eff-del" data-idx="${i}" style="background:#dc3545;color:#fff;border:none;border-radius:3px;padding:2px 8px;cursor:pointer;font-size:11px">✕</button>
        </div>`).join('');
    }

    // Gera opções de magnitude como no simulador do jogo
    const magOptions = [5,10,15,20,25,30,50,75,100].map(v => `<option value="${v}">+${v}%</option>`).join('');

    ov.innerHTML = `<div id="tw-cd-modal">
      <h2>⚙️ Configurações — ${WORLD.toUpperCase()}</h2>
      <div style="display:flex;gap:5px;margin-bottom:12px;border-bottom:1px solid #eee;padding-bottom:8px;flex-wrap:wrap">
        <button class="cfg-tab-btn active" data-cfg-tab="rename" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#28a745;color:#fff">✏️ Renomear</button>
        <button class="cfg-tab-btn" data-cfg-tab="bonus" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#eee">⚔️ Bônus</button>
        <button class="cfg-tab-btn" data-cfg-tab="stack" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#eee">🛡️ Defesa</button>
        <button class="cfg-tab-btn" data-cfg-tab="server" style="padding:4px 10px;border:1px solid #ccc;border-radius:4px;cursor:pointer;background:#eee">🌐 Servidor</button>
      </div>

      <!-- ABA RENOMEAR -->
      <div id="cfg-tab-rename">
        <p style="font-size:11px;color:#666;margin:0 0 8px">Cmd começando com " | " <em>acrescenta</em> ao nome. Sem " | " <em>substitui</em> o sufixo.</p>
        <div id="cfg-btn-list" style="max-height:360px;overflow-y:auto">${renderBtnRows()}</div>
        <button id="cfg-add-btn" style="margin-top:8px;padding:4px 12px;background:#28a745;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">+ Adicionar botão</button>
      </div>

      <!-- ABA BÔNUS — COMPLETA como o simulador do jogo -->
      <div id="cfg-tab-bonus" style="display:none">
        <p style="font-size:11px;color:#666;margin:0 0 10px">Configure os bônus ativos no mundo. Estes valores são aplicados na calculadora de defesa e no simulador.</p>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">🏴 Bandeira — Bônus de Ataque/Defesa</strong>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:12px">
            <label>Bandeira atacante:
              <select id="cfg-flag-att" style="padding:4px;border-radius:3px;border:1px solid #ccc;margin-left:4px">
                <option value="0">Nenhum</option>
                ${[2,3,4,5,6,7,8,9,10,15,20,25,30].map(n=>`<option value="${n}" ${bonus.flagAtt==n?'selected':''}>+${n}%</option>`).join('')}
              </select>
            </label>
            <label>Bandeira defensor:
              <select id="cfg-flag-def" style="padding:4px;border-radius:3px;border:1px solid #ccc;margin-left:4px">
                <option value="0">Nenhum</option>
                ${[2,3,4,5,6,7,8,9,10,15,20,25,30].map(n=>`<option value="${n}" ${bonus.flagDef==n?'selected':''}>+${n}%</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">🏇 Paladino — Itens ativos</strong>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:12px">
            <label>Bônus ataque:
              <select id="cfg-knight-att" style="padding:4px;border-radius:3px;border:1px solid #ccc;margin-left:4px">
                <option value="0">Nenhum</option>
                ${[3,5,7,10,15,20,25,30].map(n=>`<option value="${n}" ${bonus.knightAtt==n?'selected':''}>+${n}%</option>`).join('')}
              </select>
            </label>
            <label>Bônus defesa:
              <select id="cfg-knight-def" style="padding:4px;border-radius:3px;border:1px solid #ccc;margin-left:4px">
                <option value="0">Nenhum</option>
                ${[3,5,7,10,15,20,25,30].map(n=>`<option value="${n}" ${bonus.knightDef==n?'selected':''}>+${n}%</option>`).join('')}
              </select>
            </label>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">🌙 Bônus Noturno</strong>
          <div style="margin-top:8px;font-size:12px">
            <label class="cfg-check"><input type="checkbox" id="cfg-night" ${bonus.nightBonus?'checked':''}>
              &nbsp;Bônus noturno ativo — defensor recebe +100% (dobra a defesa)
            </label>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">⚙️ Moral e Sorte</strong>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:12px;align-items:center">
            <label>Moral:
              <input type="number" id="cfg-moral" value="${bonus.moral||100}" min="0" max="100"
                style="width:60px;padding:3px;border:1px solid #ccc;border-radius:3px;margin-left:4px"> %
            </label>
            <label>Sorte (-25 a +25):
              <input type="number" id="cfg-luck" value="${bonus.luck||0}" min="-25" max="25"
                style="width:60px;padding:3px;border:1px solid #ccc;border-radius:3px;margin-left:4px"> %
            </label>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">⛪ Igreja</strong>
          <div style="display:flex;gap:12px;margin-top:8px;flex-wrap:wrap;font-size:12px;align-items:center">
            <label class="cfg-check"><input type="checkbox" id="cfg-church" ${bonus.church?'checked':''}>
              &nbsp;Igreja ativa no mundo
            </label>
            <label>% atacante:
              <input type="number" id="cfg-church-att" value="${bonus.churchAtt||100}" min="0" max="100"
                style="width:60px;padding:3px;border:1px solid #ccc;border-radius:3px;margin-left:4px"> %
            </label>
            <label>% defensor:
              <input type="number" id="cfg-church-def" value="${bonus.churchDef||100}" min="0" max="100"
                style="width:60px;padding:3px;border:1px solid #ccc;border-radius:3px;margin-left:4px"> %
            </label>
          </div>
        </div>

        <div style="border:1px solid #ddd;border-radius:4px;padding:10px;margin-bottom:10px">
          <strong style="font-size:12px">✨ Efeitos Personalizados</strong>
          <p style="font-size:11px;color:#666;margin:4px 0 8px">Adicione efeitos como no simulador do jogo: bandeira, itens do paladino, habilidades de tribo, etc.</p>
          <div id="cfg-effects-list">${renderEffectRows()}</div>
          <button id="cfg-add-effect" style="margin-top:8px;padding:4px 12px;background:#007bff;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:12px">+ Adicionar Efeito</button>
        </div>

        <div style="background:#fff3cd;border:1px solid #ffc107;border-radius:4px;padding:8px;font-size:11px;color:#555">
          💡 Estes valores são usados no cálculo de <strong>fulls necessários</strong> da calculadora de defesa e no <strong>pré-preenchimento do simulador</strong>.
        </div>
      </div>

      <!-- ABA DEFESA -->
      <div id="cfg-tab-stack" style="display:none">
        <p style="font-size:11px;color:#666;margin:0 0 8px">Limiares de status de defesa baseados em número de fulls estimados.</p>
        ${['OK','STACK_MORE','NOK'].map(k=>`
        <div style="border:1px solid #ddd;border-radius:4px;padding:8px;margin-bottom:8px">
          <strong style="color:${CFG.stackConfig[k].color}">${CFG.stackConfig[k].msg}</strong>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:6px;font-size:11px;align-items:center">
            <label>Nome: <input type="text" class="sc-msg" data-key="${k}" value="${esc(CFG.stackConfig[k].msg)}" style="width:100px;padding:3px;border:1px solid #ccc;border-radius:3px"></label>
            <label>Mín. Fulls: <input type="number" class="sc-fulls" data-key="${k}" value="${CFG.stackConfig[k].fulls}" style="width:55px;padding:3px;border:1px solid #ccc;border-radius:3px"></label>
            <label>Cor: <input type="color" class="sc-color" data-key="${k}" value="${esc(CFG.stackConfig[k].color)}" style="width:36px;height:24px;cursor:pointer"></label>
          </div>
        </div>`).join('')}
      </div>

      <!-- ABA SERVIDOR -->
      <div id="cfg-tab-server" style="display:none">
        <div class="cfg-grp"><label>URL do Servidor</label><input type="text" id="cfg-server-url" value="${esc(CFG.serverURL||'')}"></div>
        <div class="cfg-grp"><label>Token de autenticação</label><input type="password" id="cfg-server-token" value="${esc(CFG.authToken||'')}"></div>
        <div class="cfg-grp"><label class="cfg-check"><input type="checkbox" id="cfg-server-enabled" ${CFG.serverEnabled?'checked':''}> Servidor habilitado</label></div>
        <div class="cfg-grp"><label>Discord Webhook URL</label><input type="text" id="cfg-discord-url" value="${esc(CFG.discordWebhook||'')}"></div>
        <div class="cfg-grp"><label class="cfg-check"><input type="checkbox" id="cfg-discord-enabled" ${CFG.discordEnabled?'checked':''}> Discord habilitado</label></div>
        <div class="cfg-grp"><label class="cfg-check"><input type="checkbox" id="cfg-debug" ${CFG.debug?'checked':''}> Modo debug (console)</label></div>
      </div>

      <div id="cfg-result" style="display:none;margin-top:8px;padding:6px;border-radius:4px;font-size:12px"></div>
      <div class="cfg-btns">
        <button class="btn-cancel" id="cfg-cancel">✕ Fechar</button>
        <button class="btn-save"   id="cfg-save">💾 Salvar</button>
      </div>
    </div>`;

    document.body.appendChild(ov);

    // Navegação entre abas
    const TABS = ['rename','bonus','stack','server'];
    ov.querySelectorAll('.cfg-tab-btn').forEach(btn => {
      btn.onclick = () => {
        ov.querySelectorAll('.cfg-tab-btn').forEach(b=>{b.style.background='#eee';b.style.color='#333';});
        btn.style.background='#28a745'; btn.style.color='#fff';
        TABS.forEach(t=>{ const e=ov.querySelector(`#cfg-tab-${t}`); if(e) e.style.display=t===btn.dataset.cfgTab?'':'none'; });
      };
    });

    // Botões de renomear
    const list = ov.querySelector('#cfg-btn-list');
    list.addEventListener('input', e => {
      const idx = parseInt(e.target.dataset.idx); if (isNaN(idx)) return;
      if (e.target.classList.contains('bi-label')) CFG.renameButtons[idx].label = e.target.value;
      if (e.target.classList.contains('bi-cmd'))   CFG.renameButtons[idx].cmd   = e.target.value;
      if (e.target.classList.contains('bi-bg'))    CFG.renameButtons[idx].bg    = e.target.value;
      if (e.target.classList.contains('bi-fg'))    CFG.renameButtons[idx].color = e.target.value;
      const row = list.querySelector(`[data-btn-idx="${idx}"]`);
      const pb  = row?.querySelector('.preview-btn');
      if (pb) { pb.textContent=CFG.renameButtons[idx].label; pb.style.background=CFG.renameButtons[idx].bg; pb.style.color=CFG.renameButtons[idx].color; }
    });
    list.addEventListener('click', e => {
      if (!e.target.classList.contains('del-btn')) return;
      CFG.renameButtons.splice(parseInt(e.target.dataset.idx), 1);
      list.innerHTML = renderBtnRows();
    });
    ov.querySelector('#cfg-add-btn').onclick = () => {
      CFG.renameButtons.push({ label:'Novo', cmd:'[Novo]', bg:'#007bff', color:'#ffffff' });
      list.innerHTML = renderBtnRows();
    };

    // Efeitos personalizados
    const effList = ov.querySelector('#cfg-effects-list');
    effList.addEventListener('change', e => {
      const idx = parseInt(e.target.dataset.idx); if (isNaN(idx) || !bonus.effects[idx]) return;
      if (e.target.classList.contains('eff-type')) bonus.effects[idx].type = e.target.value;
      if (e.target.classList.contains('eff-name')) bonus.effects[idx].name = e.target.value;
      if (e.target.classList.contains('eff-mag'))  bonus.effects[idx].magnitude = parseInt(e.target.value) || 0;
    });
    effList.addEventListener('click', e => {
      if (!e.target.classList.contains('eff-del')) return;
      const idx = parseInt(e.target.dataset.idx);
      bonus.effects.splice(idx, 1);
      effList.innerHTML = renderEffectRows();
    });
    ov.querySelector('#cfg-add-effect').onclick = () => {
      if (!bonus.effects) bonus.effects = [];
      bonus.effects.push({ name: 'flag', type: 'att', magnitude: 10 });
      effList.innerHTML = renderEffectRows();
    };

    // Stack config
    ov.querySelectorAll('.sc-msg').forEach(el=>el.onchange=()=>CFG.stackConfig[el.dataset.key].msg=el.value);
    ov.querySelectorAll('.sc-fulls').forEach(el=>el.onchange=()=>CFG.stackConfig[el.dataset.key].fulls=parseInt(el.value)||0);
    ov.querySelectorAll('.sc-color').forEach(el=>el.onchange=()=>CFG.stackConfig[el.dataset.key].color=el.value);

    ov.querySelector('#cfg-cancel').onclick = () => ov.remove();
    ov.onclick = e => { if (e.target===ov) ov.remove(); };

    ov.querySelector('#cfg-save').onclick = () => {
      // Bônus
      CFG.bonus = {
        flagAtt:    parseInt(ov.querySelector('#cfg-flag-att').value) || 0,
        flagDef:    parseInt(ov.querySelector('#cfg-flag-def').value) || 0,
        knightAtt:  parseInt(ov.querySelector('#cfg-knight-att').value) || 0,
        knightDef:  parseInt(ov.querySelector('#cfg-knight-def').value) || 0,
        nightBonus: ov.querySelector('#cfg-night').checked,
        moral:      parseInt(ov.querySelector('#cfg-moral').value) || 100,
        luck:       parseInt(ov.querySelector('#cfg-luck').value) || 0,
        church:     ov.querySelector('#cfg-church').checked,
        churchAtt:  parseInt(ov.querySelector('#cfg-church-att').value) || 100,
        churchDef:  parseInt(ov.querySelector('#cfg-church-def').value) || 100,
        effects:    bonus.effects || [],
      };

      // Servidor
      CFG.serverURL      = ov.querySelector('#cfg-server-url')?.value || CFG.serverURL;
      CFG.authToken      = ov.querySelector('#cfg-server-token')?.value || CFG.authToken;
      CFG.serverEnabled  = ov.querySelector('#cfg-server-enabled')?.checked ?? CFG.serverEnabled;
      CFG.discordWebhook = ov.querySelector('#cfg-discord-url')?.value || '';
      CFG.discordEnabled = ov.querySelector('#cfg-discord-enabled')?.checked ?? false;
      CFG.debug          = ov.querySelector('#cfg-debug')?.checked ?? false;

      // Migra para manter compatibilidade
      CFG.nightBonus = CFG.bonus.nightBonus;

      saveConfig(CFG);
      ov.remove();
      setStatus('✅ Configurações salvas!');
      // Limpa cache do minimapa para refletir mudanças
      _mapBgCache = null;
      // Re-aplica botões
      document.querySelectorAll('[data-cd-buttons]').forEach(el=>delete el.dataset.cdButtons);
      applyRenameToTable();
    };
  }

  // ══════════════════════════════════════════════════
  // BOTÃO LATERAL
  // ══════════════════════════════════════════════════
  function addSideBtn() {
    if (document.getElementById('tw-cd-sidebtn')) return;
    const btn = document.createElement('div');
    btn.id = 'tw-cd-sidebtn'; btn.className = 'quest'; btn.title = 'Central de Defesa TW';
    btn.innerHTML = `CD<span class="cd-nbadge"></span>`;
    btn.onclick = () => {
      if (!panelReady) buildPanel();
      if (collapsed) { collapsed=false; panelEl.querySelector('#tw-cd-body').style.display=''; panelEl.querySelector('#tw-cd-collapse').textContent='▾'; GM_setValue('tw_cd2_collapsed_'+WORLD,false); }
      panelEl?.scrollIntoView({behavior:'smooth',block:'start'});
    };
    (document.querySelector('#questlog_new')||document.querySelector('#menu_row2')||document.body).appendChild(btn);
    setInterval(()=>{ const now=Date.now(), n=allAttacks.filter(a=>a.is_noble&&a.arrival_at>now).length, b=btn.querySelector('.cd-nbadge'); if(!b)return; b.textContent=n>99?'99+':String(n); b.classList.toggle('show',n>0); }, 5000);
  }

  // ══════════════════════════════════════════════════
  // MUTATION OBSERVER — detecta mudanças na tabela em tempo real
  // ══════════════════════════════════════════════════
  let _observerTimer = null;
  function setupTableObserver() {
    const table = document.querySelector('#incomings_table');
    if (!table) return;

    const observer = new MutationObserver(() => {
      // Debounce: espera 500ms após última mudança
      clearTimeout(_observerTimer);
      _observerTimer = setTimeout(() => {
        log('🔄 Tabela modificada, re-sincronizando...');
        applyRenameToTable();
        mainSync(true);
      }, 500);
    });

    observer.observe(table, {
      childList: true,
      subtree: true,
      characterData: true,
    });
    log('✅ MutationObserver ativo na tabela de ataques');
  }

  // ══════════════════════════════════════════════════
  // SYNC
  // ══════════════════════════════════════════════════
  let syncing = false;
  async function mainSync(force=false) {
    if (syncing&&!force) return;
    syncing=true;
    try {
      setStatus('🔄 sincronizando...');
      const local  = collectDOM();
      const remote = await fetchServerAttacks();
      const merged = new Map();
      remote.forEach(a=>{ if(a.command_id) merged.set(a.command_id,a); });
      local .forEach(a=>{ if(a.command_id) merged.set(a.command_id,a); });
      // Remove ataques já passados
      const now = Date.now();
      allAttacks = Array.from(merged.values()).filter(a => (a.arrival_at || 0) > now);
      queueUpload(local);
      notifyDiscord(allAttacks);
      allAttacks.filter(a => a.is_noble && a.arrival_at > now && (a.arrival_at - now) < 1800000).forEach(a => {
        if (!_soundAlerted.has(a.command_id)) { _soundAlerted.add(a.command_id); playNobleAlert(); }
      });
      renderAttacks();
      setStatus(`✅ ${allAttacks.length} ataques | ${new Date().toLocaleTimeString('pt-BR')}`);
    } catch(e) { log('mainSync',e); setStatus('❌ Erro na sincronização',true); }
    syncing=false;
  }

  async function bgSync() {
    try {
      const base = new URL(location.href);
      base.searchParams.set('screen','overview_villages'); base.searchParams.set('mode','incomings');
      const all=[], maxP={val:0}, emptyS={val:0};
      for (let p=0;p<50;p++) {
        if(p>maxP.val&&p>0)break;
        base.searchParams.set('page',String(p));
        const res = await rateFetch(base.toString(),{credentials:'same-origin'});
        if(!res.ok)break;
        const html=await res.text(), doc=new DOMParser().parseFromString(html,'text/html');
        if(p===0) doc.querySelectorAll('a[href*="page="]').forEach(a=>{const m=a.href.match(/[?&]page=(\d+)/);if(m)maxP.val=Math.max(maxP.val,+m[1]);});
        if(!doc.querySelector('#incomings_table')){if(++emptyS.val>=2)break;continue;}
        const atks=collectDOM(doc);
        if(!atks.length){if(p>0&&++emptyS.val>=2)break;}
        else{emptyS.val=0;all.push(...atks);}
        await new Promise(r=>setTimeout(r,120));
      }
      if(all.length>0){
        const m=new Map(allAttacks.map(a=>[a.command_id,a]));
        all.forEach(a=>{if(a.command_id)m.set(a.command_id,a);});
        allAttacks=Array.from(m.values()).filter(a => (a.arrival_at || 0) > Date.now());
        queueUpload(all); notifyDiscord(allAttacks); renderAttacks();
        setStatus(`✅ ${allAttacks.length} ataques (todas as páginas) | ${new Date().toLocaleTimeString('pt-BR')}`);
      }
    } catch(e){log('bgSync',e);}
  }

  // ══════════════════════════════════════════════════
  // INIT
  // ══════════════════════════════════════════════════
  async function init() {
    log(`Central de Defesa TW v${VERSION} — ${WORLD}`);
    const screen = new URLSearchParams(location.search).get('screen') || '';
    const mode   = new URLSearchParams(location.search).get('mode')   || '';

    loadRemoteConfig().catch(()=>{});

    const player = getPlayer();
    const autorizado = await checkAuthorization(player);
    if (!autorizado) return;

    loadWorld().catch(()=>{});
    addSideBtn();

    if (screen === 'overview_villages' && mode === 'incomings') {
      buildPanel();
      // Aplica botões de renomear imediatamente
      applyRenameToTable();
      // Setup MutationObserver para tempo real
      setupTableObserver();

      setTimeout(() => mainSync(), 800);
      setInterval(() => mainSync(), 15000);
      setInterval(tickCountdowns, 1000);
      setTimeout(() => { bgSync(); setInterval(bgSync, 3*60000); }, 20000);
      // Re-aplica botões periodicamente (caso o jogo recarregue a tabela via AJAX)
      setInterval(() => applyRenameToTable(), 2000);
    }

    if (screen === 'overview') {
      setTimeout(() => buildDefWidget(document.querySelector('.vis')), 1500);
      setInterval(() => {
        document.querySelectorAll('#commands_incomings .command-row').forEach(row => {
          if (row.dataset.snipeBtn) return;
          row.dataset.snipeBtn = '1';
          const td = row.querySelector('td:last-child'); if (!td) return;
          const btn = document.createElement('button');
          btn.textContent='🎯'; btn.title='Snipe Finder';
          btn.style.cssText='margin-left:4px;background:transparent;border:none;cursor:pointer;font-size:14px;padding:0';
          btn.onclick = () => {
            const coord = (row.textContent||'').match(/(\d{3})\|(\d{3})/)?.[0] || '';
            const time  = (row.textContent||'').match(/\d{1,2}:\d{2}:\d{2}/)?.[0] || '';
            openSnipeFinder(coord, time);
          };
          td.appendChild(btn);
        });
      }, 600);
    }

    if (screen === 'place' && mode === 'sim') {
      setTimeout(() => fillSimulatorFromSession(), 800);
    }

    if (screen === 'info_village') {
      setInterval(()=>{
        document.querySelectorAll('#commands_incomings .command-row, #commands_outgoings .command-row').forEach(row => {
          if (row.dataset.snipeBtn) return;
          row.dataset.snipeBtn = '1';
          const td = row.querySelector('td:last-child'); if(!td)return;
          const btn = document.createElement('button');
          btn.textContent='🎯'; btn.title='Snipe Finder';
          btn.style.cssText='margin-left:4px;background:transparent;border:none;cursor:pointer;font-size:14px;padding:0';
          btn.onclick = ()=>{
            const coord = (row.textContent||'').match(/(\d{3})\|(\d{3})/)?.[0] || '';
            const time  = (row.textContent||'').match(/\d{1,2}:\d{2}:\d{2}/)?.[0] || '';
            openSnipeFinder(coord, time);
          };
          td.appendChild(btn);
        });
      },600);
    }

    document.addEventListener('click', e => {
      if (!e.target.classList.contains('cd-snipe-row')) return;
      const tr = e.target.closest('tr[data-arrival]');
      if (!tr) return;
      const arrival = parseInt(tr.dataset.arrival);
      const coord   = (tr.textContent||'').match(/(\d{3})\|(\d{3})/)?.[0] || '';
      if (coord && arrival) openSnipeFinder(coord, new Date(arrival).toLocaleTimeString('pt-BR'));
    });

    setTimeout(()=>sendHeartbeat(),5000);
    setInterval(()=>sendHeartbeat(),90000);
    setInterval(()=>fetchOnline(),90000);

    const first = GM_getValue('tw_cd2_first_'+WORLD, true);
    if (first && !CFG.serverURL && !CFG.discordWebhook) {
      GM_setValue('tw_cd2_first_'+WORLD, false);
      setTimeout(()=>openConfig(), 2000);
    }
  }

  if (document.readyState==='loading') document.addEventListener('DOMContentLoaded',init);
  else init();

})();
