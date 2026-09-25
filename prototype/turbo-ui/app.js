(() => {
  'use strict';
  const views = [...document.querySelectorAll('.view')];
  const shell = document.querySelector('.app-shell');
  const menuButtons = [...document.querySelectorAll('.menu-item')];
  const viewButtons = [...document.querySelectorAll('[data-view-target]')];
  const oppRows = [...document.querySelectorAll('.radar-row')];
  const gateResult = document.getElementById('gate-result');
  let current = 'command';

  const fixtureOpps = {
    'OPP-117': {title:'Authorized browser program',source:'fixture://authorized-program',fresh:'8m',policy:'96%',score:'74/100',digest:'sha256:9f3b…0c18',verdict:'HUMAN_AUTHORIZE',className:'human'},
    'OPP-104': {title:'Public program feed',source:'fixture://public-feed',fresh:'12m',policy:'68%',score:'57/100',digest:'sha256:821d…aa40',verdict:'WATCH',className:'watch'},
    'OPP-121': {title:'Scope drift fixture',source:'fixture://scope-drift',fresh:'31m',policy:'100%',score:'12/100',digest:'sha256:19ce…0f91',verdict:'SKIP',className:'skip'},
    'OPP-126': {title:'Needs policy research',source:'fixture://policy-gap',fresh:'41m',policy:'42%',score:'N/D',digest:'sha256:6dd8…2d04',verdict:'RESEARCH',className:'research'}
  };

  function showView(name, focus=true){
    const target = document.querySelector(`[data-view-name="${name}"]`);
    if(!target) return;
    current = name;
    shell.dataset.view = name;
    views.forEach(v => v.classList.toggle('is-active', v === target));
    menuButtons.forEach(b => b.setAttribute('aria-current', b.dataset.menu === name ? 'page' : 'false'));
    if(focus){
      const heading = target.querySelector('h1,h2,[id$="-title"]') || target;
      heading.setAttribute('tabindex','-1');
      heading.focus({preventScroll:true});
    }
  }

  viewButtons.forEach(b => b.addEventListener('click', () => showView(b.dataset.viewTarget)));
  menuButtons.forEach(b => b.addEventListener('click', () => {
    const map = {file:'command',radar:'radar',decide:'radar',verify:'evidence',evidence:'evidence',gates:'gates',memory:'memory',skills:'skills',system:'system',help:'help'};
    showView(map[b.dataset.menu] || 'command');
  }));

  oppRows.forEach(row => row.addEventListener('click', () => {
    oppRows.forEach(r => { r.classList.remove('is-selected'); r.setAttribute('aria-selected','false'); });
    row.classList.add('is-selected'); row.setAttribute('aria-selected','true');
    const d = fixtureOpps[row.dataset.opp];
    document.getElementById('opp-label').textContent = row.dataset.opp;
    document.getElementById('opp-title').textContent = d.title;
    document.getElementById('opp-source').textContent = d.source;
    document.getElementById('opp-fresh').textContent = d.fresh;
    document.getElementById('opp-policy').textContent = d.policy;
    document.getElementById('opp-score').textContent = d.score;
    document.getElementById('opp-digest').textContent = d.digest;
    const verdict = document.getElementById('opp-verdict');
    verdict.textContent = d.verdict;
    verdict.className = `verdict ${d.className}`;
  }));

  function previewDecision(kind){
    gateResult.textContent = `${kind} preview only — no runtime, gate bus, or external state changed.`;
    gateResult.classList.remove('preview-flash');
    void gateResult.offsetWidth;
    gateResult.classList.add('preview-flash');
  }
  document.getElementById('approve-preview').addEventListener('click',()=>previewDecision('APPROVE'));
  document.getElementById('deny-preview').addEventListener('click',()=>previewDecision('DENY'));

  document.addEventListener('keydown', e => {
    const map = {F1:'help',F2:'radar',F3:'radar',F4:'gates',F6:'evidence',F7:'memory',F8:'evidence',F9:'system'};
    if(map[e.key]){ e.preventDefault(); showView(map[e.key]); return; }
    if(e.key==='F10'){ e.preventDefault(); const visible = menuButtons.find(b=>b.offsetParent!==null); if(visible) visible.focus(); return; }
    if(e.key==='Escape'){ e.preventDefault(); showView('command'); return; }
    if(e.key==='F5'){ e.preventDefault(); document.body.classList.remove('preview-flash'); void document.body.offsetWidth; document.body.classList.add('preview-flash'); }
  });

  const clock = document.getElementById('clock');
  function tick(){ const d=new Date(); clock.textContent=d.toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'}); }
  tick();
  setInterval(tick,30000);
  showView('command', false);
})();