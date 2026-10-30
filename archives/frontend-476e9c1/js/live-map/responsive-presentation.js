/* Only layout. No tracking state, requests, subscriptions or coordinate changes. */
(function () {
  const app = document.getElementById('app');
  const card = document.getElementById('next-card');
  const controls = document.getElementById('map-controls');
  const preview = new URLSearchParams(location.search).get('presentation') === 'compact';
  if (preview) app.dataset.embed = 'compact';
  let frame = 0;
  let mapWidth = 0, mapHeight = 0;
  function layout() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(function () {
      const width = app.clientWidth, height = app.clientHeight;
      if (!width || !height) return;
      app.dataset.presentation = preview || width < 768 || height < 520 ? 'compact' : 'full';
      const bottom = Math.ceil(app.getBoundingClientRect().bottom - controls.getBoundingClientRect().top + 8);
      app.style.setProperty('--map-bottom', bottom + 'px');
      const mapElement = document.getElementById('map');
      if (mapElement.clientWidth !== mapWidth || mapElement.clientHeight !== mapHeight) {
        mapWidth = mapElement.clientWidth; mapHeight = mapElement.clientHeight;
        // Leaflet's non-animated pan preserves the geographic center on embed resize.
        map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
      }
    });
  }
  // Own the single container observer, including content/overlay changes.
  const observer = new ResizeObserver(layout);
  [app, card, controls].forEach(element => observer.observe(element));
  window.addEventListener('pageshow', layout);
  window.addEventListener('pagehide', function (event) {
    if (!event.persisted) { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('pageshow', layout); }
  });
  layout();
})();
