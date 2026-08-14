# Agent Note: Diagram canvas as a Session sidecar

Status: implemented

Date: 2026-08-14

## Problem

An editable diagram must survive page reloads without changing DSH Session event formats or making high-frequency canvas changes model-visible. The browser must also detect concurrent writes, and reused Session ids must not expose data from an earlier lifecycle.

## Decision

The plugin stores each diagram in a storage-domain table keyed by an opaque diagram id. Every record also carries its Session id and `{createdAt, cwd}` lifecycle identity. Excalidraw scene data is the current editable document; the original `DiagramSpec` is generation provenance.

Browser autosaves use whole-scene compare-and-set writes with an opaque revision. They do not append Session events. `diagram_read` is the only path that derives the current scene summary for a model, so model-visible content enters the ordinary tool result log.

The DSH Client bundle only registers the `conversation.view` entry. The active view mounts a same-origin iframe whose Vite-built assets and self-hosted Excalidraw fonts are served by the Host plugin. This keeps Excalidraw and its dynamic chunks outside DSH Web startup without changing the DSH client-module protocol or relying on a font CDN.

## Alternatives considered

- Store every canvas change in the Session log. Rejected because autosave would create large, model-irrelevant events and require a Session format change.
- Keep `DiagramSpec` authoritative and regenerate the scene after edits. Rejected because regeneration can discard user-authored geometry and text.
- Bundle Excalidraw into the DSH Client entry. Rejected because the current client-module server exposes one eagerly downloaded JavaScript asset, while Excalidraw builds into a large entry plus dynamic chunks.
- Add CRDT or real-time collaboration. Rejected because the first release is a local single-user workflow; whole-scene compare-and-set writes expose conflicts without adding another persistence model.

## Consequences

- A revision conflict returns the authoritative Host record and preserves the browser draft.
- Session fork and export do not copy this sidecar in the first release.
- Uninstalling the bundle removes its routes and UI but retains stored records.
- The iframe is not a security isolation boundary. Static path containment, CSP, loopback-only RPC, runtime schemas and Host-side Session ownership checks enforce access.
- The first release fails plugin loading unless DSH Web is physically bound to `127.0.0.1`; it does not expose the diagram channel on an all-interfaces deployment.
- Image, embedded Web content, external links and binary files are outside the first-release scene format.
