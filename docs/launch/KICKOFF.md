# Запуск серии L

Вставить в Claude Code целиком:

```text
git fetch origin. Набор задач лежит в ветке origin/feature/launch-docs, папка docs/launch.
Если в ~/Downloads/GAIKA_LAUNCH/ есть те же файлы с более новой строкой «Версия», бери их.

Прочитай docs/launch/00_SYSTEM.md, затем docs/launch/01_SPEC.md целиком.
Выполняй шаги docs/launch/L0.md ... L10.md строго по порядку, каждый по MASTER-AGENT-SKILL:
Task Brief, ADR где требуется, реализация, проверка запуском, отчёт, строка в docs/launch/JOURNAL.md.
Работай в ветке feature/launch от origin/main.

Останавливайся только там, где написано ОСТАНОВКА (после L2, L9, L10) или BLOCKED.
Слияние в main только после моего «ок».
Начни с L0.
```

Продолжить после остановки:

```text
ок. Продолжай со следующего шага серии L по docs/launch/JOURNAL.md.
```
