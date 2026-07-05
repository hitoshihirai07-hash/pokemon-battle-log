const app = document.querySelector('#app');
const loginLayer = document.querySelector('#login-layer');
const loginForm = document.querySelector('#login-form');
const loginError = document.querySelector('#login-error');
const pinInput = document.querySelector('#pin-input');
const seasonSelect = document.querySelector('#season-select');
const toast = document.querySelector('#toast');

const state = {
  view: 'record',
  pin: sessionStorage.getItem('pokemon-battle-log-pin') || '',
  data: null,
  teams: [],
  records: [],
  season: localStorage.getItem('pokemon-battle-log-season') || 'S3',
  draft: null,
  editingId: null,
  teamDraft: null,
  toastTimer: null,
};

seasonSelect.value = state.season;

const RESULT_LABEL = { win: '勝ち', lose: '負け', draw: '引き分け', other: 'その他' };
const RESULT_CLASS = { win: 'good', lose: 'bad', draw: 'warn', other: 'warn' };
const SPEED_LABEL = { selfFirst: '自分が先行', opponentFirst: '相手が先行', unclear: '判定不可' };
const SIDE_LABEL = { selfToOpponent: '自分 → 相手', opponentToSelf: '相手 → 自分' };

function e(value) {
  return String(value ?? '').replace(/[&<>'"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;' }[char]));
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function unique(values) { return [...new Set(values.filter(Boolean))]; }
function todayJapan() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo' }).format(new Date()); }
function dateText(value) {
  if (!value) return '日付未入力';
  const [y, m, d] = value.split('-');
  return `${Number(y)}年${Number(m)}月${Number(d)}日`;
}
function percent(a, b) { return b ? `${(a / b * 100).toFixed(1)}%` : '—'; }
function mapTotal(map) { return [...map.values()].reduce((sum, n) => sum + n, 0); }
function sortedCounter(map) { return [...map.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'ja')); }
function counterText(map, fallback = '—') {
  const entries = sortedCounter(map);
  return entries.length ? entries.map(([name, count]) => `${name} ${count}`).join('／') : fallback;
}
function notify(message) {
  toast.textContent = message;
  toast.classList.add('is-visible');
  clearTimeout(state.toastTimer);
  state.toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2800);
}
function setLogin(open) {
  loginLayer.classList.toggle('is-open', open);
  loginLayer.setAttribute('aria-hidden', String(!open));
  if (open) setTimeout(() => pinInput.focus(), 60);
}
function apiHeaders(extra = {}) {
  return { 'content-type': 'application/json', 'x-app-pin': state.pin, ...extra };
}
async function checkSetup() {
  let response;
  try {
    response = await fetch('/api/health', { cache: 'no-store' });
  } catch {
    throw new Error('Cloudflare Functionsへ接続できませんでした。Pagesのルートディレクトリは空欄、ビルド出力ディレクトリは public にして、最新のmainを再デプロイしてください。');
  }
  let payload;
  try { payload = await response.json(); } catch { payload = { ok: false }; }
  if (response.status === 404) {
    throw new Error('Cloudflare Functionsが公開されていません。Pagesのルートディレクトリを public にせず空欄にし、ビルド出力ディレクトリだけを public にして再デプロイしてください。');
  }
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error || 'Cloudflareの保存設定を確認できませんでした。');
  }
}

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: apiHeaders(options.headers || {}) });
  let payload;
  try { payload = await response.json(); } catch { payload = { ok: false, error: 'サーバーの応答を読み取れませんでした。' }; }
  if (response.status === 401) {
    sessionStorage.removeItem('pokemon-battle-log-pin');
    state.pin = '';
    setLogin(true);
  }
  if (!response.ok || !payload.ok) throw new Error(payload.error || '処理に失敗しました。');
  return payload;
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') { cell += '"'; i += 1; }
      else if (char === '"') quoted = false;
      else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') { row.push(cell); cell = ''; }
    else if (char === '\n') { row.push(cell.replace(/\r$/, '')); rows.push(row); row = []; cell = ''; }
    else cell += char;
  }
  if (cell.length || row.length) { row.push(cell.replace(/\r$/, '')); rows.push(row); }
  const [header = [], ...body] = rows;
  if (header.length) header[0] = header[0].replace(/^\uFEFF/, '');
  return body.filter(values => values.some(v => v !== '')).map(values => Object.fromEntries(header.map((key, index) => [key, values[index] ?? ''])));
}

async function loadData() {
  const files = ['pokemon.csv', 'pokemon_moves.csv', 'tool.csv', 'characteristics.csv', 'mega.csv'];
  const results = await Promise.all(files.map(file => fetch(`./data/${file}`).then(async res => {
    if (!res.ok) throw new Error(`${file}を読み込めませんでした。`);
    return parseCSV(await res.text());
  })));
  const [pokemon, moves, tools, characteristics, mega] = results;
  const megaNames = new Set(mega.map(row => row['ポケモン名']));
  const basePokemon = pokemon.filter(row => !megaNames.has(row['名前']));
  const byName = new Map(pokemon.map(row => [row['名前'], row]));
  const baseByName = new Map(basePokemon.map(row => [row['名前'], row]));
  const movesByName = new Map();
  for (const row of moves) {
    const name = row['ポケモン名'];
    if (!movesByName.has(name)) movesByName.set(name, []);
    movesByName.get(name).push(row);
  }
  for (const [name, rows] of movesByName.entries()) {
    const seen = new Set();
    movesByName.set(name, rows.filter(row => {
      const move = row['技名前'];
      if (seen.has(move)) return false;
      seen.add(move);
      return true;
    }));
  }
  const megaByBase = new Map();
  for (const row of mega) {
    const base = row['元ポケモン名'];
    if (!megaByBase.has(base)) megaByBase.set(base, []);
    megaByBase.get(base).push(row['ポケモン名']);
  }
  state.data = {
    pokemon, basePokemon, byName, baseByName, movesByName, megaByBase,
    tools: unique(tools.map(row => row['名前'])).sort((a, b) => a.localeCompare(b, 'ja')),
    abilityByName: new Map(characteristics.map(row => [row['特性'], row['効果'] || ''])),
  };
}
function activePokemon() {
  if (!state.data) return [];
  if (state.season === 'all') return state.data.basePokemon;
  return state.data.basePokemon.filter(row => row[state.season] === 'TRUE');
}
function getBasePokemon(name) { return state.data?.baseByName.get(name) || null; }
function getPokemon(name) { return state.data?.byName.get(name) || null; }
function getMegaNames(baseName) { return state.data?.megaByBase.get(baseName) || []; }
function getShownPokemon(baseName, megaName) { return megaName ? getPokemon(megaName) || getBasePokemon(baseName) : getBasePokemon(baseName); }
function abilitiesOf(pokemon) { return unique([pokemon?.['とくせい1'], pokemon?.['とくせい2'], pokemon?.['かくれとくせい']]); }
function typeText(pokemon) { return [pokemon?.['タイプ1'], pokemon?.['タイプ2']].filter(Boolean).join('／') || '—'; }
function pokemonMeta(baseName, megaName = '') {
  const base = getBasePokemon(baseName);
  const shown = getShownPokemon(baseName, megaName);
  if (!base || !shown) return '';
  const formText = megaName ? `<strong>${e(megaName)}</strong>　` : '';
  const statText = `タイプ ${e(typeText(shown))}　S種族値 ${e(shown['素早'])}`;
  return `${formText}${statText}`;
}
function pokemonOptionHTML(selected = '') {
  const rows = activePokemon().slice().sort((a, b) => a['名前'].localeCompare(b['名前'], 'ja'));
  return `<datalist id="pokemon-options">${rows.map(row => `<option value="${e(row['名前'])}"></option>`).join('')}</datalist>`;
}
function toolOptionHTML() {
  return `<datalist id="tool-options">${state.data.tools.map(name => `<option value="${e(name)}"></option>`).join('')}</datalist>`;
}
function selectOptions(values, selected, placeholder = '選択してください') {
  return `<option value="">${e(placeholder)}</option>${values.map(value => `<option value="${e(value)}"${value === selected ? ' selected' : ''}>${e(value)}</option>`).join('')}`;
}
function speedOptions(names, selected) { return selectOptions(names, selected, '選択'); }
function movesFor(baseName) { return state.data?.movesByName.get(baseName) || []; }
function movesOptionHTML(id, baseName) {
  const moves = movesFor(baseName);
  return `<datalist id="${e(id)}">${moves.map(row => `<option value="${e(row['技名前'])}"></option>`).join('')}</datalist>`;
}
function teamById(id) { return state.teams.find(team => team.id === id) || null; }
function makeFreshRecord(teamId = state.teams[0]?.id || '') {
  return {
    battleDate: todayJapan(), result: 'win', teamId,
    selfPokemon: [],
    opponentPokemon: Array.from({ length: 6 }, () => ({ baseName: '', selected: false, megaName: '', moves: ['', '', '', ''], item: '', ability: '', note: '' })),
    speed: [], damage: [], note: '', otherNote: ''
  };
}
function ensureDraft() { if (!state.draft) state.draft = makeFreshRecord(); }
function ensureTeamDraft() { if (!state.teamDraft) state.teamDraft = { id: null, name: '', pokemon: Array(6).fill('') }; }

async function verifyPin(pin) {
  const response = await fetch('/api/auth', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ pin })
  });
  let payload;
  try { payload = await response.json(); } catch { payload = { ok: false, error: 'サーバーの応答を読み取れませんでした。' }; }
  if (!response.ok || !payload.ok) throw new Error(payload.error || 'PINを確認できませんでした。');
}
async function loadRemote() {
  const [teams, records] = await Promise.all([api('/api/teams'), api('/api/records')]);
  state.teams = teams.teams;
  state.records = records.records;
  if (!state.draft) state.draft = makeFreshRecord();
}

function render() {
  if (!state.data) return;
  document.querySelectorAll('.nav-button').forEach(button => button.classList.toggle('is-active', button.dataset.view === state.view));
  if (state.view === 'record') app.innerHTML = renderRecordView();
  if (state.view === 'history') app.innerHTML = renderHistoryView();
  if (state.view === 'analysis') app.innerHTML = renderAnalysisView();
  if (state.view === 'teams') app.innerHTML = renderTeamsView();
}

function renderRecordView() {
  ensureDraft();
  const draft = state.draft;
  const team = teamById(draft.teamId);
  const selectedOpponent = draft.opponentPokemon.filter(p => p.selected);
  const knownInfo = draft.opponentPokemon.reduce((sum, p) => sum + p.moves.filter(Boolean).length + (p.item ? 1 : 0) + (p.ability ? 1 : 0), 0);
  return `
    ${pokemonOptionHTML()}${toolOptionHTML()}
    <section class="page-head">
      <div><h2>${state.editingId ? '対戦記録を編集' : '対戦を記録'}</h2><p>相手の情報は、見えたものだけで大丈夫です。全ターンを残す画面にはしていません。</p></div>
      ${state.editingId ? `<button class="quiet-button" type="button" data-action="cancel-edit-record">編集をやめる</button>` : ''}
    </section>
    <div class="record-layout">
      <section class="card form-card">
        <div class="section-block">
          <div class="field-grid three">
            <label>対戦日<input type="date" value="${e(draft.battleDate)}" data-record-date></label>
            <label>自分の構築<select data-record-team>${teamSelectOptions(draft.teamId)}</select></label>
            <div><span class="help-text">選択中</span><p class="muted">${team ? `${e(team.name)}（${team.pokemon.length}匹）` : '構築を選んでください'}</p></div>
          </div>
          <div class="section-label" style="margin-top:16px"><h3>結果</h3><p>後で勝率として集計できます。</p></div>
          <div class="result-pills">
            ${Object.entries(RESULT_LABEL).map(([value, label]) => `<label class="result-pill"><input type="radio" name="record-result" value="${value}" data-record-result ${draft.result === value ? 'checked' : ''}>${label}</label>`).join('')}
          </div>
        </div>
        ${team ? renderRecordBody(team) : renderNoTeamNotice()}
      </section>
      <aside class="card side-card">
        <h3>この試合の記録</h3>
        <div class="stats-list">
          <div class="stat-line"><span>自分の選出</span><strong>${draft.selfPokemon.length} / 3</strong></div>
          <div class="stat-line"><span>相手の選出</span><strong>${selectedOpponent.length} / 3</strong></div>
          <div class="stat-line"><span>判明情報</span><strong>${knownInfo}件</strong></div>
          <div class="stat-line"><span>素早さ対面</span><strong>${draft.speed.length}件</strong></div>
          <div class="stat-line"><span>ダメージ記録</span><strong>${draft.damage.length}件</strong></div>
        </div>
        <div class="section-block"><p class="help-text">相手の集計は、メガ進化後では分けず、元ポケモン名へ統合します。メガ先・持ち物・特性・技は詳細内訳として残ります。</p></div>
      </aside>
    </div>`;
}
function renderNoTeamNotice() {
  return `<div class="section-block"><div class="notice">先に「自分の構築」で6匹を登録してください。登録した構築から、その試合で選出した3匹だけを選べます。</div><div class="button-row" style="margin-top:12px"><button class="secondary-button" type="button" data-view="teams">自分の構築を登録する</button></div></div>`;
}
function renderRecordBody(team) {
  const draft = state.draft;
  return `
    <div class="section-block">
      <div class="section-label"><h3>自分の選出 3匹</h3><p>構築から選択</p></div>
      <div class="choice-grid">${team.pokemon.map(name => {
        const selected = draft.selfPokemon.includes(name);
        const pokemon = getBasePokemon(name);
        return `<label class="choice-card ${selected ? 'is-selected' : ''}"><input type="checkbox" value="${e(name)}" data-self-selected ${selected ? 'checked' : ''}><span>${e(name)}<small>${pokemon ? `タイプ ${e(typeText(pokemon))}／S ${e(pokemon['素早'])}` : 'データ外'}</small></span></label>`;
      }).join('')}</div>
    </div>
    <div class="section-block">
      <div class="section-label"><h3>相手の6匹と判明情報</h3><p>選出・技・持ち物・特性は見えた範囲だけ。</p></div>
      <div class="opponent-list">${draft.opponentPokemon.map((opponent, index) => renderOpponentCard(opponent, index)).join('')}</div>
    </div>
    <div class="section-block">
      <div class="section-label"><h3>素早さの対面</h3><p>通常条件かどうかも残せます。</p></div>
      <div class="dynamic-list">${draft.speed.map((row, index) => renderSpeedRow(row, index)).join('')}</div>
      <div class="button-row" style="margin-top:10px"><button class="secondary-button" type="button" data-action="add-speed">素早さ対面を追加</button></div>
    </div>
    <div class="section-block">
      <div class="section-label"><h3>ダメージ記録</h3><p>計算結果・実戦で確認した％や実数を残せます。</p></div>
      <div class="dynamic-list">${draft.damage.map((row, index) => renderDamageRow(row, index)).join('')}</div>
      <div class="button-row" style="margin-top:10px"><button class="secondary-button" type="button" data-action="add-damage">ダメージ記録を追加</button></div>
    </div>
    <div class="section-block">
      <div class="field-grid">
        <label>試合メモ<textarea data-record-note placeholder="勝敗を分けた場面、警戒したいことなど">${e(draft.note)}</textarea></label>
        <label>その他<textarea data-record-other placeholder="ランク帯、ルール、構築全体についてなど">${e(draft.otherNote)}</textarea></label>
      </div>
    </div>
    <div class="submit-row">
      <p class="help-text">保存後はPC・スマホで同じ履歴と集計を見られます。</p>
      <button class="primary-button" type="button" data-action="save-record">${state.editingId ? '変更を保存' : '対戦記録を保存'}</button>
    </div>`;
}
function renderOpponentCard(opponent, index) {
  const base = getBasePokemon(opponent.baseName);
  const megaNames = base ? getMegaNames(opponent.baseName) : [];
  const shown = base ? getShownPokemon(opponent.baseName, opponent.megaName) : null;
  const abilityList = abilitiesOf(shown);
  const selected = Boolean(opponent.selected);
  const moveListId = `move-options-${index}`;
  const moves = [...opponent.moves, '', '', '', ''].slice(0, 4);
  const maybeClearMega = megaNames.includes(opponent.megaName) ? opponent.megaName : '';
  return `<article class="opponent-card ${selected ? 'is-selected' : ''}">
    <div class="opponent-top">
      <span class="slot-number">${index + 1}</span>
      <input type="text" list="pokemon-options" value="${e(opponent.baseName)}" placeholder="相手ポケモン" data-opponent-name="${index}">
      <label class="select-mark" title="相手が選出した場合にチェック"><input type="checkbox" data-op-selected="${index}" ${selected ? 'checked' : ''}>選出</label>
    </div>
    ${base ? `
      <div class="pokemon-meta">${pokemonMeta(opponent.baseName, maybeClearMega)}</div>
      ${megaNames.length ? `<label>メガ進化<select data-op-mega="${index}">${selectOptions(megaNames, maybeClearMega, 'メガ進化なし')}</select></label>` : ''}
      <div class="mini-fields" style="margin-top:8px">
        <label>判明特性<select data-op-ability="${index}">${selectOptions(abilityList, opponent.ability, '未確認')}</select></label>
        <label>判明持ち物<input type="text" list="tool-options" value="${e(opponent.item)}" placeholder="未確認" data-op-item="${index}"></label>
        ${opponent.ability ? `<p class="ability-effect">${e(state.data.abilityByName.get(opponent.ability) || '効果データは未登録です。')}</p>` : ''}
      </div>
      ${movesOptionHTML(moveListId, opponent.baseName)}
      <div class="moves-grid">
        ${moves.map((move, moveIndex) => `<input type="text" list="${moveListId}" value="${e(move)}" placeholder="判明技 ${moveIndex + 1}" data-op-move="${index}" data-move-index="${moveIndex}">`).join('')}
      </div>
      ${movesFor(opponent.baseName).length ? '' : '<p class="help-text">このポケモンは技候補データ未登録です。技名を自由に入力できます。</p>'}
      <label style="margin-top:8px">補足<input type="text" value="${e(opponent.note)}" placeholder="型・行動など" data-op-note="${index}"></label>
    ` : opponent.baseName ? '<p class="form-error">候補にある元ポケモン名を選んでください。</p>' : '<p class="help-text">選ぶと、対応する技・特性・メガ進化先だけが候補になります。</p>'}
  </article>`;
}
function renderSpeedRow(row, index) {
  const selfNames = state.draft.selfPokemon;
  const opponentNames = state.draft.opponentPokemon.filter(p => p.selected).map(p => p.baseName);
  return `<div class="dynamic-row">
    <label>自分<select data-speed-field="selfName" data-speed-index="${index}">${speedOptions(selfNames, row.selfName)}</select></label>
    <label>相手<select data-speed-field="opponentName" data-speed-index="${index}">${speedOptions(opponentNames, row.opponentName)}</select></label>
    <label>行動順<select data-speed-field="result" data-speed-index="${index}">${selectOptions(Object.values(SPEED_LABEL), SPEED_LABEL[row.result] || '', '選択')}</select></label>
    <label>条件<select data-speed-field="condition" data-speed-index="${index}">${selectOptions(['通常', '優先技', '追い風', 'トリックルーム', '麻痺など', 'その他'], row.condition, '条件を選択')}</select></label>
    <label>補足<input type="text" value="${e(row.note)}" data-speed-field="note" data-speed-index="${index}" placeholder="任意"></label>
    <div class="remove-wrap"><button class="danger-button" type="button" data-action="remove-speed" data-index="${index}">削除</button></div>
  </div>`;
}
function renderDamageRow(row, index) {
  const draft = state.draft;
  const selectedOpponent = draft.opponentPokemon.filter(p => p.selected).map(p => p.baseName);
  const selfNames = draft.selfPokemon;
  const attackerNames = row.side === 'opponentToSelf' ? selectedOpponent : selfNames;
  const defenderNames = row.side === 'opponentToSelf' ? selfNames : selectedOpponent;
  const selectedAttacker = row.attacker;
  const attackerBase = getBasePokemon(selectedAttacker);
  const moveListId = `damage-move-options-${index}`;
  return `<div class="dynamic-row damage-row">
    <label>向き<select data-damage-field="side" data-damage-index="${index}">${selectOptions(Object.values(SIDE_LABEL), SIDE_LABEL[row.side] || '', '選択')}</select></label>
    <label>攻撃側<select data-damage-field="attacker" data-damage-index="${index}">${speedOptions(attackerNames, row.attacker)}</select></label>
    <label>防御側<select data-damage-field="defender" data-damage-index="${index}">${speedOptions(defenderNames, row.defender)}</select></label>
    ${attackerBase ? movesOptionHTML(moveListId, selectedAttacker) : ''}
    <label>技<input type="text" ${attackerBase ? `list="${moveListId}"` : ''} value="${e(row.move)}" data-damage-field="move" data-damage-index="${index}" placeholder="技名"></label>
    <label>ダメージ％<input type="number" min="0" max="1000" step="0.1" value="${e(row.percent)}" data-damage-field="percent" data-damage-index="${index}" placeholder="例 42"></label>
    <label>実数<input type="number" min="0" step="1" value="${e(row.amount)}" data-damage-field="amount" data-damage-index="${index}" placeholder="任意"></label>
    <label>補足<input type="text" value="${e(row.note)}" data-damage-field="note" data-damage-index="${index}" placeholder="乱数・状態など"></label>
    <div class="remove-wrap"><button class="danger-button" type="button" data-action="remove-damage" data-index="${index}">削除</button></div>
  </div>`;
}

function renderHistoryView() {
  const records = state.records;
  return `<section class="page-head"><div><h2>対戦履歴</h2><p>選出、判明した技・特性・持ち物、素早さ対面、ダメージメモを試合ごとに見返せます。</p></div><button class="secondary-button" type="button" data-view="record">新しい対戦を記録</button></section>
    ${records.length ? `<section class="history-list">${records.map(renderHistoryCard).join('')}</section>` : `<div class="empty-state">まだ対戦記録がありません。<br>最初の1試合を残すと、相手の構築入り回数と選出回数が集計されます。</div>`}`;
}
function renderHistoryCard(record) {
  const opponentSelected = record.opponentPokemon.filter(p => p.selected).map(p => p.baseName).join('・') || '未記録';
  const team = teamById(record.teamId);
  return `<article class="card history-card">
    <div class="history-card-top"><div><h3>${e(dateText(record.battleDate))} <span class="tag ${RESULT_CLASS[record.result] || 'warn'}">${e(RESULT_LABEL[record.result] || 'その他')}</span></h3><p>自分：${e(record.selfPokemon.join('・') || '未記録')}　／　相手選出：${e(opponentSelected)}</p></div><p>${e(team?.name || '構築名なし')}</p></div>
    <div class="history-tags">${record.opponentPokemon.map(p => `<span class="tag ${p.selected ? 'warn' : ''}">${e(p.baseName)}${p.megaName ? `（${e(p.megaName)}）` : ''}${p.selected ? '・選出' : ''}</span>`).join('')}</div>
    <details><summary>この試合の詳細を見る</summary>${renderRecordDetail(record)}</details>
    <div class="history-actions"><button class="mini-button" type="button" data-action="edit-record" data-id="${e(record.id)}">編集</button><button class="danger-button" type="button" data-action="delete-record" data-id="${e(record.id)}">削除</button></div>
  </article>`;
}
function renderRecordDetail(record) {
  const opponent = record.opponentPokemon.map(p => {
    const info = [p.megaName ? `メガ：${p.megaName}` : '', p.ability ? `特性：${p.ability}` : '', p.item ? `持ち物：${p.item}` : '', p.moves?.length ? `技：${p.moves.join('／')}` : '', p.note || ''].filter(Boolean).join('　');
    return `<li><strong>${e(p.baseName)}${p.selected ? '（選出）' : ''}</strong><br>${e(info || '判明情報なし')}</li>`;
  }).join('');
  const speed = record.speed?.length ? `<ul>${record.speed.map(row => `<li>${e(row.selfName)} vs ${e(row.opponentName)}：${e(SPEED_LABEL[row.result] || row.result)}${row.condition ? `（${e(row.condition)}）` : ''}${row.note ? `／${e(row.note)}` : ''}</li>`).join('')}</ul>` : '<p>記録なし</p>';
  const damage = record.damage?.length ? `<ul>${record.damage.map(row => `<li>${e(SIDE_LABEL[row.side] || row.side)}：${e(row.attacker)} → ${e(row.defender)}${row.move ? `／${e(row.move)}` : ''}${row.percent ? `／${e(row.percent)}%` : ''}${row.amount ? `／${e(row.amount)}` : ''}${row.note ? `／${e(row.note)}` : ''}</li>`).join('')}</ul>` : '<p>記録なし</p>';
  return `<div class="detail-grid"><section class="detail-block"><h4>相手の6匹</h4><ul>${opponent}</ul></section><section class="detail-block"><h4>素早さの対面</h4>${speed}</section><section class="detail-block"><h4>ダメージ記録</h4>${damage}</section><section class="detail-block"><h4>メモ</h4><p>${e(record.note || '—').replace(/\n/g, '<br>')}</p></section>${record.otherNote ? `<section class="detail-block full"><h4>その他</h4><p>${e(record.otherNote).replace(/\n/g, '<br>')}</p></section>` : ''}</div>`;
}

function buildOpponentStats() {
  const stats = new Map();
  for (const record of state.records) {
    for (const opponent of record.opponentPokemon || []) {
      const name = opponent.baseName;
      if (!name) continue;
      if (!stats.has(name)) stats.set(name, { name, inSix: 0, selected: 0, items: new Map(), abilities: new Map(), moves: new Map(), megas: new Map(), records: [] });
      const item = stats.get(name);
      item.inSix += 1;
      if (opponent.selected) item.selected += 1;
      if (opponent.item) item.items.set(opponent.item, (item.items.get(opponent.item) || 0) + 1);
      if (opponent.ability) item.abilities.set(opponent.ability, (item.abilities.get(opponent.ability) || 0) + 1);
      if (opponent.megaName) item.megas.set(opponent.megaName, (item.megas.get(opponent.megaName) || 0) + 1);
      for (const move of opponent.moves || []) if (move) item.moves.set(move, (item.moves.get(move) || 0) + 1);
      item.records.push({ date: record.battleDate, result: record.result, selected: opponent.selected });
    }
  }
  return [...stats.values()].sort((a, b) => b.inSix - a.inSix || b.selected - a.selected || a.name.localeCompare(b.name, 'ja'));
}
function renderAnalysisView() {
  const stats = buildOpponentStats();
  const total = state.records.length;
  const wins = state.records.filter(row => row.result === 'win').length;
  const losses = state.records.filter(row => row.result === 'lose').length;
  const selectedTotal = stats.reduce((sum, row) => sum + row.selected, 0);
  return `<section class="page-head"><div><h2>相手ポケモン集計</h2><p>メガ進化後は別ポケモンとして数えず、元ポケモンの構築入り・選出へ統合しています。</p></div><button class="quiet-button" type="button" data-action="refresh">再読み込み</button></section>
    <section class="analysis-summary"><div class="summary-box"><span>対戦数</span><strong>${total}</strong></div><div class="summary-box"><span>勝ち</span><strong>${wins}</strong></div><div class="summary-box"><span>負け</span><strong>${losses}</strong></div><div class="summary-box"><span>相手の選出合計</span><strong>${selectedTotal}</strong></div></section>
    ${stats.length ? `<div class="table-wrap"><table><thead><tr><th>相手ポケモン</th><th>相手の6匹入り</th><th>選出</th><th>選出率</th><th>持ち物判明</th><th>主な持ち物</th><th>確認済み情報</th></tr></thead><tbody>${stats.map(row => renderAnalysisRow(row)).join('')}</tbody></table></div>` : '<div class="empty-state">記録が増えると、ここに相手ポケモンの構築入り回数・選出回数・持ち物内訳が表示されます。</div>'}`;
}
function renderAnalysisRow(row) {
  const itemKnown = mapTotal(row.items);
  const extra = `<details><summary>技・特性・メガ内訳</summary><div class="detail-grid"><section class="detail-block"><h4>技</h4><p>${e(counterText(row.moves))}</p></section><section class="detail-block"><h4>特性</h4><p>${e(counterText(row.abilities))}</p></section><section class="detail-block"><h4>メガ進化</h4><p>${e(counterText(row.megas))}</p></section><section class="detail-block"><h4>対戦結果</h4><p>選出 ${row.selected}回／未選出 ${row.inSix - row.selected}回</p></section></div></details>`;
  return `<tr><td><strong>${e(row.name)}</strong>${extra}</td><td class="number">${row.inSix}</td><td class="number">${row.selected}</td><td class="number">${percent(row.selected, row.inSix)}</td><td class="number">${itemKnown}${row.selected ? ` / ${row.selected}` : ''}</td><td>${e(counterText(row.items))}</td><td>技 ${mapTotal(row.moves)}件<br>特性 ${mapTotal(row.abilities)}件</td></tr>`;
}

function renderTeamsView() {
  ensureTeamDraft();
  const draft = state.teamDraft;
  return `${pokemonOptionHTML()}
    <section class="page-head"><div><h2>自分の構築</h2><p>構築の6匹を一度登録しておくと、対戦記録では選出3匹だけをタップして残せます。</p></div>${draft.id ? `<button class="quiet-button" type="button" data-action="new-team">新しい構築を作る</button>` : ''}</section>
    <div class="record-layout"><section class="card form-card"><div class="section-label"><h3>${draft.id ? '構築を編集' : '構築を登録'}</h3><p>元ポケモン名で登録します。</p></div>
      <label>構築名<input type="text" value="${e(draft.name)}" placeholder="例：S3 メガ○○軸" data-team-name></label>
      <div class="section-block"><div class="field-grid">${draft.pokemon.map((name, index) => `<label>ポケモン ${index + 1}<input type="text" list="pokemon-options" value="${e(name)}" placeholder="ポケモン名" data-team-pokemon="${index}"></label>`).join('')}</div></div>
      <div class="submit-row"><p class="help-text">同じポケモンは重複登録できません。</p><button class="primary-button" type="button" data-action="save-team">${draft.id ? '変更を保存' : '構築を保存'}</button></div>
    </section>
    <aside class="card side-card"><h3>登録済み構築</h3>${state.teams.length ? `<div class="stats-list">${state.teams.map(team => `<div class="stat-line"><span>${e(team.name)}</span><strong>${team.pokemon.length}匹</strong></div>`).join('')}</div>` : '<p class="help-text">まだありません。</p>'}</aside></div>
    <section class="section-block">${state.teams.length ? `<div class="team-list">${state.teams.map(renderTeamCard).join('')}</div>` : '<div class="empty-state">まずは現在使っている6匹を登録してください。</div>'}</section>`;
}
function renderTeamCard(team) {
  return `<article class="card team-card"><h3>${e(team.name)}</h3><p>選出用の6匹</p><div class="team-members">${team.pokemon.map(name => `<span class="tag">${e(name)}</span>`).join('')}</div><div class="button-row"><button class="mini-button" type="button" data-action="edit-team" data-id="${e(team.id)}">編集</button><button class="danger-button" type="button" data-action="delete-team" data-id="${e(team.id)}">削除</button></div></article>`;
}

function teamSelectOptions(selectedId) { return `<option value="">構築を選択</option>${state.teams.map(team => `<option value="${e(team.id)}"${team.id === selectedId ? ' selected' : ''}>${e(team.name)}</option>`).join('')}`; }
function selectedTeamFromSelect(select) { return state.teams.find(team => team.id === select.value) || null; }
function resetRecord() { state.editingId = null; state.draft = makeFreshRecord(state.draft?.teamId || state.teams[0]?.id || ''); }
function validBaseName(name) { return Boolean(getBasePokemon(String(name || '').trim())); }
function resultKeyFromLabel(label) { return Object.entries(SPEED_LABEL).find(([, value]) => value === label)?.[0] || ''; }
function sideKeyFromLabel(label) { return Object.entries(SIDE_LABEL).find(([, value]) => value === label)?.[0] || ''; }

async function saveRecord() {
  const draft = state.draft;
  const team = teamById(draft.teamId);
  if (!team) throw new Error('自分の構築を選んでください。');
  if (draft.selfPokemon.length !== 3) throw new Error('自分の選出を3匹選んでください。');
  if (draft.opponentPokemon.some(p => !validBaseName(p.baseName))) throw new Error('相手の6匹は、候補にある元ポケモン名で選んでください。');
  if (new Set(draft.opponentPokemon.map(p => p.baseName)).size !== 6) throw new Error('相手の6匹に同じポケモンが重複しています。');
  if (draft.opponentPokemon.filter(p => p.selected).length !== 3) throw new Error('相手の選出を3匹選んでください。');
  const payload = clone(draft);
  payload.opponentPokemon = payload.opponentPokemon.map(p => ({ ...p, moves: p.moves.filter(Boolean) }));
  if (state.editingId) await api(`/api/records/${encodeURIComponent(state.editingId)}`, { method: 'PUT', body: JSON.stringify(payload) });
  else await api('/api/records', { method: 'POST', body: JSON.stringify(payload) });
  await loadRemote();
  const keepTeam = draft.teamId;
  state.editingId = null;
  state.draft = makeFreshRecord(keepTeam);
  render();
  notify('対戦記録を保存しました。');
}
async function saveTeam() {
  const draft = state.teamDraft;
  const pokemon = draft.pokemon.map(name => String(name || '').trim());
  if (!draft.name.trim()) throw new Error('構築名を入力してください。');
  if (pokemon.some(name => !validBaseName(name))) throw new Error('6匹すべて、候補にある元ポケモン名で選んでください。');
  if (new Set(pokemon).size !== 6) throw new Error('同じポケモンを重複して登録できません。');
  const payload = { name: draft.name.trim(), pokemon };
  if (draft.id) await api(`/api/teams/${encodeURIComponent(draft.id)}`, { method: 'PUT', body: JSON.stringify(payload) });
  else await api('/api/teams', { method: 'POST', body: JSON.stringify(payload) });
  await loadRemote();
  state.teamDraft = { id: null, name: '', pokemon: Array(6).fill('') };
  render();
  notify('構築を保存しました。');
}
async function exportBackup() {
  const response = await fetch('/api/export', { headers: apiHeaders() });
  let payload;
  try { payload = await response.json(); } catch { throw new Error('バックアップを作成できませんでした。'); }
  if (!response.ok || !payload.app) throw new Error(payload.error || 'バックアップを作成できませんでした。');
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `pokemon-battle-log-backup-${todayJapan()}.json`;
  link.click();
  URL.revokeObjectURL(url);
  notify('バックアップをダウンロードしました。');
}

async function handleAction(button) {
  const action = button.dataset.action;
  if (action === 'save-record') return saveRecord();
  if (action === 'cancel-edit-record') { resetRecord(); render(); return; }
  if (action === 'add-speed') { state.draft.speed.push({ selfName: state.draft.selfPokemon[0] || '', opponentName: state.draft.opponentPokemon.find(p => p.selected)?.baseName || '', result: 'selfFirst', condition: '通常', note: '' }); render(); return; }
  if (action === 'remove-speed') { state.draft.speed.splice(Number(button.dataset.index), 1); render(); return; }
  if (action === 'add-damage') { state.draft.damage.push({ side: 'selfToOpponent', attacker: state.draft.selfPokemon[0] || '', defender: state.draft.opponentPokemon.find(p => p.selected)?.baseName || '', move: '', percent: '', amount: '', note: '' }); render(); return; }
  if (action === 'remove-damage') { state.draft.damage.splice(Number(button.dataset.index), 1); render(); return; }
  if (action === 'refresh') { await loadRemote(); render(); notify('最新の記録を読み込みました。'); return; }
  if (action === 'new-team') { state.teamDraft = { id: null, name: '', pokemon: Array(6).fill('') }; render(); return; }
  if (action === 'save-team') return saveTeam();
  if (action === 'edit-team') { const team = teamById(button.dataset.id); if (team) { state.teamDraft = clone(team); render(); } return; }
  if (action === 'delete-team') {
    const team = teamById(button.dataset.id); if (!team) return;
    if (!window.confirm(`「${team.name}」を削除しますか？\n過去の対戦記録は消えません。`)) return;
    await api(`/api/teams/${encodeURIComponent(team.id)}`, { method: 'DELETE' });
    await loadRemote();
    if (state.teamDraft?.id === team.id) state.teamDraft = { id: null, name: '', pokemon: Array(6).fill('') };
    if (state.draft?.teamId === team.id) { state.draft.teamId = ''; state.draft.selfPokemon = []; }
    render(); notify('構築を削除しました。'); return;
  }
  if (action === 'edit-record') {
    const record = state.records.find(row => row.id === button.dataset.id);
    if (!record) return;
    state.editingId = record.id; state.draft = clone(record);
    state.draft.opponentPokemon = state.draft.opponentPokemon.map(p => ({ ...p, moves: [...(p.moves || []), '', '', '', ''].slice(0, 4) }));
    state.view = 'record'; render(); window.scrollTo({ top: 0, behavior: 'smooth' }); return;
  }
  if (action === 'delete-record') {
    const record = state.records.find(row => row.id === button.dataset.id); if (!record) return;
    if (!window.confirm(`${dateText(record.battleDate)}の対戦記録を削除しますか？`)) return;
    await api(`/api/records/${encodeURIComponent(record.id)}`, { method: 'DELETE' });
    await loadRemote(); render(); notify('対戦記録を削除しました。'); return;
  }
}

app.addEventListener('click', async event => {
  const viewButton = event.target.closest('[data-view]');
  if (viewButton) { state.view = viewButton.dataset.view; render(); return; }
  const actionButton = event.target.closest('[data-action]');
  if (!actionButton) return;
  try { await handleAction(actionButton); } catch (error) { notify(error.message || '処理に失敗しました。'); }
});
app.addEventListener('change', event => {
  const target = event.target;
  if (!state.draft && !state.teamDraft) return;
  if (target.matches('[data-record-date]')) { state.draft.battleDate = target.value; return; }
  if (target.matches('[data-record-team]')) {
    const team = selectedTeamFromSelect(target);
    state.draft.teamId = team?.id || '';
    state.draft.selfPokemon = state.draft.selfPokemon.filter(name => team?.pokemon.includes(name));
    render(); return;
  }
  if (target.matches('[data-record-result]')) { state.draft.result = target.value; return; }
  if (target.matches('[data-self-selected]')) {
    const name = target.value;
    if (target.checked) {
      if (state.draft.selfPokemon.length >= 3) { notify('自分の選出は3匹までです。'); render(); return; }
      state.draft.selfPokemon.push(name);
    } else state.draft.selfPokemon = state.draft.selfPokemon.filter(value => value !== name);
    render(); return;
  }
  if (target.matches('[data-opponent-name]')) {
    const index = Number(target.dataset.opponentName);
    const current = state.draft.opponentPokemon[index];
    const name = target.value.trim();
    const changed = current.baseName !== name;
    state.draft.opponentPokemon[index] = { baseName: name, selected: changed ? false : current.selected, megaName: '', moves: changed ? ['', '', '', ''] : current.moves, item: changed ? '' : current.item, ability: '', note: changed ? '' : current.note };
    render(); return;
  }
  if (target.matches('[data-op-selected]')) {
    const index = Number(target.dataset.opSelected);
    const selectedCount = state.draft.opponentPokemon.filter(p => p.selected).length;
    if (target.checked && selectedCount >= 3) { notify('相手の選出は3匹までです。'); render(); return; }
    state.draft.opponentPokemon[index].selected = target.checked;
    render(); return;
  }
  if (target.matches('[data-op-mega]')) {
    const index = Number(target.dataset.opMega);
    state.draft.opponentPokemon[index].megaName = target.value;
    state.draft.opponentPokemon[index].ability = '';
    render(); return;
  }
  if (target.matches('[data-op-ability]')) { state.draft.opponentPokemon[Number(target.dataset.opAbility)].ability = target.value; render(); return; }
  if (target.matches('[data-op-item]')) { state.draft.opponentPokemon[Number(target.dataset.opItem)].item = target.value.trim(); return; }
  if (target.matches('[data-op-move]')) { state.draft.opponentPokemon[Number(target.dataset.opMove)].moves[Number(target.dataset.moveIndex)] = target.value.trim(); return; }
  if (target.matches('[data-op-note]')) { state.draft.opponentPokemon[Number(target.dataset.opNote)].note = target.value; return; }
  if (target.matches('[data-speed-field]')) {
    const row = state.draft.speed[Number(target.dataset.speedIndex)];
    const field = target.dataset.speedField;
    row[field] = field === 'result' ? resultKeyFromLabel(target.value) : target.value;
    return;
  }
  if (target.matches('[data-damage-field]')) {
    const row = state.draft.damage[Number(target.dataset.damageIndex)];
    const field = target.dataset.damageField;
    row[field] = field === 'side' ? sideKeyFromLabel(target.value) : target.value;
    if (field === 'side') { row.attacker = ''; row.defender = ''; render(); }
    return;
  }
  if (target.matches('[data-team-name]')) { state.teamDraft.name = target.value; return; }
  if (target.matches('[data-team-pokemon]')) { state.teamDraft.pokemon[Number(target.dataset.teamPokemon)] = target.value.trim(); return; }
});
app.addEventListener('input', event => {
  const target = event.target;
  if (target.matches('[data-record-note]')) state.draft.note = target.value;
  if (target.matches('[data-record-other]')) state.draft.otherNote = target.value;
  if (target.matches('[data-op-item]')) state.draft.opponentPokemon[Number(target.dataset.opItem)].item = target.value;
  if (target.matches('[data-op-move]')) state.draft.opponentPokemon[Number(target.dataset.opMove)].moves[Number(target.dataset.moveIndex)] = target.value;
  if (target.matches('[data-op-note]')) state.draft.opponentPokemon[Number(target.dataset.opNote)].note = target.value;
  if (target.matches('[data-speed-field]')) { const row = state.draft.speed[Number(target.dataset.speedIndex)]; if (row && target.dataset.speedField === 'note') row.note = target.value; }
  if (target.matches('[data-damage-field]')) { const row = state.draft.damage[Number(target.dataset.damageIndex)]; if (row && ['move','percent','amount','note'].includes(target.dataset.damageField)) row[target.dataset.damageField] = target.value; }
  if (target.matches('[data-team-name]')) state.teamDraft.name = target.value;
  if (target.matches('[data-team-pokemon]')) state.teamDraft.pokemon[Number(target.dataset.teamPokemon)] = target.value;
});

document.querySelectorAll('.nav-button').forEach(button => button.addEventListener('click', () => { state.view = button.dataset.view; render(); }));
seasonSelect.addEventListener('change', () => { state.season = seasonSelect.value; localStorage.setItem('pokemon-battle-log-season', state.season); render(); notify(`候補データを${seasonSelect.options[seasonSelect.selectedIndex].text}に切り替えました。`); });
document.querySelector('#export-button').addEventListener('click', async () => { try { await exportBackup(); } catch (error) { notify(error.message || 'バックアップを作成できませんでした。'); } });
document.querySelector('#lock-button').addEventListener('click', () => { sessionStorage.removeItem('pokemon-battle-log-pin'); state.pin = ''; setLogin(true); });
loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  loginError.textContent = '';
  try {
    const pin = pinInput.value;
    await verifyPin(pin);
    state.pin = pin;
    sessionStorage.setItem('pokemon-battle-log-pin', pin);
    await loadRemote();
    setLogin(false);
    render();
    pinInput.value = '';
  } catch (error) { loginError.textContent = error.message || 'PINを確認できませんでした。'; }
});

(async () => {
  try {
    await loadData();
    await checkSetup();
    if (state.pin) {
      try { await loadRemote(); setLogin(false); render(); }
      catch { setLogin(true); render(); }
    } else {
      render(); setLogin(true);
    }
  } catch (error) {
    app.innerHTML = `<div class="empty-state">候補データを読み込めませんでした。<br>${e(error.message)}</div>`;
  }
})();
