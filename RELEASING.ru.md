# Релиз (GitHub + npm)

Этот репозиторий подготовлен для публикации в npm.

## Требования

- Есть доступ к репозиторию на GitHub.
- Есть npm аккаунт с правами публикации выбранного имени пакета.

## Ручной релиз (локально)

1. Убедитесь, что пакет не помечен как private:
   - В `package.json` установите `"private": false`.
2. Прогоните проверки:
   - `npm ci`
   - `npm run typecheck`
   - `npm test`
   - `npm run build`
3. Поднимите версию и создайте git tag:
   - `npm version patch` (или `minor` / `major`)
   - Команда создаст tag вида `vX.Y.Z`.
4. Запушьте коммиты и теги:
   - `git push`
   - `git push --tags`
5. Публикация:
   - `npm login`
   - `npm publish --access public`

## Автоматический релиз (GitHub Actions)

В репозитории есть workflow `.github/workflows/release.yml`, он запускается при пуше тегов `v*.*.*`.

Настройка:
- Добавьте `NPM_TOKEN` в GitHub repo secrets.
- Перед созданием тега убедитесь, что `"private": false`.

