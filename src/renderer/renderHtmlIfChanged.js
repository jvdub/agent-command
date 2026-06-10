const lastRenderedHtml = new WeakMap();

export function renderHtmlIfChanged(element, html) {
  if (lastRenderedHtml.get(element) === html) {
    return false;
  }

  element.innerHTML = html;
  lastRenderedHtml.set(element, html);
  return true;
}
