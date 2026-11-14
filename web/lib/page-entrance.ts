/**
 * Logging in and out are full page loads (so nothing from the old session stays alive), which
 * the browser animates as a cross-document view transition (@view-transition in globals.css).
 * This runs in <head> before the new page first paints and names the moment, so globals.css
 * can play the right one:
 * - "enter-app": arriving from the login or sign-up page: the app rises into place
 * - "leave-app": arriving at the login page from inside the app (logging out): the app sinks away
 * Browsers without cross-document view transitions skip it and simply show the page.
 */
export const ENTRANCE_SCRIPT = `addEventListener("pagereveal",function(e){try{var t=e.viewTransition;if(!t)return;var a=window.navigation&&navigation.activation&&navigation.activation.from;var f=a&&a.url?a.url:document.referrer;if(!f)return;var auth=function(p){return p==="/login"||p==="/register"||p.indexOf("/login/")===0||p.indexOf("/register/")===0};var from=auth(new URL(f).pathname),here=auth(location.pathname);if(from&&!here)t.types.add("enter-app");else if(!from&&here)t.types.add("leave-app")}catch(_){}});`;
