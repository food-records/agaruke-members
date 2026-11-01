// Shared, closed-set routing context. No identity, bearer code or arbitrary URL.
(function () {
  function context(value) {
    if (!value || !['ticket', 'rich_menu'].includes(value.kind)) return null;
    if (value.kind === 'rich_menu') return {kind: 'rich_menu'};
    if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value.coupon_id || '') || ![200,500,1000].includes(Number(value.offer))) return null;
    return {kind: 'ticket', coupon_id: value.coupon_id, offer: Number(value.offer)};
  }
  function parse(search) {
    const p = new URLSearchParams(search);
    return context({kind:p.get('entry'),coupon_id:p.get('coupon'),offer:p.get('offer')});
  }
  function destination(value) {
    const c = context(value); if (!c) throw Error('INVALID_ENTRY');
    const p = new URLSearchParams({utm_source:'line',utm_medium:'social',utm_campaign:c.kind==='ticket'?'point_exchange':'agaruke_ec',utm_content:c.kind==='ticket'?`pointcard_ticket_${c.offer}`:'rich_menu_shop'});
    return '/?' + p.toString();
  }
  window.agarukeShopEntry = {context, parse, destination};
})();
