import { getDate } from './game.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderTitleScreen({ savedState = null, notice = '', music = { enabled: true, playing: false, volume: .28 }, clickSound = { enabled: true, volume: .35 }, icon } = {}) {
  const savedLabel = savedState
    ? `${getDate(savedState)} · 第 ${savedState.turn} / ${savedState.maxTurns} 季${savedState.status === 'playing' ? '' : ' · 已完结'}`
    : '尚无本地卷宗';
  const volume = Math.round(Math.max(0, Math.min(1, Number.isFinite(music.volume) ? music.volume : .28)) * 100);
  const soundVolume = Math.round(Math.max(0, Math.min(1, Number.isFinite(clickSound.volume) ? clickSound.volume : .35)) * 100);
  const arrow = typeof icon === 'function' ? icon('arrow') : '<span aria-hidden="true">→</span>';
  return `<main class="title-screen" aria-labelledby="game-title">
    <div class="title-landscape" aria-hidden="true"></div>
    <div class="title-shade" aria-hidden="true"></div>
    <section class="title-content">
      <header class="title-brand">
        <img class="title-emblem" src="./assets/ming-gear.svg" alt="" width="88" height="88">
        <p class="title-kicker">内廷督造 · 工业救亡</p>
        <h1 id="game-title">崇祯工业</h1>
      </header>
      <p class="title-prologue">朕梦中得窥天机，历甲申之殇，习天工之妙。<br><strong>逆天改命，当始于今日。</strong></p>
      <div class="title-rule" aria-hidden="true"><span>◆</span></div>
      <nav class="title-menu" aria-label="游戏主菜单">
        <button class="title-menu-button title-continue" data-action="continue-game" ${savedState ? '' : 'disabled'}>
          <span class="title-menu-label">继续游戏</span><small>${esc(savedLabel)}</small>${arrow}
        </button>
        <button class="title-menu-button title-new" data-action="new-game"><span class="title-menu-label">新游戏</span>${arrow}</button>
        <button class="title-menu-button" data-action="load-save"><span class="title-menu-label">读取存档</span>${arrow}</button>
      </nav>
      ${notice ? `<p class="title-notice" role="status">${esc(notice)}</p>` : ''}
      <div class="title-music" aria-label="背景音乐设置">
        <button class="title-music-toggle" data-action="toggle-music" aria-pressed="${music.enabled === true}"><span class="title-music-glyph" aria-hidden="true">♫</span><span data-music-label>音乐${music.enabled ? '开' : '关'}</span></button>
        <label class="title-volume"><span>音量</span><input type="range" min="0" max="100" value="${volume}" data-music-volume aria-label="音乐音量"></label>
      </div>
      <div class="title-music title-click-sound" aria-label="点击音效设置">
        <button class="title-music-toggle" data-action="toggle-click-sound" aria-pressed="${clickSound.enabled === true}"><span class="title-music-glyph" aria-hidden="true">♩</span><span data-click-sound-label>音效${clickSound.enabled ? '开' : '关'}</span></button>
        <label class="title-volume"><span>音量</span><input type="range" min="0" max="100" value="${soundVolume}" data-click-sound-volume aria-label="点击音效音量"></label>
      </div>
      <p class="title-save-hint">进度自动保存在此浏览器；读取存档可导入导出的卷宗。</p>
    </section>
    <div class="title-side-seal" aria-hidden="true">天工开物<br>以续国祚</div>
  </main>`;
}
