// Announcement visibility can change after member authentication.
const header = document.querySelector('.section-header');
if (header) {
  const preceding = [...document.querySelectorAll('.shopify-section-group-header-group')].filter(section => section !== header && Boolean(section.compareDocumentPosition(header) & Node.DOCUMENT_POSITION_FOLLOWING));
  let top = 0;
  const update = () => {
    const visible = Math.max(0, top - window.scrollY);
    document.documentElement.style.setProperty('--ag-announcement-visible', `${visible}px`);
    const sticky = header.querySelector('sticky-header');
    if (sticky) sticky.headerBounds = {top, bottom: top + header.offsetHeight};
  };
  const measure = () => {
    top = preceding.reduce((height, section) => height + section.getBoundingClientRect().height, 0);
    document.documentElement.style.setProperty('--header-height', `${header.offsetHeight}px`);
    update();
  };
  const observer = new ResizeObserver(measure);
  preceding.forEach(section => observer.observe(section));
  observer.observe(header);
  window.addEventListener('scroll', update, {passive:true, capture:true});
  window.addEventListener('resize', measure, {passive:true});
  measure();
}
