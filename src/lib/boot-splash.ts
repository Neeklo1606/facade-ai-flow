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
#boot-splash{position:fixed;inset:0;z-index:70;background:var(--void);color:var(--text);padding:40px 20px;font-family:var(--font-sans)}
html[data-booted] #boot-splash{display:none}
#boot-splash .b-wrap{max-width:560px;margin:0 auto}
#boot-splash .b-mark{font-size:22px;line-height:1;font-weight:600;letter-spacing:0}
#boot-splash .b-hero{margin-top:24px;font-size:40px;line-height:44px;font-weight:600;letter-spacing:0}
#boot-splash .b-sub{margin-top:12px;font-size:17px;line-height:24px;opacity:.72}
</style>
<div class="b-wrap">
<div class="b-mark">гайка</div>
<div class="b-hero" data-boot-hero>Говорите с объекта. Гайка соберёт остальное.</div>
<div class="b-sub" data-boot-hero>Голос с площадки становится отчётом, документом и заявкой. Человек только подтверждает.</div>
</div>`;

/** Заголовок входа — только на корне без выбранной роли: иначе это был бы чужой экран */
export const BOOT_SPLASH_SCRIPT = `(function(){try{var root=location.pathname==="/";var chosen=sessionStorage.getItem("neeklo-fieldops-role-chosen")==="1";if(!root||chosen)document.documentElement.dataset.bootCompact="";}catch(e){}})()`;
