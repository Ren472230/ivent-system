# Game Library v0.2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить в IVENT SYSTEM управляемую библиотеку игр с архивом, паспортом, картинками, пользовательским редактором и быстрым созданием этапа.

**Architecture:** Существующий `GameModule` остаётся контрактом исполнительного ядра. Новый `GameManifest` хранит богатые метаданные и состояние библиотеки; пользовательские редакции получают неизменяемые `moduleId`. UI устанавливается отдельным модулем поверх существующего приложения, регистрирует пользовательские модули через `registerGameModule()` и оборачивает адаптер сохранений для переноса библиотеки.

**Tech Stack:** TypeScript, DOM API, Canvas API, localStorage, существующий автономный build через `tsc` и `scripts/build.mjs`.

**Spec:** `docs/superpowers/specs/2026-09-15-game-library-v02-design.md`

## Global Constraints

- Один итоговый автономный HTML-файл.
- Полная работа базовой библиотеки без сети.
- Пользовательские изображения обрабатываются локально до 800×450.
- Архивирование не удаляет модуль из рантайма и не ломает старые этапы.
- Редактирование пользовательской игры создаёт новую неизменяемую редакцию.
- Экспорт v0.2 переносит библиотеку; импорт v0.1 остаётся совместимым.
- Существующее командное ядро 0.1 не переписывается.

---

### Task 1: Модель Game Manifest и постоянная библиотека

**Files:**
- Create: `src/game-library.ts`
- Test: `tests/game-library.test.mjs`

**Interfaces:**
- Produces: `GameManifest`, `GameLibraryState`, `createGameLibrary()`, `loadGameLibrary()`, `saveGameLibrary()`, `upsertGameManifest()`, `setGameActive()`, `duplicateGameManifest()`, `reviseGameManifest()`, `registerLibraryModules()`.
- Uses: `GameModule`, `getGameRegistry()`, `registerGameModule()`, `IventError`.

- [ ] **Step 1: Write failing tests**

Tests must assert:

```text
seed -> every built-in module appears as active system manifest
archive -> manifest active=false but remains present
restore -> manifest active=true
duplicate -> new custom gameId/moduleId, source=custom
revise -> old moduleId remains unchanged and new moduleId supersedes it
register -> custom manifests become available from getGameRegistry()
```

- [ ] **Step 2: Run tests and confirm failure because library API is missing**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 3: Implement minimal library model**

Persist under `ivent:v2:game-library`. Generate immutable module ids as `custom-<slug>-r<revision>-<suffix>`.

- [ ] **Step 4: Run tests and confirm pass**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 5: Commit**

Commit message: `feat: add persistent game library model`

---

### Task 2: Обложки и локальная обработка изображений

**Files:**
- Modify: `src/game-library.ts`
- Test: `tests/game-library.test.mjs`

**Interfaces:**
- Produces: `defaultGameCover(manifest)`, `readAndResizeGameCover(file, document)`.

- [ ] **Step 1: Add failing tests for deterministic default cover**

Assert that a manifest without uploaded art receives a `data:image/svg+xml` cover and that the same game id gives the same generated visual metadata.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 3: Implement cover helpers**

Default SVG must be self-contained. Uploaded image processing uses `FileReader`, `Image`, and canvas; target canvas is exactly 800×450 and export format is JPEG quality 0.78.

- [ ] **Step 4: Verify green**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 5: Commit**

Commit message: `feat: add offline game covers`

---

### Task 3: Архив влияет на создание этапов, исторические этапы сохраняются

**Files:**
- Modify: `src/game-library.ts`
- Test: `tests/game-library.test.mjs`

**Interfaces:**
- Produces: `installGameLibraryGuards()`.

- [ ] **Step 1: Write failing behavior test**

Given an archived module, a new `ADD_STAGE` command through the installed wrapper must leave the stage list unchanged. After restore, the same command must add the stage. Existing stages with that module id remain untouched.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 3: Implement execute wrapper**

Wrap exported `Ivent.execute` once. Only `ADD_STAGE` for inactive modules is suppressed; all other commands delegate unchanged.

- [ ] **Step 4: Verify green and full regression suite**

Run: `npm test`

- [ ] **Step 5: Commit**

Commit message: `feat: respect game archive in stage creation`

---

### Task 4: Экспорт и импорт библиотеки вместе с мероприятием

**Files:**
- Modify: `src/game-library.ts`
- Test: `tests/game-library.test.mjs`

**Interfaces:**
- Produces: `installLibraryStorageBundle()`.

- [ ] **Step 1: Write failing tests**

Exported v0.2 JSON must have:

```json
{
  "iventBundleVersion": 2,
  "state": {},
  "gameLibrary": {}
}
```

Import of this bundle restores both state and library. Import of plain v0.1 state delegates to original importer.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/game-library.test.mjs`

- [ ] **Step 3: Wrap `createStorageAdapter`**

The wrapper delegates save/load/list. Only export/import formats are extended.

- [ ] **Step 4: Verify green and storage regressions**

Run: `npm test`

- [ ] **Step 5: Commit**

Commit message: `feat: bundle game library with saves`

---

### Task 5: Экран «Игры», паспорт, архив и редактор

**Files:**
- Create: `src/game-library-ui.ts`
- Modify: `tsconfig.json`
- Test: `tests/game-library-ui.test.mjs`

**Interfaces:**
- Produces: `installGameLibraryUI(document, window)`.
- Consumes: public game-library functions from Tasks 1–4.

- [ ] **Step 1: Write DOM-oriented smoke tests**

The UI installer must create/inject:

```text
navigation action "Игры"
active cards
archive block
button "+ Создать игру"
passport action
archive/restore action
```

The tests use a minimal fake document abstraction and pure HTML generator exports where browser DOM is unavailable.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/game-library-ui.test.mjs`

- [ ] **Step 3: Implement library UI**

Cards use 16:9 cover, name, summary, players, minutes, props and AI badge. Passport dialog renders goal, full rules, result, reward, props, item policy, AI capabilities and host notes.

- [ ] **Step 4: Implement editor**

Editor validates name, rules/summary, duration, player bounds and reward. Saving a system copy uses duplicate. Editing custom game uses revision. Uploaded image uses Task 2 helper.

- [ ] **Step 5: Verify green**

Run: `npm test -- tests/game-library-ui.test.mjs`

- [ ] **Step 6: Commit**

Commit message: `feat: add visual game library editor`

---

### Task 6: Быстрое создание из программы и визуальные этапы

**Files:**
- Modify: `src/game-library-ui.ts`
- Test: `tests/game-library-ui.test.mjs`

**Interfaces:**
- Adds program enhancement and `createAndAdd` editor mode.

- [ ] **Step 1: Write failing tests for program enhancer**

Assert generated enhancement includes `+ Новая игра`, removes inactive module options, and produces `createAndAdd` intent.

- [ ] **Step 2: Verify red**

Run: `npm test -- tests/game-library-ui.test.mjs`

- [ ] **Step 3: Implement program integration**

A MutationObserver post-processes renders:

- appends the «Игры» navigation action;
- filters archived options from `#new-stage-module`;
- adds `+ Новая игра` to the program header;
- decorates program cards and current hero with covers when a manifest match is available.

`createAndAdd` saves the manifest, registers its module, navigates to «Этапы», selects the new module and triggers the existing `add-stage` action.

- [ ] **Step 4: Verify green and full regression suite**

Run: `npm test`

- [ ] **Step 5: Commit**

Commit message: `feat: create games directly from program`

---

### Task 7: Release integration and verification

**Files:**
- Modify: `tsconfig.json`
- Modify: `README.md`
- Verify: `release/ivent-system.html`

**Interfaces:**
- `src/game-library.ts` loads after games/auction and before storage wrapping is instantiated.
- `src/game-library-ui.ts` loads after app definitions and before page mount.

- [ ] **Step 1: Add source files to TypeScript build order**

Order:

```text
domain -> random -> core -> items -> games -> auction -> game-library -> storage -> statistics -> app -> game-library-ui -> main
```

- [ ] **Step 2: Run complete tests**

Run: `npm test`
Expected: zero failures.

- [ ] **Step 3: Build release**

Run: `npm run build`
Expected: `release/ivent-system.html` created successfully.

- [ ] **Step 4: Run release verifier**

Run: `npm run verify:release`
Expected: autonomous single-file checks pass and no external resources are required.

- [ ] **Step 5: Manual browser smoke**

Open the release through `file://` and verify:

1. create event;
2. open Games;
3. archive a built-in;
4. confirm it disappears from stage selector;
5. restore it;
6. create custom game with image;
7. add it as stage;
8. save and reload;
9. export and re-import;
10. confirm custom game and cover remain.

- [ ] **Step 6: Update README and commit**

Commit message: `release: prepare IVENT SYSTEM 0.2 game library`
