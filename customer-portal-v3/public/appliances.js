(() => {
  const container = document.getElementById('appliance-grid');
  const status = document.getElementById('appliance-status');
  if (!container) return;

  const safeText = (v) => String(v == null ? '' : v);

  const formatPrice = (n) => {
    const num = Number(n);
    if (!isFinite(num) || num <= 0) return '';
    return '$' + num.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
  };

  const formatDims = (item) => {
    if (item.dimensions_display) return safeText(item.dimensions_display);
    const parts = [];
    if (item.width_in)  parts.push(`W ${item.width_in}"`);
    if (item.height_in) parts.push(`H ${item.height_in}"`);
    if (item.depth_in)  parts.push(`D ${item.depth_in}"`);
    if (item.capacity_cu_ft) parts.push(`${item.capacity_cu_ft} cu ft`);
    return parts.join(' · ');
  };

  const buildEmptyMedia = () => {
    const media = document.createElement('div');
    media.className = 'appliance-media appliance-media-empty';
    const span = document.createElement('span');
    span.textContent = 'No photo';
    media.appendChild(span);
    return media;
  };

  const buildImageMedia = (url, altText) => {
    const media = document.createElement('div');
    media.className = 'appliance-media';
    const img = document.createElement('img');
    img.src = url;
    img.alt = altText;
    img.loading = 'lazy';
    img.decoding = 'async';
    img.addEventListener('error', () => {
      const fallback = buildEmptyMedia();
      if (media.parentNode) media.parentNode.replaceChild(fallback, media);
    });
    media.appendChild(img);
    return media;
  };

  const buildCard = (item) => {
    const card = document.createElement('article');
    card.className = 'appliance-card';

    const firstPhoto = Array.isArray(item.photo_links) && item.photo_links.length
      ? String(item.photo_links[0]).trim()
      : '';
    const title = `${safeText(item.brand)} ${safeText(item.model)}`.trim();

    card.appendChild(firstPhoto ? buildImageMedia(firstPhoto, title || 'Appliance') : buildEmptyMedia());

    const body = document.createElement('div');
    body.className = 'appliance-body';

    const h3 = document.createElement('h3');
    h3.className = 'appliance-title';
    h3.textContent = title || 'Appliance';
    body.appendChild(h3);

    const metaBits = [];
    if (item.category) metaBits.push(safeText(item.category));
    if (item.condition) metaBits.push(`Condition: ${safeText(item.condition)}`);
    if (item.fuel_type) metaBits.push(safeText(item.fuel_type));
    if (item.warranty_tier) metaBits.push(`Warranty: ${safeText(item.warranty_tier)}`);
    if (metaBits.length) {
      const meta = document.createElement('div');
      meta.className = 'appliance-meta';
      meta.textContent = metaBits.join(' · ');
      body.appendChild(meta);
    }

    const dimsText = formatDims(item);
    if (dimsText) {
      const dims = document.createElement('div');
      dims.className = 'appliance-dims';
      dims.textContent = dimsText;
      body.appendChild(dims);
    }

    const priceText = formatPrice(item.list_price);
    if (priceText) {
      const price = document.createElement('div');
      price.className = 'appliance-price';
      price.textContent = priceText;
      body.appendChild(price);
    }

    card.appendChild(body);
    return card;
  };

  const setStatus = (message, state = '') => {
    if (!status) return;
    status.textContent = message;
    status.dataset.state = state;
  };

  const renderEmpty = (message) => {
    container.innerHTML = '';
    setStatus(message, 'empty');
  };

  const renderCards = (items) => {
    container.innerHTML = '';
    setStatus(`${items.length} available`, 'ready');
    for (const item of items) {
      container.appendChild(buildCard(item));
    }
  };

  const load = async () => {
    setStatus('Loading inventory…', 'loading');
    try {
      const response = await fetch('/api/appliances', {
        headers: { accept: 'application/json' }
      });
      let result = null;
      try {
        result = await response.json();
      } catch (_err) {
        result = null;
      }
      if (!result || !result.ok || !Array.isArray(result.data)) {
        renderEmpty('Inventory is being prepared. Please check back soon.');
        return;
      }
      if (result.data.length === 0) {
        renderEmpty('No appliances are currently available. New inventory is added regularly.');
        return;
      }
      renderCards(result.data);
    } catch (_err) {
      renderEmpty('Inventory is being prepared. Please check back soon.');
    }
  };

  load();
})();
