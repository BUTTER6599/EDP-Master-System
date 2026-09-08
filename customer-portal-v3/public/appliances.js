(() => {
  const container = document.getElementById('appliance-grid');
  const status = document.getElementById('appliance-status');
  if (!container) return;

  const MAX_GALLERY_PHOTOS = 15;
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

  const buildMetaBits = (item) => {
    const bits = [];
    if (item.category) bits.push(safeText(item.category));
    if (item.condition) bits.push(`Condition: ${safeText(item.condition)}`);
    if (item.fuel_type) bits.push(safeText(item.fuel_type));
    if (item.warranty_tier) bits.push(`Warranty: ${safeText(item.warranty_tier)}`);
    return bits;
  };

  const titleFor = (item) =>
    `${safeText(item.brand)} ${safeText(item.model)}`.trim() || 'Appliance';

  const collectPhotos = (item) =>
    (Array.isArray(item.photo_links) ? item.photo_links : [])
      .map((p) => String(p == null ? '' : p).trim())
      .filter(Boolean)
      .slice(0, MAX_GALLERY_PHOTOS);

  // ---- card thumbnail media ----
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

  // ---- gallery / detail modal (created once) ----
  const gallery = createGallery();
  document.body.appendChild(gallery.root);
  let galleryState = { item: null, photos: [], index: 0, opener: null };

  function createGallery() {
    const root = document.createElement('div');
    root.className = 'gallery-overlay';
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.setAttribute('aria-labelledby', 'gallery-title');
    root.hidden = true;

    const panel = document.createElement('div');
    panel.className = 'gallery-panel';

    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'gallery-close';
    close.setAttribute('aria-label', 'Close');
    close.textContent = 'Close';
    panel.appendChild(close);

    const main = document.createElement('div');
    main.className = 'gallery-main';
    const prev = document.createElement('button');
    prev.type = 'button';
    prev.className = 'gallery-nav gallery-prev';
    prev.setAttribute('aria-label', 'Previous photo');
    prev.textContent = '‹';
    const mainMedia = document.createElement('div');
    mainMedia.className = 'gallery-main-media';
    const mainImg = document.createElement('img');
    mainImg.className = 'gallery-main-img';
    mainImg.alt = '';
    mainImg.decoding = 'async';
    const mainEmpty = document.createElement('div');
    mainEmpty.className = 'gallery-main-empty';
    mainEmpty.textContent = 'No photo';
    mainEmpty.hidden = true;
    mainMedia.appendChild(mainImg);
    mainMedia.appendChild(mainEmpty);
    const next = document.createElement('button');
    next.type = 'button';
    next.className = 'gallery-nav gallery-next';
    next.setAttribute('aria-label', 'Next photo');
    next.textContent = '›';
    main.appendChild(prev);
    main.appendChild(mainMedia);
    main.appendChild(next);
    panel.appendChild(main);

    const counter = document.createElement('div');
    counter.className = 'gallery-counter';
    counter.setAttribute('aria-live', 'polite');
    panel.appendChild(counter);

    const thumbs = document.createElement('div');
    thumbs.className = 'gallery-thumbs';
    thumbs.setAttribute('role', 'list');
    panel.appendChild(thumbs);

    const info = document.createElement('div');
    info.className = 'gallery-info';
    const title = document.createElement('h2');
    title.className = 'gallery-title';
    title.id = 'gallery-title';
    const price = document.createElement('div');
    price.className = 'gallery-price';
    const meta = document.createElement('div');
    meta.className = 'gallery-meta';
    const dims = document.createElement('div');
    dims.className = 'gallery-dims';
    info.appendChild(title);
    info.appendChild(price);
    info.appendChild(meta);
    info.appendChild(dims);
    panel.appendChild(info);

    root.appendChild(panel);
    return { root, panel, close, prev, next, mainMedia, mainImg, mainEmpty, thumbs, counter, title, price, meta, dims };
  }

  function openGallery(item, opener) {
    const photos = collectPhotos(item);
    galleryState = { item, photos, index: 0, opener: opener || null };

    const t = titleFor(item);
    gallery.title.textContent = t;
    gallery.price.textContent = formatPrice(item.list_price);
    gallery.meta.textContent = buildMetaBits(item).join(' · ');
    gallery.dims.textContent = formatDims(item);

    gallery.thumbs.innerHTML = '';
    photos.forEach((url, i) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'gallery-thumb';
      btn.setAttribute('role', 'listitem');
      btn.setAttribute('aria-label', `Show photo ${i + 1} of ${photos.length}`);
      const timg = document.createElement('img');
      timg.src = url;
      timg.alt = '';
      timg.loading = 'lazy';
      timg.decoding = 'async';
      timg.addEventListener('error', () => { btn.classList.add('gallery-thumb-broken'); });
      btn.appendChild(timg);
      btn.addEventListener('click', () => setIndex(i));
      gallery.thumbs.appendChild(btn);
    });
    gallery.thumbs.hidden = photos.length < 2;

    gallery.root.hidden = false;
    document.body.classList.add('gallery-open');
    setIndex(0);
    try { gallery.close.focus(); } catch (_) { /* ignore */ }
  }

  function closeGallery() {
    if (gallery.root.hidden) return;
    gallery.root.hidden = true;
    document.body.classList.remove('gallery-open');
    const opener = galleryState.opener;
    galleryState = { item: null, photos: [], index: 0, opener: null };
    if (opener && typeof opener.focus === 'function') {
      try { opener.focus(); } catch (_) { /* ignore */ }
    }
  }

  function setIndex(i) {
    const n = galleryState.photos.length;
    if (n === 0) {
      gallery.mainImg.hidden = true;
      gallery.mainImg.removeAttribute('src');
      gallery.mainEmpty.textContent = 'No photo';
      gallery.mainEmpty.hidden = false;
      gallery.prev.hidden = true;
      gallery.next.hidden = true;
      gallery.counter.textContent = '';
      return;
    }
    galleryState.index = ((i % n) + n) % n;
    const url = galleryState.photos[galleryState.index];
    // Show a "Loading photo…" state until the image actually loads (or
    // errors). This prevents the container from ever presenting as an
    // unexplained blank gray rectangle while the image is in flight.
    gallery.mainImg.hidden = true;
    gallery.mainEmpty.textContent = 'Loading photo…';
    gallery.mainEmpty.hidden = false;
    gallery.mainImg.alt = `${gallery.title.textContent} (photo ${galleryState.index + 1} of ${n})`;
    gallery.mainImg.src = url;
    // Some browsers fire neither load nor error if the src was already
    // fully cached; check .complete after assignment.
    if (gallery.mainImg.complete && gallery.mainImg.naturalWidth > 0) {
      gallery.mainImg.hidden = false;
      gallery.mainEmpty.hidden = true;
    }
    gallery.prev.hidden = n < 2;
    gallery.next.hidden = n < 2;
    gallery.counter.textContent = n < 2 ? '' : `Photo ${galleryState.index + 1} of ${n}`;
    const thumbNodes = gallery.thumbs.querySelectorAll('.gallery-thumb');
    for (let t = 0; t < thumbNodes.length; t += 1) {
      if (t === galleryState.index) thumbNodes[t].classList.add('gallery-thumb-active');
      else thumbNodes[t].classList.remove('gallery-thumb-active');
    }
    const active = thumbNodes[galleryState.index];
    if (active && typeof active.scrollIntoView === 'function') {
      try { active.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' }); }
      catch (_) { /* ignore old browsers */ }
    }
  }

  // Wire gallery events once.
  // stopPropagation on close/prev/next is defensive against any parent
  // click delegate that might reopen or interfere with the modal.
  gallery.close.addEventListener('click', (e) => { e.stopPropagation(); closeGallery(); });
  gallery.prev.addEventListener('click', (e) => { e.stopPropagation(); setIndex(galleryState.index - 1); });
  gallery.next.addEventListener('click', (e) => { e.stopPropagation(); setIndex(galleryState.index + 1); });
  gallery.root.addEventListener('click', (e) => { if (e.target === gallery.root) closeGallery(); });

  // Main image load / error handlers. Preserve galleryState so
  // Prev/Next stay functional even if a specific photo fails.
  gallery.mainImg.addEventListener('load', () => {
    if (gallery.root.hidden) return;
    gallery.mainImg.hidden = false;
    gallery.mainEmpty.hidden = true;
  });
  gallery.mainImg.addEventListener('error', () => {
    if (gallery.root.hidden) return;
    gallery.mainImg.hidden = true;
    gallery.mainEmpty.textContent = 'Photo unavailable';
    gallery.mainEmpty.hidden = false;
  });
  document.addEventListener('keydown', (e) => {
    if (gallery.root.hidden) return;
    if (e.key === 'Escape') { closeGallery(); e.preventDefault(); }
    else if (e.key === 'ArrowLeft') { setIndex(galleryState.index - 1); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { setIndex(galleryState.index + 1); e.preventDefault(); }
  });
  // Swipe on the main image area
  let touchStartX = null;
  let touchStartY = null;
  gallery.mainMedia.addEventListener('touchstart', (e) => {
    if (e.changedTouches && e.changedTouches.length) {
      touchStartX = e.changedTouches[0].clientX;
      touchStartY = e.changedTouches[0].clientY;
    }
  }, { passive: true });
  gallery.mainMedia.addEventListener('touchend', (e) => {
    if (touchStartX == null) return;
    const t = (e.changedTouches && e.changedTouches[0]) || null;
    const endX = t ? t.clientX : touchStartX;
    const endY = t ? t.clientY : touchStartY;
    const dx = endX - touchStartX;
    const dy = endY - touchStartY;
    touchStartX = null;
    touchStartY = null;
    if (Math.abs(dx) < 40 || Math.abs(dx) < Math.abs(dy)) return; // ignore small or mostly-vertical
    if (dx > 0) setIndex(galleryState.index - 1);
    else setIndex(galleryState.index + 1);
  }, { passive: true });

  // ---- card build (clickable) ----
  const buildCard = (item) => {
    const card = document.createElement('article');
    card.className = 'appliance-card';
    card.tabIndex = 0;
    card.setAttribute('role', 'button');
    const t = titleFor(item);
    card.setAttribute('aria-label', `View photos and details for ${t}`);

    const firstPhoto = (Array.isArray(item.photo_links) && item.photo_links.length)
      ? String(item.photo_links[0]).trim()
      : '';
    card.appendChild(firstPhoto ? buildImageMedia(firstPhoto, t) : buildEmptyMedia());

    const body = document.createElement('div');
    body.className = 'appliance-body';

    const h3 = document.createElement('h3');
    h3.className = 'appliance-title';
    h3.textContent = t;
    body.appendChild(h3);

    const bits = buildMetaBits(item);
    if (bits.length) {
      const meta = document.createElement('div');
      meta.className = 'appliance-meta';
      meta.textContent = bits.join(' · ');
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

    card.addEventListener('click', () => openGallery(item, card));
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        openGallery(item, card);
      }
    });
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
