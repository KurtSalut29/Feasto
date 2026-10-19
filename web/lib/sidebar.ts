/**
 * Whether the dashboard sidebar is folded into an icon rail. It's stored in the browser and
 * shown as data-sidebar="collapsed" on <html>, which the `collapsed:` CSS variant reads.
 */
export const SIDEBAR_STORAGE_KEY = "feasto-sidebar";

/** Runs before the page paints, so a folded sidebar doesn't flash open on load. */
export const SIDEBAR_INIT_SCRIPT = `try{if(localStorage.getItem(${JSON.stringify(SIDEBAR_STORAGE_KEY)})==="collapsed")document.documentElement.dataset.sidebar="collapsed"}catch(e){}`;
