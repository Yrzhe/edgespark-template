import { useEffect, useRef, useState } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock, GripVertical, Plus, Layers as LayersIcon, Sparkles, Image as ImageIcon, Type as TypeIcon, Square, Save, Send, GitBranch, Search, ArrowRight, Loader2, CheckCircle2, Coins, Palette as PaletteIcon, History, ShieldCheck, AlertCircle, ArrowUp, ArrowDown, Download, Bot, SlidersHorizontal, AlignLeft, AlignCenter, AlignRight, AlignJustify, Crosshair, Group, Ungroup } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExportDialog, type ExportRequest } from './ExportDialog';
import { exportCard } from '@/lib/export';
import { writeAssetDrag, ASSET_DRAG_MIME } from '@/components/magicpath/asset-library/AssetLibrary';
export type LayerKind = 'bg' | 'asset' | 'text' | 'group';
export type TextDecoration = 'none' | 'solid' | 'wavy' | 'dashed' | 'dotted';
export type Layer = {
  id: string;
  kind: LayerKind;
  name: string;
  thumbBg?: string; // for bg + group preview
  thumbFg?: string;
  assetName?: string; // when asset
  assetId?: string; // M-225/226: source asset id (durable; for re-presign reconciliation)
  src?: string; // M-225/226: presigned previewUrl for an asset image layer (never a raw R2 URI)
  textValue?: string; // when text
  font?: string;
  fontSize?: number; // text layer point size in canvas-preview px; default 34 (M-220)
  textAlign?: 'left' | 'center' | 'right' | 'justify'; // text layer alignment (M-218)
  opacity: number; // 0-1
  visible: boolean;
  locked: boolean;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  decoration?: TextDecoration; // text underline style; default 'none'
  decorationColor?: string; // default coral #F36440
  groupId?: string; // R6-editor (4): layers sharing a groupId move/select as a unit
};
export type Derivative = {
  id: string;
  title: string;
  ratio: string;
  bg: string;
  fg: string;
  creator: string;
  createdAtLabel: string;
};
const LAYERS: Layer[] = [{
  id: 'l_text_1',
  kind: 'text',
  name: 'Headline',
  textValue: '"Arena Olympics · Season 2"',
  font: 'Inter 800',
  opacity: 1,
  visible: true,
  locked: false
}, {
  id: 'l_asset_bird',
  kind: 'asset',
  name: 'Coral bird',
  assetName: 'coral bird · paper-cut',
  thumbFg: '#F36440',
  opacity: 0.95,
  visible: true,
  locked: false
}, {
  id: 'l_asset_b',
  kind: 'asset',
  name: 'BLOOME b',
  assetName: 'b.svg',
  thumbFg: '#FFFFFF',
  opacity: 0.18,
  visible: true,
  locked: false
}, {
  id: 'l_bg',
  kind: 'bg',
  name: 'Bloome Navy bg',
  thumbBg: '#2556B6',
  opacity: 1,
  visible: true,
  locked: true
}];
const DERIVATIVES: Derivative[] = [{
  id: 'd1',
  title: 'Tighter text',
  ratio: '9:16',
  bg: '#2556B6',
  fg: '#F36440',
  creator: 'Jin',
  createdAtLabel: '3m'
}, {
  id: 'd2',
  title: 'IG 1:1 crop',
  ratio: '1:1',
  bg: '#2556B6',
  fg: '#F36440',
  creator: 'Marco',
  createdAtLabel: '5m'
}, {
  id: 'd3',
  title: 'Season 2 · navy',
  ratio: '9:16',
  bg: '#0C0A0F',
  fg: '#F36440',
  creator: 'Ana',
  createdAtLabel: '8m'
}, {
  id: 'd4',
  title: 'IG cream variant',
  ratio: '1:1',
  bg: '#F7F5F1',
  fg: '#F36440',
  creator: 'Ren',
  createdAtLabel: '11m'
}];
const LAYER_ICON: Record<LayerKind, ComponentType<{
  className?: string;
}>> = {
  bg: Square,
  asset: ImageIcon,
  text: TypeIcon,
  group: LayersIcon
};
type RightPanel = 'agent' | 'inspector' | 'rules';
export type CardEditorCard = {
  id: string;
  title: string;
  ratio: string;
  widthPx: number;
  heightPx: number;
  status: string;
  bg: string;
  fg: string;
  layers: Layer[];
  lockVersion?: number;
  parentCardId?: string | null;
  paletteId?: string | null;
  agentRunId?: string | null;
  ruleVersionAtSave?: string | null;
  cardSpec?: Record<string, unknown>;
  slotAssignments?: Record<string, unknown>;
  copyBlock?: Record<string, unknown>;
  ruleReport?: RuleReport | null;
};
export type EditorPalette = { id: string; name: string; colors: Record<string, string>; lockVersion?: number };
export type AgentRunView = {
  id: string;
  status: string;
  prompt: string;
  tools: string[];
  steps?: Array<{ name: string; status: 'running' | 'done' | 'error'; output?: string }>;
  outputRefs: unknown[];
  outputText?: string | null;
  costMicros?: number;
  // Assets the agent produced/selected this run, resolved to thumbnails (M-225). pending =
  // bytes not yet in R2 → loading placeholder.
  producedAssets?: Array<{ id: string; name?: string | null; previewUrl?: string | null; pending?: boolean; width?: number | null; height?: number | null }>;
};
export type RuleReport = {
  passed?: boolean;
  pass?: boolean;
  findings?: unknown[];
  rules?: unknown[];
  score?: number;
  ruleVersionId?: string;
};
export type CardEditorProps = {
  card?: CardEditorCard | null;
  derivatives?: Derivative[];
  palettes?: EditorPalette[];
  activePaletteId?: string | null;
  activeRules?: unknown[];
  agentRuns?: AgentRunView[];
  toast?: string | null;
  saving?: boolean;
  loading?: boolean;
  error?: string | null;
  onBack?: () => void;
  onSaveDraft?: () => void;
  onSaveReady?: () => void;
  onSaveDraftAfterRules?: () => void;
  onDerive?: () => void;
  onPaletteChange?: (paletteId: string) => void;
  onRunAgent?: (prompt: string) => void;
  onOpenDerivative?: (id: string) => void;
  onPatchLayers?: (layers: Layer[], title?: string) => Promise<void> | void;
  onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => Promise<void> | void;
};
export const CardEditor = ({
  card,
  derivatives = [],
  palettes = [],
  activePaletteId = null,
  activeRules = [],
  agentRuns = [],
  toast = null,
  saving = false,
  loading = false,
  error = null,
  onBack,
  onSaveDraft,
  onSaveReady,
  onSaveDraftAfterRules,
  onDerive,
  onPaletteChange,
  onRunAgent,
  onOpenDerivative,
  onPatchLayers,
  onPatchCardMeta
}: CardEditorProps) => {
  const [rightPanel, setRightPanel] = useState<RightPanel>('agent');
  // R6-editor (4): multi-select. selectedIds is the source of truth; selectedLayer is the
  // "primary" (last-picked) for the Inspector + keyboard ops. setSelectedLayer is kept as a
  // single-select shim so all existing call sites (addText, duplicate, delete, undo) work.
  const [selectedIds, setSelectedIds] = useState<string[]>(['l_asset_bird']);
  // enteredGroupId: when set, clicks select single layers WITHIN that group (double-click to enter).
  const [enteredGroupId, setEnteredGroupId] = useState<string | null>(null);
  const selectedLayer = selectedIds.length ? selectedIds[selectedIds.length - 1] : null;
  const setSelectedLayer = (id: string | null) => setSelectedIds(id ? [id] : []);
  const [layers, setLayers] = useState<Layer[]>(() => card?.layers ?? (import.meta.env.DEV ? LAYERS : []));
  const [agentInput, setAgentInput] = useState('');
  const [derivOpen, setDerivOpen] = useState(false);
  const [layerBusy] = useState<string | null>(null);
  // M-216: layers-list drag-to-reorder. dragLayerId = the row being dragged; dropTarget = the
  // row it's hovering + which side to drop on (the grab cursor / "drag to reorder" hint was
  // there but no handler — only the ▲▼ buttons reordered).
  const [dragLayerId, setDragLayerId] = useState<string | null>(null);
  const [dropTarget, setDropTarget] = useState<{ id: string; pos: 'above' | 'below' } | null>(null);
  const { t } = useTranslation();
  // R6 export: ref to the on-canvas card frame (overflow-hidden = page rect, so
  // bleed is already clipped). exportCard renders it to PNG/JPG/PDF at real res.
  const canvasFrameRef = useRef<HTMLDivElement | null>(null);
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // R5 (d): optimistic local commit + debounced background persist (no spinner on the
  // canvas). Refs hold the pending save + latest onPatchLayers so the gesture never
  // waits on the network. See NOTES R5-d.
  const saveTimerRef = useRef<number | null>(null);
  const pendingSaveRef = useRef<{ layers: Layer[]; title?: string } | null>(null);
  const onPatchLayersRef = useRef(onPatchLayers);
  onPatchLayersRef.current = onPatchLayers;
  // M-225/226: ref to the latest asset-sink handler, set each render below.
  const addAssetLayerRef = useRef<(detail: { assetId?: string; name?: string; previewUrl?: string | null; width?: number | null; height?: number | null } | null, atX?: number, atY?: number) => void>(() => {});
  // R6-editor (3): undo/redo. History holds pre-change snapshots {layers, cardLockVersion};
  // one entry per edit burst (coalesced via the same 600ms debounce window, so a drag or a
  // nudge-burst is a single undo step, not per-frame/keystroke). 30-deep (≥20 required).
  const historyRef = useRef<{ layers: Layer[]; cardLockVersion: number }[]>([]);
  const redoRef = useRef<{ layers: Layer[]; cardLockVersion: number }[]>([]);
  const activeCard = card ?? (import.meta.env.DEV ? {
    id: 'sample',
    title: 'Arena Olympics · Season 2',
    ratio: '9:16',
    widthPx: 1080,
    heightPx: 1920,
    status: 'pinned',
    bg: '#2556B6',
    fg: '#F36440',
    layers: LAYERS
  } : null);
  const activeDerivatives = derivatives.length > 0 ? derivatives : import.meta.env.DEV ? DERIVATIVES : [];
  useEffect(() => {
    if (card?.layers) setLayers(card.layers);
  }, [card?.id, card?.lockVersion]);
  // Deselect (drops resize handles + selection outline from the capture), let
  // React paint two frames, then render the frame to the chosen format.
  const handleExport = async (req: ExportRequest) => {
    const node = canvasFrameRef.current;
    if (!node || !activeCard) return;
    setExporting(true);
    setSelectedLayer(null);
    try {
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
      );
      await exportCard(node, {
        format: req.format,
        multiplier: req.multiplier,
        transparent: req.transparent,
        ratio: activeCard.ratio,
        widthPx: activeCard.widthPx,
        heightPx: activeCard.heightPx,
        bg: activeCard.bg,
        title: activeCard.title,
      });
      setExportOpen(false);
    } catch (err) {
      console.error('Card export failed', err);
      window.alert(t('export.failed'));
    } finally {
      setExporting(false);
    }
  };
  const toggleVisibility = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? {
      ...l,
      visible: !l.visible
    } : l));
  };
  const toggleLock = (id: string) => {
    setLayers(prev => prev.map(l => l.id === id ? {
      ...l,
      locked: !l.locked
    } : l));
  };
  const flushSave = () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const pending = pendingSaveRef.current;
    pendingSaveRef.current = null;
    if (pending) void onPatchLayersRef.current?.(pending.layers, pending.title);
  };
  // Commit to local state instantly (optimistic), persist in the background ~600ms later.
  // Rapid drags/slider ticks coalesce into one save; the canvas never blocks on the network.
  const commitLayers = (nextLayers: Layer[], title?: string, _busyId?: string) => {
    // R6-editor (3): snapshot the pre-change layers once per edit burst (start of a new
    // debounce window) and clear redo. Coalesces drags/nudge-bursts into one undo step.
    if (saveTimerRef.current == null) {
      historyRef.current.push({ layers, cardLockVersion: card?.lockVersion ?? 0 });
      if (historyRef.current.length > 30) historyRef.current.shift();
      redoRef.current = [];
    }
    setLayers(nextLayers);
    pendingSaveRef.current = { layers: nextLayers, title };
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushSave, 600);
  };
  // R6-editor (3): apply a history snapshot and persist it. Undo/redo both write to the
  // server through the same debounced optimistic save (App tracks the live lockVersion + 409).
  const applySnapshot = (snapshotLayers: Layer[]) => {
    setLayers(snapshotLayers);
    pendingSaveRef.current = { layers: snapshotLayers };
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(flushSave, 600);
  };
  const undo = () => {
    const prev = historyRef.current.pop();
    if (!prev) return;
    redoRef.current.push({ layers, cardLockVersion: card?.lockVersion ?? 0 });
    if (selectedLayer && !prev.layers.some((l) => l.id === selectedLayer)) setSelectedLayer(prev.layers[0]?.id ?? null);
    applySnapshot(prev.layers);
  };
  const redo = () => {
    const nextSnap = redoRef.current.pop();
    if (!nextSnap) return;
    historyRef.current.push({ layers, cardLockVersion: card?.lockVersion ?? 0 });
    applySnapshot(nextSnap.layers);
  };
  // Flush any pending save when the editor unmounts so a quick drag-then-navigate isn't lost.
  useEffect(() => () => flushSave(), []);
  // M-225/226: the non-drag asset path. AssetLibrary / Agent produced-asset strip / AssetZoom
  // broadcast `magpie:add-asset-to-card` with { assetId, name, previewUrl, width, height };
  // subscribe once and route through the live ref so it sinks into the open card centred.
  useEffect(() => {
    const handler = (event: Event) => addAssetLayerRef.current?.((event as CustomEvent).detail);
    window.addEventListener('magpie:add-asset-to-card', handler);
    return () => window.removeEventListener('magpie:add-asset-to-card', handler);
  }, []);
  // R6-editor (2): keyboard nudge / delete / duplicate for the selected layer. The
  // effect reattaches on layers/selection change so the handler always sees fresh
  // state, and bails while typing in an input/textarea/contentEditable (text-layer
  // edit, title rename, agent box) so those keys aren't hijacked.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const ae = document.activeElement as HTMLElement | null;
      if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable)) return;
      // R6-editor (3): undo / redo — global (no layer selection required)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); return; }
      // R6-editor (4): group / ungroup
      if ((e.ctrlKey || e.metaKey) && (e.key === 'g' || e.key === 'G')) {
        e.preventDefault();
        if (e.shiftKey) ungroupSelection(); else groupSelection();
        return;
      }
      const ids = selectedIds;
      if (!ids.length) return;
      const sel = layers.filter((l) => ids.includes(l.id));
      if (!sel.length) return;
      // duplicate — Ctrl/Cmd+D, +24px cascade (matches R3.5 addTextLayer cascade). Whole selection.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        const stamp = Date.now();
        const dupGroup = sel.some((l) => l.groupId) ? `g_${stamp}` : undefined;
        const dups: Layer[] = sel.map((l, i) => ({ ...l, id: `l_${l.kind}_${stamp}_${i}`, x: (l.x ?? 0) + 24, y: (l.y ?? 0) + 24, locked: false, groupId: l.groupId ? dupGroup : undefined }));
        setSelectedIds(dups.map((d) => d.id));
        void commitLayers([...dups, ...layers]);
        return;
      }
      // delete — Delete / Backspace. Skips locked layers in the selection.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        const del = new Set(sel.filter((l) => !l.locked).map((l) => l.id));
        if (!del.size) return;
        e.preventDefault();
        const next = layers.filter((l) => !del.has(l.id));
        setSelectedLayer(next[0]?.id ?? null);
        void commitLayers(next);
        return;
      }
      // nudge — arrows (1px), Shift+arrows (10px). Moves the whole selection.
      const step = e.shiftKey ? 10 : 1;
      let dx = 0;
      let dy = 0;
      if (e.key === 'ArrowLeft') dx = -step;
      else if (e.key === 'ArrowRight') dx = step;
      else if (e.key === 'ArrowUp') dy = -step;
      else if (e.key === 'ArrowDown') dy = step;
      else return;
      e.preventDefault();
      const patches: Record<string, Partial<Layer>> = {};
      for (const l of sel) if (!l.locked) patches[l.id] = { x: (l.x ?? 0) + dx, y: (l.y ?? 0) + dy };
      if (Object.keys(patches).length) patchManyLayers(patches);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedIds, layers, enteredGroupId]);
  // M-216: drop `fromId` immediately above/below `toId` in the z-order list, then persist
  // through the same debounced optimistic save the ▲▼ buttons use.
  const reorderLayer = (fromId: string, toId: string, pos: 'above' | 'below') => {
    if (fromId === toId) return;
    const moving = layers.find((l) => l.id === fromId);
    if (!moving) return;
    const without = layers.filter((l) => l.id !== fromId);
    let toIdx = without.findIndex((l) => l.id === toId);
    if (toIdx < 0) return;
    if (pos === 'below') toIdx += 1;
    const next = [...without.slice(0, toIdx), moving, ...without.slice(toIdx)];
    void commitLayers(next, undefined, fromId);
  };
  const moveLayer = (id: string, direction: -1 | 1) => {
    const index = layers.findIndex((layer) => layer.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= layers.length) return;
    const next = [...layers];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item);
    void commitLayers(next, undefined, id);
  };
  const patchLayer = (id: string, patch: Partial<Layer>, title?: string) => {
    const next = layers.map((layer) => layer.id === id ? { ...layer, ...patch } : layer);
    void commitLayers(next, title, id);
  };
  // R6-editor (4): apply a per-id positional delta to many layers in one commit (multi-drag,
  // multi-nudge) so the whole selection moves as one undo step + one debounced PATCH.
  const patchManyLayers = (patches: Record<string, Partial<Layer>>) => {
    const next = layers.map((layer) => (patches[layer.id] ? { ...layer, ...patches[layer.id] } : layer));
    void commitLayers(next);
  };
  // R6-editor (4): expand a clicked id to its full group (unless we've entered that group).
  const expandSelection = (id: string): string[] => {
    const layer = layers.find((l) => l.id === id);
    if (layer?.groupId && layer.groupId !== enteredGroupId) {
      return layers.filter((l) => l.groupId === layer.groupId).map((l) => l.id);
    }
    return [id];
  };
  // R6-editor (4): selection entry point used by the canvas. additive = Shift-click (toggle).
  const selectLayer = (id: string, additive = false) => {
    if (additive) {
      setSelectedIds((prev) => {
        const grp = expandSelection(id);
        const allIn = grp.every((g) => prev.includes(g));
        return allIn ? prev.filter((p) => !grp.includes(p)) : [...prev.filter((p) => !grp.includes(p)), ...grp];
      });
      return;
    }
    setSelectedIds(expandSelection(id));
  };
  // R6-editor (4): group / ungroup the current selection. groupId is a fresh id (no Date.now
  // in module scope is fine here — it's an event handler, deterministic enough for a key).
  const groupSelection = () => {
    if (selectedIds.length < 2) return;
    const gid = `g_${Date.now()}_${selectedIds.length}`;
    const next = layers.map((l) => (selectedIds.includes(l.id) ? { ...l, groupId: gid } : l));
    void commitLayers(next);
  };
  const ungroupSelection = () => {
    const gids = new Set(selectedIds.map((id) => layers.find((l) => l.id === id)?.groupId).filter(Boolean) as string[]);
    if (!gids.size) return;
    const next = layers.map((l) => (l.groupId && gids.has(l.groupId) ? { ...l, groupId: undefined } : l));
    setEnteredGroupId(null);
    void commitLayers(next);
  };
  const addTextLayer = () => {
    const textCount = layers.filter((layer) => layer.kind === 'text').length;
    // 48px cascade (was 24px) so stacked headlines clear the ~34px text + underline
    // and read as distinct rows instead of piling up. Wraps every 8 via % 8.
    const cascade = textCount % 8;
    const next: Layer = {
      id: `l_text_${Date.now()}`,
      kind: 'text',
      name: 'Headline',
      textValue: 'New headline',
      font: 'Inter 800',
      opacity: 1,
      visible: true,
      locked: false,
      x: 48 + cascade * 48,
      y: 64 + cascade * 48,
      width: 300,
      height: 96,
    };
    setSelectedLayer(next.id);
    void commitLayers([next, ...layers], undefined, next.id);
  };
  // M-225/226: asset → card sink. Adds the dragged/clicked asset as an image layer with a
  // sensible non-zero size (M-214 rule): scale to ~42% of canvas width, keep the asset's
  // aspect, cap height. `atX/atY` (preview px) drop the layer under the cursor; otherwise it
  // lands centred. Stores src (presigned previewUrl) + assetId (durable, for reconciliation).
  const addAssetLayer = (detail: { assetId?: string; name?: string; previewUrl?: string | null; width?: number | null; height?: number | null } | null, atX?: number, atY?: number) => {
    if (!detail?.assetId || !card) return;
    const pv = canvasPreviewSize(card.ratio, card.widthPx, card.heightPx);
    const aspect = detail.width && detail.height && detail.width > 0 && detail.height > 0 ? detail.width / detail.height : 1;
    let w = Math.round(pv.w * 0.42);
    let h = Math.round(w / aspect);
    const maxH = Math.round(pv.h * 0.6);
    if (h > maxH) { h = maxH; w = Math.round(h * aspect); }
    w = Math.max(48, w);
    h = Math.max(48, h);
    const cx = atX ?? pv.w / 2;
    const cy = atY ?? pv.h / 2;
    const pos = clampPos(Math.round(cx - w / 2), Math.round(cy - h / 2), w, h, pv.w, pv.h);
    const next: Layer = {
      id: `l_asset_${detail.assetId}_${Date.now()}`,
      kind: 'asset',
      name: detail.name || 'Asset',
      assetName: detail.name || undefined,
      assetId: detail.assetId,
      src: detail.previewUrl || undefined,
      opacity: 1,
      visible: true,
      locked: false,
      x: pos.x,
      y: pos.y,
      width: w,
      height: h,
    };
    setSelectedLayer(next.id);
    void commitLayers([next, ...layers], undefined, next.id);
  };
  // Keep a live ref so the once-subscribed window listener always calls the latest closure
  // (fresh layers / card) without re-subscribing every render.
  addAssetLayerRef.current = addAssetLayer;
  if (loading) return <div className="h-dvh grid place-items-center text-[12.5px] text-muted-foreground">Loading card...</div>;
  if (error) return <div className="h-dvh grid place-items-center text-[12.5px] text-[var(--destructive)]">{error}</div>;
  if (!activeCard) return <div className="h-dvh grid place-items-center text-[12.5px] text-muted-foreground">No card selected.</div>;

  // Canvas preview box (matches CanvasFrame's scale). Used for off-canvas detection +
  // align-to-canvas in the Inspector so both speak the same preview-px coordinate space.
  const previewBox = canvasPreviewSize(activeCard.ratio, activeCard.widthPx, activeCard.heightPx);
  // M-083: Group enabled for a 2+ multi-selection; Ungroup when the selection contains a grouped layer.
  const canGroup = selectedIds.length >= 2;
  const canUngroup = selectedIds.some((id) => layers.find((l) => l.id === id)?.groupId);
  // M-215: reposition an off-canvas layer fully back inside the page rect (+ select it).
  const bringIntoView = (id: string) => {
    const l = layers.find((q) => q.id === id);
    if (!l) return;
    const box = resolveBox(l, previewBox.w, previewBox.h);
    const margin = 8;
    const x = Math.round(Math.min(Math.max(margin, box.x), Math.max(margin, previewBox.w - box.w - margin)));
    const y = Math.round(Math.min(Math.max(margin, box.y), Math.max(margin, previewBox.h - box.h - margin)));
    setSelectedLayer(id);
    patchLayer(id, { x, y });
  };

  return <div className="relative w-full h-dvh overflow-hidden bg-background text-foreground font-sans">
      <PaperBackdrop />
      <ExportDialog open={exportOpen} exporting={exporting} onClose={() => setExportOpen(false)} onExport={(req) => void handleExport(req)} />
      {toast && <div className="fixed top-[72px] right-5 z-50 max-w-sm bloome-card-hero px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 shadow-[0_8px_24px_rgba(12,10,15,0.12)]">
        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#F36440] shrink-0" />
        <span className="flex-1 text-[var(--foreground)]">{toast}</span>
      </div>}

      <div className="relative flex flex-col h-full min-h-0">
        {/* Top bar */}
        <header className="shrink-0 h-14 flex items-center px-5 gap-3 bg-card/80 backdrop-blur-sm border-b border-[color-mix(in_oklab,#0C0A0F_6%,transparent)]">
          <button onClick={onBack} className="text-[12px] text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ChevronLeft className="w-3.5 h-3.5" />
            {t('editor.backToLibrary')}
          </button>
          <span className="text-muted-foreground/40">/</span>
          <div className="flex items-baseline gap-2 min-w-0">
            <EditableTitle title={activeCard.title} onSave={(title) => onPatchCardMeta?.({ title })} />
            <select value={aspectPreset(activeCard.ratio, activeCard.widthPx, activeCard.heightPx)} onChange={(event) => void onPatchCardMeta?.({ ratio: event.target.value })} className="text-[10.5px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-muted border border-transparent hover:border-[var(--border-subtle)] outline-none">
              {ASPECT_PRESETS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
              {aspectPreset(activeCard.ratio, activeCard.widthPx, activeCard.heightPx) === 'Custom' && <option value="Custom">Custom</option>}
            </select>
            <span className="text-[10.5px] text-muted-foreground font-mono px-1.5 py-0.5 rounded bg-muted">{activeCard.widthPx}×{activeCard.heightPx}</span>
            <span className="text-[10px] uppercase tracking-wider font-bold text-[var(--primary)]">● {activeCard.status}</span>
          </div>
          <div className="flex-1" />
          <div className="hidden md:flex items-center gap-3 text-[10.5px] font-mono text-muted-foreground mr-2">
            <span className="inline-flex items-center gap-1">
              <Coins className="w-3 h-3" /> $0.04 today
            </span>
            <span className="opacity-50">·</span>
            <label className="inline-flex items-center gap-1" title={t('editor.palette.label')}>
              <PaletteIcon className="w-3 h-3" />
              <span className="not-sr-only">{t('editor.palette.label')}</span>
              <select value={activePaletteId ?? ''} onChange={e => onPaletteChange?.(e.target.value)} className="bg-transparent max-w-[150px] outline-none">
                <option value="">{t('editor.palette.canonical')}</option>
                {palettes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <button onClick={() => setExportOpen(true)} className="text-[12px] px-2.5 py-1.5 rounded-md hover:bg-muted text-muted-foreground inline-flex items-center gap-1.5">
            <Download className="w-3.5 h-3.5" /> {t('export.button')}
          </button>
          <button disabled={saving} onClick={onSaveDraft} className="text-[12px] px-2.5 py-1.5 rounded-md hover:bg-muted text-muted-foreground inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />} {saving ? t('editor.actions.saving') : t('editor.actions.saveDraft')}
          </button>
          <button disabled={saving} onClick={onDerive} className="text-[12px] px-2.5 py-1.5 rounded-md hover:bg-muted text-muted-foreground inline-flex items-center gap-1.5 disabled:opacity-50">
            {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <GitBranch className="w-3.5 h-3.5" />} {t('editor.actions.makeVariant')}
          </button>
          <button disabled={saving} onClick={onSaveReady} className="text-[12px] px-3 py-1.5 rounded-md bg-[var(--primary)] text-primary-foreground font-semibold inline-flex items-center gap-1.5 shadow-[0_1px_2px_rgba(12,10,15,0.08)] hover:opacity-90 transition-opacity disabled:opacity-50">
            <Send className="w-3.5 h-3.5" /> {t('editor.actions.publish')}
          </button>
        </header>

        {/* Main 3-column */}
        <div className="flex-1 flex min-h-0">

          {/* LEFT — Layers panel */}
          <aside className="w-[240px] shrink-0 flex flex-col bg-background/60 border-r border-[color-mix(in_oklab,#0C0A0F_5%,transparent)]">
            <div className="px-3 py-2.5 flex items-baseline justify-between">
              <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground inline-flex items-center gap-1.5">
                <LayersIcon className="w-3 h-3" />
                Layers
              </span>
              <button onClick={addTextLayer} className="text-[11px] text-[var(--primary)] hover:underline inline-flex items-center gap-0.5">
                <Plus className="w-3 h-3" /> add
              </button>
            </div>
            {/* M-083: visible Group / Ungroup (mirrors Ctrl/Cmd+G · Ctrl+Shift+G). Group needs
                2+ selected; Ungroup needs a grouped layer in the selection. */}
            <div className="px-2 pb-2 flex items-center gap-1">
              <button onClick={groupSelection} disabled={!canGroup} title={t('editor.layers.groupHint')} className="flex-1 min-h-8 inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border-subtle)] bg-white text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
                <Group className="w-3.5 h-3.5" /> {t('editor.layers.group')}
              </button>
              <button onClick={ungroupSelection} disabled={!canUngroup} title={t('editor.layers.ungroupHint')} className="flex-1 min-h-8 inline-flex items-center justify-center gap-1 rounded-md border border-[var(--border-subtle)] bg-white text-[11px] font-semibold text-foreground hover:bg-muted disabled:opacity-40 disabled:cursor-not-allowed">
                <Ungroup className="w-3.5 h-3.5" /> {t('editor.layers.ungroup')}
              </button>
            </div>
            {selectedIds.length > 1 && <div className="px-3 pb-1.5 text-[10px] font-mono text-muted-foreground">{t('editor.layers.selectedCount', { count: selectedIds.length })}</div>}
            <ul className="flex-1 overflow-auto px-1.5 space-y-0.5">
              {layers.map((l, index) => <LayerRow key={l.id} layer={l} isSelected={selectedIds.includes(l.id)} busy={layerBusy === l.id} canMoveUp={index > 0} canMoveDown={index < layers.length - 1} offCanvas={l.kind !== 'bg' && l.visible && isOffCanvas(resolveBox(l, previewBox.w, previewBox.h), previewBox.w, previewBox.h)} dragging={dragLayerId === l.id} dropPos={dropTarget?.id === l.id ? dropTarget.pos : null} onSelect={(additive) => (additive ? selectLayer(l.id, true) : setSelectedLayer(l.id))} onLocate={() => bringIntoView(l.id)} onToggleVisibility={() => toggleVisibility(l.id)} onToggleLock={() => toggleLock(l.id)} onMoveUp={() => moveLayer(l.id, -1)} onMoveDown={() => moveLayer(l.id, 1)} onDragStartRow={() => setDragLayerId(l.id)} onDragOverRow={(pos) => setDropTarget((prev) => (prev?.id === l.id && prev.pos === pos ? prev : { id: l.id, pos }))} onDropRow={() => { if (dragLayerId) reorderLayer(dragLayerId, l.id, dropTarget?.pos ?? 'above'); setDragLayerId(null); setDropTarget(null); }} onDragEndRow={() => { setDragLayerId(null); setDropTarget(null); }} />)}
            </ul>
            <div className="px-3 py-2 text-[10px] text-muted-foreground font-mono border-t border-[color-mix(in_oklab,#0C0A0F_5%,transparent)]">
              {layers.length} layers · drag to reorder
            </div>
          </aside>

          {/* CENTER — canvas */}
          <main className="flex-1 min-w-0 flex flex-col items-center justify-center p-8 overflow-auto bg-[#FAF7F1]">
            <CanvasFrame layers={layers} ratio={activeCard.ratio} widthPx={activeCard.widthPx} heightPx={activeCard.heightPx} title={activeCard.title} bg={activeCard.bg} fg={activeCard.fg} selectedIds={selectedIds} enteredGroupId={enteredGroupId} onSelectLayer={selectLayer} onEnterGroup={setEnteredGroupId} onMarqueeSelect={setSelectedIds} onPatchLayer={patchLayer} onMultiPatch={patchManyLayers} onLocateLayer={bringIntoView} onAddAssetAt={addAssetLayer} frameRef={canvasFrameRef} />
          </main>

          {/* RIGHT — agent / inspector toggle */}
          <aside className="w-[340px] shrink-0 flex flex-col bg-card border-l border-[color-mix(in_oklab,#0C0A0F_5%,transparent)]">
            {/* Tab toggle */}
            <div className="shrink-0 px-3 pt-3 flex items-center gap-1">
              <button onClick={() => setRightPanel('agent')} className={`flex-1 min-h-10 text-[11px] px-2 py-1.5 rounded-md inline-flex items-center justify-center gap-1.5 ${rightPanel === 'agent' ? 'bg-[var(--primary)]/[0.08] text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted'}`}>
                <Bot className="w-3.5 h-3.5 shrink-0" /> {t('editor.tabs.agent')}
              </button>
              <button onClick={() => setRightPanel('inspector')} className={`flex-1 min-h-10 text-[11px] px-2 py-1.5 rounded-md inline-flex items-center justify-center gap-1.5 ${rightPanel === 'inspector' ? 'bg-[var(--primary)]/[0.08] text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted'}`}>
                <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" /> {t('editor.tabs.inspector')}
              </button>
              <button onClick={() => setRightPanel('rules')} className={`flex-1 min-h-10 text-[11px] px-2 py-1.5 rounded-md inline-flex items-center justify-center gap-1.5 ${rightPanel === 'rules' ? 'bg-[var(--primary)]/[0.08] text-foreground font-semibold' : 'text-muted-foreground hover:bg-muted'}`}>
                <PaletteIcon className="w-3.5 h-3.5 shrink-0" /> {t('editor.tabs.rules')}
              </button>
            </div>

            {rightPanel === 'agent' ? <AgentPanel input={agentInput} setInput={setAgentInput} runs={agentRuns} onRun={onRunAgent} /> : rightPanel === 'rules' ? <RulesPanel report={activeCard.ruleReport ?? null} rules={activeRules} onSaveDraft={onSaveDraftAfterRules} /> : <InspectorPanel layer={layers.find(l => l.id === selectedLayer) ?? null} canvasW={previewBox.w} canvasH={previewBox.h} onAlign={(patch) => selectedLayer && patchLayer(selectedLayer, patch)} />}
          </aside>
        </div>

        {/* BOTTOM — derivatives strip */}
        <footer className={`absolute left-[240px] right-[340px] bottom-0 z-20 border-t border-[color-mix(in_oklab,#0C0A0F_6%,transparent)] bg-card/95 backdrop-blur-sm shadow-[0_-8px_24px_rgba(12,10,15,0.08)] transition-all ${derivOpen ? 'h-[200px]' : 'h-6'}`}>
          <button onClick={() => setDerivOpen(o => !o)} className="w-full h-6 flex items-center px-5 gap-2 hover:bg-muted/30 text-left">
            <GitBranch className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Variants ({activeDerivatives.length})</span>
            <div className="flex-1" />
            {derivOpen ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />}
          </button>
          {derivOpen && <div className="px-5 pb-3 overflow-x-auto h-[174px]">
              <ul className="flex items-stretch gap-2.5 min-w-0">
                {activeDerivatives.map(d => <li key={d.id} className="shrink-0"><DerivativeChip d={d} onOpen={() => onOpenDerivative?.(d.id)} /></li>)}
                <li className="shrink-0">
                  <button onClick={onDerive} className="bloome-card flex items-center justify-center w-[120px] h-[140px] border-dashed text-muted-foreground hover:bg-muted/40 hover:text-foreground transition-colors">
                    <div className="text-center">
                      <Plus className="w-5 h-5 mx-auto" />
                      <div className="text-[10px] mt-1 font-mono">Derive new</div>
                    </div>
                  </button>
                </li>
              </ul>
            </div>}
        </footer>
      </div>
    </div>;
};

/* ─────────────────────────── Layer row ─────────────────────────── */

const LayerRow = ({
  layer,
  isSelected,
  busy,
  canMoveUp,
  canMoveDown,
  offCanvas,
  dragging,
  dropPos,
  onSelect,
  onLocate,
  onToggleVisibility,
  onToggleLock,
  onMoveUp,
  onMoveDown,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow
}: {
  layer: Layer;
  isSelected: boolean;
  busy: boolean;
  canMoveUp: boolean;
  canMoveDown: boolean;
  offCanvas?: boolean;
  dragging?: boolean;
  dropPos?: 'above' | 'below' | null;
  onSelect: (additive: boolean) => void;
  onLocate?: () => void;
  onToggleVisibility: () => void;
  onToggleLock: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDragStartRow?: () => void;
  onDragOverRow?: (pos: 'above' | 'below') => void;
  onDropRow?: () => void;
  onDragEndRow?: () => void;
}) => {
  const Icon = LAYER_ICON[layer.kind];
  const { t } = useTranslation();
  return <li
      draggable
      onClick={(e) => onSelect(e.shiftKey || e.metaKey || e.ctrlKey)}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('application/x-magpie-layer', layer.id); onDragStartRow?.(); }}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; const r = e.currentTarget.getBoundingClientRect(); onDragOverRow?.(e.clientY < r.top + r.height / 2 ? 'above' : 'below'); }}
      onDrop={(e) => { e.preventDefault(); onDropRow?.(); }}
      onDragEnd={() => onDragEndRow?.()}
      className={`group relative flex items-center gap-1.5 px-2 py-1.5 rounded-md cursor-pointer transition-colors ${isSelected ? 'bg-[var(--primary)]/[0.08]' : 'hover:bg-muted/60'} ${dragging ? 'opacity-40' : ''}`}>
      {/* M-216: drop-position indicator while dragging a row to reorder */}
      {dropPos && <span className={`absolute left-1 right-1 h-0.5 rounded-full bg-[var(--primary)] ${dropPos === 'above' ? '-top-px' : '-bottom-px'}`} />}
      <GripVertical className="w-3 h-3 text-muted-foreground/40 shrink-0 cursor-grab" />
      {/* tiny thumb */}
      <span className="w-7 h-7 rounded shrink-0 grid place-items-center text-[8px] font-mono" style={{
      background: layer.thumbBg ?? (layer.kind === 'asset' && layer.thumbFg ? '#F7F5F1' : '#FFFFFF'),
      color: layer.thumbFg ?? '#0C0A0F',
      opacity: layer.visible ? 1 : 0.4
    }}>
        
        {layer.kind === 'text' ? 'Aa' : layer.kind === 'asset' ? <Icon className="w-3 h-3" /> : layer.kind === 'group' ? '◇' : null}
      </span>
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] truncate ${isSelected ? 'font-semibold' : 'font-medium'} ${!layer.visible ? 'text-muted-foreground' : ''}`}>
          {layer.name}
        </div>
        <div className="text-[9.5px] font-mono text-muted-foreground/80 truncate">
          {offCanvas ? <span className="text-[var(--accent)] font-semibold">{t('editor.layers.offCanvas')}</span> : <>
            {layer.kind === 'asset' && layer.assetName}
            {layer.kind === 'text' && layer.textValue}
            {layer.kind === 'bg' && layer.thumbBg}
          </>}
          {layer.opacity < 1 && <span> · {Math.round(layer.opacity * 100)}%</span>}
        </div>
      </div>
      {offCanvas && <button onClick={e => {
      e.stopPropagation();
      onLocate?.();
    }} className="p-1 rounded text-[var(--accent)] hover:bg-card" aria-label={t('editor.layers.bringIntoView')} title={t('editor.layers.bringIntoView')}>
        <Crosshair className="w-3.5 h-3.5" />
      </button>}
      {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      <button disabled={!canMoveUp} onClick={e => {
      e.stopPropagation();
      onMoveUp();
    }} className="p-0.5 rounded hover:bg-card text-muted-foreground disabled:opacity-30" aria-label="Move layer up">
        <ArrowUp className="w-3 h-3" />
      </button>
      <button disabled={!canMoveDown} onClick={e => {
      e.stopPropagation();
      onMoveDown();
    }} className="p-0.5 rounded hover:bg-card text-muted-foreground disabled:opacity-30" aria-label="Move layer down">
        <ArrowDown className="w-3 h-3" />
      </button>
      <button onClick={e => {
      e.stopPropagation();
      onToggleVisibility();
    }} className="p-0.5 rounded hover:bg-card text-muted-foreground" aria-label="Toggle visibility">
        
        {layer.visible ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
      </button>
      <button onClick={e => {
      e.stopPropagation();
      onToggleLock();
    }} className={`p-0.5 rounded hover:bg-card ${layer.locked ? 'text-[var(--accent)]' : 'text-muted-foreground/60'}`} aria-label="Toggle lock">
        
        {layer.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
      </button>
    </li>;
};

const EditableTitle = ({ title, onSave }: { title: string; onSave?: (title: string) => void | Promise<void> }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(title);
  useEffect(() => setDraft(title), [title]);
  const save = () => {
    const next = draft.trim() || title;
    setEditing(false);
    if (next !== title) void onSave?.(next);
  };
  if (editing) {
    return <input
      autoFocus
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={save}
      onKeyDown={(event) => {
        if (event.key === 'Enter') save();
        if (event.key === 'Escape') {
          setDraft(title);
          setEditing(false);
        }
      }}
      className="text-[13px] font-bold bg-white border border-[var(--border-subtle)] rounded px-1.5 py-0.5 outline-none max-w-[260px]"
    />;
  }
  return <button onClick={() => setEditing(true)} onDoubleClick={() => setEditing(true)} className="text-[13px] font-bold truncate max-w-[260px] text-left hover:underline" title={title}>{title}</button>;
};

/* ─────────────────────────── Canvas ─────────────────────────── */

const CanvasFrame = ({
  layers,
  ratio,
  widthPx,
  heightPx,
  title,
  bg,
  fg,
  selectedIds,
  enteredGroupId,
  onSelectLayer,
  onEnterGroup,
  onMarqueeSelect,
  onPatchLayer,
  onMultiPatch,
  onLocateLayer,
  onAddAssetAt,
  frameRef
}: {
  layers: Layer[];
  ratio: string;
  widthPx: number;
  heightPx: number;
  title: string;
  bg: string;
  fg: string;
  selectedIds: string[];
  enteredGroupId: string | null;
  onSelectLayer: (id: string, additive?: boolean) => void;
  onEnterGroup: (gid: string | null) => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPatchLayer: (id: string, patch: Partial<Layer>, title?: string) => void;
  onMultiPatch: (patches: Record<string, Partial<Layer>>) => void;
  onLocateLayer?: (id: string) => void;
  onAddAssetAt?: (detail: { assetId?: string; name?: string; previewUrl?: string | null; width?: number | null; height?: number | null } | null, atX: number, atY: number) => void;
  frameRef?: React.Ref<HTMLDivElement>;
}) => {
  const actual = actualSize(ratio, widthPx, heightPx);
  const maxW = 420;
  const maxH = 620;
  const scale = Math.min(maxW / actual.width, maxH / actual.height);
  const w = Math.round(actual.width * scale);
  const h = Math.round(actual.height * scale);
  // R6-editor (1)/(4): transient overlays — red snap guides + marquee rect. Cleared on mouseup.
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // M-225/226: true while an asset chip is dragged over the canvas (drop-target highlight).
  const [assetDragOver, setAssetDragOver] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);
  // Merge the export frameRef (Quill) with our own inner ref for marquee coordinate math.
  const setFrame = (node: HTMLDivElement | null) => {
    innerRef.current = node;
    if (typeof frameRef === 'function') frameRef(node);
    else if (frameRef) (frameRef as React.MutableRefObject<HTMLDivElement | null>).current = node;
  };
  // Resolve a layer's on-canvas box using the SAME defaults as the render below.
  const boxOf = (l: Layer) => resolveBox(l, w, h);
  const draggable = (l: Layer) => (l.kind === 'asset' || l.kind === 'text') && l.id !== 'l_asset_b' && !l.locked;
  const SNAP = 5;
  // R6-editor (1): snap one moving box against siblings + canvas center/edges. Returns the
  // snapped top-left + the guide coordinates that fired (empty when Alt disables snapping).
  const snapBox = (px: number, py: number, bw: number, bh: number, ignore: Set<string>, disable: boolean) => {
    if (disable) return { x: px, y: py, gx: [] as number[], gy: [] as number[] };
    const targetsX: number[] = [0, w / 2, w];
    const targetsY: number[] = [0, h / 2, h];
    for (const l of layers) {
      if (ignore.has(l.id) || l.kind === 'bg' || !l.visible) continue;
      const b = boxOf(l);
      targetsX.push(b.x, b.x + b.w / 2, b.x + b.w);
      targetsY.push(b.y, b.y + b.h / 2, b.y + b.h);
    }
    const pts = (start: number, size: number) => [start, start + size / 2, start + size];
    let bestX = { d: SNAP + 1, adj: 0, line: 0 };
    for (const p of pts(px, bw)) for (const t of targetsX) { const d = Math.abs(p - t); if (d < bestX.d) bestX = { d, adj: t - p, line: t }; }
    let bestY = { d: SNAP + 1, adj: 0, line: 0 };
    for (const p of pts(py, bh)) for (const t of targetsY) { const d = Math.abs(p - t); if (d < bestY.d) bestY = { d, adj: t - p, line: t }; }
    const sibs = layers.filter((l) => !ignore.has(l.id) && l.kind !== 'bg' && l.visible).map(boxOf);
    let gx = bestX.d <= SNAP ? [bestX.line] : [];
    let gy = bestY.d <= SNAP ? [bestY.line] : [];
    let outX = bestX.d <= SNAP ? px + bestX.adj : px;
    let outY = bestY.d <= SNAP ? py + bestY.adj : py;
    // R6-editor (1): equal-spacing — if a left + right neighbor exist on an axis, snap so the
    // gap to each is equal (the classic Canva "===" distribution guide). Only when edge/center
    // snap didn't already fire on that axis.
    if (bestX.d > SNAP) {
      const left = sibs.filter((b) => b.x + b.w <= px).sort((a, b) => (b.x + b.w) - (a.x + a.w))[0];
      const right = sibs.filter((b) => b.x >= px + bw).sort((a, b) => a.x - b.x)[0];
      if (left && right) {
        const target = (left.x + left.w + right.x - bw) / 2;
        if (Math.abs(target - px) <= SNAP) { outX = target; gx = [left.x + left.w, px, px + bw, right.x]; }
      }
    }
    if (bestY.d > SNAP) {
      const top = sibs.filter((b) => b.y + b.h <= py).sort((a, b) => (b.y + b.h) - (a.y + a.h))[0];
      const bot = sibs.filter((b) => b.y >= py + bh).sort((a, b) => a.y - b.y)[0];
      if (top && bot) {
        const target = (top.y + top.h + bot.y - bh) / 2;
        if (Math.abs(target - py) <= SNAP) { outY = target; gy = [top.y + top.h, py, py + bh, bot.y]; }
      }
    }
    return { x: outX, y: outY, gx, gy };
  };
  // R6-editor (4): proportional resize of a multi-selection. Drag a corner of the combined
  // bounding box → every selected layer's box (x,y,w,h) scales about the opposite corner by
  // the same factor, so relative layout is preserved. Corner-only (keeps aspect intuitive).
  const startGroupResize = (handle: 'nw' | 'ne' | 'se' | 'sw', event: React.PointerEvent<HTMLElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const ids = selectedIds.slice();
    const starts = new Map<string, { x: number; y: number; w: number; h: number }>();
    for (const id of ids) { const l = layers.find((q) => q.id === id); if (l) starts.set(id, boxOf(l)); }
    const boxes = [...starts.values()];
    if (boxes.length < 2) return;
    const bx = Math.min(...boxes.map((b) => b.x));
    const by = Math.min(...boxes.map((b) => b.y));
    const bw = Math.max(...boxes.map((b) => b.x + b.w)) - bx;
    const bh = Math.max(...boxes.map((b) => b.y + b.h)) - by;
    // anchor = the corner opposite the dragged handle (stays fixed)
    const anchorX = handle.includes('w') ? bx + bw : bx;
    const anchorY = handle.includes('n') ? by + bh : by;
    const startX = event.clientX;
    const startY = event.clientY;
    const nodes = ids.map((id) => innerRef.current?.querySelector(`[data-layer-id="${id}"]`) as HTMLElement | null);
    let frame = 0;
    let scale = 1;
    const paint = () => {
      frame = 0;
      ids.forEach((id, i) => {
        const n = nodes[i]; const b = starts.get(id); if (!n || !b) return;
        const nx = anchorX + (b.x - anchorX) * scale;
        const ny = anchorY + (b.y - anchorY) * scale;
        n.style.transformOrigin = 'top left';
        n.style.transform = `translate(${nx - b.x}px, ${ny - b.y}px) scale(${scale})`;
      });
    };
    const compute = (m: PointerEvent) => {
      const dx = (m.clientX - startX) * (handle.includes('w') ? -1 : 1);
      const dy = (m.clientY - startY) * (handle.includes('n') ? -1 : 1);
      const sx = (bw + dx) / Math.max(1, bw);
      const sy = (bh + dy) / Math.max(1, bh);
      return Math.max(0.1, Math.min(sx, sy)); // uniform scale = min, keeps aspect
    };
    const move = (m: PointerEvent) => { scale = compute(m); if (!frame) frame = window.requestAnimationFrame(paint); };
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      if (frame) window.cancelAnimationFrame(frame);
      nodes.forEach((n) => { if (n) { n.style.transform = ''; n.style.transformOrigin = ''; } });
      scale = compute(m);
      if (scale === 1) return;
      const patches: Record<string, Partial<Layer>> = {};
      for (const id of ids) {
        const b = starts.get(id); if (!b) continue;
        patches[id] = {
          x: Math.round(anchorX + (b.x - anchorX) * scale),
          y: Math.round(anchorY + (b.y - anchorY) * scale),
          width: Math.max(32, Math.round(b.w * scale)),
          height: Math.max(32, Math.round(b.h * scale)),
        };
      }
      onMultiPatch(patches);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  // Marquee select: pointerdown on empty canvas → rubber-band → select covered draggable layers.
  const startMarquee = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.target !== innerRef.current) return; // only when clicking bare canvas
    const rect = innerRef.current.getBoundingClientRect();
    const ox = event.clientX - rect.left;
    const oy = event.clientY - rect.top;
    const move = (m: PointerEvent) => {
      const cx = Math.max(0, Math.min(w, m.clientX - rect.left));
      const cy = Math.max(0, Math.min(h, m.clientY - rect.top));
      setMarquee({ x: Math.min(ox, cx), y: Math.min(oy, cy), w: Math.abs(cx - ox), h: Math.abs(cy - oy) });
    };
    const up = (m: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      const cx = Math.max(0, Math.min(w, m.clientX - rect.left));
      const cy = Math.max(0, Math.min(h, m.clientY - rect.top));
      const r = { x: Math.min(ox, cx), y: Math.min(oy, cy), w: Math.abs(cx - ox), h: Math.abs(cy - oy) };
      setMarquee(null);
      onEnterGroup(null); // clicking bare canvas exits any entered group
      if (r.w < 4 && r.h < 4) { onMarqueeSelect([]); return; } // a bare click clears selection
      const hit = layers.filter((l) => draggable(l)).filter((l) => {
        const b = boxOf(l);
        return b.x < r.x + r.w && b.x + b.w > r.x && b.y < r.y + r.h && b.y + b.h > r.y;
      }).map((l) => l.id);
      onMarqueeSelect(hit);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up, { once: true });
  };
  return <div className="relative">
      {/* Outer pseudo-frame ruler */}
      <div className="absolute -top-5 -left-5 -right-5 -bottom-5 pointer-events-none">
        <CanvasRuler ratio={ratio} />
      </div>

      <div ref={setFrame} onPointerDown={startMarquee}
        // M-225/226: canvas as a drop-target for asset chips dragged from the Asset Library /
        // Agent panel. Read the shared mime, drop the asset as an image layer at the cursor.
        onDragOver={(event) => {
          if (!onAddAssetAt || !Array.from(event.dataTransfer.types).includes(ASSET_DRAG_MIME)) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = 'copy';
          if (!assetDragOver) setAssetDragOver(true);
        }}
        onDragLeave={(event) => { if (event.target === innerRef.current) setAssetDragOver(false); }}
        onDrop={(event) => {
          const raw = event.dataTransfer.getData(ASSET_DRAG_MIME);
          setAssetDragOver(false);
          if (!raw || !onAddAssetAt) return;
          event.preventDefault();
          const rect = innerRef.current?.getBoundingClientRect();
          const x = rect ? event.clientX - rect.left : w / 2;
          const y = rect ? event.clientY - rect.top : h / 2;
          try { onAddAssetAt(JSON.parse(raw), x, y); } catch { /* ignore malformed payload */ }
        }}
        className={`relative overflow-hidden bloome-card-hero ${assetDragOver ? 'outline outline-2 outline-dashed outline-[var(--primary)] outline-offset-2' : ''}`} style={{
      width: w,
      height: h,
      background: bg
    }}>
        
        {/* The composed card preview, layer by layer (bottom-up) */}
        {[...layers].reverse().map(l => {
        if (!l.visible) return null;
        if (l.kind === 'bg') {
          // data-card-bg-layer: export's transparent-PNG mode filters this out.
          return <div key={l.id} data-card-bg-layer className="absolute inset-0" style={{
            background: l.thumbBg,
            opacity: l.opacity
          }} />;
        }
        const { x, y, w: lw, h: lh } = resolveBox(l, w, h);
        const selected = selectedIds.includes(l.id);
        const soloSelected = selected && selectedIds.length === 1;
        const clampSize = (value: number) => Math.max(32, Math.round(value));
        const startResize = (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => {
          if (l.locked || (l.kind !== 'asset' && l.kind !== 'text')) return;
          event.preventDefault();
          event.stopPropagation();
          onSelectLayer(l.id);
          const startX = event.clientX;
          const startY = event.clientY;
          const startLayer = { x, y, width: lw, height: lh };
          const aspect = lw / Math.max(1, lh);
          const parent = event.currentTarget.parentElement as HTMLElement | null;
          let frame = 0;
          let pending: ReturnType<typeof resizeBox> | null = null;
          const paint = () => {
            frame = 0;
            if (!parent || !pending) return;
            parent.style.transform = `translate3d(${pending.x - startLayer.x}px, ${pending.y - startLayer.y}px, 0)`;
            parent.style.width = `${clampSize(pending.width)}px`;
            parent.style.height = `${clampSize(pending.height)}px`;
          };
          const move = (moveEvent: PointerEvent) => {
            const pointer = moveEvent as PointerEvent;
            pending = resizeBox(startLayer, handle, pointer.clientX - startX, pointer.clientY - startY, pointer.shiftKey, aspect);
            if (!frame) frame = window.requestAnimationFrame(paint);
          };
          const up = (upEvent: PointerEvent) => {
            const pointer = upEvent as PointerEvent;
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (frame) window.cancelAnimationFrame(frame);
            if (parent) parent.style.transform = '';
            const next = resizeBox(startLayer, handle, pointer.clientX - startX, pointer.clientY - startY, pointer.shiftKey, aspect);
            const patch = { x: next.x, y: next.y, width: clampSize(next.width), height: clampSize(next.height) };
            if (patch.x !== x || patch.y !== y || patch.width !== lw || patch.height !== lh) onPatchLayer(l.id, patch);
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up, { once: true });
        };
        const startDrag = (event: React.PointerEvent<HTMLElement | SVGSVGElement>) => {
          if (event.target instanceof HTMLElement && event.target.dataset.resizeHandle) return;
          if (l.locked || (l.kind !== 'asset' && l.kind !== 'text')) return;
          event.preventDefault();
          // R6-editor (4): decide what moves. If this layer is already selected (multi),
          // drag the whole selection; if it's grouped (and we haven't entered the group),
          // drag the group; otherwise pick just this layer (Shift adds to selection).
          const alreadySelected = selectedIds.includes(l.id);
          // M-083: when we've double-clicked INTO this layer's group, a press targets the single
          // member (move it alone); outside an entered group a grouped layer drags the whole group.
          const inEnteredGroup = !!l.groupId && l.groupId === enteredGroupId;
          const grp = (l.groupId && l.groupId !== enteredGroupId)
            ? layers.filter((g) => g.groupId === l.groupId).map((g) => g.id) : null;
          if (inEnteredGroup ? (selectedIds.length !== 1 || !alreadySelected) : !alreadySelected) onSelectLayer(l.id, event.shiftKey);
          const movingIds = inEnteredGroup ? [l.id]
            : (alreadySelected && selectedIds.length > 1) ? selectedIds.slice()
            : grp ? grp : [l.id];
          document.body.style.cursor = 'grabbing';
          const startX = event.clientX;
          const startY = event.clientY;
          const starts = new Map<string, { x: number; y: number; w: number; h: number }>();
          for (const id of movingIds) { const ml = layers.find((q) => q.id === id); if (ml) starts.set(id, boxOf(ml)); }
          const boxes = [...starts.values()];
          const gx0 = Math.min(...boxes.map((b) => b.x));
          const gy0 = Math.min(...boxes.map((b) => b.y));
          const gw = Math.max(...boxes.map((b) => b.x + b.w)) - gx0;
          const gh = Math.max(...boxes.map((b) => b.y + b.h)) - gy0;
          const nodes = movingIds.map((id) => innerRef.current?.querySelector(`[data-layer-id="${id}"]`) as HTMLElement | null);
          nodes.forEach((n) => { if (n) n.style.cursor = 'grabbing'; });
          let frame = 0;
          let applied = { dx: 0, dy: 0 };
          const paint = () => {
            frame = 0;
            nodes.forEach((n) => { if (n) n.style.transform = `translate3d(${applied.dx}px, ${applied.dy}px, 0)`; });
          };
          const computeSnap = (m: PointerEvent) => snapBox(gx0 + (m.clientX - startX), gy0 + (m.clientY - startY), gw, gh, new Set(movingIds), m.altKey);
          const move = (m: PointerEvent) => {
            const s = computeSnap(m);
            applied = { dx: s.x - gx0, dy: s.y - gy0 };
            setGuides({ x: s.gx, y: s.gy });
            if (!frame) frame = window.requestAnimationFrame(paint);
          };
          const up = (m: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (frame) window.cancelAnimationFrame(frame);
            nodes.forEach((n) => { if (n) { n.style.transform = ''; n.style.cursor = ''; } });
            document.body.style.cursor = '';
            setGuides({ x: [], y: [] });
            const s = computeSnap(m);
            const ddx = s.x - gx0;
            const ddy = s.y - gy0;
            if (ddx === 0 && ddy === 0) return;
            if (movingIds.length === 1) {
              const b = starts.get(movingIds[0])!;
              onPatchLayer(movingIds[0], clampPos(b.x + ddx, b.y + ddy, b.w, b.h, w, h));
            } else {
              const patches: Record<string, Partial<Layer>> = {};
              for (const id of movingIds) { const b = starts.get(id); if (!b) continue; const p = clampPos(b.x + ddx, b.y + ddy, b.w, b.h, w, h); patches[id] = { x: p.x, y: p.y }; }
              onMultiPatch(patches);
            }
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up, { once: true });
        };
        if (l.kind === 'asset' && l.id === 'l_asset_b') {
          // big light B watermark
          return <div key={l.id} className="absolute inset-0 flex items-end justify-center" style={{
            opacity: l.opacity
          }}>
                <span className="text-[500px] font-[900] leading-[0.8] text-white" style={{
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '-30px'
            }}>b</span>
              </div>;
        }
        if (l.kind === 'asset' && l.id === 'l_asset_bird') {
          // matisse bird
          return <div key={l.id} data-layer-id={l.id} onPointerDown={startDrag} onDoubleClick={() => { if (l.groupId) onEnterGroup(l.groupId); }} className={`absolute ${l.locked ? '' : 'cursor-grab'} ${soloSelected ? 'outline outline-1 outline-[#2556B6]' : ''}`} style={{
            left: x,
            top: y,
            width: lw,
            height: lh,
            opacity: l.opacity,
            touchAction: 'none'
          }}>
            <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
                <path d="M 30 100 Q 50 60 110 70 L 150 50 L 165 75 Q 175 80 165 95 L 170 110 L 150 130 Q 110 140 80 130 L 50 145 Z" fill={fg} stroke="#0C0A0F" strokeWidth="3" strokeLinejoin="round" />
                <circle cx="148" cy="78" r="2.5" fill="#0C0A0F" />
              </svg>
            {soloSelected && <ResizeHandles onResize={startResize} />}
          </div>;
        }
        if (l.kind === 'text') {
          return <EditableTextLayer key={l.id} layer={l} title={title} selected={soloSelected} x={x} y={y} width={lw} height={lh} onPointerDown={startDrag} onResize={startResize} onSave={(value) => onPatchLayer(l.id, { textValue: value })} />;
        }
        if (l.kind === 'asset') {
          return <div key={l.id} data-layer-id={l.id} onPointerDown={startDrag} onDoubleClick={() => { if (l.groupId) onEnterGroup(l.groupId); }} className={`absolute grid place-items-center ${l.locked ? '' : 'cursor-grab'} ${soloSelected ? 'outline outline-1 outline-[#2556B6]' : ''}`} style={{
            left: x,
            top: y,
            width: lw,
            height: lh,
            opacity: l.opacity,
            touchAction: 'none'
          }}>
              {/* M-225/226: real asset image (presigned previewUrl) when present, else placeholder. */}
              {l.src
                ? <img src={l.src} alt={l.name} draggable={false} className="absolute inset-0 w-full h-full object-contain pointer-events-none" style={{ outline: '1px solid rgba(0,0,0,0.1)' }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : <ImageIcon className="w-10 h-10 text-white/80" />}
              {soloSelected && <ResizeHandles onResize={startResize} />}
              </div>;
        }
        return null;
      })}

        {/* R6-editor (4): combined bounding box when 2+ layers are selected */}
        {selectedIds.length > 1 && (() => {
          const boxes = selectedIds.map((id) => layers.find((l) => l.id === id)).filter(Boolean).map((l) => boxOf(l as Layer));
          if (!boxes.length) return null;
          const bx = Math.min(...boxes.map((b) => b.x));
          const by = Math.min(...boxes.map((b) => b.y));
          const bw = Math.max(...boxes.map((b) => b.x + b.w)) - bx;
          const bh = Math.max(...boxes.map((b) => b.y + b.h)) - by;
          const corners: Array<{ id: 'nw' | 'ne' | 'se' | 'sw'; cls: string; cursor: string }> = [
            { id: 'nw', cls: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
            { id: 'ne', cls: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
            { id: 'se', cls: '-right-1.5 -bottom-1.5', cursor: 'nwse-resize' },
            { id: 'sw', cls: '-left-1.5 -bottom-1.5', cursor: 'nesw-resize' },
          ];
          return <div className="absolute border border-dashed border-[#2556B6]" style={{ left: bx, top: by, width: bw, height: bh, pointerEvents: 'none' }}>
            {corners.map((c) => <span key={c.id} onPointerDown={(e) => startGroupResize(c.id, e)} className={`absolute z-20 w-3 h-3 rounded-full bg-white border border-[#2556B6] shadow-sm ${c.cls}`} style={{ cursor: c.cursor, pointerEvents: 'auto' }} />)}
          </div>;
        })()}

        {/* R6-editor (1): red snap guides (cleared on pointerup) */}
        {guides.x.map((gx, i) => <div key={`gx${i}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: gx, width: 1, background: '#F36440' }} />)}
        {guides.y.map((gy, i) => <div key={`gy${i}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: gy, height: 1, background: '#F36440' }} />)}

        {/* R6-editor (4): marquee rubber-band */}
        {marquee && <div className="absolute pointer-events-none border border-[#2556B6] bg-[#2556B6]/10" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}

        {/* M-215: off-canvas layers are clipped by the export frame, so we surface a clickable
            marker pinned to the nearest edge (with the layer name). Click = bring it back in. */}
        {layers.map((l) => {
          if (l.kind === 'bg' || !l.visible) return null;
          const b = boxOf(l);
          if (!isOffCanvas(b, w, h)) return null;
          const cx = b.x + b.w / 2;
          const cy = b.y + b.h / 2;
          const px = Math.max(12, Math.min(w - 12, cx));
          const py = Math.max(12, Math.min(h - 12, cy));
          return <button key={`oc-${l.id}`} data-offcanvas-marker={l.id} onPointerDown={(e) => e.stopPropagation()} onClick={(e) => { e.stopPropagation(); onLocateLayer?.(l.id); }} className="absolute z-30 -translate-x-1/2 -translate-y-1/2 inline-flex items-center gap-1 max-w-[130px] rounded-full border border-dashed border-white/70 bg-[#0C0A0F]/80 px-1.5 py-0.5 text-[9px] font-mono text-white shadow-sm hover:bg-[#0C0A0F]" style={{ left: px, top: py }} title={l.name}>
            <Crosshair className="w-2.5 h-2.5 shrink-0" />
            <span className="truncate">{l.name}</span>
          </button>;
        })}
      </div>

      <div className="text-center mt-3 text-[10.5px] font-mono text-muted-foreground">
        Canvas · {w}×{h}px preview · actual {actual.width}×{actual.height}
      </div>
    </div>;
};

const EditableTextLayer = ({
  layer,
  title,
  selected,
  x,
  y,
  width,
  height,
  onPointerDown,
  onResize,
  onSave
}: {
  layer: Layer;
  title: string;
  selected: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
  onResize: (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => void;
  onSave: (value: string) => void;
}) => {
  const [editing, setEditing] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const value = layer.textValue || title || 'Headline';
  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      document.execCommand('selectAll', false);
    }
  }, [editing]);
  const save = () => {
    const next = ref.current?.innerText.trim() || value;
    setEditing(false);
    if (next !== value) onSave(next);
  };
  // M-083: selection happens in startDrag (pointerdown), exactly like asset layers — a
  // separate onClick=onSelect here re-toggled the just-added shift-selection back off, which
  // is why canvas shift-click multi-select never accumulated for text layers.
  return <div data-layer-id={layer.id} onPointerDown={editing ? undefined : onPointerDown} onDoubleClick={() => !layer.locked && setEditing(true)} className={`absolute ${layer.locked ? '' : 'cursor-grab'} ${selected ? 'outline outline-1 outline-[#2556B6]' : ''}`} style={{ left: x, top: y, width, height, opacity: layer.opacity, touchAction: 'none' }}>
    <div ref={ref} contentEditable={editing} suppressContentEditableWarning onBlur={save} onKeyDown={(event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        save();
      }
      if (event.key === 'Escape') setEditing(false);
    }} className={`text-white font-[800] leading-[1.05] outline-none block w-full ${editing ? 'bg-white/15 rounded px-1' : ''}`} style={{
      fontFamily: 'Inter, sans-serif',
      // M-220: per-layer font size (canvas-preview px); default 34. M-218: text alignment.
      fontSize: layer.fontSize ?? 34,
      textAlign: layer.textAlign ?? 'left',
      // R5 (a): decoration is per-layer, default 'none' (no line). Native CSS
      // text-decoration auto-tracks the text width — no more fixed 120px SVG squiggle.
      textDecorationLine: layer.decoration && layer.decoration !== 'none' ? 'underline' : 'none',
      textDecorationStyle:
        layer.decoration === 'wavy' ? 'wavy' :
        layer.decoration === 'dashed' ? 'dashed' :
        layer.decoration === 'dotted' ? 'dotted' : 'solid',
      textDecorationColor: layer.decorationColor ?? '#F36440',
      textDecorationThickness: '2.5px',
      textUnderlineOffset: '6px',
    }}>
      {value}
    </div>
    {selected && !editing && <ResizeHandles onResize={onResize} />}
  </div>;
};

type ResizeHandle = 'nw' | 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w';

const HANDLE_POSITIONS: Array<{ id: ResizeHandle; className: string; cursor: string }> = [
  { id: 'nw', className: '-left-1.5 -top-1.5', cursor: 'nwse-resize' },
  { id: 'n', className: 'left-1/2 -translate-x-1/2 -top-1.5', cursor: 'ns-resize' },
  { id: 'ne', className: '-right-1.5 -top-1.5', cursor: 'nesw-resize' },
  { id: 'e', className: '-right-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
  { id: 'se', className: '-right-1.5 -bottom-1.5', cursor: 'nwse-resize' },
  { id: 's', className: 'left-1/2 -translate-x-1/2 -bottom-1.5', cursor: 'ns-resize' },
  { id: 'sw', className: '-left-1.5 -bottom-1.5', cursor: 'nesw-resize' },
  { id: 'w', className: '-left-1.5 top-1/2 -translate-y-1/2', cursor: 'ew-resize' },
];

const ResizeHandles = ({ onResize }: { onResize: (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => void }) => <>
  {HANDLE_POSITIONS.map((handle) => <span
    key={handle.id}
    data-resize-handle={handle.id}
    onPointerDown={(event) => onResize(handle.id, event)}
    className={`absolute z-20 w-3 h-3 rounded-full bg-white border border-[#2556B6] shadow-sm ${handle.className}`}
    style={{ cursor: handle.cursor }}
  />)}
</>;

// R5 (b): how far an element may hang off any edge (canvas-preview px). Canva-style
// bleed — symmetric on all four sides; export clips to the page rect (canvas is
// overflow-hidden). The old bug clamped only the lower bound (max(0), no min).
const DRAG_BLEED = 80;

function clampPos(px: number, py: number, elW: number, elH: number, canvasW: number, canvasH: number) {
  return {
    x: Math.min(canvasW - elW + DRAG_BLEED, Math.max(-DRAG_BLEED, Math.round(px))),
    y: Math.min(canvasH - elH + DRAG_BLEED, Math.max(-DRAG_BLEED, Math.round(py))),
  };
}

function resizeBox(
  box: { x: number; y: number; width: number; height: number },
  handle: ResizeHandle,
  dx: number,
  dy: number,
  keepAspect: boolean,
  aspect: number
) {
  let { x, y, width, height } = box;
  if (handle.includes('e')) width += dx;
  if (handle.includes('s')) height += dy;
  if (handle.includes('w')) {
    width -= dx;
    x += dx;
  }
  if (handle.includes('n')) {
    height -= dy;
    y += dy;
  }
  width = Math.max(32, width);
  height = Math.max(32, height);
  if (keepAspect) {
    if (handle === 'n' || handle === 's') width = height * aspect;
    else height = width / Math.max(0.1, aspect);
  }
  // Symmetric soft bound on position too (was max(0)): a left/top resize may bleed off-edge.
  return { x: Math.round(Math.max(-DRAG_BLEED, x)), y: Math.round(Math.max(-DRAG_BLEED, y)), width: Math.round(width), height: Math.round(height) };
}

// Canvas preview box: the on-screen size the card is scaled to fit (must match CanvasFrame).
const CANVAS_MAX_W = 420;
const CANVAS_MAX_H = 620;
function canvasPreviewSize(ratio: string, widthPx: number, heightPx: number): { w: number; h: number } {
  const actual = actualSize(ratio, widthPx, heightPx);
  const scale = Math.min(CANVAS_MAX_W / actual.width, CANVAS_MAX_H / actual.height);
  return { w: Math.round(actual.width * scale), h: Math.round(actual.height * scale) };
}
// M-214: treat a missing OR non-positive dimension as "use the sensible default" so
// agent-added layers that arrive with width/height 0 still render at a usable size.
const dim = (value: number | undefined, fallback: number) =>
  typeof value === 'number' && value > 0 ? value : fallback;
// Single source of truth for a layer's on-canvas box (preview px). Used by the canvas
// render, drag/snap math, off-canvas detection, the Inspector readout, and align-to-canvas.
function resolveBox(l: Layer, w: number, h: number): { x: number; y: number; w: number; h: number } {
  return {
    x: l.x ?? (l.id === 'l_asset_bird' ? 80 : 24),
    y: l.y ?? (l.kind === 'text' ? h - 150 : l.id === 'l_asset_bird' ? 200 : 0),
    w: dim(l.width, l.kind === 'text' ? w - 48 : 220),
    h: dim(l.height, l.kind === 'text' ? 110 : 220),
  };
}
// M-215: a layer counts as off-canvas (hard to see / "disappeared") when its CENTRE
// falls outside the page rect — a partially-bleeding layer is still findable.
function isOffCanvas(box: { x: number; y: number; w: number; h: number }, w: number, h: number): boolean {
  const cx = box.x + box.w / 2;
  const cy = box.y + box.h / 2;
  return cx < 0 || cx > w || cy < 0 || cy > h;
}

function actualSize(ratio: string, widthPx: number, heightPx: number): { width: number; height: number } {
  if (ratio === '1:1') return { width: 1080, height: 1080 };
  if (ratio === '9:16') return { width: 1080, height: 1920 };
  if (ratio === '16:9') return { width: 1920, height: 1080 };
  if (ratio === '4:5') return { width: 1080, height: 1350 };
  if (ratio === '3:4') return { width: 1080, height: 1440 };
  if (ratio === '1.91:1') return { width: 1200, height: 628 };
  return { width: widthPx, height: heightPx };
}

// Aspect preset options shown in the toolbar select.
const ASPECT_PRESETS = ['1:1', '16:9', '9:16', '4:5', '3:4'] as const;

// R5.5 (1): derive the displayed preset so the select tracks the canvas's real
// ratio. R4 persists the card as ratio='custom' + width/height, so on reload we
// reverse-map width/height back to a named preset (within tolerance) or fall
// back to 'Custom' — keeping select.value consistent with the rendered canvas.
function aspectPreset(ratio: string, widthPx: number, heightPx: number): string {
  if ((ASPECT_PRESETS as readonly string[]).includes(ratio)) return ratio;
  const actual = actualSize(ratio, widthPx, heightPx);
  if (!actual.height) return 'Custom';
  const r = actual.width / actual.height;
  const match = ASPECT_PRESETS.find((preset) => {
    const dims = actualSize(preset, 0, 0);
    return Math.abs(r - dims.width / dims.height) < 0.01;
  });
  return match ?? 'Custom';
}
const CanvasRuler = ({
  ratio
}: {
  ratio: string;
}) => <svg className="w-full h-full" aria-hidden>
    <defs>
      <pattern id="ruler-tick-h" x="0" y="0" width="40" height="6" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="0" y2="6" stroke="#0C0A0F" strokeOpacity="0.18" strokeWidth="1" />
      </pattern>
      <pattern id="ruler-tick-v" x="0" y="0" width="6" height="40" patternUnits="userSpaceOnUse">
        <line x1="0" y1="0" x2="6" y2="0" stroke="#0C0A0F" strokeOpacity="0.18" strokeWidth="1" />
      </pattern>
    </defs>
    <rect x="20" y="0" width="calc(100% - 40px)" height="6" fill="url(#ruler-tick-h)" />
    <rect x="20" y="0" width="6" height="100%" fill="url(#ruler-tick-v)" />
  </svg>;

/* ─────────────────────────── Right: Agent panel ─────────────────────────── */

const AgentPanel = ({
  input,
  setInput,
  runs,
  onRun,
  sessionName
}: {
  input: string;
  setInput: (v: string) => void;
  runs: AgentRunView[];
  onRun?: (prompt: string) => void;
  sessionName?: string | null;
}) => {
  const latest = runs[0] ?? null;
  const [zoom, setZoom] = useState<NonNullable<AgentRunView['producedAssets']>[number] | null>(null);
  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;
    onRun?.(prompt);
    setInput('');
  };
  return <div className="flex-1 flex flex-col min-h-0 px-3 py-3 gap-3 overflow-auto">
    {/* Session header */}
    <div className="flex items-baseline justify-between">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Session</div>
        <div className="text-[13px] font-semibold leading-tight mt-0.5">{sessionName ?? 'New session'}</div>
      </div>
    </div>

    {/* Omnibar */}
    <form className="bloome-card p-1.5 flex items-center gap-1.5" onSubmit={submit}>
      <Search className="w-3.5 h-3.5 ml-1 text-muted-foreground shrink-0" />
      <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ask the agent to add or change…" className="flex-1 bg-transparent text-[13px] focus:outline-none placeholder:text-muted-foreground/70" />
    
      <button type="submit" className="p-1.5 rounded-md bg-[var(--primary)] text-primary-foreground" aria-label="Run">
        <ArrowRight className="w-3 h-3" />
      </button>
    </form>

    {/* Active plan or empty state */}
    {latest ? <div className="bloome-card overflow-hidden">
      <div className="px-3 py-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">Plan</span>
        <span className="text-[10px] font-mono text-muted-foreground">{`${latest.status} · ${formatMicros(latest.costMicros ?? 0)}`}</span>
      </div>
      <div className="px-3 pb-2 text-[12px] text-foreground leading-relaxed">
        <span className="italic text-muted-foreground">"{latest.prompt}"</span>
      </div>
      {latest.steps && latest.steps.length > 0 && <ul className="px-3 pb-2 space-y-1 text-[11.5px]">
        {latest.steps.slice(0, 8).map((step, index) => <li key={`${step.name}-${index}`} className="grid grid-cols-[14px_1fr_auto] gap-1.5 items-baseline">
          {step.status === 'running' ? <Loader2 className="w-3 h-3 text-[var(--primary)] animate-spin self-center" /> : step.status === 'error' ? <AlertCircle className="w-3 h-3 text-[var(--destructive)] self-center" /> : <CheckCircle2 className="w-3 h-3 text-[var(--success)] self-center" />}
          <span><code className="font-mono">{step.name}</code></span>
          <span className="text-[10px] font-mono text-muted-foreground">{step.status === 'running' ? '...' : step.status}</span>
        </li>)}
      </ul>}
      {latest.producedAssets && latest.producedAssets.length > 0 && <ProducedAssetStrip assets={latest.producedAssets} onZoom={setZoom} />}
      {latest.outputText && <div className="border-t border-[color-mix(in_oklab,#0C0A0F_6%,transparent)] px-3 py-2 text-[12px] text-foreground leading-relaxed whitespace-pre-wrap">
        {latest.outputText}
      </div>}
    </div> : <div className="bloome-card px-3 py-4 text-center text-[12px] text-muted-foreground">
      Ask Magpie above to start. The plan, tool calls and reply will appear here.
    </div>}

    {/* Recent runs */}
    {runs.length > 1 && <div>
      <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-1.5">
        Recent in this session
      </div>
      <ul className="space-y-1">
        {runs.slice(1).map(r => <li key={r.id} className="px-2 py-1.5 rounded-md hover:bg-muted/40">
            <div className="text-[11.5px] truncate" title={r.prompt}>"{r.prompt}"</div>
            <div className="text-[9.5px] font-mono text-muted-foreground mt-0.5">{r.status} · {formatMicros(r.costMicros ?? 0)}</div>
            {r.producedAssets && r.producedAssets.length > 0 && <ProducedAssetStrip assets={r.producedAssets} onZoom={setZoom} compact />}
          </li>)}
      </ul>
    </div>}
    {zoom && <AssetZoom asset={zoom} onClose={() => setZoom(null)} />}
  </div>;
};

/* Thumbnails of the assets the agent produced/selected this run (M-225). Each ready thumb is
   draggable onto the canvas (Lumen's drop target reads the ASSET_DRAG_MIME payload) and offers
   an explicit "Add" button (broadcasts magpie:add-asset-to-card) as the non-drag path. Pending
   assets (bytes not yet in R2) show a spinner until the async generate finishes (M-102). */
const ProducedAssetStrip = ({ assets, onZoom, compact = false }: {
  assets: NonNullable<AgentRunView['producedAssets']>;
  onZoom: (asset: NonNullable<AgentRunView['producedAssets']>[number]) => void;
  compact?: boolean;
}) => <div className={compact ? 'mt-1.5' : 'px-3 pb-2.5'}>
    {!compact && <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">Produced · {assets.length}</div>}
    <div className={`grid gap-1.5 ${compact ? 'grid-cols-6' : 'grid-cols-3'}`}>
      {assets.map(asset => <ProducedAssetThumb key={asset.id} asset={asset} onZoom={onZoom} />)}
    </div>
  </div>;

const ProducedAssetThumb = ({ asset, onZoom }: {
  asset: NonNullable<AgentRunView['producedAssets']>[number];
  onZoom: (asset: NonNullable<AgentRunView['producedAssets']>[number]) => void;
}) => {
  const ready = !!asset.previewUrl && !asset.pending;
  return <div
    draggable={ready}
    onDragStart={ready ? (e) => writeAssetDrag(e, { id: asset.id, name: asset.name ?? '', previewUrl: asset.previewUrl, width: asset.width ?? undefined, height: asset.height ?? undefined }) : undefined}
    onClick={() => ready && onZoom(asset)}
    title={asset.name ?? asset.id}
    className={`group relative bloome-card overflow-hidden ${ready ? 'cursor-grab active:cursor-grabbing' : ''}`}
    style={{ aspectRatio: '1 / 1', background: '#F7F5F1' }}>
    {ready
      ? <img src={asset.previewUrl ?? undefined} alt={asset.name ?? ''} draggable={false} loading="lazy" className="absolute inset-0 w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} />
      : <div className="absolute inset-0 grid place-items-center text-[9px] font-mono text-muted-foreground gap-1"><Loader2 className="w-3 h-3 animate-spin" /><span>generating</span></div>}
    {ready && <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('magpie:add-asset-to-card', { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl, width: asset.width, height: asset.height } })); }} title="Add to card" className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 rounded bg-[var(--primary)] text-primary-foreground py-0.5 text-[9px] font-semibold inline-flex items-center justify-center gap-1 transition-opacity">
      <Plus className="w-2.5 h-2.5" /> Add
    </button>}
  </div>;
};

const AssetZoom = ({ asset, onClose }: { asset: NonNullable<AgentRunView['producedAssets']>[number]; onClose: () => void }) => <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,#0C0A0F_72%,transparent)] p-6" onClick={onClose}>
    <div className="bloome-card max-w-[560px] w-full overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="relative bg-[#F7F5F1]" style={{ aspectRatio: '1 / 1' }}>
        {asset.previewUrl ? <img src={asset.previewUrl} alt={asset.name ?? ''} className="absolute inset-0 w-full h-full object-contain" /> : null}
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="text-[13px] font-semibold truncate" title={asset.name ?? asset.id}>{asset.name ?? asset.id}</div>
        <button onClick={() => { window.dispatchEvent(new CustomEvent('magpie:add-asset-to-card', { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl, width: asset.width, height: asset.height } })); onClose(); }} className="shrink-0 rounded-md bg-[var(--primary)] text-primary-foreground px-3 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add to card
        </button>
      </div>
    </div>
  </div>;

const RulesPanel = ({ report, rules, onSaveDraft }: { report: RuleReport | null; rules: unknown[]; onSaveDraft?: () => void }) => {
  const passed = report ? report.passed ?? report.pass ?? false : null;
  const rows = Array.isArray(report?.findings) && report.findings.length ? report.findings : Array.isArray(report?.rules) ? report.rules : [];
  return <div className="flex-1 flex flex-col min-h-0 px-3 py-3 gap-3 overflow-auto">
    <div className="flex items-start justify-between gap-2">
      <div>
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">Active rules</div>
        <div className="text-[13px] font-semibold leading-tight mt-0.5">{rules.length} checks loaded</div>
      </div>
      {/* Brand rules are EDITED with the structured editor on /rules — never as JSON here (M-223). */}
      <a href="/rules" className="shrink-0 text-[11px] font-semibold text-[var(--primary)] hover:underline inline-flex items-center gap-1 mt-0.5">Edit brand rules <ArrowRight className="w-3 h-3" /></a>
    </div>
    <div className="bloome-card p-3">
      <div className="flex items-center gap-2">
        {passed === true ? <CheckCircle2 className="w-4 h-4 text-[var(--success)]" /> : passed === false ? <AlertCircle className="w-4 h-4 text-[var(--destructive)]" /> : <ShieldCheck className="w-4 h-4 text-muted-foreground" />}
        <span className="text-[12px] font-semibold">{passed === true ? 'Passed' : passed === false ? 'Needs draft' : 'No report yet'}</span>
        {typeof report?.score === 'number' && <span className="ml-auto text-[10px] font-mono text-muted-foreground">{report.score}/100</span>}
      </div>
      {passed === false && <button onClick={onSaveDraft} className="mt-3 w-full rounded-md bg-[#0C0A0F] px-3 py-1.5 text-[12px] font-semibold text-white">Save as draft instead</button>}
    </div>
    <ul className="space-y-1.5">
      {rows.map((row, index) => <li key={index} className="bloome-card p-2.5"><FriendlyRule rule={row} /></li>)}
      {!rows.length && rules.map((rule, index) => <li key={index} className="bloome-card p-2.5"><FriendlyRule rule={rule} /></li>)}
    </ul>
  </div>;
};

// Human-readable rendering of a brand-rule / rule-finding object — swatches, type + spacing
// summaries, pass/fail + message. Replaces the old raw-JSON <pre> so the rules surface never
// shows the user JSON (M-223). Brand rules are edited structurally on /rules.
const FriendlyRule = ({ rule }: { rule: unknown }) => {
  if (!rule || typeof rule !== 'object') return <div className="text-[11.5px] text-muted-foreground">{String(rule)}</div>;
  const r = rule as Record<string, any>;
  const kind = String(r.kind ?? r.id ?? r.rule ?? r.check ?? 'rule');
  const colors: any[] | null = Array.isArray(r.colors) ? r.colors : Array.isArray(r.canonicalPalette) ? r.canonicalPalette : Array.isArray(r.palette) ? r.palette : null;
  const ok: boolean | null = typeof r.pass === 'boolean' ? r.pass : typeof r.passed === 'boolean' ? r.passed : null;
  const msg = r.message ?? r.description ?? r.detail ?? r.reason ?? null;
  const isSpacing = kind.includes('spacing') && (r.token ?? r.value) != null;
  return <div className="flex flex-col gap-1.5">
    <div className="flex items-center gap-2">
      <span className="text-[11.5px] font-semibold capitalize">{kind.replace(/[-_]/g, ' ')}</span>
      {ok !== null && <span className={`text-[9px] font-mono uppercase tracking-wider px-1 py-0.5 rounded ${ok ? 'bg-[#48BB78] text-white' : 'bg-[var(--destructive)] text-white'}`}>{ok ? 'pass' : 'fail'}</span>}
    </div>
    {colors && <div className="flex flex-wrap gap-1">
      {colors.map((c, i) => {
        const hex = typeof c === 'string' ? c : String(c?.hex ?? c?.value ?? '#ccc');
        const role = typeof c === 'object' ? (c?.role ?? '') : '';
        return <span key={i} className="inline-flex items-center gap-1 text-[9.5px] font-mono text-muted-foreground"><span className="w-3.5 h-3.5 rounded-sm border border-[var(--border-subtle)]" style={{ background: hex }} />{role || hex}</span>;
      })}
    </div>}
    {(r.fontFamily || r.headingSize || r.bodySize) && <div className="text-[10.5px] text-muted-foreground">Type · {String(r.fontFamily ?? 'default')}{(r.headingSize && r.bodySize) ? ` · ${r.headingSize}/${r.bodySize}` : ''}</div>}
    {isSpacing && <div className="text-[10.5px] text-muted-foreground">Spacing · {String(r.token ?? r.value)}px</div>}
    {msg && <div className="text-[10.5px] text-muted-foreground leading-relaxed">{String(msg)}</div>}
  </div>;
};

function formatMicros(value: number): string {
  return `$${(value / 1_000_000).toFixed(3)}`;
}

/* ─────────────────────────── Right: Inspector panel ─────────────────────────── */

const TEXT_ALIGNS: Array<{ id: NonNullable<Layer['textAlign']>; Icon: ComponentType<{ className?: string }> }> = [
  { id: 'left', Icon: AlignLeft },
  { id: 'center', Icon: AlignCenter },
  { id: 'right', Icon: AlignRight },
  { id: 'justify', Icon: AlignJustify },
];

const InspectorPanel = ({
  layer,
  canvasW,
  canvasH,
  onAlign
}: {
  layer: Layer | null;
  canvasW: number;
  canvasH: number;
  onAlign?: (patch: Partial<Layer>) => void;
}) => {
  const { t } = useTranslation();
  // M-219: align the selected layer to the canvas (replaces the confusing fixed-px presets).
  // Uses the layer's resolved box so each edge/centre lands exactly on the page rect.
  const alignToCanvas = (axis: 'x' | 'y', where: 'start' | 'center' | 'end') => {
    if (!layer) return;
    const box = resolveBox(layer, canvasW, canvasH);
    if (axis === 'x') {
      const x = where === 'start' ? 0 : where === 'center' ? Math.round((canvasW - box.w) / 2) : Math.round(canvasW - box.w);
      onAlign?.({ x });
    } else {
      const y = where === 'start' ? 0 : where === 'center' ? Math.round((canvasH - box.h) / 2) : Math.round(canvasH - box.h);
      onAlign?.({ y });
    }
  };
  const alignBtn = "min-h-10 rounded-md bg-white border border-[var(--border-subtle)] inline-flex items-center justify-center gap-1 px-2 py-1.5 text-[10.5px] font-semibold text-foreground hover:bg-muted";
  return <div className="flex-1 flex flex-col min-h-0 px-3 py-3 gap-2.5 overflow-auto">
    {!layer ? <div className="text-[12px] text-muted-foreground text-center py-10">
        {t('editor.inspector.empty')}
      </div> : <>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">{t('editor.inspector.selected')}</div>
          <div className="text-[12.5px] font-semibold leading-tight mt-0.5">{layer.name}</div>
        </div>

        <InspectorField label="Kind">
          <span className="text-[11.5px] font-mono">{layer.kind}</span>
        </InspectorField>
        {layer.assetName && <InspectorField label="Asset">
            <span className="text-[11.5px] truncate">{layer.assetName}</span>
            <button className="text-[10.5px] text-[var(--primary)] hover:underline shrink-0">change</button>
          </InspectorField>}
        {layer.textValue && <InspectorField label="Text">
            <input className="flex-1 bg-card text-[12px] px-2 py-1 rounded-md border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] focus:outline-none focus:border-[var(--primary)]" defaultValue={layer.textValue.replace(/^"|"$/g, '')} onBlur={(event) => { const v = event.target.value.trim(); if (v && v !== layer.textValue) onAlign?.({ textValue: v }); }} />
          </InspectorField>}
        {layer.font && <InspectorField label="Font">
            <select className="bg-card text-[12px] px-2 py-1 rounded-md border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] font-mono">
              <option>{layer.font}</option>
              <option>Inter 400</option>
              <option>Inter 600</option>
              <option>JetBrains Mono 500</option>
            </select>
          </InspectorField>}
        {/* M-220: font size — live slider + number, both write fontSize (default 34). */}
        {layer.kind === 'text' && <InspectorField label={t('editor.inspector.fontSize')}>
            <input type="range" min={12} max={120} value={layer.fontSize ?? 34} onChange={(event) => onAlign?.({ fontSize: Number(event.target.value) })} className="flex-1 accent-[var(--primary)]" />
            <input type="number" min={8} max={400} value={layer.fontSize ?? 34} onChange={(event) => { const n = Number(event.target.value); if (Number.isFinite(n) && n > 0) onAlign?.({ fontSize: Math.round(n) }); }} className="w-12 bg-card text-[11.5px] tabular-nums px-1.5 py-1 rounded-md border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)] focus:outline-none focus:border-[var(--primary)]" />
          </InspectorField>}
        {/* M-218: text alignment — left / center / right / justify, writes textAlign. */}
        {layer.kind === 'text' && <InspectorField label={t('editor.inspector.textAlign')}>
            <div className="flex-1 inline-flex rounded-md overflow-hidden border border-[var(--border-subtle)]">
              {TEXT_ALIGNS.map(({ id, Icon }) => {
                const active = (layer.textAlign ?? 'left') === id;
                return <button key={id} onClick={() => onAlign?.({ textAlign: id })} aria-label={t(`editor.inspector.align.${id}`)} title={t(`editor.inspector.align.${id}`)} className={`flex-1 min-h-10 grid place-items-center py-1.5 ${active ? 'bg-[var(--primary)] text-primary-foreground' : 'bg-white text-muted-foreground hover:bg-muted'}`}>
                  <Icon className="w-3.5 h-3.5" />
                </button>;
              })}
            </div>
          </InspectorField>}
        {layer.kind === 'text' && <InspectorField label="Decoration">
            <select value={layer.decoration ?? 'none'} onChange={(event) => onAlign?.({ decoration: event.target.value as TextDecoration })} className="flex-1 bg-card text-[12px] px-2 py-1 rounded-md border border-[color-mix(in_oklab,#0C0A0F_8%,transparent)]">
              {(['none', 'solid', 'wavy', 'dashed', 'dotted'] as const).map((style) => <option key={style} value={style}>{style === 'none' ? 'None' : style === 'solid' ? 'Underline' : style.charAt(0).toUpperCase() + style.slice(1)}</option>)}
            </select>
          </InspectorField>}
        {/* R5 (c): controlled opacity slider — onChange → patchLayer({opacity}); debounced persist keeps it 60fps. */}
        <InspectorField label="Opacity">
          <input type="range" min={0} max={100} value={Math.round(layer.opacity * 100)} onChange={(event) => onAlign?.({ opacity: Number(event.target.value) / 100 })} className="flex-1 accent-[var(--primary)]" />
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums w-9 text-right">{Math.round(layer.opacity * 100)}%</span>
        </InspectorField>
        <InspectorField label="Visible">
          <button className="text-[11.5px] inline-flex items-center gap-1.5 text-foreground">
            {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
            {layer.visible ? 'on' : 'hidden'}
          </button>
        </InspectorField>
        <InspectorField label="Locked">
          <button className="text-[11.5px] inline-flex items-center gap-1.5">
            {layer.locked ? <Lock className="w-3.5 h-3.5 text-[var(--accent)]" /> : <Unlock className="w-3.5 h-3.5 text-muted-foreground" />}
            {layer.locked ? 'locked' : 'editable'}
          </button>
        </InspectorField>

        <hr className="border-[color-mix(in_oklab,#0C0A0F_6%,transparent)] my-1" />

        {/* M-219: align-to-canvas (replaces the old top-left/center/bottom px presets that
            users mistook for text alignment). Two explicit axes, clear edge labels. */}
        <div className="text-[10px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
          {t('editor.inspector.alignToCanvas')}
        </div>
        <div className="grid grid-cols-3 gap-1">
          <button onClick={() => alignToCanvas('x', 'start')} className={alignBtn}>{t('editor.inspector.canvas.left')}</button>
          <button onClick={() => alignToCanvas('x', 'center')} className={alignBtn}>{t('editor.inspector.canvas.centerH')}</button>
          <button onClick={() => alignToCanvas('x', 'end')} className={alignBtn}>{t('editor.inspector.canvas.right')}</button>
          <button onClick={() => alignToCanvas('y', 'start')} className={alignBtn}>{t('editor.inspector.canvas.top')}</button>
          <button onClick={() => alignToCanvas('y', 'center')} className={alignBtn}>{t('editor.inspector.canvas.middle')}</button>
          <button onClick={() => alignToCanvas('y', 'end')} className={alignBtn}>{t('editor.inspector.canvas.bottom')}</button>
        </div>
        {/* Resolved box (matches what's drawn) so M-214 zero-size layers read their real
            rendered W/H, not a misleading 0. */}
        {(() => {
          const box = resolveBox(layer, canvasW, canvasH);
          return <div className="grid grid-cols-2 gap-2">
            <InspectorField label="X"><span className="text-[11.5px] font-mono tabular-nums">{Math.round(box.x)}</span></InspectorField>
            <InspectorField label="Y"><span className="text-[11.5px] font-mono tabular-nums">{Math.round(box.y)}</span></InspectorField>
            <InspectorField label="W"><span className="text-[11.5px] font-mono tabular-nums">{Math.round(box.w)}</span></InspectorField>
            <InspectorField label="H"><span className="text-[11.5px] font-mono tabular-nums">{Math.round(box.h)}</span></InspectorField>
          </div>;
        })()}
      </>}
  </div>;
};
const InspectorField = ({
  label,
  children
}: {
  label: string;
  children: ReactNode;
}) => <div>
    <div className="text-[9.5px] font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</div>
    <div className="flex items-center gap-2">{children}</div>
  </div>;

/* ─────────────────────────── Derivative chip ─────────────────────────── */

const DerivativeChip = ({
  d,
  onOpen
}: {
  d: Derivative;
  onOpen?: () => void;
}) => <article onClick={onOpen} className="bloome-card overflow-hidden w-[120px] hover:translate-y-[-1px] transition-transform cursor-pointer">
    <div className="relative" style={{
    background: d.bg,
    aspectRatio: d.ratio === '9:16' ? '9/16' : d.ratio === '1:1' ? '1/1' : '16/9'
  }}>
      <svg viewBox="0 0 80 100" preserveAspectRatio="xMidYMid slice" className="w-full h-full" aria-hidden>
        <text x="40" y="100" textAnchor="middle" fontFamily="Inter, sans-serif" fontWeight="900" fontSize="92" fill="#FFFFFF" opacity="0.1" letterSpacing="-3">b</text>
        <g transform="translate(40, 38)">
          <circle cx="0" cy="0" r="6" fill={d.fg} stroke="#0C0A0F" strokeWidth="1.5" />
          <path d="M -8 8 Q 0 14 8 8 L 8 24 L -8 24 Z" fill={d.fg} stroke="#0C0A0F" strokeWidth="1.5" />
        </g>
      </svg>
      <span className="absolute top-1 left-1 text-[8.5px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-[#FFF8EF]/95 text-[#0C0A0F]">
        {d.ratio}
      </span>
    </div>
    <div className="px-2 py-1.5">
      <div className="text-[10.5px] font-semibold truncate">{d.title}</div>
      <div className="text-[9px] text-muted-foreground font-mono">{d.creator} · {d.createdAtLabel}</div>
    </div>
  </article>;

/* ─────────────────────────── Backdrop ─────────────────────────── */

const PaperBackdrop = () => <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <defs>
      <pattern id="paper-dot-ce" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.8" fill="#0C0A0F" fillOpacity="0.05" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper-dot-ce)" />
  </svg>;
