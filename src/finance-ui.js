import { formatSilver as silver } from './format.js';

const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const signed = value => `${value > 0 ? '+' : value < 0 ? '−' : ''}${silver(Math.abs(value))}`;
const amount = (value, kind) => `<strong class="${kind === 'expense' ? 'finance-negative' : 'finance-positive'}">${kind === 'expense' ? '−' : '+'}${silver(value)}<small> 两</small></strong>`;

export function financePage(state, finance) {
  const names = Object.fromEntries(state.teams.map(team => [team.id, team.name]));
  const levy = finance.levy;
  return `<section class="finance-page" aria-label="财政收支明细">
    <div class="finance-overview"><div><small>内库现银</small><strong>${silver(finance.money)}<em>两</em></strong></div><div><small>本季预计收入</small><strong class="finance-positive">+${silver(finance.income)}<em>两</em></strong></div><div><small>本季预计支出</small><strong class="finance-negative">−${silver(finance.expenses)}<em>两</em></strong></div><div><small>预计结余变化</small><strong class="${finance.netIncome < 0 ? 'finance-negative' : 'finance-positive'}">${signed(finance.netIncome)}<em>两</em></strong></div></div>
    <p class="finance-balance ${finance.shortfall > 0 ? 'is-short' : ''}">${finance.shortfall > 0 ? `本季资金不足 ${silver(finance.shortfall)} 两，无法结束本季。可调整研究安排，或劝输助饷。` : `按当前安排结算后，内库预计余 ${silver(finance.projectedBalance)} 两。`}</p>
    <div class="finance-plans"><section><header><h3>本季收入</h3><span>结算时入账</span></header><dl>${finance.incomeItems.map(item => `<div><dt>${esc(item.label)}</dt><dd>${amount(item.amount,'income')}</dd></div>`).join('') || '<p class="finance-empty">本季没有预计收入。</p>'}</dl></section><section><header><h3>本季支出</h3><span>按当前研究安排</span></header><dl>${finance.expenseItems.map(item => `<div><dt>${esc(item.label)}${item.teamId && !item.label.includes(names[item.teamId] || item.teamId) ? `<small>${esc(names[item.teamId] || item.teamId)}</small>` : ''}</dt><dd>${amount(item.amount,'expense')}</dd></div>`).join('') || '<p class="finance-empty">尚未安排需要本季支付的研究。</p>'}</dl></section></div>
    <section class="finance-levy"><div><h3>${esc(levy.name)}</h3><p>以朝廷威望号召捐输：消耗 <b>${levy.prestigeCost}</b> 点威望，立即收入 <b>${silver(levy.moneyGain)}</b> 两。</p><small>${esc(levy.canUse ? `当前威望 ${state.reputation}，助饷后 ${state.reputation-levy.prestigeCost}。威望降低也会减少往后的拨款。` : levy.reason)}</small></div><button class="small-button primary" data-action="levy" ${levy.canUse ? '' : 'disabled'}>${esc(levy.name)} · +${silver(levy.moneyGain)} 两</button></section>
    <section class="finance-history"><header><h3>已发生收支</h3><span>逐笔记账 · 最近在前</span></header>${finance.history.length ? `<div class="finance-table-scroll"><table><thead><tr><th scope="col">季度</th><th scope="col">事由</th><th scope="col">收支</th><th scope="col">入账后余额</th></tr></thead><tbody>${finance.history.map(entry => `<tr><td>第 ${entry.turn} 季</td><td>${esc(entry.label)}${entry.teamId && !entry.label.includes(names[entry.teamId] || entry.teamId) ? `<small>${esc(names[entry.teamId] || entry.teamId)}</small>` : ''}</td><td>${amount(entry.amount,entry.kind)}</td><td>${silver(entry.balance)} 两</td></tr>`).join('')}</tbody></table></div>` : '<p class="finance-empty">尚无收支记录。营建、验收、招募与季末收支均会逐笔记入。</p>'}</section>
  </section>`;
}
