const LISTING_CONTEXT = Object.freeze({
  listingId: '3c04f5dd-dcb3-46ca-9332-e7cde6f9b421',
  listingTitle: 'Songpa Bangi-dong 3-bedroom short-term residential lease',
  inquiryDraft: 'I am asking about the Bangi-dong short-term residential lease: KRW 690,000 weekly rent and maintenance (KRW 590,000 rent + KRW 100,000 maintenance); known one-week contract amount KRW 1,220,000 including refundable KRW 330,000 deposit and KRW 200,000 cleaning fee; utilities separate.'
});

document.querySelectorAll('[data-shortstay-inquiry]').forEach((control) => {
  control.addEventListener('click', (event) => {
    if (!document.getElementById('lr-knowledge-widget')) return;
    event.preventDefault();
    window.dispatchEvent(new CustomEvent('lottereal:open-inquiry', {
      detail: LISTING_CONTEXT
    }));
  });
});
