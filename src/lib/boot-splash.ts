/**
 * Экран до загрузки скриптов (этап D, D5). В демо-контуре маршруты рендерятся во вкладке
 * (ADR-004), и первый HTML пуст: на медленной мобильной сети человек смотрел на пустой экран
 * до восьми секунд. Оболочка документа отдаёт этот статичный экран сразу: на корне без
 * выбранной роли — заголовок экрана входа, на остальных адресах — только знак.
 *
 * Разметка — строка, а не React: её не сверяет гидратация. Прячется атрибутом
 * `data-booted` на `<html>`, который ставит приложение после монтирования.
 */
export const BOOT_SPLASH_HTML = `<style>
#boot-splash{position:fixed;inset:0;z-index:70;overflow:hidden;isolation:isolate;background:var(--void);color:var(--text);font-family:var(--font-sans)}
html[data-booted] #boot-splash{display:none}
#boot-splash .b-orb{position:absolute;z-index:-1;top:-80px;right:-96px;width:300px;height:300px;border-radius:999px;filter:blur(48px);background:radial-gradient(circle at 40% 40%,#ff8a4c 0%,#f16001 40%,transparent 70%);opacity:.55}
:root[data-theme="light"] #boot-splash .b-orb{opacity:.4}
#boot-splash .b-wrap{max-width:1200px;margin:0 auto;padding:20px 20px 40px}
#boot-splash .b-mark{height:40px;display:flex;align-items:center;font-size:24px;line-height:1;font-weight:600;letter-spacing:-.02em}
#boot-splash .b-hero{margin-top:56px;max-width:980px;font-size:44px;line-height:46px;font-weight:600;letter-spacing:-.035em;text-wrap:balance}
#boot-splash .b-tone{display:block;color:var(--text-3)}
#boot-splash .b-sub{margin-top:20px;max-width:560px;font-size:17px;line-height:24px;color:var(--text-2)}
@media (min-width:640px){#boot-splash .b-orb{top:-96px;right:-40px;width:440px;height:440px}#boot-splash .b-wrap{padding:32px 40px 40px}#boot-splash .b-hero{margin-top:80px;font-size:64px;line-height:64px}#boot-splash .b-sub{margin-top:24px;font-size:19px;line-height:28px}}
@media (min-width:1024px){#boot-splash .b-orb{top:-120px;right:6%;width:560px;height:560px}#boot-splash .b-wrap{padding:40px 64px 56px}#boot-splash .b-hero{margin-top:96px;font-size:88px;line-height:86px}}
</style>
<div class="b-orb" data-boot-hero></div>
<div class="b-wrap">
<div class="b-mark">гайка</div>
<div class="b-hero" data-boot-hero>Говорите с объекта. <span class="b-tone">Гайка соберёт остальное.</span></div>
<div class="b-sub" data-boot-hero>Голос с площадки становится отчётом, документом и заявкой. Человек только подтверждает.</div>
</div>`;

/** Заголовок входа — только на корне без выбранной роли: иначе это был бы чужой экран */
export const BOOT_SPLASH_SCRIPT = `(function(){try{var root=location.pathname==="/";var chosen=sessionStorage.getItem("neeklo-fieldops-role-chosen")==="1";if(!root||chosen)document.documentElement.dataset.bootCompact="";}catch(e){}})()`;
