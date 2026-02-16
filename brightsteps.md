# PRD: **BrightSteps**

*Calm, structured learning for autistic kids. Peace of mind for families.
No chaos, no "gamification addiction," no weird surprises.*

**Document Version:** 1.1
**Owner:** Prabhu (Architect / Product Owner)
**Primary Dev Mode:** Agent-assisted (Antigravity + Copilot + Codex)
with human-led architecture and scope control
**Repo State Assumption:** Empty folder at start
**Target Platforms (Phase 1):** Web (desktop + tablet),
mobile-friendly responsive
**Target Users:** Autistic kids (primary), parents/caregivers (secondary)
**Core Philosophy:** Structured, predictable, low-sensory learning with
visual supports, prompting, and spaced review.

---

## 0) Disclaimer + Research Alignment Guardrails

This product is **educational support**. It is not therapy, diagnosis,
or medical advice.

**Evidence-aligned principles (must inform every feature):**

- **Structured + predictable UI** (consistent layout, clear next step).
- **Visual supports first** (images/icons with optional audio support).
- **Prompting + prompt fading** (scaffold early, reduce help later).
- **Spaced + varied practice** (avoid mindless repetition loops).
- **User choice** (topic, mode, input method).
- **Low sensory load** (no autoplay audio, minimal motion, no time
  pressure by default).

**Hard "NOs" (guardrails):**

- No dark patterns (lootboxes, variable rewards, manipulative streak pressure).
- No always-on animation, confetti, flashing.
- No surprise sounds.
- No collecting child personal data in Phase 1.
- No live AI generating factual content for children at runtime.
- No mixed-module packs (FactCards + PicturePhrases together in one pack).

---

## 1) Product Summary

**BrightSteps** is a calm learning app with two independent learning modules:

1. **FactCards** (flashcards with spaced review)
2. **PicturePhrases** (image-based sentence building)
3. **Caregiver controls** (content packs, difficulty, sensory settings)

**Module isolation decision (locked):**

- A single pack belongs to exactly one module.
- FactCards and PicturePhrases do not intersect inside one pack.
- A future blended mode is possible, but only as a new, explicit feature.

The MVP remains intentionally modest: reliable learning loops +
offline-first content packs with strict schema validation.

---

## 2) Goals, Non-Goals, Success Metrics

### 2.1 Goals (Phase 1)

- Provide a **predictable learning experience** with visual-first content.
- Support **spaced repetition** and **prompt fading** where applicable.
- Allow families to use the app **without accounts** (local-first).
- Provide a **reliable, validated pack format** that supports upload/import flows.
- Keep module boundaries strict and enforceable in schema + UI.

### 2.2 Non-Goals (Phase 1)

- No social features, messaging, comments.
- No AI tutor chatbot for kids.
- No multi-user cloud sync.
- No classroom/teacher admin portal.
- No medical claims or individualized therapy plans.
- No blended sessions that combine FactCards + PicturePhrases.

### 2.3 Success Metrics

**Product metrics (local-only analytics in Phase 1):**

- Session completion rate (started vs completed).
- Average correct rate by module, mode, and difficulty.
- Hint usage trend over time (should decrease with learning).
- Return sessions per week (not via manipulative streaks).

**Quality metrics:**

- Lighthouse performance > 90.
- P95 interaction latency < 100ms for core interactions on typical devices.
- Offline usage works for all core learning loops.
- 100% pack validation before entering any learning flow.

---

## 3) Personas

### 3.1 Child Learner

- Needs: predictability, minimal sensory overload, clear instructions,
  visual aids.
- Varies: reading level, motor skills, attention span.
- Preference: choice of input mode.

### 3.2 Caregiver (Parent/Family)

- Needs: trust, safety, no creepy data collection, simple setup, content
  control.
- Wants: progress visibility without overinterpreting.
- Needs reliable content import/edit workflows with clear errors.

---

## 4) User Experience Principles (Non-Negotiable)

1. **One primary action per screen.**
2. **Consistent layout:** same placement for Next, Hint, Back.
3. **No timers by default.** Optional later.
4. **Adjustable support:** hints/choices/word banks enabled per session.
5. **Sensory settings:** reduced motion, muted by default, high contrast option.
6. **Error is informative, not punitive:** no shame language.
7. **Module clarity:** the user always knows whether they are in FactCards
   or PicturePhrases mode.

---

## 5) System Overview (Phases)

### Phase 1 (MVP): Local-first module-isolated learning loops

- FactCards module with spaced repetition scheduling
- PicturePhrases module with guided sentence construction
- Content packs (JSON + assets)
- Sensory settings and local progress dashboard
- Strict schema validation and pack-level module lock

### Phase 2: Content studio + caregiver mode

- Caregiver mode gate (math question/device auth)
- Content pack import/export UI
- JSON upload -> editor mapping workflow
- AI-assisted *offline authoring* for PicturePhrases sentence candidates
- Multi-profile on same device

### Phase 3: Optional cloud sync + community packs

- Caregiver accounts only
- Cloud sync for settings + progress
- Curated content marketplace (free packs)
- Moderation + content integrity pipeline

### Phase 4: Accessibility + multimodal expansions

- Text-to-speech and recorded audio prompts
- Additional activity types
- Optional blended mode (explicit new feature, not implicit mixing)

---

## 6) Architecture & Tech Stack

### 6.1 Monorepo Structure

Use **pnpm workspaces** with a clean monorepo.

```text
/apps
/web                    # Next.js app (UI + local storage)
/packages
/content-schema         # zod schemas + validators + types
/spaced-repetition      # scheduler logic + tests
/ui                     # shared components + design tokens
/content
/packs                  # sample content packs (json + assets)
/public
/stitch                 # normalized design scaffolds (reference only)
```

### 6.2 Frontend (Phase 1)

- **Next.js (App Router) + TypeScript**
- **TailwindCSS**
- **Radix UI** (or shadcn/ui) for accessible primitives
- **dnd-kit** for PicturePhrases drag/drop
- **Dexie.js (IndexedDB)** for local persistence
- **Zod** for schema validation
- **Vitest** for unit tests
- **Playwright** for E2E tests

### 6.3 Backend (Phase 1)

None required. Local-first.

### 6.4 Optional Backend (Phase 3+)

- Node.js + Fastify (or Next.js API routes)
- Postgres (Supabase or Neon)
- Auth: caregiver only
- Object storage: S3-compatible
- Analytics: opt-in only

---

## 7) Data Model (Content Packs + Upload Contract)

### 7.1 Pack Package Format

Pack is a folder (Phase 1 static assets; Phase 2 importable zip):

- `pack.json`
- `assets/images/*` (optional)
- `assets/audio/*` (optional)

### 7.2 Pack Envelope Schema (Required)

Top-level pack fields:

- `schemaVersion` (string, semver)
- `packId` (string, unique)
- `moduleType` (`factcards` or `picturephrases`) **required**
- `title` (string)
- `description` (string, optional)
- `version` (string)
- `language` (string)
- `ageBand` (string)
- `topics` (array of strings)
- `settings` (optional defaults)
- `assets` (array of asset descriptors)
- `items` (array of module-specific items)

**Hard rule:** all `items[]` must match `moduleType`.

Sample envelope:

```json
{
  "schemaVersion": "2.0.0",
  "packId": "geo-factcards-001",
  "moduleType": "factcards",
  "title": "Geography Basics",
  "description": "Flags, countries, capitals, and simple maps.",
  "version": "1.0.0",
  "language": "en",
  "ageBand": "6-10",
  "topics": ["geography"],
  "settings": {
    "defaultSupportLevel": 2,
    "audioEnabledByDefault": false
  },
  "assets": [
    {
      "id": "img_france",
      "kind": "image",
      "path": "assets/images/france.png",
      "alt": "Map of France"
    }
  ],
  "items": []
}
```

### 7.3 Asset Descriptor Schema

Each `assets[]` item:

- `id` (string, unique in pack)
- `kind` (`image` or `audio`)
- `path` (relative path inside pack)
- `alt` (required for image)
- `transcript` (optional for audio)
- `durationMs` (optional, audio)

### 7.4 FactCards Item Schema

- `id` (string)
- `type` = `factcard`
- `topic` (string)
- `prompt` (string)
- `answer` (string)
- `variants` (optional string[])
- `distractors` (optional string[])
- `hints` (optional ordered string[])
- `media` (optional object):
  - `imageRef` (asset id)
  - `promptAudioRef` (asset id)
  - `answerAudioRef` (asset id)

### 7.5 PicturePhrases Item Schema

- `id` (string)
- `type` = `picturephrase`
- `topic` (string)
- `media`:
  - `imageRef` (required asset id)
  - `promptAudioRef` (optional)
- `wordBank` (array of token objects)
  - each token: `id`, `text`, optional `pos`
- `sentenceGroups` (array, min 1)
  - `intent` (string)
  - `canonical` (string)
  - `acceptable` (string[])
  - `requiredWordIds` (string[])
  - `minWords` / `maxWords` (number)
- `distractors` (optional token[])
- `hintLevels` (object for level 3/2/1/0 behavior)

**Why sentenceGroups:** one picture can produce many valid sentences.
This supports multiple acceptable answers without over-accepting noise.

### 7.6 Upload -> Editor Field Mapping Contract

The editor must map JSON fields to deterministic UI sections.

Required mapping behavior:

- Use `moduleType` to load the correct editor surface.
- Use JSON pointer paths for validation errors.
- Highlight exact UI field for each error.
- Never auto-coerce across modules.

Minimum mapping tables:

- General: `packId`, `title`, `description`, `language`, `ageBand`
- Assets: `assets[]` into Visual/Audio asset panels
- FactCards: `items[].prompt/answer/distractors/hints/media`
- PicturePhrases: `items[].wordBank/sentenceGroups/hintLevels/media`

### 7.7 Validation Guardrails

- Reject pack if `moduleType` missing or invalid.
- Reject pack if any item `type` mismatches `moduleType`.
- Reject unresolved asset refs.
- Reject duplicate IDs (`assets`, `items`, token IDs).
- Reject malformed sentenceGroups (missing canonical/acceptable).
- Invalid packs must never crash the app.

---

## 8) Learning Engine Requirements

### 8.1 FactCards Scheduler (Phase 1)

Implement a simple, testable scheduler for **FactCards only**:

- each item has `dueAt`, `intervalDays`, optional `ease`, `lastResult`
- interval ladder:
  - first correct: +1 day
  - second correct: +3 days
  - third correct: +7 days
  - then +14, +30...
- incorrect: reset to 1 day (or same-session retry)

### 8.2 PicturePhrases Progression (Phase 1)

PicturePhrases does **not** use the same due-date ladder in Phase 1.

Use session-based progression:

- record attempts, hint usage, accepted sentence group
- avoid immediate repetition in same session unless incorrect
- support-level adjustments still apply

### 8.3 Prompting + Fading

Both modules support levels 3 -> 0:

- 3: max scaffolding
- 2: partial scaffolding
- 1: minimal hints
- 0: no hints unless requested

Auto-adjust:

- 3 consecutive correct with low hint usage -> support -1
- 2 consecutive incorrect -> support +1 (max 3)

---

## 9) UX Requirements (Phase 1)

### 9.1 Global Settings (Sensory + Accessibility)

- Reduced motion: true/false (default true)
- Audio: off by default
- Text size: small/medium/large
- Contrast mode: normal/high
- Input mode preference: tap/drag/type

### 9.2 Core Screens

1. **Home / Pack Browser**
   - Pick a pack
   - Show module badge (FactCards or PicturePhrases)
   - Pick a topic
   - Start session
2. **Session Setup**
   - Duration: 5/10/15 minutes
   - Mode: Learn vs Review (module-aware)
   - Support level: Auto / Manual override
   - Input type: filtered by module
3. **Learning Screen: FactCards**
   - Prompt + optional image/audio
   - Response mode (tap choices or type)
   - Buttons: Hint, Check, Next
4. **Learning Screen: PicturePhrases**
   - Image + sentence builder UI
   - Word bank + hint levels
   - Accept if sentence maps to valid sentenceGroup
5. **Progress**
   - Session summary
   - Module-specific stats
   - Hint usage trend

### 9.3 Copy Guidelines

- Clear, literal, short sentences.
- Avoid idioms, sarcasm, rhetorical questions.
- Neutral feedback language.

---

## 10) Functional Requirements by Phase

### 10.1 Phase 1 Requirements (MVP)

#### Content

- Load built-in packs from `/content/packs`
- Validate pack schema before use
- Enforce pack-level module lock
- Show pack list, module badge, and topics

#### Learning

- Start module-specific session from selected pack
- FactCards:
  - prompt/image/audio rendering
  - response capture + hinting
  - scheduler update + local persistence
- PicturePhrases:
  - drag/drop builder
  - sentence normalization + group matching
  - hinting + local persistence

#### Settings

- Persist sensory/accessibility settings
- Apply reduced motion and audio defaults

#### Progress

- Show local summary separated by module
- No cloud analytics

#### Quality

- Offline works
- Responsive UI
- Keyboard navigation for core flows

### 10.2 Phase 2 Requirements

- Caregiver mode gate
- Pack zip import/export UI
- Upload JSON -> editor mapping UI with field-level error linking
- Content preview + validation UI
- AI-assisted PicturePhrases authoring tool:
  - input: topic + age band + image + wordBank
  - output: candidate sentenceGroups JSON
  - require human accept/edit before publish

### 10.3 Phase 3 Requirements

- Caregiver accounts + optional sync
- Curated community packs
- Moderation pipeline
- Strong content integrity controls

### 10.4 Phase 4 Requirements

- Text-to-speech
- Audio prompts
- Additional activity types
- Optional blended mode (explicit configuration)

---

## 11) Non-Functional Requirements

### Performance

- Cold load under 2 seconds on decent broadband
- No jank during drag/drop
- Images optimized (next/image)

### Accessibility

- keyboard navigation
- visible focus states
- ARIA labels
- reduced motion support

### Security/Privacy

- Phase 1: no accounts, no PII collection
- local storage only
- provide Reset all data action

### Reliability

- Corrupt local DB resets gracefully with confirmation
- Pack validation errors never crash app
- Invalid upload gives actionable field-level feedback

---

## 12) API / Integrations

### Phase 1

No external APIs required.

### Phase 2 (Optional, Authoring Tooling)

- OpenAI API (or local model) for **offline authoring assistance**
- only in caregiver/developer flows
- never exposed to child runtime loop
- strict structured output (JSON only)
- human acceptance required

### Phase 3 (Optional)

- Auth + DB + storage + analytics (opt-in)

---

## 13) Repository Setup Requirements (Agent Instructions)

### 13.1 Bootstrapping

- Initialize pnpm workspace
- Create Next.js app at `/apps/web`
- Create shared packages as specified
- Add linting + formatting:
  - ESLint
  - Prettier
  - TypeScript strict mode

### 13.2 Testing

- Unit tests for:
  - pack schema validation (including module lock)
  - scheduler logic (FactCards)
  - sentence normalization + group matching (PicturePhrases)
- E2E tests for:
  - start FactCards session
  - start PicturePhrases session
  - complete each module flow
  - settings persistence

### 13.3 CI

- GitHub Actions:
  - install
  - lint
  - test
  - build

---

## 14) Key Algorithms (Precise Specs)

### 14.1 Sentence Normalization

To compare user sentence to accepted sentence variants:

- lowercase
- trim whitespace
- collapse multiple spaces
- remove trailing punctuation `. ! ?`
- optional contraction normalization (Phase 2)

Correctness rule:

- normalized user sentence matches any normalized sentenceGroup.acceptable.

### 14.2 Session Item Selection

Inputs:

- moduleType
- desired session length (5/10/15)
- average time per item estimate
- due items (FactCards only) + new items

Rules:

- FactCards: include at least 60% due items if available
- PicturePhrases: session variety by topic + no duplicate unless incorrect
- avoid immediate repetition unless incorrect

### 14.3 Support Level Auto-Adjust

Maintain per-user per-topic per-module support level:

- increase support for repeated incorrect responses
- decrease support for repeated correct responses with low hint usage
- store in local DB

### 14.4 AI-Assisted PicturePhrases Authoring Pipeline (Phase 2)

1. Image analysis extracts objects/actions/context.
2. Model generates candidate sentence groups constrained to wordBank.
3. Rule validator checks:
   - schema validity
   - token coverage and required words
   - sentence length bounds
   - duplication and quality
4. Safety filter removes unsafe/inappropriate text.
5. Human review accepts/edits/rejects candidates.
6. Save provenance metadata (`model`, `promptVersion`, `generatedAt`).

---

## 15) UI Component Requirements

### 15.1 Components

- PackCard
- TopicPicker
- SessionSetupForm
- FactCardPlayer
- PicturePhrasePlayer
- WordBank + DropZone (dnd-kit)
- HintPanel
- ProgressSummary
- SettingsPanel
- PackImportPanel (Phase 2)
- PackEditor (Phase 2)

### 15.2 Styling Rules

- large tap targets
- minimal visual clutter
- consistent spacing
- no parallax, no confetti
- calm palette + high contrast option
- preserve stitched design language from `public/stitch/*` references

---

## 16) Content Safety Guardrails

- Built-in packs are manually curated static JSON.
- If AI assistance is used (Phase 2+), it must:
  - generate only schema-valid structured output
  - avoid medical advice and manipulative framing
  - avoid unsafe content
  - require caregiver/dev approval before use
- Runtime app never calls AI during child learning sessions.

---

## 17) Deliverables Checklist (Phase 1)

**Must ship:**

- Running web app with:
  - pack loading + strict validation
  - module-isolated session loops
  - FactCards scheduler
  - PicturePhrases matcher
  - settings + progress summary
- `/content/packs` includes at least 2 packs:
  - one FactCards pack
  - one PicturePhrases pack
- `README.md` includes:
  - install/run
  - pack format docs
  - schema docs + module lock rule

**Nice-to-have (if time):**

- Calm mode toggle
- Optional audio playback (off by default)

---

## 18) Implementation Plan (Agent-Executable)

### Phase 1 Task Breakdown (Order Matters)

1. **Repo bootstrap**
   - pnpm workspace
   - Next.js app
   - package scaffolding
1. **Design system extraction**
   - convert normalized `public/stitch/*` references into app tokens/components
1. **Content schema contract**
   - pack envelope + module lock + assets + item schemas
   - validators + precise error mapping
1. **Local persistence**
   - Dexie schema: settings, itemStates, sessionHistory
1. **FactCards scheduler module**
   - selection + update rules + tests
1. **Home + pack loader**
   - list packs + module badges + validation errors
1. **Session setup + routing**
   - module-aware session config + route dispatch
1. **FactCards player**
   - hinting + outcomes + scheduler integration
1. **PicturePhrases player**
   - dnd-kit builder + sentenceGroup matching + hints
1. **Progress + settings**
   - module-separated local stats + sensory toggles
1. **E2E tests + polish**
   - module flow tests + Lighthouse/perf checks

---

## 19) "Agent Guardrails" for Antigravity/Codex (System Prompt Addendum)

**Do not expand scope. No accounts/backend in Phase 1.**
Implement exactly Phase 1 requirements with clean architecture.

**Strict rules for agent:**

- Validate all packs with Zod and handle errors gracefully.
- Enforce `moduleType` lock; reject mixed-module packs.
- No runtime AI fact generation.
- Reduced motion ON and audio OFF by default.
- No timers unless explicitly enabled.
- Keep UI minimal and consistent.
- Write tests for schema lock, scheduler, and sentence matching.

---

## 20) Naming + Feature Set Glossary

### BrightSteps Modules

- **FactCards**: flashcards + spaced review
- **PicturePhrases**: image -> sentence builder
- **CalmControls**: sensory + accessibility settings
- **Progress Pulse**: simple local progress

---

## 21) Open Questions (Defer to Phase 2+)

- Multi-language content strategy
- Cloud sync model and conflict resolution
- Community pack moderation
- Audio/TTS production workflow
- Blended mode design (if/when modules are combined intentionally)

---

## 22) Acceptance Criteria (Phase 1)

A Phase 1 build is accepted when:

- App runs from clean bootstrap with `pnpm i && pnpm dev`.
- One FactCards pack and one PicturePhrases pack load and validate.
- Mixed-module pack import is rejected with clear field-level error.
- User completes sessions in both modules.
- FactCards outcomes update due dates.
- PicturePhrases outcomes persist correctly.
- Settings persist across refresh.
- Offline mode works for packs and sessions.
- Unit and E2E tests pass.

---

## 23) Repo Files Required (Phase 1)

- `README.md`
- `.env.example` (even if not used in Phase 1)
- `/apps/web`
- `/packages/content-schema`
- `/packages/spaced-repetition`
- `/content/packs/*`
- `/public/stitch/*` (normalized design references)

---

### End of PRD
