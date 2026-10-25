// Opens the shared inquiry chat for the Samgong listing from any [data-corporate-inquiry] link.
document.addEventListener('click', (event) => {
  const trigger = event.target.closest('[data-corporate-inquiry]');
  if (!trigger) return;
  event.preventDefault();
  window.dispatchEvent(new CustomEvent('lottereal:open-inquiry', {
    detail: {
      listingId: '4b2080fa-ebc5-4363-a801-ca1be33add3e',
      listingTitle: '올림픽공원 전면 프라이빗 사옥용 삼공빌딩'
    }
  }));
});
