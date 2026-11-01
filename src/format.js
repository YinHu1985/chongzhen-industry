/** Silver is stored in actual taels; large totals use a compact ten-thousand unit. */
export const formatSilver = value => {
  const amount = Math.round(Number(value) || 0);
  return Math.abs(amount) >= 10000
    ? `${(amount / 10000).toLocaleString('zh-CN', { maximumFractionDigits: 3 })}万`
    : amount.toLocaleString('zh-CN');
};
