export const diagrams = {
  'hit-rate': ({ alt, data }, { escapeHtml }) => {
    const before = Math.min(100, Math.max(0, Number(data.before)));
    const after = Math.min(100, Math.max(0, Number(data.after)));
    return `<div class="hit-chart" role="img" aria-label="${escapeHtml(alt)}">
      <div><span>Before</span><meter max="100" value="${before}"></meter><strong>${before}%</strong></div>
      <div><span>After</span><meter max="100" value="${after}"></meter><strong>${after}%</strong></div>
    </div>`;
  },
};
