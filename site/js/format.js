// Small text helpers shared by the page and the Timeline.

/** Escape text for safe use inside HTML. */
export const escapeHtml = (text) =>
  String(text ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

/** '1 monument', '2,345 monuments'. */
export const plural = (n, one, many) => `${n.toLocaleString('en-GB')} ${n === 1 ? one : many}`;
