export function shopEntryUrl(origin:string, coupon?:{id:string;cost:number}) {
 const base=new URL(origin);
 if(base.protocol!=='https:' || base.username || base.password)throw Error('STORE_NOT_CONFIGURED');
 const url=new URL('/apps/members',base.origin);
 if(coupon && (!/^[a-zA-Z0-9_-]{1,128}$/.test(coupon.id) || ![200,500,1000].includes(coupon.cost)))throw Error('INVALID_ENTRY');
 const kind=coupon?'ticket':'rich_menu';url.searchParams.set('entry',kind);
 if(coupon){url.searchParams.set('coupon',coupon.id);url.searchParams.set('offer',String(coupon.cost));}
 for(const [key,value] of Object.entries({utm_source:'line',utm_medium:'social',utm_campaign:coupon?'point_exchange':'agaruke_ec',utm_content:coupon?`pointcard_ticket_${coupon.cost}`:'rich_menu_shop'}))url.searchParams.set(key,value);
 return url.href;
}
