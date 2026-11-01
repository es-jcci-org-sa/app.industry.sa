(() => {
  'use strict';

  const base = window.viewerBase;
  const app = document.getElementById('app');
  const own = (value, key) => value != null && Object.prototype.hasOwnProperty.call(value, key);
  const scalar = value => ['string', 'number', 'boolean'].includes(typeof value) ? String(value) : '';
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const validId = value => /^[A-Za-z0-9_-]{1,128}$/.test(value);
  let config;
  let requestNumber = 0;

  class LoadError extends Error {
    constructor(code, phase = 'DATA_VALIDATION', status = null) {
      super(String(code));
      this.code = code;
      this.phase = phase;
      this.status = status;
    }
  }

  function readPath(value, path) {
    return String(path || '').split('.').reduce((item, key) => own(item, key) ? item[key] : undefined, value);
  }

  function valueOf(field, data) {
    const values = field.paths ? field.paths.map(path => scalar(readPath(data, path))).filter(Boolean) : [scalar(readPath(data, field.path))];
    const value = values.join(field.separator == null ? ' ' : field.separator);
    return value ? scalar(field.prefix) + value + scalar(field.suffix) : '';
  }

  function element(tag, className, text) {
    const result = document.createElement(tag);
    if (className) result.className = className;
    if (text != null) result.textContent = scalar(text);
    return result;
  }

  async function loadJSON(relativePath) {
    const url = new URL(relativePath, base);
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 7000);
      let retry = false;
      let failure;
      try {
        const response = await fetch(url, {cache: 'no-store', signal: controller.signal});
        if (!response.ok) {
          retry = response.status === 429 || response.status >= 500;
          throw new LoadError(response.status === 404 ? 404 : 503, 'DATA_HTTP', response.status);
        }
        // Live Server can return HTML for an absent JSON file.
        if (!/application\/(?:[\w.+-]*\+)?json\b/i.test(response.headers.get('content-type') || '')) throw new LoadError(404, 'DATA_TYPE');
        let data;
        try { data = await response.json(); }
        catch (error) {
          if (controller.signal.aborted) {retry = true; throw new LoadError(503, 'DATA_TIMEOUT');}
          if (error instanceof SyntaxError) throw new LoadError(500, 'DATA_PARSE');
          retry = true;
          throw new LoadError(503, 'DATA_CONNECTION');
        }
        if (!object(data)) throw new LoadError(500, 'DATA_VALIDATION');
        return data;
      } catch (error) {
        if (error instanceof LoadError) failure = error;
        else {
          retry = true;
          failure = new LoadError(503, controller.signal.aborted ? 'DATA_TIMEOUT' : 'DATA_CONNECTION');
        }
      } finally { clearTimeout(timeout); }
      if (!retry || attempt === 2) throw failure;
      await new Promise(resolve => setTimeout(resolve, attempt === 0 ? 250 : 750));
    }
  }

  function routeId() {
    const relative = location.pathname.slice(base.pathname.length);
    const match = relative.match(/^license\/view\/([^/]+?)(?:\/|\/index\.html)?$/);
    let id = '';
    if (match && match[1] !== 'index.html') {
      try { id = decodeURIComponent(match[1]); } catch (_) { throw new LoadError(404, 'ROUTE'); }
    } else if (['', 'index.html', '404.html', 'license/view/', 'license/view/index.html'].includes(relative)) {
      const params = new URLSearchParams(location.search);
      id = params.get('id') || params.get('routeId') || '';
    }
    if (!validId(id)) throw new LoadError(404, 'ROUTE');
    return id;
  }

  function image(settings, className) {
    const img = element('img', className);
    if (settings && settings.src) {
      const url = new URL(settings.src, base);
      if (url.origin === base.origin && /^https?:$/.test(url.protocol)) img.src = url.href;
    }
    img.alt = scalar(settings && settings.alt);
    return img;
  }

  function status(value, variants, className, id) {
    const badge = element('div', className, value);
    if (id) badge.id = id;
    const normalized = scalar(value).trim().toLocaleLowerCase();
    const variant = (variants || []).find(item => (item.values || []).some(text => scalar(text).trim().toLocaleLowerCase() === normalized));
    if (normalized) badge.classList.add('status-badge', 'tone-' + (variant ? variant.tone : 'neutral'));
    return badge;
  }

  function field(settings, data) {
    const box = element('div', 'flex flex-col space-y-2');
    box.append(element('p', 'text-lg', settings.label));
    const value = valueOf(settings, data);
    const content = settings.variants ? status(value, settings.variants, 'field-value', settings.id) : element('p', 'text-slate-500 font-medium field-value', value);
    if (settings.id) content.id = settings.id;
    box.append(content);
    return box;
  }

  function table(settings, data) {
    const scroll = element('div', 'table-scroll mt-6');
    const result = element('table', 'rounded-md shadow min-w-full divide-y divide-gray-300 data-table');
    const head = element('thead', 'bg-gray-50');
    const header = element('tr');
    settings.columns.forEach(column => {
      const th = element('th', 'px-3 py-3.5 text-center text-sm', column.label);
      th.scope = 'col';
      header.append(th);
    });
    head.append(header);
    const body = element('tbody', 'bg-white');
    body.id = settings.bodyId || '';
    const items = readPath(data, settings.path);
    (Array.isArray(items) ? items : []).forEach(item => {
      if (!object(item)) return;
      const row = element('tr', 'even:bg-gray-50');
      settings.columns.forEach(column => row.append(element('td', 'px-3 py-4 text-sm text-gray-500 text-center', valueOf(column, item))));
      body.append(row);
    });
    result.append(head, body);
    scroll.append(result);
    return scroll;
  }

  function render(data) {
    document.body.removeAttribute('style');
    document.documentElement.lang = config.language;
    document.documentElement.dir = config.direction;
    document.body.className = 'viewer-page';
    document.title = valueOf(config.documentTitle, data);
    const viewer = element('div', 'max-w-5xl mx-auto');
    viewer.id = 'viewer';

    const header = element('div', 'viewer-header flex items-center justify-between gap-8');
    const title = element('div', 'text-xl font-bold', valueOf(config.header.title, data));
    title.id = config.header.title.id;
    header.append(image(config.header.startImage, 'h-16 header-image'), title, image(config.header.endImage, 'h-16 header-image'));
    viewer.append(header);

    const summary = element('div', 'mt-6 p-6 rounded-md flex flex-col bg-gray-100 justify-between items-center mb-4');
    const line = element('div', 'flex w-full items-center gap-6');
    const identifier = element('span', 'text-lg font-medium', valueOf(config.summary.identifier, data));
    identifier.id = config.summary.identifier.id;
    const badge = config.summary.status;
    line.append(identifier, status(valueOf(badge, data), badge.variants, '', badge.id));
    const dates = element('div', 'summary-dates flex gap-6 mt-4 w-full');
    config.summary.dates.forEach(settings => {
      const date = element('div', 'flex gap-4 items-center');
      const content = element('div', '', valueOf(settings, data));
      content.id = settings.id;
      date.append(element('div', 'font-medium', settings.label), content);
      dates.append(date);
    });
    summary.append(line, dates);
    viewer.append(summary);

    const sections = element('div', 'w-full mt-6 space-y-12 divide-y');
    config.sections.forEach((settings, index) => {
      const section = element('section', 'w-full' + (index ? ' pt-6' : ''));
      section.append(element('h3', 'text-xl text-teal-500 font-bold mb-2', settings.title));
      if (settings.type === 'table') section.append(table(settings, data));
      else (settings.rows || []).forEach(columns => {
        const grid = element('div', 'mt-6 w-full grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 info-grid');
        columns.forEach(fields => {
          const column = element('div', 'flex flex-col gap-4 w-full');
          fields.forEach(settings => column.append(field(settings, data)));
          grid.append(column);
        });
        section.append(grid);
      });
      sections.append(section);
    });
    viewer.append(sections);
    const footer = element('div', 'mt-8 pt-8 flex w-full border-t border-slate-400 items-center justify-center px-4');
    footer.append(image(config.footer.image, 'w-36'));
    viewer.append(footer);
    app.replaceChildren(viewer);
    app.dataset.state = 'ready';
  }

  function showError(code, phase) {
    const custom = config && object(config.errors) && config.errors[String(code)];
    // Without a readable record there are no record-specific strings to display.
    const settings = object(custom) ? custom : {title: Error.name + ' ' + code, message: '', language: 'en', direction: 'ltr'};
    document.documentElement.lang = settings.language;
    document.documentElement.dir = settings.direction;
    document.body.className = 'error-page';
    document.title = settings.title;
    const box = element('div', 'load-error');
    box.id = 'load-error';
    Object.assign(document.body.style, {margin: '0', minHeight: '100vh', display: 'grid', placeItems: 'center', textAlign: 'center', fontFamily: 'Arial, sans-serif'});
    box.append(element('h1', 'error-code', settings.title), element('p', 'error-text', settings.message));
    app.replaceChildren(box);
    app.dataset.state = 'error';
    app.dataset.code = String(code);
    app.dataset.errorPhase = phase || '';
    app.setAttribute('aria-busy', 'false');
  }

  async function navigate() {
    const current = ++requestNumber;
    config = undefined;
    app.replaceChildren();
    app.dataset.state = 'loading';
    app.setAttribute('aria-busy', 'true');
    delete app.dataset.code;
    delete app.dataset.route;
    delete app.dataset.errorPhase;
    delete app.dataset.styles;
    document.title = '';
    try {
      const id = routeId();
      const data = await loadJSON('data/' + encodeURIComponent(id) + '.json');
      if (current !== requestNumber) return;
      if (!object(data.view) || !object(data.view.header) || !object(data.view.summary) || !Array.isArray(data.view.sections)) throw new LoadError(500);
      config = data.view;
      try { render(data); }
      catch (_) { throw new LoadError(500, 'VIEW_RENDER'); }
      app.dataset.route = id;
      app.setAttribute('aria-busy', 'false');
      // Styling is optional presentation. It must never turn loaded data into 503.
      applyPresentation(config, current).catch(() => {
        if (current === requestNumber) app.dataset.styles = 'fallback';
      });
    } catch (error) {
      if (current === requestNumber) {
        const known = error instanceof LoadError;
        const code = known ? error.code : 500;
        const phase = known ? error.phase : 'VIEW_INTERNAL';
        console.error('[viewer]', {code, phase, status: known ? error.status : null});
        showError(code, phase);
      }
    }
  }

  async function applyPresentation(settings, current) {
    const previous = [...document.querySelectorAll('link[data-viewer-stylesheet]')];
    const added = [];
    async function stylesheet(path) {
      for (let attempt = 0; attempt < 2; attempt++) {
        if (current !== requestNumber) return false;
        const success = await new Promise(resolve => {
        const link = element('link');
        link.rel = 'stylesheet';
        link.dataset.viewerStylesheet = '';
        const url = new URL(path, base);
        if (attempt) url.searchParams.set('style_retry', String(attempt));
        link.href = url.href;
        let settled = false;
        const finish = success => {
          if (settled) return;
          settled = true;
          clearTimeout(timer);
          if (!success) link.remove();
          resolve(success);
        };
        const timer = setTimeout(() => finish(false), 5000);
        link.onload = () => finish(true);
        link.onerror = () => finish(false);
        added.push(link);
        document.head.append(link);
        });
        if (success) return true;
        if (!attempt) await new Promise(resolve => setTimeout(resolve, 250));
      }
      return false;
    }
    const paths = Array.isArray(settings.stylesheets) ? settings.stylesheets.filter(path => typeof path === 'string') : [];
    const results = await Promise.allSettled(paths.map(stylesheet));
    if (current !== requestNumber) {added.forEach(link => link.remove()); return;}
    const complete = results.every(result => result.status === 'fulfilled' && result.value);
    previous.forEach(link => link.remove());
    app.dataset.styles = complete ? 'ready' : 'fallback';
    if (!complete) console.warn('[viewer]', {phase: 'STYLE_FALLBACK'});
    document.querySelectorAll('link[data-viewer-favicon]').forEach(link => link.remove());
    if (settings.favicon) {
      const icon = element('link');
      icon.rel = 'icon';
      icon.dataset.viewerFavicon = '';
      icon.href = new URL(settings.favicon, base).href;
      document.head.append(icon);
    }
  }

  function start() {
    navigate();
    addEventListener('popstate', navigate);

    // Retire only this viewer's old worker. Routing never depends on a worker.
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistrations().then(registrations => {
        registrations.forEach(registration => {
          const worker = registration.active || registration.waiting || registration.installing;
          if (worker && worker.scriptURL === new URL('sw.js', base).href) registration.unregister();
        });
      }).catch(() => {});
    }
  }

  start();
})();
