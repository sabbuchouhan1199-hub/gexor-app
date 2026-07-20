# UX and Accessibility Requirements

**Source documents:** 01. PRD.md, 11. UX-AND-INFORMATION-ARCHITECTURE.md,
03. NON-FUNCTIONAL-REQUIREMENTS.md

**Number of included requirements:** 12 NFR + 2 synthetic + PRD UX principles

For the full structured record of every requirement, see `REQUIREMENTS-INDEX.json`.

---

## UX Principles

### (From 01. PRD.md §44 — Experience Principles)
- **Familiar First Experience:** The main chat interface should feel familiar to existing AI chat users.
- **Progressive Disclosure:** Reveal complexity gradually. Default shows workspace, conversation, provider, model, prompt mode, memory status, message input. Advanced info in expandable views.
- **User Control Without Constant Interruption:** Auto-handle low-risk ops; request confirmation for sensitive memory, conflicts, high-cost requests, key removal, workspace/account deletion.
- **Clear System Status:** User always understands whether Gexor is connecting, enhancing, retrieving, waiting, streaming, processing, or experiencing an error.
- **Reversible Actions:** Memory creation/edits/deletion, workspace/conversation archival, model recommendation, prompt-enhancement selection should be reversible where practical.

### (From 01. PRD.md §62 — User-Control Hierarchy)
1. Security and legal restrictions
2. Explicit current-message instruction
3. Private-mode restrictions
4. Explicit workspace setting
5. Explicit account preference
6. Confirmed workspace memory
7. Confirmed general preference
8. Automatic recommendation
9. Default system behaviour

---

## Information Architecture

### Primary Navigation (PRD §45.1)
Home, Workspaces, Conversations, Memories, Providers, Usage, Settings, Help and Feedback.

### Workspace Detail (PRD §45.4)
Overview, Conversations, Memories, Instructions, Provider/Model preferences, Usage, Settings.

---

## Responsive Web Requirements

### (PRD §60)
- **Desktop web:** Full workspace layout.
- **Tablet web:** Core journey supported.
- **Mobile web (320 CSS-pixel min):** Sign in, select workspace, start conversation, send message, view response, change model, control memory, use private mode, inspect basic usage.

---

## Accessibility Requirements

### UX-DOC11-001 — WCAG 2.2 AA for MVP (synthetic)
- **Statement:** MVP surface shall meet WCAG 2.2 AA: keyboard operable, visible focus, logical order, skip links, semantic headings/landmarks, status with live regions, color not sole signal, text contrast AA, 400% zoom/reflow, reduced-motion support.
- **Source:** 11. UX-AND-INFORMATION-ARCHITECTURE.md §8

### UX-DOC11-002 — Keyboard Navigation and Screen Reader
- **Statement:** The primary user interface shall be keyboard-operable and compatible with screen-reader software.

### UX-DOC11-003 — Visual Contrast and Scalability
- **Statement:** Text and interactive elements shall meet WCAG AA contrast ratios. The interface shall support browser-level text scaling up to 200% without loss of functionality.

### UX-DOC11-004 — Memory Inspectability
- **Statement:** Memory controls and runtime details shall be accessible through standard input methods.

### UX-DOC11-005 — Streaming Announcements
- **Statement:** Streaming response updates shall use live regions for screen-reader announcements but shall not announce every individual token.

### UX-DOC11-006 — Non-Color Indicators
- **Statement:** Status and state information shall not rely solely on color. Text labels, icons, or patterns shall be used.

### UX-DOC11-007 — Reduced Motion
- **Statement:** Animated transitions shall respect the user's reduced-motion preference.

---

## Error Experience (PRD §56)

### Error Principles
- Clear, actionable, non-technical where possible, preserving user input, traceable internally, safe from secret disclosure.

### Provider Authentication Error
- Show: connection failed, likely credential/permission issue, test connection action, replace credential action, setup guide link.

### Provider Quota/Billing Error
- Show: provider rejected request, possible quota/billing cause, provider billing dashboard guidance, switch provider/model action.

### Security/Access Error
- Must not reveal whether another user's protected resource exists. Return generic message.

---

## Empty States (PRD §57)

- No workspace → explanation + Create Project/Client workspace
- No provider → explanation + Connect Gemini/OpenAI + billing disclosure
- No conversation → start conversation + example prompts
- No memory → what Gexor memory stores + add memory + start conversation
- No usage → usage will appear after requests + cost setting shortcut

---

## Notifications (PRD §59)

- In-app notifications for: provider connected/failed, memory saved/suggested/conflict, export ready, deletion scheduled, cost threshold reached.
- Notifications: relevant, dismissible, non-disruptive, linked to action where required.

---

## Key User Journeys (PRD §46–55)

### First-Time User
Landing → Register (Google or email/password) → Welcome → Connect provider (setup guide + test) → First workspace (type, name, description) → Memory preference (Balanced recommended) → First conversation (example prompt) → Onboarding complete.

### Returning User
Sign in → Recent workspaces/conversations → Open workspace → Continue or start conversation → Send request → Receive response with workspace context → Review memories → Monitor usage.

### Provider Connection
Select provider → See responsibility disclosure → Enter credential (masked) → Test connection → See available models → Select default → Connection active.

### Private Chat
Start Private Chat → Visible private indicator → Default: no memory reading/writing → Option to enable memory reading only → No persistent memory created.

### Memory Interaction
Explicit: "Remember that..." → Detect → Create structured memory → Show confirmation with undo → Link to source.
Automatic: Detect clear stable fact → Create candidate → Check duplicates/conflicts → Save when criteria met → Non-disruptive notification.
Suggested: Uncertain/sensitive info → Create suggestion → Show proposed memory + category + source → User confirms/edits/rejects/ignores.

### Cost Control
Select Economy/Balanced/Best Quality → Warning threshold → Hard block → Per-request display of model, tokens, estimated cost, context overhead.
