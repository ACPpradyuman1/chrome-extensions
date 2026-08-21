document.getElementById('site').textContent =
  new URLSearchParams(location.search).get('site') || 'This site';
