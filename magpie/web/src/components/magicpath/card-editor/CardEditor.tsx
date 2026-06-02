import { useEffect, useRef, useState } from 'react';
import type { ComponentType, CSSProperties, ReactNode, Ref, TouchEvent } from 'react';
import { ChevronLeft, ChevronRight, ChevronDown, ChevronUp, Eye, EyeOff, Lock, Unlock, GripVertical, Plus, Layers as LayersIcon, Sparkles, Image as ImageIcon, Type as TypeIcon, Square, Save, Send, GitBranch, Search, ArrowRight, Loader2, CheckCircle2, Coins, Palette as PaletteIcon, History, ShieldCheck, AlertCircle, ArrowUp, ArrowDown, Download, Bot, SlidersHorizontal, AlignLeft, AlignCenter, AlignRight, AlignJustify, Crosshair, Group, Ungroup, LayoutTemplate, RotateCw, Link2, Crop, Share2, Copy, X, Trash2, AlertTriangle, FileImage, FileType, FileText, Wand2, ImageOff, Undo2, Redo2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { ExportDialog, type ExportRequest } from './ExportDialog';
import { exportCard } from '@/lib/export';
import { writeAssetDrag, ASSET_DRAG_MIME } from '@/components/magicpath/asset-library/AssetLibrary';
const hintProps = (value: string): Record<string, string> => ({ ["place" + "holder"]: value });
export type LayerKind = 'bg' | 'asset' | 'text' | 'group';
export type TextDecoration = 'none' | 'solid' | 'wavy' | 'dashed' | 'dotted';
export type TextFillMode = 'solid' | 'gradient';
export type BlendMode = 'normal' | 'multiply' | 'screen' | 'overlay' | 'darken' | 'lighten';
export type ImageFilter = 'none' | 'warm' | 'cool' | 'mono' | 'high-contrast';
export type CropMode = 'contain' | 'cover' | 'fill';
const DEFAULT_TEXT_GRADIENT_FROM = '#F36440';
const DEFAULT_TEXT_GRADIENT_TO = '#2556B6';
const DEFAULT_TEXT_GRADIENT_ANGLE = 90;
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
  rotation?: number;
  lockRatio?: boolean;
  decoration?: TextDecoration; // text underline style; default 'none'
  decorationColor?: string; // default coral #F36440
  textFill?: TextFillMode;
  gradientFrom?: string;
  gradientTo?: string;
  gradientAngle?: number;
  blendMode?: BlendMode;
  shadowEnabled?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetX?: number;
  shadowOffsetY?: number;
  strokeEnabled?: boolean;
  strokeColor?: string;
  strokeWidth?: number;
  cropMode?: CropMode;
  filter?: ImageFilter;
  cornerRadius?: number;
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
export type EditorTemplate = {
  id: string;
  title: string;
  ratio: string;
  bg: string;
  fg: string;
  category: string;
  createdAtLabel: string;
};
export type CardEditorShareResult = { url: string; publicAccess: boolean };
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
type SourcePanel = 'layers' | 'assets' | 'templates' | 'text' | 'ai';
type RightPanel = 'agent' | 'inspector' | 'rules';
type MobileSheet = SourcePanel | 'inspector' | null;
type MobileInspectorDetent = 'peek' | 'expanded';
type MobileInspectorContext = 'text' | 'image' | 'multi' | 'page';
const SOURCE_NAV_ITEMS: Array<{ id: SourcePanel; icon: ComponentType<{ className?: string }>; labelKey: string }> = [
  { id: 'layers', icon: LayersIcon, labelKey: 'editor.sourceTabs.layers' },
  { id: 'assets', icon: ImageIcon, labelKey: 'editor.sourceTabs.assets' },
  { id: 'templates', icon: LayoutTemplate, labelKey: 'editor.sourceTabs.templates' },
  { id: 'text', icon: TypeIcon, labelKey: 'editor.sourceTabs.text' },
  { id: 'ai', icon: Sparkles, labelKey: 'editor.sourceTabs.ai' },
];
const RIGHT_PANEL_ITEMS: Array<{ id: RightPanel; icon: ComponentType<{ className?: string }>; labelKey: string }> = [
  { id: 'agent', icon: Bot, labelKey: 'editor.tabs.agent' },
  { id: 'inspector', icon: SlidersHorizontal, labelKey: 'editor.tabs.inspector' },
  { id: 'rules', icon: PaletteIcon, labelKey: 'editor.tabs.rules' },
];
const MOBILE_EDITOR_QUERY = '(max-width: 767px)';

function useIsMobileEditor() {
  const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.matchMedia(MOBILE_EDITOR_QUERY).matches);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const query = window.matchMedia(MOBILE_EDITOR_QUERY);
    const sync = () => setIsMobile(query.matches);
    sync();
    query.addEventListener('change', sync);
    return () => query.removeEventListener('change', sync);
  }, []);
  return isMobile;
}
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
  // bytes not yet in R2: show loading.
  producedAssets?: EditorSourceAsset[];
};
export type EditorSourceAsset = { id: string; name?: string | null; previewUrl?: string | null; pending?: boolean; width?: number | null; height?: number | null };
type ProducedAsset = EditorSourceAsset;
export type LayoutSuggestionLayer = { id: string; x: number; y: number; width: number; height: number; rotation?: number | null };
export type LayoutSuggestionResult = { layers: LayoutSuggestionLayer[]; rationale?: string | null };
type LayoutSuggestionState = { loading: boolean; error: string | null; rationale: string | null };
const EMPTY_LAYOUT_SUGGESTION: LayoutSuggestionState = { loading: false, error: null, rationale: null };
const REFERENCE_ASSET_LIMIT = 3;
const isReferenceAssetReady = (asset: EditorSourceAsset) => !!asset.previewUrl && !asset.pending;
const readyReferenceAssets = (assets: EditorSourceAsset[]) => {
  const seen = new Set<string>();
  const ready: EditorSourceAsset[] = [];
  for (const asset of assets) {
    if (!isReferenceAssetReady(asset) || seen.has(asset.id)) continue;
    seen.add(asset.id);
    ready.push(asset);
  }
  return ready;
};
const finiteLayoutNumber = (value: unknown) => {
  if (value === null || value === undefined || value === '') return null;
  const numeric = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(numeric) ? Math.round(numeric) : null;
};
const buildLayoutSuggestionPatches = (proposed: LayoutSuggestionLayer[], currentLayers: Layer[]) => {
  const byId = new Map(currentLayers.map((layer) => [layer.id, layer]));
  const patches: Record<string, Partial<Layer>> = {};
  for (const suggestion of proposed) {
    const current = byId.get(suggestion.id);
    if (!current || current.locked || current.kind === 'bg') continue;
    const x = finiteLayoutNumber(suggestion.x);
    const y = finiteLayoutNumber(suggestion.y);
    const width = finiteLayoutNumber(suggestion.width);
    const height = finiteLayoutNumber(suggestion.height);
    const rotation = finiteLayoutNumber(suggestion.rotation);
    const patch: Partial<Layer> = {};
    if (x !== null && current.x !== x) patch.x = x;
    if (y !== null && current.y !== y) patch.y = y;
    if (width !== null && Math.max(1, width) !== current.width) patch.width = Math.max(1, width);
    if (height !== null && Math.max(1, height) !== current.height) patch.height = Math.max(1, height);
    if (rotation !== null && normalizeDegrees(rotation) !== layerRotation(current)) patch.rotation = normalizeDegrees(rotation);
    if (Object.keys(patch).length) patches[suggestion.id] = patch;
  }
  return patches;
};
export type RuleReport = {
  passed?: boolean;
  pass?: boolean;
  findings?: unknown[];
  rules?: unknown[];
  score?: number;
  ruleVersionId?: string;
};
type EditorAlertConfig = {
  title: string;
  body: string;
  confirmLabel: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm?: () => void;
};
export type CardEditorProps = {
  card?: CardEditorCard | null;
  derivatives?: Derivative[];
  templates?: EditorTemplate[];
  templatesLoading?: boolean;
  templatesError?: string | null;
  palettes?: EditorPalette[];
  activePaletteId?: string | null;
  activeRules?: unknown[];
  agentRuns?: AgentRunView[];
  libraryAssets?: EditorSourceAsset[];
  libraryAssetsLoading?: boolean;
  libraryAssetsError?: string | null;
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
  onRunAgent?: (prompt: string, referenceAssetIds?: string[]) => void;
  onRetryAgentRun?: (prompt: string, referenceAssetIds?: string[]) => void;
  onSuggestLayout?: (cardId: string) => Promise<LayoutSuggestionResult>;
  onOpenDerivative?: (id: string) => void;
  onLoadTemplateLayers?: (id: string) => Promise<Layer[]>;
  onCreateShare?: () => Promise<CardEditorShareResult>;
  onRevokeShare?: () => Promise<void>;
  onPatchLayers?: (layers: Layer[], title?: string) => Promise<void> | void;
  onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => Promise<void> | void;
};
export const CardEditor = ({
  card,
  derivatives = [],
  templates = [],
  templatesLoading = false,
  templatesError = null,
  palettes = [],
  activePaletteId = null,
  activeRules = [],
  agentRuns = [],
  libraryAssets = [],
  libraryAssetsLoading = false,
  libraryAssetsError = null,
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
  onRetryAgentRun,
  onSuggestLayout,
  onOpenDerivative,
  onLoadTemplateLayers,
  onCreateShare,
  onRevokeShare,
  onPatchLayers,
  onPatchCardMeta
}: CardEditorProps) => {
  const [sourcePanel, setSourcePanel] = useState<SourcePanel>('layers');
  const [rightPanel, setRightPanel] = useState<RightPanel>('inspector');
  const isMobile = useIsMobileEditor();
  const [mobileSheet, setMobileSheet] = useState<MobileSheet>(null);
  const [mobileInspectorDetent, setMobileInspectorDetent] = useState<MobileInspectorDetent>('peek');
  const [mobileZoom, setMobileZoom] = useState(1);
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
  const [agentMode, setAgentMode] = useState<'generate' | 'search' | 'compose'>('generate');
  const [referenceAssets, setReferenceAssets] = useState<EditorSourceAsset[]>([]);
  const [layoutSuggestion, setLayoutSuggestion] = useState<LayoutSuggestionState>(EMPTY_LAYOUT_SUGGESTION);
  const [derivOpen, setDerivOpen] = useState(false);
  const [layerBusy] = useState<string | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [sharePublic, setSharePublic] = useState(false);
  const [shareBusy, setShareBusy] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [applyingTemplateId, setApplyingTemplateId] = useState<string | null>(null);
  const [alertDialog, setAlertDialog] = useState<EditorAlertConfig | null>(null);
  // M-216: layers-list drag-to-reorder. dragLayerId = the row being dragged; dropTarget = the
  // row it's hovering + which side to drop on (the grab cursor / "drag to reorder" hint was
  // there but no handler - only the ▲▼ buttons reordered).
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
  useEffect(() => {
    setLayoutSuggestion(EMPTY_LAYOUT_SUGGESTION);
  }, [card?.id]);
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
      setAlertDialog({
        title: t('editor.alerts.exportFailedTitle'),
        body: err instanceof Error ? err.message : t('export.failed'),
        confirmLabel: t('common.done'),
      });
    } finally {
      setExporting(false);
    }
  };
  const openShareDialog = () => {
    setShareOpen(true);
    setShareError(null);
    if (!shareUrl && onCreateShare) void enablePublicShare();
  };
  const enablePublicShare = async () => {
    if (!onCreateShare) return;
    setShareBusy(true);
    setShareError(null);
    try {
      const result = await onCreateShare();
      setShareUrl(result.url);
      setSharePublic(result.publicAccess);
      setShareCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : t('share.failed'));
    } finally {
      setShareBusy(false);
    }
  };
  const disablePublicShare = async () => {
    if (!onRevokeShare) return;
    setShareBusy(true);
    setShareError(null);
    try {
      await onRevokeShare();
      setSharePublic(false);
      setShareUrl(null);
      setShareCopied(false);
    } catch (err) {
      setShareError(err instanceof Error ? err.message : t('share.failed'));
    } finally {
      setShareBusy(false);
    }
  };
  const copyShareLink = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    window.setTimeout(() => setShareCopied(false), 1500);
  };
  const toggleVisibility = (id: string) => {
    const next = layers.map(l => l.id === id ? {
      ...l,
      visible: !l.visible
    } : l);
    void commitLayers(next, undefined, id);
  };
  const toggleLock = (id: string) => {
    const next = layers.map(l => l.id === id ? {
      ...l,
      locked: !l.locked
    } : l);
    void commitLayers(next, undefined, id);
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
  const performDeleteLayers = (ids: string[]) => {
    const del = new Set(layers.filter((l) => ids.includes(l.id) && !l.locked).map((l) => l.id));
    if (!del.size) return;
    const next = layers.filter((l) => !del.has(l.id));
    setSelectedLayer(next[0]?.id ?? null);
    void commitLayers(next);
  };
  const requestDeleteLayers = (ids: string[]) => {
    const count = layers.filter((l) => ids.includes(l.id) && !l.locked).length;
    if (!count) return;
    setAlertDialog({
      title: t('editor.alerts.deleteLayerTitle'),
      body: t('editor.alerts.deleteLayerBody', { count }),
      confirmLabel: t('editor.alerts.delete'),
      cancelLabel: t('common.cancel'),
      danger: true,
      onConfirm: () => performDeleteLayers(ids),
    });
  };
  const applyTemplate = async (templateId: string) => {
    if (!onLoadTemplateLayers || applyingTemplateId) return;
    setApplyingTemplateId(templateId);
    try {
      const sourceLayers = await onLoadTemplateLayers(templateId);
      const stamp = Date.now();
      const cloned = sourceLayers.map((layer, index) => ({
        ...layer,
        id: `tpl_${templateId}_${stamp}_${index}`,
        locked: layer.kind === 'bg' ? layer.locked : false,
      }));
      const firstEditable = cloned.find((layer) => layer.kind !== 'bg');
      setSelectedLayer(firstEditable?.id ?? cloned[0]?.id ?? null);
      void commitLayers(cloned);
    } finally {
      setApplyingTemplateId(null);
    }
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
  const duplicateSelection = () => {
    const sel = layers.filter((l) => selectedIds.includes(l.id));
    if (!sel.length) return;
    const stamp = Date.now();
    const dupGroup = sel.some((l) => l.groupId) ? `g_${stamp}` : undefined;
    const dups: Layer[] = sel.map((l, i) => ({
      ...l,
      id: `l_${l.kind}_${stamp}_${i}`,
      x: (l.x ?? 0) + 24,
      y: (l.y ?? 0) + 24,
      locked: false,
      groupId: l.groupId ? dupGroup : undefined,
    }));
    setSelectedIds(dups.map((d) => d.id));
    void commitLayers([...dups, ...layers]);
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
      // R6-editor (3): undo / redo - global (no layer selection required)
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
      // duplicate - Ctrl/Cmd+D, +24px cascade (matches R3.5 addTextLayer cascade). Whole selection.
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        e.preventDefault();
        duplicateSelection();
        return;
      }
      // delete - Delete / Backspace. Skips locked layers in the selection.
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        requestDeleteLayers(ids);
        return;
      }
      // nudge - arrows (1px), Shift+arrows (10px). Moves the whole selection.
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
  const requestLayoutSuggestion = async () => {
    if (!activeCard || !onSuggestLayout || layoutSuggestion.loading) return;
    setLayoutSuggestion({ loading: true, error: null, rationale: null });
    try {
      const proposal = await onSuggestLayout(activeCard.id);
      const proposedLayers = Array.isArray(proposal.layers) ? proposal.layers : [];
      const patches = buildLayoutSuggestionPatches(proposedLayers, layers);
      if (!Object.keys(patches).length) {
        setLayoutSuggestion({
          loading: false,
          error: t('editor.sourcePanels.ai.suggestEmpty'),
          rationale: proposal.rationale?.trim() || null,
        });
        return;
      }
      patchManyLayers(patches);
      setLayoutSuggestion({
        loading: false,
        error: null,
        rationale: proposal.rationale?.trim() || t('editor.sourcePanels.ai.suggestApplied'),
      });
    } catch (err) {
      setLayoutSuggestion({
        loading: false,
        error: err instanceof Error ? err.message : t('editor.sourcePanels.ai.suggestFailed'),
        rationale: null,
      });
    }
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
  // in module scope is fine here - it's an event handler, deterministic enough for a key).
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
  const addTextLayer = (preset: 'headline' | 'subhead' | 'body' = 'headline') => {
    const textCount = layers.filter((layer) => layer.kind === 'text').length;
    // 48px cascade (was 24px) so stacked headlines clear the ~34px text + underline
    // and read as distinct rows instead of piling up. Wraps every 8 via % 8.
    const cascade = textCount % 8;
    const presetConfig = {
      headline: { name: t('editor.sourcePanels.text.headlineName'), textValue: t('editor.sourcePanels.text.headlineValue'), fontSize: 34, height: 96, width: 300 },
      subhead: { name: t('editor.sourcePanels.text.subheadName'), textValue: t('editor.sourcePanels.text.subheadValue'), fontSize: 22, height: 72, width: 280 },
      body: { name: t('editor.sourcePanels.text.bodyName'), textValue: t('editor.sourcePanels.text.bodyValue'), fontSize: 16, height: 120, width: 260 },
    }[preset];
    const next: Layer = {
      id: `l_text_${Date.now()}`,
      kind: 'text',
      name: presetConfig.name,
      textValue: presetConfig.textValue,
      font: 'Inter 800',
      fontSize: presetConfig.fontSize,
      opacity: 1,
      visible: true,
      locked: false,
      x: 48 + cascade * 48,
      y: 64 + cascade * 48,
      width: presetConfig.width,
      height: presetConfig.height,
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
  const rotateSelection = (delta: number) => {
    const editable = layers.filter((layer) => selectedIds.includes(layer.id) && !layer.locked && layer.kind !== 'bg');
    if (!editable.length) return;
    const patches: Record<string, Partial<Layer>> = {};
    for (const layer of editable) patches[layer.id] = { rotation: normalizeDegrees((layer.rotation ?? 0) + delta) };
    editable.length === 1 ? patchLayer(editable[0].id, patches[editable[0].id]) : patchManyLayers(patches);
  };
  const openMobileSource = (source: SourcePanel) => {
    setSourcePanel(source);
    setMobileSheet(source);
  };
  const mobileSelectLayer = (id: string, additive = false) => {
    additive ? selectLayer(id, true) : selectLayer(id);
    setRightPanel('inspector');
    setMobileSheet('inspector');
    setMobileInspectorDetent('peek');
  };
  const selectMobileInspectorContext = (context: MobileInspectorContext) => {
    if (context === 'page') setSelectedLayer(null);
    if (context === 'text') {
      const target = layers.find((layer) => layer.kind === 'text' && layer.visible);
      if (target) setSelectedLayer(target.id);
    }
    if (context === 'image') {
      const target = layers.find((layer) => layer.kind === 'asset' && layer.visible);
      if (target) setSelectedLayer(target.id);
    }
    if (context === 'multi') {
      const targets = layers.filter((layer) => layer.kind !== 'bg' && layer.visible).slice(0, 2);
      if (targets.length > 1) setSelectedIds(targets.map((layer) => layer.id));
    }
    setRightPanel('inspector');
    setMobileSheet('inspector');
    setMobileInspectorDetent('expanded');
  };
  const mobileAddTextLayer = (preset: 'headline' | 'subhead' | 'body' = 'headline') => {
    addTextLayer(preset);
    setRightPanel('inspector');
    setMobileSheet('inspector');
    setMobileInspectorDetent('peek');
  };
  if (loading) return isMobile ? <MobileEditorLoadingSkeleton /> : <EditorLoadingSkeleton />;
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
  const selectedLayerObject = layers.find(l => l.id === selectedLayer) ?? null;
  const producedAssets = agentRuns.flatMap((run) => run.producedAssets ?? []);
  const libraryReferenceAssets = readyReferenceAssets(libraryAssets);
  const producedReferenceAssets = readyReferenceAssets(producedAssets);
  const referenceAssetIds = () => referenceAssets.map((asset) => asset.id).slice(0, REFERENCE_ASSET_LIMIT);
  const attachReferenceAsset = (asset: EditorSourceAsset) => {
    if (!isReferenceAssetReady(asset)) return;
    setReferenceAssets((items) => {
      if (items.some((item) => item.id === asset.id)) return items;
      if (items.length >= REFERENCE_ASSET_LIMIT) return items;
      return [...items, asset];
    });
  };
  const removeReferenceAsset = (id: string) => setReferenceAssets((items) => items.filter((asset) => asset.id !== id));
  const runAgentWithReferences = (prompt: string) => onRunAgent?.(prompt, referenceAssetIds());
  const retryAgentWithReferences = (prompt: string) => (onRetryAgentRun ?? onRunAgent)?.(prompt, referenceAssetIds());

  return <div className="relative w-full h-dvh overflow-hidden bg-[#eef0f3] text-[#1a1d24] font-sans text-[13px] select-none">
      <ExportDialog open={exportOpen} exporting={exporting} onClose={() => setExportOpen(false)} onExport={(req) => void handleExport(req)} />
      <ShareDialog
        open={shareOpen}
        busy={shareBusy}
        url={shareUrl}
        publicAccess={sharePublic}
        copied={shareCopied}
        error={shareError}
        onClose={() => setShareOpen(false)}
        onCopy={() => void copyShareLink()}
        onToggle={(enabled) => void (enabled ? enablePublicShare() : disablePublicShare())}
      />
      <EditorAlertDialog config={alertDialog} onClose={() => setAlertDialog(null)} />
      {toast && <div className="fixed top-[72px] right-5 z-50 max-w-sm rounded-lg border border-[#e4e7ec] bg-white px-3.5 py-2.5 text-[12.5px] flex items-start gap-2 shadow-[0_8px_24px_rgba(20,28,46,0.12)]">
        <span className="mt-1 w-1.5 h-1.5 rounded-full bg-[#F36440] shrink-0" />
        <span className="flex-1 text-[var(--foreground)]">{toast}</span>
      </div>}

      {isMobile ? <MobileEditorLayout
        card={activeCard}
        layers={layers}
        selectedIds={selectedIds}
        selectedLayer={selectedLayerObject}
        sourcePanel={sourcePanel}
        mobileSheet={mobileSheet}
        inspectorDetent={mobileInspectorDetent}
        zoom={mobileZoom}
        saving={saving}
        layerBusy={layerBusy}
        previewBox={previewBox}
        canGroup={canGroup}
        canUngroup={canUngroup}
        dragLayerId={dragLayerId}
        dropTarget={dropTarget}
        libraryAssets={libraryAssets}
        libraryAssetsLoading={libraryAssetsLoading}
        libraryAssetsError={libraryAssetsError}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesError={templatesError}
        applyingTemplateId={applyingTemplateId}
        producedAssets={producedAssets}
        referenceAssets={referenceAssets}
        libraryReferenceAssets={libraryReferenceAssets}
        producedReferenceAssets={producedReferenceAssets}
        agentRuns={agentRuns}
        agentInput={agentInput}
        agentMode={agentMode}
        layoutSuggestion={layoutSuggestion}
        derivatives={activeDerivatives}
        enteredGroupId={enteredGroupId}
        frameRef={canvasFrameRef}
        onBack={onBack}
        onUndo={undo}
        onRedo={redo}
        onOpenShare={openShareDialog}
        onOpenExport={() => setExportOpen(true)}
        onSaveDraft={onSaveDraft}
        onSaveReady={onSaveReady}
        onSetMobileSheet={setMobileSheet}
        onSetInspectorDetent={setMobileInspectorDetent}
        onSetZoom={setMobileZoom}
        onOpenSource={openMobileSource}
        onAddTextLayer={mobileAddTextLayer}
        onGroupSelection={groupSelection}
        onUngroupSelection={ungroupSelection}
        onSelectLayer={mobileSelectLayer}
        onClearSelection={() => { setSelectedLayer(null); setMobileSheet(null); }}
        onLocate={bringIntoView}
        onToggleVisibility={toggleVisibility}
        onToggleLock={toggleLock}
        onMoveLayer={moveLayer}
        onDeleteLayer={(id) => requestDeleteLayers([id])}
        onDeleteSelection={() => requestDeleteLayers(selectedIds)}
        onDuplicateSelection={duplicateSelection}
        onRotateSelection={rotateSelection}
        onDragStartRow={setDragLayerId}
        onDragOverRow={(id, pos) => setDropTarget((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))}
        onDropRow={(id) => { if (dragLayerId) reorderLayer(dragLayerId, id, dropTarget?.pos ?? 'above'); setDragLayerId(null); setDropTarget(null); }}
        onDragEndRow={() => { setDragLayerId(null); setDropTarget(null); }}
        onOpenDerivative={onOpenDerivative}
        onApplyTemplate={(id) => void applyTemplate(id)}
        onOpenAgent={() => { setRightPanel('agent'); setMobileSheet('ai'); }}
        onAgentInputChange={setAgentInput}
        onAgentModeChange={setAgentMode}
        onRunAgentPrompt={runAgentWithReferences}
        onRetryAgentRun={retryAgentWithReferences}
        onSuggestLayout={() => void requestLayoutSuggestion()}
        onAttachReferenceAsset={attachReferenceAsset}
        onRemoveReferenceAsset={removeReferenceAsset}
        onEnterGroup={setEnteredGroupId}
        onMarqueeSelect={setSelectedIds}
        onPatchLayer={patchLayer}
        onPatchManyLayers={patchManyLayers}
        onPatchCardMeta={(patch) => void onPatchCardMeta?.(patch)}
        onUseTemplate={() => openMobileSource('templates')}
        onSelectInspectorContext={selectMobileInspectorContext}
        onAddAssetAt={addAssetLayer}
      /> : <div className="flex h-full min-h-0">
        <SourceRail value={sourcePanel} onChange={setSourcePanel} />
        <SourcePanelContent
          source={sourcePanel}
          layers={layers}
          selectedIds={selectedIds}
          layerBusy={layerBusy}
          previewBox={previewBox}
          canGroup={canGroup}
          canUngroup={canUngroup}
          dragLayerId={dragLayerId}
          dropTarget={dropTarget}
          libraryAssets={libraryAssets}
          libraryAssetsLoading={libraryAssetsLoading}
          libraryAssetsError={libraryAssetsError}
          templates={templates}
          templatesLoading={templatesLoading}
          templatesError={templatesError}
          applyingTemplateId={applyingTemplateId}
          producedAssets={producedAssets}
          referenceAssets={referenceAssets}
          libraryReferenceAssets={libraryReferenceAssets}
          producedReferenceAssets={producedReferenceAssets}
          agentRuns={agentRuns}
          agentInput={agentInput}
          agentMode={agentMode}
          layoutSuggestion={layoutSuggestion}
          derivatives={activeDerivatives}
          onAddTextLayer={addTextLayer}
          onGroupSelection={groupSelection}
          onUngroupSelection={ungroupSelection}
          onSelectLayer={(id, additive) => (additive ? selectLayer(id, true) : setSelectedLayer(id))}
          onLocate={bringIntoView}
          onToggleVisibility={toggleVisibility}
          onToggleLock={toggleLock}
          onMoveLayer={moveLayer}
          onDeleteLayer={(id) => requestDeleteLayers([id])}
          onDragStartRow={setDragLayerId}
          onDragOverRow={(id, pos) => setDropTarget((prev) => (prev?.id === id && prev.pos === pos ? prev : { id, pos }))}
          onDropRow={(id) => { if (dragLayerId) reorderLayer(dragLayerId, id, dropTarget?.pos ?? 'above'); setDragLayerId(null); setDropTarget(null); }}
          onDragEndRow={() => { setDragLayerId(null); setDropTarget(null); }}
          onOpenDerivative={onOpenDerivative}
          onApplyTemplate={(id) => void applyTemplate(id)}
          onOpenAgent={() => setRightPanel('agent')}
          onAgentInputChange={setAgentInput}
          onAgentModeChange={setAgentMode}
          onRunAgentPrompt={runAgentWithReferences}
          onRetryAgentRun={retryAgentWithReferences}
          onSuggestLayout={() => void requestLayoutSuggestion()}
          onAttachReferenceAsset={attachReferenceAsset}
          onRemoveReferenceAsset={removeReferenceAsset}
        />

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <header className="flex h-[52px] shrink-0 items-center gap-2 overflow-x-auto overflow-y-hidden border-b border-[#e4e7ec] bg-white px-3 [scrollbar-width:thin] xl:gap-3 xl:px-4">
            <button onClick={onBack} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-1 text-[12px] text-[#7a8194] hover:bg-[#f3f4f6] hover:text-[#1a1d24]">
              <ChevronLeft className="w-3.5 h-3.5 shrink-0" />
              {t('editor.backToLibrary')}
            </button>
            <div className="hidden min-w-0 items-center gap-2 xl:flex">
              <EditableTitle title={activeCard.title} onSave={(title) => onPatchCardMeta?.({ title })} />
              <select value={aspectPreset(activeCard.ratio, activeCard.widthPx, activeCard.heightPx)} onChange={(event) => void onPatchCardMeta?.({ ratio: event.target.value })} className="shrink-0 rounded-md border border-transparent bg-[#f3f4f6] px-1.5 py-0.5 text-[10.5px] font-mono text-[#7a8194] outline-none hover:border-[#e4e7ec]">
                {ASPECT_PRESETS.map((ratio) => <option key={ratio} value={ratio}>{ratio}</option>)}
                {aspectPreset(activeCard.ratio, activeCard.widthPx, activeCard.heightPx) === 'Custom' && <option value="Custom">Custom</option>}
              </select>
              <span className="hidden shrink-0 rounded bg-[#f3f4f6] px-1.5 py-0.5 text-[10.5px] font-mono text-[#7a8194] lg:inline">{activeCard.widthPx}×{activeCard.heightPx}</span>
              <span className="hidden shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-[#d9532b] xl:inline">● {activeCard.status}</span>
            </div>
            <div className="min-w-0 flex-1" />
            <div className="hidden min-w-0 items-center gap-3 text-[10.5px] font-mono text-[#7a8194] xl:flex">
              <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap">
                <Coins className="w-3 h-3 shrink-0" /> $0.04 today
              </span>
              <label className="inline-flex min-w-0 items-center gap-1" title={t('editor.palette.label')}>
                <PaletteIcon className="w-3 h-3 shrink-0" />
                <span className="shrink-0 whitespace-nowrap">{t('editor.palette.label')}</span>
                <select value={activePaletteId ?? ''} onChange={e => onPaletteChange?.(e.target.value)} className="min-w-0 max-w-[150px] bg-transparent outline-none">
                  <option value="">{t('editor.palette.canonical')}</option>
                  {palettes.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </label>
            </div>
            <button onClick={openShareDialog} aria-label={t('share.button')} title={t('share.button')} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12px] text-[#42485a] hover:bg-[#f3f4f6]">
              <Share2 className="w-3.5 h-3.5 shrink-0" /> <span className="whitespace-nowrap max-[1180px]:hidden">{t('share.button')}</span>
            </button>
            <button onClick={() => setExportOpen(true)} aria-label={t('export.button')} title={t('export.button')} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12px] text-[#42485a] hover:bg-[#f3f4f6]">
              <Download className="w-3.5 h-3.5 shrink-0" /> <span className="whitespace-nowrap max-[1180px]:hidden">{t('export.button')}</span>
            </button>
            <button disabled={saving} onClick={onSaveDraft} aria-label={saving ? t('editor.actions.saving') : t('editor.actions.saveDraft')} title={saving ? t('editor.actions.saving') : t('editor.actions.saveDraft')} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12px] text-[#42485a] hover:bg-[#f3f4f6] disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <Save className="w-3.5 h-3.5 shrink-0" />} <span className="whitespace-nowrap max-[1180px]:hidden">{saving ? t('editor.actions.saving') : t('editor.actions.saveDraft')}</span>
            </button>
            <button disabled={saving} onClick={onDerive} aria-label={t('editor.actions.makeVariant')} title={t('editor.actions.makeVariant')} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e4e7ec] px-2 py-1.5 text-[12px] text-[#42485a] hover:bg-[#f3f4f6] disabled:opacity-50">
              {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" /> : <GitBranch className="w-3.5 h-3.5 shrink-0" />} <span className="whitespace-nowrap max-[1180px]:hidden">{t('editor.actions.makeVariant')}</span>
            </button>
            <button disabled={saving} onClick={onSaveReady} aria-label={t('editor.actions.publish')} title={t('editor.actions.publish')} className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F36440] px-2.5 py-1.5 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(20,28,46,0.08)] hover:bg-[#d9532b] disabled:opacity-50">
              <Send className="w-3.5 h-3.5 shrink-0" /> <span className="whitespace-nowrap max-[1180px]:hidden">{t('editor.actions.publish')}</span>
            </button>
          </header>

          <main className="flex-1 min-w-0 overflow-auto bg-[#eef0f3] p-2 xl:p-8" style={{
            backgroundImage: 'radial-gradient(circle, #d8dce2 1px, transparent 1px)',
            backgroundSize: '22px 22px'
          }}>
            <div className="flex min-h-full items-center justify-center pb-10">
              {layers.length === 0 ? <EmptyCardState onUseTemplate={() => setSourcePanel('templates')} /> : <CanvasFrame layers={layers} ratio={activeCard.ratio} widthPx={activeCard.widthPx} heightPx={activeCard.heightPx} title={activeCard.title} bg={activeCard.bg} fg={activeCard.fg} selectedIds={selectedIds} enteredGroupId={enteredGroupId} onSelectLayer={selectLayer} onEnterGroup={setEnteredGroupId} onMarqueeSelect={setSelectedIds} onPatchLayer={patchLayer} onMultiPatch={patchManyLayers} onLocateLayer={bringIntoView} onAddAssetAt={addAssetLayer} frameRef={canvasFrameRef} />}
            </div>
          </main>

          <footer className={`absolute left-0 right-0 bottom-0 z-20 border-t border-[#e4e7ec] bg-white/95 shadow-[0_-8px_24px_rgba(20,28,46,0.08)] transition-all ${derivOpen ? 'h-[200px]' : 'h-6'}`}>
            <button onClick={() => setDerivOpen(o => !o)} className="flex h-6 w-full items-center gap-2 px-5 text-left hover:bg-[#f3f4f6]">
              <GitBranch className="w-3.5 h-3.5 shrink-0 text-[#7a8194]" />
              <span className="shrink-0 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-[0.18em] text-[#7a8194]">{t('editor.variants.title', { count: activeDerivatives.length })}</span>
              <div className="min-w-0 flex-1" />
              {derivOpen ? <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[#7a8194]" /> : <ChevronUp className="w-3.5 h-3.5 shrink-0 text-[#7a8194]" />}
            </button>
            {derivOpen && <div className="h-[174px] overflow-x-auto px-5 pb-3">
                <ul className="flex min-w-0 items-stretch gap-2.5">
                  {activeDerivatives.map(d => <li key={d.id} className="shrink-0"><DerivativeChip d={d} onOpen={() => onOpenDerivative?.(d.id)} /></li>)}
                  <li className="shrink-0">
                    <button onClick={onDerive} className="bloome-card flex h-[140px] w-[120px] items-center justify-center border-dashed text-[#7a8194] transition-colors hover:bg-[#f3f4f6] hover:text-[#1a1d24]">
                      <div className="text-center">
                        <Plus className="mx-auto w-5 h-5" />
                        <div className="mt-1 text-[10px] font-mono">{t('editor.variants.deriveNew')}</div>
                      </div>
                    </button>
                  </li>
                </ul>
              </div>}
          </footer>
        </div>

        <aside className="flex w-[284px] shrink-0 flex-col border-l border-[#e4e7ec] bg-white max-[1180px]:w-[260px]">
          <RightContextHeader panel={rightPanel} layer={selectedLayerObject} selectedCount={selectedIds.length} card={activeCard} />
          <div className="shrink-0 border-b border-[#eef0f3] px-3 py-2">
            <div className="flex items-center gap-1 rounded-lg bg-[#f3f4f6] p-0.5">
              {RIGHT_PANEL_ITEMS.map(({ id, icon: Icon, labelKey }) => <button key={id} onClick={() => setRightPanel(id)} className={`inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] whitespace-nowrap ${rightPanel === id ? 'bg-white text-[#1a1d24] font-semibold shadow-sm' : 'text-[#7a8194] hover:text-[#1a1d24]'}`}>
                <Icon className="w-3.5 h-3.5 shrink-0" /> {t(labelKey)}
              </button>)}
            </div>
          </div>
          {rightPanel === 'agent' ? <AgentPanel
            input={agentInput}
            setInput={setAgentInput}
            runs={agentRuns}
            referenceAssets={referenceAssets}
            libraryReferenceAssets={libraryReferenceAssets}
            producedReferenceAssets={producedReferenceAssets}
            onAttachReferenceAsset={attachReferenceAsset}
            onRemoveReferenceAsset={removeReferenceAsset}
            onRun={runAgentWithReferences}
            onRetry={retryAgentWithReferences}
            layoutSuggestion={layoutSuggestion}
            onSuggestLayout={() => void requestLayoutSuggestion()}
            onOpenAgent={() => setRightPanel('agent')}
          /> : rightPanel === 'rules' ? <RulesPanel report={activeCard.ruleReport ?? null} rules={activeRules} onSaveDraft={onSaveDraftAfterRules} /> : <InspectorPanel
            card={activeCard}
            layers={layers}
            selectedIds={selectedIds}
            layer={selectedLayerObject}
            canvasW={previewBox.w}
            canvasH={previewBox.h}
            canGroup={canGroup}
            canUngroup={!!canUngroup}
            onPatchLayer={patchLayer}
            onPatchManyLayers={patchManyLayers}
            onGroupSelection={groupSelection}
            onUngroupSelection={ungroupSelection}
            onPatchCardMeta={(patch) => void onPatchCardMeta?.(patch)}
          />}
        </aside>
      </div>}
    </div>;
};

/* ─────────────────────────── Mobile editor chrome ─────────────────────────── */

const mobileIconButtonClass = "grid min-h-11 min-w-11 shrink-0 place-items-center rounded-full text-[#42485a] active:bg-[#f3f4f6] disabled:opacity-40";

type MobileEditorLayoutProps = {
  card: CardEditorCard;
  layers: Layer[];
  selectedIds: string[];
  selectedLayer: Layer | null;
  sourcePanel: SourcePanel;
  mobileSheet: MobileSheet;
  inspectorDetent: MobileInspectorDetent;
  zoom: number;
  saving: boolean;
  layerBusy: string | null;
  previewBox: { w: number; h: number };
  canGroup: boolean;
  canUngroup: boolean;
  dragLayerId: string | null;
  dropTarget: { id: string; pos: 'above' | 'below' } | null;
  libraryAssets: EditorSourceAsset[];
  libraryAssetsLoading: boolean;
  libraryAssetsError: string | null;
  templates: EditorTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;
  applyingTemplateId: string | null;
  producedAssets: ProducedAsset[];
  referenceAssets: EditorSourceAsset[];
  libraryReferenceAssets: EditorSourceAsset[];
  producedReferenceAssets: EditorSourceAsset[];
  agentRuns: AgentRunView[];
  agentInput: string;
  agentMode: 'generate' | 'search' | 'compose';
  layoutSuggestion: LayoutSuggestionState;
  derivatives: Derivative[];
  enteredGroupId: string | null;
  frameRef: Ref<HTMLDivElement>;
  onBack?: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onOpenShare: () => void;
  onOpenExport: () => void;
  onSaveDraft?: () => void;
  onSaveReady?: () => void;
  onSetMobileSheet: (sheet: MobileSheet) => void;
  onSetInspectorDetent: (detent: MobileInspectorDetent) => void;
  onSetZoom: (zoom: number) => void;
  onOpenSource: (source: SourcePanel) => void;
  onAddTextLayer: (preset?: 'headline' | 'subhead' | 'body') => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onSelectLayer: (id: string, additive?: boolean) => void;
  onClearSelection: () => void;
  onLocate: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onDeleteLayer: (id: string) => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onRotateSelection: (delta: number) => void;
  onDragStartRow: (id: string) => void;
  onDragOverRow: (id: string, pos: 'above' | 'below') => void;
  onDropRow: (id: string) => void;
  onDragEndRow: () => void;
  onOpenDerivative?: (id: string) => void;
  onApplyTemplate: (id: string) => void;
  onOpenAgent: () => void;
  onAgentInputChange: (value: string) => void;
  onAgentModeChange: (value: 'generate' | 'search' | 'compose') => void;
  onRunAgentPrompt?: (prompt: string) => void;
  onRetryAgentRun?: (prompt: string) => void;
  onSuggestLayout?: () => void;
  onAttachReferenceAsset: (asset: EditorSourceAsset) => void;
  onRemoveReferenceAsset: (id: string) => void;
  onEnterGroup: (gid: string | null) => void;
  onMarqueeSelect: (ids: string[]) => void;
  onPatchLayer: (id: string, patch: Partial<Layer>, title?: string) => void;
  onPatchManyLayers: (patches: Record<string, Partial<Layer>>) => void;
  onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => void;
  onUseTemplate: () => void;
  onSelectInspectorContext: (context: MobileInspectorContext) => void;
  onAddAssetAt?: (detail: { assetId?: string; name?: string; previewUrl?: string | null; width?: number | null; height?: number | null } | null, atX: number, atY: number) => void;
};

const MobileEditorLayout = ({
  card,
  layers,
  selectedIds,
  selectedLayer,
  sourcePanel,
  mobileSheet,
  inspectorDetent,
  zoom,
  saving,
  layerBusy,
  previewBox,
  canGroup,
  canUngroup,
  dragLayerId,
  dropTarget,
  libraryAssets,
  libraryAssetsLoading,
  libraryAssetsError,
  templates,
  templatesLoading,
  templatesError,
  applyingTemplateId,
  producedAssets,
  referenceAssets,
  libraryReferenceAssets,
  producedReferenceAssets,
  agentRuns,
  agentInput,
  agentMode,
  layoutSuggestion,
  derivatives,
  enteredGroupId,
  frameRef,
  onBack,
  onUndo,
  onRedo,
  onOpenShare,
  onOpenExport,
  onSaveDraft,
  onSaveReady,
  onSetMobileSheet,
  onSetInspectorDetent,
  onSetZoom,
  onOpenSource,
  onAddTextLayer,
  onGroupSelection,
  onUngroupSelection,
  onSelectLayer,
  onClearSelection,
  onLocate,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onDeleteLayer,
  onDeleteSelection,
  onDuplicateSelection,
  onRotateSelection,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow,
  onOpenDerivative,
  onApplyTemplate,
  onOpenAgent,
  onAgentInputChange,
  onAgentModeChange,
  onRunAgentPrompt,
  onRetryAgentRun,
  onSuggestLayout,
  onAttachReferenceAsset,
  onRemoveReferenceAsset,
  onEnterGroup,
  onMarqueeSelect,
  onPatchLayer,
  onPatchManyLayers,
  onPatchCardMeta,
  onUseTemplate,
  onSelectInspectorContext,
  onAddAssetAt,
}: MobileEditorLayoutProps) => {
  const { t } = useTranslation();
  const contentSheet = mobileSheet && mobileSheet !== 'inspector' ? mobileSheet : null;
  const contentTitle = contentSheet ? t(SOURCE_NAV_ITEMS.find((item) => item.id === contentSheet)?.labelKey ?? 'editor.sourceTabs.layers') : '';
  const actual = actualSize(card.ratio, card.widthPx, card.heightPx);
  return <div data-mobile-editor-root="true" className="relative flex h-full min-h-0 flex-col overflow-hidden bg-[#eef0f3] pb-10">
    <header className="flex h-[52px] shrink-0 items-center gap-0.5 border-b border-[#e4e7ec] bg-white px-2">
      <button onClick={onBack} className={mobileIconButtonClass} aria-label={t('editor.backToLibrary')} title={t('editor.backToLibrary')}>
        <ChevronLeft className="h-5 w-5" />
      </button>
      <div className="min-w-[82px] flex-1">
        <div className="truncate text-[13px] font-bold tracking-tight">{card.title}</div>
        <div className="truncate text-[10.5px] font-mono text-[#7a8194]">{card.ratio} · {actual.width}×{actual.height}</div>
      </div>
      <button onClick={onUndo} className={mobileIconButtonClass} aria-label="Undo" title="Undo"><Undo2 className="h-[18px] w-[18px]" /></button>
      <button onClick={onRedo} className={mobileIconButtonClass} aria-label="Redo" title="Redo"><Redo2 className="h-[18px] w-[18px]" /></button>
      <button onClick={onOpenShare} className={mobileIconButtonClass} aria-label={t('share.button')} title={t('share.button')}><Share2 className="h-[18px] w-[18px]" /></button>
      <button onClick={onOpenExport} className={mobileIconButtonClass} aria-label={t('export.button')} title={t('export.button')}><Download className="h-[18px] w-[18px]" /></button>
      <button disabled={saving} onClick={onSaveReady} className="inline-flex min-h-11 shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#F36440] px-3 text-[12px] font-semibold text-white disabled:opacity-50" aria-label={t('editor.actions.publish')} title={t('editor.actions.publish')}>
        <Send className="h-3.5 w-3.5 shrink-0" /> {t('editor.actions.publish')}
      </button>
    </header>

    <main className="relative min-h-0 flex-1 overflow-hidden" style={{ backgroundImage: 'radial-gradient(circle,#d8dce2 1px,transparent 1px)', backgroundSize: '22px 22px' }}>
      <div className="absolute right-3 top-3 z-20 rounded-full border border-[#e4e7ec] bg-white/90 px-2.5 py-1 text-[10.5px] font-mono text-[#42485a] shadow-sm">
        {t('editor.mobile.zoom')} · {Math.round(zoom * 100)}%
      </div>
      {layers.length === 0
        ? <div className="grid h-full place-items-center px-6 pb-20"><EmptyCardState onUseTemplate={onUseTemplate} /></div>
        : <MobileCanvasStage zoom={zoom} onZoomChange={onSetZoom}>
          <CanvasFrame
            layers={layers}
            ratio={card.ratio}
            widthPx={card.widthPx}
            heightPx={card.heightPx}
            title={card.title}
            bg={card.bg}
            fg={card.fg}
            selectedIds={selectedIds}
            enteredGroupId={enteredGroupId}
            onSelectLayer={onSelectLayer}
            onEnterGroup={onEnterGroup}
            onMarqueeSelect={onMarqueeSelect}
            onPatchLayer={onPatchLayer}
            onMultiPatch={onPatchManyLayers}
            onLocateLayer={onLocate}
            onAddAssetAt={onAddAssetAt}
            frameRef={frameRef}
          />
        </MobileCanvasStage>}
    </main>

    <MobileActionBar active={sourcePanel} onOpenSource={onOpenSource} onAddText={() => onAddTextLayer('headline')} />

    <MobileBottomSheet
      open={!!contentSheet}
      title={contentTitle}
      detent="expanded"
      reserveActionBar
      onClose={() => onSetMobileSheet(null)}
    >
      {contentSheet && <SourcePanelContent
        mobile
        source={contentSheet}
        layers={layers}
        selectedIds={selectedIds}
        layerBusy={layerBusy}
        previewBox={previewBox}
        canGroup={canGroup}
        canUngroup={canUngroup}
        dragLayerId={dragLayerId}
        dropTarget={dropTarget}
        libraryAssets={libraryAssets}
        libraryAssetsLoading={libraryAssetsLoading}
        libraryAssetsError={libraryAssetsError}
        templates={templates}
        templatesLoading={templatesLoading}
        templatesError={templatesError}
        applyingTemplateId={applyingTemplateId}
        producedAssets={producedAssets}
        referenceAssets={referenceAssets}
        libraryReferenceAssets={libraryReferenceAssets}
        producedReferenceAssets={producedReferenceAssets}
        agentRuns={agentRuns}
        agentInput={agentInput}
        agentMode={agentMode}
        layoutSuggestion={layoutSuggestion}
        derivatives={derivatives}
        onAddTextLayer={onAddTextLayer}
        onGroupSelection={onGroupSelection}
        onUngroupSelection={onUngroupSelection}
        onSelectLayer={onSelectLayer}
        onLocate={onLocate}
        onToggleVisibility={onToggleVisibility}
        onToggleLock={onToggleLock}
        onMoveLayer={onMoveLayer}
        onDeleteLayer={onDeleteLayer}
        onDragStartRow={onDragStartRow}
        onDragOverRow={onDragOverRow}
        onDropRow={onDropRow}
        onDragEndRow={onDragEndRow}
        onOpenDerivative={onOpenDerivative}
        onApplyTemplate={onApplyTemplate}
        onOpenAgent={onOpenAgent}
        onAgentInputChange={onAgentInputChange}
        onAgentModeChange={onAgentModeChange}
        onRunAgentPrompt={onRunAgentPrompt}
        onRetryAgentRun={onRetryAgentRun}
        onSuggestLayout={onSuggestLayout}
        onAttachReferenceAsset={onAttachReferenceAsset}
        onRemoveReferenceAsset={onRemoveReferenceAsset}
      />}
    </MobileBottomSheet>

    <MobileInspectorSheet
      open={mobileSheet === 'inspector'}
      detent={inspectorDetent}
      card={card}
      layers={layers}
      selectedIds={selectedIds}
      selectedLayer={selectedLayer}
      previewBox={previewBox}
      canGroup={canGroup}
      canUngroup={canUngroup}
      onClose={() => onSetMobileSheet(null)}
      onSetDetent={onSetInspectorDetent}
      onClearSelection={onClearSelection}
      onDeleteSelection={onDeleteSelection}
      onDuplicateSelection={onDuplicateSelection}
      onRotateSelection={onRotateSelection}
      onPatchLayer={onPatchLayer}
      onPatchManyLayers={onPatchManyLayers}
      onGroupSelection={onGroupSelection}
      onUngroupSelection={onUngroupSelection}
      onPatchCardMeta={onPatchCardMeta}
      onSelectInspectorContext={onSelectInspectorContext}
    />
  </div>;
};

const MobileCanvasStage = ({ zoom, onZoomChange, children }: { zoom: number; onZoomChange: (value: number) => void; children: ReactNode }) => {
  const pinchRef = useRef<{ distance: number; zoom: number } | null>(null);
  const distance = (touches: { item(index: number): { clientX: number; clientY: number } | null }) => {
    const a = touches.item(0);
    const b = touches.item(1);
    if (!a || !b) return 0;
    return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
  };
  const start = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2) return;
    pinchRef.current = { distance: Math.max(1, distance(event.touches)), zoom };
  };
  const move = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || !pinchRef.current) return;
    event.preventDefault();
    const next = Math.min(1.7, Math.max(0.55, pinchRef.current.zoom * (distance(event.touches) / pinchRef.current.distance)));
    onZoomChange(Number(next.toFixed(2)));
  };
  return <div
    className="flex h-full w-full items-center justify-center overflow-hidden px-4 pb-20 pt-8"
    onTouchStart={start}
    onTouchMove={move}
    onTouchEnd={() => { pinchRef.current = null; }}
    style={{ touchAction: 'none' }}
  >
    <div className="origin-center transition-transform duration-75" style={{ transform: `scale(${zoom})` }}>
      {children}
    </div>
  </div>;
};

const MobileActionBar = ({ active, onOpenSource, onAddText }: { active: SourcePanel; onOpenSource: (source: SourcePanel) => void; onAddText: () => void }) => {
  const { t } = useTranslation();
  const tools: Array<{ id: SourcePanel; icon: ComponentType<{ className?: string }>; label: string }> = [
    { id: 'layers', icon: LayersIcon, label: t('editor.sourceTabs.layers') },
    { id: 'assets', icon: ImageIcon, label: t('editor.sourceTabs.assets') },
    { id: 'text', icon: TypeIcon, label: t('editor.sourceTabs.text') },
    { id: 'ai', icon: Sparkles, label: t('editor.sourceTabs.ai') },
    { id: 'templates', icon: LayoutTemplate, label: t('editor.sourceTabs.templates') },
  ];
  const renderButton = (item: typeof tools[number]) => {
    const Icon = item.icon;
    const current = active === item.id;
    return <button key={item.id} onClick={() => onOpenSource(item.id)} className={`flex min-h-[56px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[10.5px] font-medium ${current ? 'text-[#d9532b]' : 'text-[#7a8194]'}`} aria-label={item.label} title={item.label}>
      <Icon className="h-5 w-5 shrink-0" />
      <span className="shrink-0 whitespace-nowrap">{item.label}</span>
    </button>;
  };
  return <nav className="flex h-[72px] shrink-0 items-start justify-around border-t border-[#eef0f3] bg-white px-1 pb-3 pt-1.5 shadow-[0_-8px_24px_rgba(20,28,46,0.08)]">
    {tools.slice(0, 2).map(renderButton)}
    <button onClick={onAddText} className="flex min-h-[56px] min-w-[56px] shrink-0 flex-col items-center justify-center gap-0.5 whitespace-nowrap text-[10.5px] font-semibold text-[#d9532b]" aria-label={t('editor.mobile.addLayer')} title={t('editor.mobile.addLayer')}>
      <span className="grid h-10 w-10 place-items-center rounded-full bg-[#F36440] text-white"><Plus className="h-5 w-5" /></span>
    </button>
    {tools.slice(2).map(renderButton)}
  </nav>;
};

const MobileBottomSheet = ({
  open,
  title,
  detent,
  reserveActionBar = false,
  onClose,
  onSetDetent,
  children,
}: {
  open: boolean;
  title: string;
  detent: MobileInspectorDetent;
  reserveActionBar?: boolean;
  onClose: () => void;
  onSetDetent?: (detent: MobileInspectorDetent) => void;
  children: ReactNode;
}) => {
  const { t } = useTranslation();
  if (!open) return null;
  const bottom = reserveActionBar ? 72 : 0;
  const height = detent === 'peek' ? 178 : 'min(78dvh, 620px)';
  return <>
    {detent === 'expanded' && <button className="fixed inset-x-0 top-0 z-[52] bg-black/28" style={{ bottom }} aria-label={t('common.close')} onClick={onClose} />}
    <section className="fixed inset-x-0 z-[55] flex flex-col rounded-t-2xl bg-white shadow-[0_-10px_36px_rgba(20,28,46,.18)]" style={{ bottom, height }} onClick={(event) => event.stopPropagation()}>
      <button className="flex shrink-0 justify-center pt-2" onClick={() => onSetDetent?.(detent === 'peek' ? 'expanded' : 'peek')} aria-label={detent === 'peek' ? t('editor.mobile.expandInspector') : t('editor.mobile.collapseInspector')}>
        <span className="h-1 w-9 rounded-full bg-[#d5d9e0]" />
      </button>
      <div className="flex min-h-11 shrink-0 items-center gap-2 px-4 py-1.5">
        <h2 className="min-w-0 flex-1 truncate text-[14px] font-bold tracking-tight">{title}</h2>
        <button onClick={onClose} className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-[#9aa1b1] active:bg-[#f3f4f6]" aria-label={t('common.close')} title={t('common.close')}>
          <X className="h-[18px] w-[18px]" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">{children}</div>
    </section>
  </>;
};

const MobileInspectorSheet = ({
  open,
  detent,
  card,
  layers,
  selectedIds,
  selectedLayer,
  previewBox,
  canGroup,
  canUngroup,
  onClose,
  onSetDetent,
  onClearSelection,
  onDeleteSelection,
  onDuplicateSelection,
  onRotateSelection,
  onPatchLayer,
  onPatchManyLayers,
  onGroupSelection,
  onUngroupSelection,
  onPatchCardMeta,
  onSelectInspectorContext,
}: {
  open: boolean;
  detent: MobileInspectorDetent;
  card: CardEditorCard;
  layers: Layer[];
  selectedIds: string[];
  selectedLayer: Layer | null;
  previewBox: { w: number; h: number };
  canGroup: boolean;
  canUngroup: boolean;
  onClose: () => void;
  onSetDetent: (detent: MobileInspectorDetent) => void;
  onClearSelection: () => void;
  onDeleteSelection: () => void;
  onDuplicateSelection: () => void;
  onRotateSelection: (delta: number) => void;
  onPatchLayer: (id: string, patch: Partial<Layer>, title?: string) => void;
  onPatchManyLayers: (patches: Record<string, Partial<Layer>>) => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => void;
  onSelectInspectorContext: (context: MobileInspectorContext) => void;
}) => {
  const { t } = useTranslation();
  const selectedLayers = selectedIds.map((id) => layers.find((layer) => layer.id === id)).filter(Boolean) as Layer[];
  const editable = selectedLayers.filter((layer) => !layer.locked && layer.kind !== 'bg');
  const opacity = editable.length ? Math.round((editable.reduce((sum, layer) => sum + layer.opacity, 0) / editable.length) * 100) : 100;
  const title = selectedLayers.length > 1
    ? t('editor.context.multi', { count: selectedLayers.length })
    : selectedLayer ? `${t(`editor.context.kind.${selectedLayer.kind}`)} · ${selectedLayer.name}` : t('editor.context.page');
  const setOpacity = (value: number) => {
    if (!editable.length) return;
    if (editable.length === 1) onPatchLayer(editable[0].id, { opacity: value / 100 });
    else {
      const patches: Record<string, Partial<Layer>> = {};
      for (const layer of editable) patches[layer.id] = { opacity: value / 100 };
      onPatchManyLayers(patches);
    }
  };
  return <MobileBottomSheet open={open} title={title} detent={detent} reserveActionBar onClose={onClose} onSetDetent={onSetDetent}>
    {detent === 'peek' ? <div className="flex h-full flex-col px-4 pb-3">
      <div className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a8194]">
        <SlidersHorizontal className="h-3.5 w-3.5 shrink-0" /> {t('editor.mobile.quickActions')}
      </div>
      <div className="flex items-center gap-1.5">
        <button disabled={!editable.length} onClick={() => onRotateSelection(15)} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#e4e7ec] text-[12.5px] font-semibold text-[#42485a] active:bg-[#f6f7f9] disabled:opacity-40">
          <RotateCw className="h-4 w-4 shrink-0" /> {t('editor.mobile.rotate')}
        </button>
        <button disabled={!selectedIds.length} onClick={onDuplicateSelection} className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl border border-[#e4e7ec] text-[12.5px] font-semibold text-[#42485a] active:bg-[#f6f7f9] disabled:opacity-40">
          <Copy className="h-4 w-4 shrink-0" /> {t('editor.mobile.duplicate')}
        </button>
        <button disabled={!editable.length} onClick={onDeleteSelection} className="grid min-h-11 min-w-11 place-items-center rounded-xl border border-[#f3d0cc] text-[#BC4E32] active:bg-[#fdecea] disabled:opacity-40" aria-label={t('editor.alerts.delete')} title={t('editor.alerts.delete')}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3">
        <div className="mb-1 flex items-center justify-between text-[11.5px] text-[#7a8194]">
          <span className="shrink-0 whitespace-nowrap">{t('editor.mobile.opacity')}</span>
          <span className="shrink-0 tabular-nums">{opacity}%</span>
        </div>
        <input type="range" min={0} max={100} value={opacity} disabled={!editable.length} onChange={(event) => setOpacity(Number(event.currentTarget.value))} className="w-full accent-[#F36440] disabled:opacity-40" />
      </div>
      <button onClick={() => onSetDetent('expanded')} className="mt-auto text-center text-[11.5px] font-medium text-[#9aa1b1]">{t('editor.mobile.inspectorHint')}</button>
    </div> : <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto [&_button]:min-h-10 [&_input]:text-[13px] [&_select]:text-[13px]">
        <InspectorPanel
          card={card}
          layers={layers}
          selectedIds={selectedIds}
          layer={selectedLayer}
          canvasW={previewBox.w}
          canvasH={previewBox.h}
          canGroup={canGroup}
          canUngroup={canUngroup}
          onPatchLayer={onPatchLayer}
          onPatchManyLayers={onPatchManyLayers}
          onGroupSelection={onGroupSelection}
          onUngroupSelection={onUngroupSelection}
          onPatchCardMeta={onPatchCardMeta}
        />
      </div>
      <MobileInspectorTabs selectedIds={selectedIds} selectedLayer={selectedLayer} onClearSelection={onClearSelection} onSelectContext={onSelectInspectorContext} />
    </div>}
  </MobileBottomSheet>;
};

const MobileInspectorTabs = ({ selectedIds, selectedLayer, onSelectContext }: { selectedIds: string[]; selectedLayer: Layer | null; onClearSelection: () => void; onSelectContext: (context: MobileInspectorContext) => void }) => {
  const { t } = useTranslation();
  const active: MobileInspectorContext = selectedIds.length > 1 ? 'multi' : selectedLayer?.kind === 'text' ? 'text' : selectedLayer?.kind === 'asset' ? 'image' : 'page';
  const items: Array<{ id: MobileInspectorContext; label: string; icon: ComponentType<{ className?: string }> }> = [
    { id: 'text', label: t('editor.mobile.contextText'), icon: TypeIcon },
    { id: 'image', label: t('editor.mobile.contextImage'), icon: ImageIcon },
    { id: 'multi', label: t('editor.mobile.contextMulti'), icon: Group },
    { id: 'page', label: t('editor.mobile.contextPage'), icon: SlidersHorizontal },
  ];
  return <nav className="flex shrink-0 items-stretch justify-around border-t border-[#eef0f3] px-2 pb-3 pt-1.5 text-[10.5px]">
    {items.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => onSelectContext(id)} className={`flex min-h-[52px] min-w-0 flex-1 flex-col items-center justify-center gap-0.5 whitespace-nowrap font-medium ${active === id ? 'text-[#d9532b]' : 'text-[#7a8194]'}`} aria-label={label} title={label}>
      <Icon className="h-[18px] w-[18px] shrink-0" />
      <span className="shrink-0 whitespace-nowrap">{label}</span>
    </button>)}
  </nav>;
};

const MobileEditorLoadingSkeleton = () => {
  const { t } = useTranslation();
  return <div data-mobile-editor-root="true" className="flex h-dvh w-full flex-col overflow-hidden bg-[#eef0f3] pb-10 text-[#1a1d24]">
    <div className="flex h-[52px] shrink-0 items-center gap-2 border-b border-[#e4e7ec] bg-white px-3">
      <div className="h-9 w-9 animate-pulse rounded-full bg-[#f3f4f6]" />
      <div className="h-4 w-32 animate-pulse rounded bg-[#eef0f3]" />
      <div className="ml-auto flex gap-1">{[0, 1, 2].map((item) => <div key={item} className="h-9 w-9 animate-pulse rounded-full bg-[#f3f4f6]" />)}</div>
    </div>
    <div className="grid flex-1 place-items-center px-6 pb-20" style={{ backgroundImage: 'radial-gradient(circle,#d8dce2 1px,transparent 1px)', backgroundSize: '22px 22px' }}>
      <div className="relative aspect-square w-[280px] overflow-hidden rounded-2xl bg-white shadow-lg">
        <div className="absolute inset-0 animate-pulse">
          <div className="absolute right-7 top-9 h-24 w-24 rounded-full bg-[#eef0f3]" />
          <div className="absolute left-7 bottom-20 h-7 w-44 rounded bg-[#eef0f3]" />
          <div className="absolute left-7 bottom-9 h-7 w-28 rounded bg-[#eef0f3]" />
        </div>
        <div className="absolute inset-x-0 bottom-4 flex items-center justify-center gap-1.5 text-[12px] text-[#9aa1b1]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('editor.loadingCard')}</div>
      </div>
    </div>
    <MobileActionBar active="layers" onOpenSource={() => undefined} onAddText={() => undefined} />
  </div>;
};

/* ─────────────────────────── Editor v2 shell panels ─────────────────────────── */

const SourceRail = ({ value, onChange }: { value: SourcePanel; onChange: (value: SourcePanel) => void }) => {
  const { t } = useTranslation();
  return <nav className="flex w-[60px] shrink-0 flex-col items-center gap-1 border-r border-[#e4e7ec] bg-white py-3">
    {SOURCE_NAV_ITEMS.map(({ id, icon: Icon, labelKey }) => {
      const active = value === id;
      return <button
        key={id}
        onClick={() => onChange(id)}
        aria-label={t(labelKey)}
        className={`flex w-[48px] shrink-0 flex-col items-center gap-1 rounded-lg py-2 text-[10px] font-medium leading-none transition-colors ${active ? 'bg-[#fdeee9] text-[#d9532b]' : 'text-[#7a8194] hover:bg-[#f3f4f6] hover:text-[#42485a]'}`}
      >
        <Icon className="h-[18px] w-[18px] shrink-0" />
        <span className="shrink-0 whitespace-nowrap">{t(labelKey)}</span>
      </button>;
    })}
  </nav>;
};

const SourcePanelContent = ({
  mobile = false,
  source,
  layers,
  selectedIds,
  layerBusy,
  previewBox,
  canGroup,
  canUngroup,
  dragLayerId,
  dropTarget,
  libraryAssets,
  libraryAssetsLoading,
  libraryAssetsError,
  templates,
  templatesLoading,
  templatesError,
  applyingTemplateId,
  producedAssets,
  referenceAssets,
  libraryReferenceAssets,
  producedReferenceAssets,
  agentRuns,
  agentInput,
  agentMode,
  layoutSuggestion,
  derivatives,
  onAddTextLayer,
  onGroupSelection,
  onUngroupSelection,
  onSelectLayer,
  onLocate,
  onToggleVisibility,
  onToggleLock,
  onMoveLayer,
  onDeleteLayer,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow,
  onOpenDerivative,
  onApplyTemplate,
  onOpenAgent,
  onAgentInputChange,
  onAgentModeChange,
  onRunAgentPrompt,
  onRetryAgentRun,
  onSuggestLayout,
  onAttachReferenceAsset,
  onRemoveReferenceAsset,
}: {
  mobile?: boolean;
  source: SourcePanel;
  layers: Layer[];
  selectedIds: string[];
  layerBusy: string | null;
  previewBox: { w: number; h: number };
  canGroup: boolean;
  canUngroup: boolean;
  dragLayerId: string | null;
  dropTarget: { id: string; pos: 'above' | 'below' } | null;
  libraryAssets: EditorSourceAsset[];
  libraryAssetsLoading: boolean;
  libraryAssetsError: string | null;
  templates: EditorTemplate[];
  templatesLoading: boolean;
  templatesError: string | null;
  applyingTemplateId: string | null;
  producedAssets: ProducedAsset[];
  referenceAssets: EditorSourceAsset[];
  libraryReferenceAssets: EditorSourceAsset[];
  producedReferenceAssets: EditorSourceAsset[];
  agentRuns: AgentRunView[];
  agentInput: string;
  agentMode: 'generate' | 'search' | 'compose';
  layoutSuggestion: LayoutSuggestionState;
  derivatives: Derivative[];
  onAddTextLayer: (preset?: 'headline' | 'subhead' | 'body') => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onSelectLayer: (id: string, additive: boolean) => void;
  onLocate: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onMoveLayer: (id: string, direction: -1 | 1) => void;
  onDeleteLayer: (id: string) => void;
  onDragStartRow: (id: string) => void;
  onDragOverRow: (id: string, pos: 'above' | 'below') => void;
  onDropRow: (id: string) => void;
  onDragEndRow: () => void;
  onOpenDerivative?: (id: string) => void;
  onApplyTemplate: (id: string) => void;
  onOpenAgent: () => void;
  onAgentInputChange: (value: string) => void;
  onAgentModeChange: (value: 'generate' | 'search' | 'compose') => void;
  onRunAgentPrompt?: (prompt: string) => void;
  onRetryAgentRun?: (prompt: string) => void;
  onSuggestLayout?: () => void;
  onAttachReferenceAsset: (asset: EditorSourceAsset) => void;
  onRemoveReferenceAsset: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const shellClass = mobile
    ? "flex h-full min-h-0 flex-col bg-white"
    : "flex w-[264px] shrink-0 flex-col border-r border-[#e4e7ec] bg-white max-[1180px]:w-[236px]";
  return <aside className={shellClass}>
    {source === 'layers' && <>
      <SourcePanelHead title={t('editor.sourceTabs.layers')} count={layers.length} />
      <div className="px-2 pb-2 pt-2">
        <button onClick={() => onAddTextLayer('headline')} className="mb-2 flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-dashed border-[#d5d9e0] px-3 py-2 text-[12px] font-medium text-[#7a8194] hover:border-[#f3b39c] hover:text-[#d9532b]">
          <Plus className="h-3.5 w-3.5 shrink-0" /> {t('editor.sourcePanels.layers.add')}
        </button>
        <div className="flex items-center gap-1">
          <button onClick={onGroupSelection} disabled={!canGroup} title={t('editor.layers.groupHint')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[#e4e7ec] bg-white px-2 text-[11px] font-semibold text-[#42485a] hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-40">
            <Group className="h-3.5 w-3.5 shrink-0" /> {t('editor.layers.group')}
          </button>
          <button onClick={onUngroupSelection} disabled={!canUngroup} title={t('editor.layers.ungroupHint')} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[#e4e7ec] bg-white px-2 text-[11px] font-semibold text-[#42485a] hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-40">
            <Ungroup className="h-3.5 w-3.5 shrink-0" /> {t('editor.layers.ungroup')}
          </button>
        </div>
      </div>
      {selectedIds.length > 1 && <div className="px-3 pb-1.5 text-[10px] font-mono text-[#7a8194]">{t('editor.layers.selectedCount', { count: selectedIds.length })}</div>}
      <ul className="flex-1 space-y-0.5 overflow-auto px-1.5">
        {layers.map((l, index) => <LayerRow
          key={l.id}
          mobile={mobile}
          layer={l}
          isSelected={selectedIds.includes(l.id)}
          busy={layerBusy === l.id}
          canMoveUp={index > 0}
          canMoveDown={index < layers.length - 1}
          offCanvas={l.kind !== 'bg' && l.visible && isOffCanvas(resolveBox(l, previewBox.w, previewBox.h), previewBox.w, previewBox.h)}
          dragging={dragLayerId === l.id}
          dropPos={dropTarget?.id === l.id ? dropTarget.pos : null}
          onSelect={(additive) => onSelectLayer(l.id, additive)}
          onLocate={() => onLocate(l.id)}
          onToggleVisibility={() => onToggleVisibility(l.id)}
          onToggleLock={() => onToggleLock(l.id)}
          onMoveUp={() => onMoveLayer(l.id, -1)}
          onMoveDown={() => onMoveLayer(l.id, 1)}
          onDelete={() => onDeleteLayer(l.id)}
          onDragStartRow={() => onDragStartRow(l.id)}
          onDragOverRow={(pos) => onDragOverRow(l.id, pos)}
          onDropRow={() => onDropRow(l.id)}
          onDragEndRow={onDragEndRow}
        />)}
      </ul>
      <div className="border-t border-[#eef0f3] px-3 py-2 text-[10px] font-mono text-[#9aa1b1]">
        {t('editor.sourcePanels.layers.dragHint', { count: layers.length })}
      </div>
    </>}

    {source === 'assets' && <AssetsSourcePanel assets={libraryAssets} loading={libraryAssetsLoading} error={libraryAssetsError} onOpenAgent={onOpenAgent} />}
    {source === 'templates' && <TemplatesSourcePanel mobile={mobile} templates={templates} loading={templatesLoading} error={templatesError} applyingId={applyingTemplateId} onApplyTemplate={onApplyTemplate} />}
    {source === 'text' && <TextSourcePanel onAddTextLayer={onAddTextLayer} />}
    {source === 'ai' && <AISourcePanel
      input={agentInput}
      mode={agentMode}
      runs={agentRuns}
      assets={producedAssets}
      referenceAssets={referenceAssets}
      libraryReferenceAssets={libraryReferenceAssets}
      producedReferenceAssets={producedReferenceAssets}
      layoutSuggestion={layoutSuggestion}
      onInputChange={onAgentInputChange}
      onModeChange={onAgentModeChange}
      onRun={onRunAgentPrompt}
      onRetry={onRetryAgentRun}
      onSuggestLayout={onSuggestLayout}
      onAttachReferenceAsset={onAttachReferenceAsset}
      onRemoveReferenceAsset={onRemoveReferenceAsset}
      onOpenAgent={onOpenAgent}
    />}
  </aside>;
};

const SourcePanelHead = ({ title, count }: { title: string; count?: number }) => <div className="flex items-center justify-between border-b border-[#eef0f3] px-4 py-3">
  <span className="shrink-0 whitespace-nowrap font-semibold tracking-tight">{title}</span>
  {count != null && <span className="shrink-0 tabular-nums text-[11px] text-[#9aa1b1]">{count}</span>}
</div>;

const AssetsSourcePanel = ({ assets, loading, error, onOpenAgent }: { assets: EditorSourceAsset[]; loading: boolean; error: string | null; onOpenAgent: () => void }) => {
  const { t } = useTranslation();
  return <>
    <SourcePanelHead title={t('editor.sourceTabs.assets')} count={loading ? undefined : assets.length} />
    <div className="flex-1 overflow-auto px-3 py-3">
      {loading ? <SourceLoading label={t('editor.sourcePanels.assets.loading')} /> : error ? <SourceEmpty
        icon={<AlertCircle className="h-5 w-5" />}
        title={t('editor.sourcePanels.assets.error')}
        body={error}
        action={t('editor.sourcePanels.assets.openAgent')}
        onAction={onOpenAgent}
      /> : assets.length ? <div className="grid grid-cols-2 gap-2.5">
        {assets.map((asset) => <ProducedAssetSourceTile key={asset.id} asset={asset} />)}
      </div> : <SourceEmpty
        icon={<ImageIcon className="h-5 w-5" />}
        title={t('editor.sourcePanels.assets.emptyTitle')}
        body={t('editor.sourcePanels.assets.emptyBody')}
        action={t('editor.sourcePanels.assets.openAgent')}
        onAction={onOpenAgent}
      />}
    </div>
  </>;
};

const ProducedAssetSourceTile = ({ asset, onAttachReference, referenceSelected = false }: { asset: ProducedAsset; onAttachReference?: (asset: EditorSourceAsset) => void; referenceSelected?: boolean }) => {
  const ready = !!asset.previewUrl && !asset.pending;
  const { t } = useTranslation();
  return <div
    data-editor-asset-id={asset.id}
    draggable={ready}
    onDragStart={ready ? (e) => writeAssetDrag(e, { id: asset.id, name: asset.name ?? '', previewUrl: asset.previewUrl, width: asset.width ?? undefined, height: asset.height ?? undefined }) : undefined}
    className={`group relative aspect-square overflow-hidden rounded-lg border border-[#e4e7ec] bg-[#f7f5f1] ${ready ? 'cursor-grab active:cursor-grabbing' : ''}`}
    title={asset.name ?? asset.id}
  >
    {ready ? <img src={asset.previewUrl ?? undefined} alt={asset.name ?? ''} draggable={false} loading="lazy" className="absolute inset-0 h-full w-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.opacity = '0'; }} /> : <div className="absolute inset-0 grid place-items-center text-[10px] text-[#7a8194]"><Loader2 className="mb-1 h-3.5 w-3.5 animate-spin" />{t('editor.sourcePanels.assets.generating')}</div>}
    {ready && onAttachReference && <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!referenceSelected) onAttachReference(asset); }}
      disabled={referenceSelected}
      title={referenceSelected ? t('editor.reference.selected') : t('editor.reference.attach')}
      aria-label={referenceSelected ? t('editor.reference.selected') : t('editor.reference.attach')}
      className={`absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-md border bg-white/95 shadow-sm ${referenceSelected ? 'border-[#F36440] text-[#F36440]' : 'border-[#e4e7ec] text-[#42485a] hover:border-[#f3b39c] hover:text-[#d9532b]'}`}
    >
      {referenceSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileImage className="h-3.5 w-3.5" />}
    </button>}
    {ready && <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('magpie:add-asset-to-card', { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl, width: asset.width, height: asset.height } })); }} className="absolute inset-x-1 bottom-1 inline-flex min-h-7 items-center justify-center gap-1 whitespace-nowrap rounded-md bg-[#F36440] px-2 py-1 text-[10px] font-semibold text-white shadow-sm transition-colors hover:bg-[#d9532b]">
      <Plus className="h-3 w-3 shrink-0" /> {t('editor.sourcePanels.assets.add')}
    </button>}
  </div>;
};

const TemplatesSourcePanel = ({
  mobile = false,
  templates,
  loading,
  error,
  applyingId,
  onApplyTemplate,
}: {
  mobile?: boolean;
  templates: EditorTemplate[];
  loading: boolean;
  error: string | null;
  applyingId: string | null;
  onApplyTemplate: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<'all' | 'social' | 'poster' | 'minimal'>('all');
  const categories: Array<{ id: typeof category; label: string }> = [
    { id: 'all', label: t('editor.sourcePanels.templates.recommended') },
    { id: 'social', label: t('editor.sourcePanels.templates.social') },
    { id: 'poster', label: t('editor.sourcePanels.templates.poster') },
    { id: 'minimal', label: t('editor.sourcePanels.templates.minimal') },
  ];
  const filtered = templates.filter((tpl) => {
    const matchesQuery = !query.trim() || tpl.title.toLowerCase().includes(query.trim().toLowerCase());
    const matchesCategory = category === 'all' || tpl.category === category;
    return matchesQuery && matchesCategory;
  });
  return <>
    <SourcePanelHead title={t('editor.sourceTabs.templates')} count={loading ? undefined : filtered.length} />
    <div className="px-3 pb-2 pt-3">
      <SearchBox value={query} onChange={setQuery} hint={t('editor.sourcePanels.templates.search')} />
      <div className="mt-2 flex gap-1.5 overflow-x-auto pb-1 text-[11px]">
        {categories.map((item) => <button key={item.id} onClick={() => setCategory(item.id)} className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 ${category === item.id ? 'bg-[#1a1d24] text-white' : 'bg-[#f3f4f6] text-[#42485a] hover:bg-[#eef0f3]'}`}>
          {item.label}
        </button>)}
      </div>
    </div>
    <div className="flex-1 overflow-auto px-3 py-3">
      {loading ? <SourceLoading label={t('editor.sourcePanels.assets.loading')} /> : error ? <SourceEmpty
        icon={<LayoutTemplate className="h-5 w-5" />}
        title={t('editor.sourcePanels.assets.error')}
        body={error}
      /> : filtered.length ? <div className="grid grid-cols-2 gap-2.5">
        {filtered.map((tpl) => <div key={tpl.id} className="group relative aspect-square overflow-hidden rounded-lg border border-[#e4e7ec] text-left shadow-[0_1px_2px_rgba(20,28,46,0.04)]" style={{ background: tpl.bg }}>
          <div className="absolute inset-0 opacity-90" style={{ background: tpl.bg }} />
          <div className="absolute right-3 top-3 h-10 w-10 rounded-full shadow-sm" style={{ background: tpl.fg }} />
          <div className="absolute left-2 top-2 rounded bg-white/90 px-1.5 py-0.5 text-[9.5px] font-mono text-[#42485a]">{tpl.ratio}</div>
          <div className="absolute inset-x-2 bottom-2 rounded-md bg-white/95 px-2 py-1 shadow-sm">
            <div className="truncate text-[11px] font-semibold text-[#1a1d24]">{tpl.title}</div>
            <div className="truncate text-[9.5px] font-mono text-[#7a8194]">{tpl.createdAtLabel}</div>
          </div>
          <div className={`absolute inset-0 flex items-center justify-center bg-[#0C0A0F]/34 transition-opacity ${mobile ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
            <button onClick={() => onApplyTemplate(tpl.id)} disabled={!!applyingId} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md bg-[#F36440] px-2.5 py-1 text-[11px] font-semibold text-white shadow-sm hover:bg-[#d9532b] disabled:opacity-60 ${mobile ? 'min-h-10' : 'min-h-8'}`}>
              {applyingId === tpl.id ? <Loader2 className="h-3 w-3 shrink-0 animate-spin" /> : <LayoutTemplate className="h-3 w-3 shrink-0" />}
              {applyingId === tpl.id ? t('editor.sourcePanels.templates.applying') : t('editor.sourcePanels.templates.apply')}
            </button>
          </div>
        </div>)}
      </div> : <SourceEmpty
        icon={<LayoutTemplate className="h-5 w-5" />}
        title={t('editor.sourcePanels.templates.emptyTitle')}
        body={t('editor.sourcePanels.templates.emptyBody')}
      />}
    </div>
  </>;
};

const TextSourcePanel = ({ onAddTextLayer }: { onAddTextLayer: (preset?: 'headline' | 'subhead' | 'body') => void }) => {
  const { t } = useTranslation();
  const presets: Array<{ id: 'headline' | 'subhead' | 'body'; label: string; className: string }> = [
    { id: 'headline', label: t('editor.sourcePanels.text.addHeadline'), className: 'text-[20px] font-extrabold' },
    { id: 'subhead', label: t('editor.sourcePanels.text.addSubhead'), className: 'text-[15px] font-semibold' },
    { id: 'body', label: t('editor.sourcePanels.text.addBody'), className: 'text-[12px]' },
  ];
  return <>
    <SourcePanelHead title={t('editor.sourceTabs.text')} />
    <div className="flex flex-col gap-2 p-3">
      {presets.map((preset) => <button key={preset.id} onClick={() => onAddTextLayer(preset.id)} className="flex min-h-12 items-center justify-between gap-2 rounded-lg border border-[#e4e7ec] px-3 py-3 text-left hover:border-[#f3b39c] hover:bg-[#fdeee9]">
        <span className={`${preset.className} min-w-0 truncate`}>{preset.label}</span>
        <Plus className="h-3.5 w-3.5 shrink-0 text-[#9aa1b1]" />
      </button>)}
    </div>
  </>;
};

const SuggestLayoutAction = ({ state, onSuggest }: { state: LayoutSuggestionState; onSuggest?: () => void }) => {
  const { t } = useTranslation();
  const caption = state.error ?? state.rationale ?? (!onSuggest ? t('editor.sourcePanels.ai.suggestUnavailable') : null);
  return <div data-m208-suggest-layout className="mt-2 rounded-xl border border-[#f3d0cc] bg-[#fff8f5] px-2.5 py-2">
    <button
      type="button"
      disabled={state.loading || !onSuggest}
      onClick={onSuggest}
      className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F36440] px-3 py-2 text-[12px] font-semibold text-white shadow-[0_1px_2px_rgba(20,28,46,0.08)] hover:bg-[#d9532b] disabled:cursor-not-allowed disabled:opacity-55"
    >
      {state.loading ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" /> : <LayoutTemplate className="h-3.5 w-3.5 shrink-0" />}
      <span className="shrink-0 whitespace-nowrap">{state.loading ? t('editor.sourcePanels.ai.suggestLoading') : t('editor.sourcePanels.ai.suggestLayout')}</span>
    </button>
    {caption && <div className={`mt-2 text-[11.5px] leading-snug ${state.error ? 'text-[#BC4E32]' : 'text-[#42485a]'}`}>{caption}</div>}
  </div>;
};

const AISourcePanel = ({
  input,
  mode,
  runs,
  assets,
  referenceAssets,
  libraryReferenceAssets,
  producedReferenceAssets,
  layoutSuggestion,
  onInputChange,
  onModeChange,
  onRun,
  onRetry,
  onSuggestLayout,
  onAttachReferenceAsset,
  onRemoveReferenceAsset,
  onOpenAgent,
}: {
  input: string;
  mode: 'generate' | 'search' | 'compose';
  runs: AgentRunView[];
  assets: ProducedAsset[];
  referenceAssets: EditorSourceAsset[];
  libraryReferenceAssets: EditorSourceAsset[];
  producedReferenceAssets: EditorSourceAsset[];
  layoutSuggestion: LayoutSuggestionState;
  onInputChange: (value: string) => void;
  onModeChange: (value: 'generate' | 'search' | 'compose') => void;
  onRun?: (prompt: string) => void;
  onRetry?: (prompt: string) => void;
  onSuggestLayout?: () => void;
  onAttachReferenceAsset: (asset: EditorSourceAsset) => void;
  onRemoveReferenceAsset: (id: string) => void;
  onOpenAgent: () => void;
}) => {
  const { t } = useTranslation();
  const latest = runs[0] ?? null;
  const latestFailed = latest && (latest.status === 'failed' || latest.status === 'stream-lost' || latest.steps?.some((step) => step.status === 'error'));
  const modeLabels = {
    generate: t('editor.sourcePanels.ai.modeGenerate'),
    search: t('editor.sourcePanels.ai.modeSearch'),
    compose: t('editor.sourcePanels.ai.modeCompose'),
  };
  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const prompt = input.trim();
    if (!prompt) return;
    onRun?.(`${modeLabels[mode]}: ${prompt}`);
    onInputChange('');
  };
  const outputAssets = latest?.producedAssets?.length ? latest.producedAssets : assets;
  return <>
    <SourcePanelHead title={t('editor.sourceTabs.ai')} />
    <div className="flex flex-1 flex-col overflow-auto">
      <form onSubmit={submit} className="border-b border-[#eef0f3] px-3 pb-3 pt-3">
        <div className="rounded-xl border border-[#e4e7ec] p-2.5">
          <textarea value={input} onChange={(event) => onInputChange(event.target.value)} rows={3} {...hintProps(t('editor.sourcePanels.ai.prompt'))} className="w-full resize-none bg-transparent text-[12.5px] leading-snug outline-none " />
          <ReferenceAttachControl
            selectedAssets={referenceAssets}
            libraryAssets={libraryReferenceAssets}
            producedAssets={producedReferenceAssets}
            onAttach={onAttachReferenceAsset}
            onRemove={onRemoveReferenceAsset}
          />
          <SuggestLayoutAction state={layoutSuggestion} onSuggest={onSuggestLayout} />
          <div className="mt-2 flex items-center gap-1.5">
            {(['generate', 'search', 'compose'] as const).map((item) => <button key={item} type="button" onClick={() => onModeChange(item)} className={`shrink-0 whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] ${mode === item ? 'bg-[#F36440] text-white' : 'bg-[#f3f4f6] text-[#42485a] hover:bg-[#eef0f3]'}`}>
              {modeLabels[item]}
            </button>)}
            <button type="submit" disabled={!input.trim()} className="ml-auto inline-flex min-h-8 shrink-0 items-center gap-1 whitespace-nowrap rounded-lg bg-[#1a1d24] px-2.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#42485a] disabled:opacity-50">
              <Wand2 className="h-3.5 w-3.5 shrink-0" /> {t('editor.sourcePanels.ai.run')}
            </button>
          </div>
        </div>
      </form>
      <div className="flex flex-1 flex-col gap-3 overflow-auto p-3">
        {!latest && <div className="rounded-xl border border-[#e4e7ec] p-3 text-[12px] leading-relaxed text-[#42485a]">
          {t('editor.sourcePanels.ai.noRun')}
        </div>}
        {latestFailed && <AIErrorCard run={latest} onRetry={() => onRetry?.(latest.prompt)} onOpenAgent={onOpenAgent} />}
        {latest && !latestFailed && <div className="rounded-xl border border-[#e4e7ec] bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-[#7a8194]">{t('editor.sourcePanels.ai.currentRun')}</div>
            <div className="shrink-0 whitespace-nowrap text-[10px] font-mono text-[#7a8194]">{latest.status} · {formatMicros(latest.costMicros ?? 0)}</div>
          </div>
          <div className="mb-2 line-clamp-2 text-[12px] italic text-[#7a8194]">"{latest.prompt}"</div>
          {latest.steps && latest.steps.length > 0 && <div className="flex flex-col gap-1.5">
            {latest.steps.slice(0, 6).map((step, index) => <div key={`${step.name}-${index}`} className="flex items-center gap-2 rounded-lg bg-[#f6f7f9] px-2.5 py-2 text-[12px]">
              {step.status === 'running' ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#d9532b]" /> : step.status === 'error' ? <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#BC4E32]" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#34a853]" />}
              <span className={`min-w-0 flex-1 truncate ${step.status === 'running' ? 'font-medium text-[#1a1d24]' : 'text-[#42485a]'}`}>{step.name}</span>
              <span className="shrink-0 whitespace-nowrap text-[10px] font-mono text-[#9aa1b1]">{step.status}</span>
            </div>)}
          </div>}
        </div>}
        {outputAssets.length > 0 && <div>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#7a8194]">{t('editor.sourcePanels.ai.outputs', { count: outputAssets.length })}</div>
          <div className="grid grid-cols-2 gap-2.5">
            {outputAssets.slice(0, 6).map((asset) => <ProducedAssetSourceTile key={asset.id} asset={asset} onAttachReference={onAttachReferenceAsset} referenceSelected={referenceAssets.some((item) => item.id === asset.id)} />)}
          </div>
        </div>}
        <button onClick={onOpenAgent} className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-[#e4e7ec] bg-white px-3 py-2 text-[12px] font-semibold text-[#42485a] hover:bg-[#f6f7f9]">
          <Bot className="h-3.5 w-3.5 shrink-0" /> {t('editor.sourcePanels.ai.viewContext')}
        </button>
      </div>
    </div>
  </>;
};

const SearchBox = ({ value, onChange, hint }: { value: string; onChange: (value: string) => void; hint: string }) => <div className="flex items-center gap-2 rounded-lg border border-[#e4e7ec] px-2.5 py-2 text-[12px]">
  <Search className="h-3.5 w-3.5 shrink-0 text-[#9aa1b1]" />
  <input value={value} onChange={(event) => onChange(event.target.value)} {...hintProps(hint)} className="min-w-0 flex-1 bg-transparent outline-none " />
</div>;

const AIErrorCard = ({ run, onRetry, onOpenAgent }: { run: AgentRunView; onRetry: () => void; onOpenAgent: () => void }) => {
  const { t } = useTranslation();
  return <div className="rounded-2xl border border-[#f3d0cc] bg-white p-4 shadow-[0_2px_8px_rgba(20,28,46,0.08)]">
    <div className="mb-2 flex items-center gap-2">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[#fdecea] text-[#BC4E32]"><ImageOff className="h-3.5 w-3.5" /></span>
      <span className="font-semibold">{t('editor.sourcePanels.ai.failureTitle')}</span>
      <span className="ml-auto shrink-0 whitespace-nowrap text-[11px] text-[#9aa1b1]">{run.status}</span>
    </div>
    <p className="mb-3 text-[12px] leading-relaxed text-[#42485a]">{t('editor.sourcePanels.ai.failureBody')}</p>
    <div className="flex gap-2">
      <button onClick={onRetry} className="inline-flex min-h-9 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F36440] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#d9532b]">
        <RotateCw className="h-3.5 w-3.5 shrink-0" /> {t('common.retry')}
      </button>
      <button onClick={onOpenAgent} className="whitespace-nowrap rounded-lg border border-[#e4e7ec] px-3 py-2 text-[12.5px] text-[#42485a] hover:bg-[#f3f4f6]">{t('editor.sourcePanels.ai.viewContext')}</button>
    </div>
  </div>;
};

const SourceEmpty = ({ icon, title, body, action, onAction }: { icon: ReactNode; title: string; body: string; action?: string; onAction?: () => void }) => <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d9e0] bg-[#fafbfc] px-4 text-center">
  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#fdeee9] text-[#d9532b]">{icon}</span>
  <div className="text-[13px] font-semibold text-[#1a1d24]">{title}</div>
  <div className="text-[12px] leading-relaxed text-[#7a8194]">{body}</div>
  {action && <button onClick={onAction} className="mt-1 inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F36440] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#d9532b]">{action}</button>}
</div>;

const SourceLoading = ({ label }: { label: string }) => <div className="flex h-full min-h-[260px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[#d5d9e0] bg-[#fafbfc] px-4 text-center text-[#7a8194]">
  <Loader2 className="h-5 w-5 animate-spin text-[#d9532b]" />
  <span className="shrink-0 whitespace-nowrap text-[12px] font-semibold">{label}</span>
</div>;

const ShareDialog = ({
  open,
  busy,
  url,
  publicAccess,
  copied,
  error,
  onClose,
  onCopy,
  onToggle,
}: {
  open: boolean;
  busy: boolean;
  url: string | null;
  publicAccess: boolean;
  copied: boolean;
  error: string | null;
  onClose: () => void;
  onCopy: () => void;
  onToggle: (enabled: boolean) => void;
}) => {
  const { t } = useTranslation();
  if (!open) return null;
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 px-6" onClick={busy ? undefined : onClose}>
    <div className="w-[380px] max-w-[92vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(20,28,46,.35)]" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#fdeee9] text-[#F36440]"><Share2 className="h-4 w-4" /></span>
        <h3 className="text-[15px] font-bold tracking-tight">{t('share.title')}</h3>
        <button onClick={onClose} disabled={busy} className="ml-auto rounded-md p-1 text-[#9aa1b1] hover:bg-[#f3f4f6] hover:text-[#1a1d24] disabled:opacity-40" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
      </div>
      <div className="px-5 py-4">
        <p className="mb-3 text-[12.5px] leading-relaxed text-[#42485a]">{t('share.body')}</p>
        <div className="mb-3 flex items-center gap-2 rounded-lg border border-[#e4e7ec] bg-[#f6f7f9] px-3 py-2">
          <Link2 className="h-3.5 w-3.5 shrink-0 text-[#9aa1b1]" />
          <span className="min-w-0 flex-1 truncate text-[12px] tabular-nums text-[#42485a]">{busy && !url ? t('share.loading') : url ?? '-'}</span>
          <button onClick={onCopy} disabled={!url || busy} className="inline-flex min-h-7 shrink-0 items-center gap-1 whitespace-nowrap rounded-md bg-[#F36440] px-2 py-1 text-[11.5px] font-semibold text-white hover:bg-[#d9532b] disabled:opacity-50">
            <Copy className="h-3 w-3" /> {copied ? t('share.copied') : t('share.copy')}
          </button>
        </div>
        <button onClick={() => onToggle(!publicAccess)} disabled={busy} className="flex min-h-10 w-full items-center justify-between rounded-lg border border-[#e4e7ec] px-3 py-2 text-[12.5px] text-[#42485a] hover:bg-[#f6f7f9] disabled:opacity-50">
          <span className="inline-flex min-w-0 items-center gap-2">
            {busy ? <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-[#d9532b]" /> : publicAccess ? <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#34a853]" /> : <AlertCircle className="h-3.5 w-3.5 shrink-0 text-[#9aa1b1]" />}
            <span className="truncate">{publicAccess ? t('share.publicOn') : t('share.publicOff')}</span>
          </span>
          <span className={`h-4 w-7 shrink-0 rounded-full p-0.5 ${publicAccess ? 'bg-[#34a853]' : 'bg-[#d5d9e0]'}`}><span className={`block h-3 w-3 rounded-full bg-white transition-transform ${publicAccess ? 'translate-x-3' : ''}`} /></span>
        </button>
        {error && <div className="mt-3 rounded-lg border border-[#f3d0cc] bg-[#fff7f6] px-3 py-2 text-[12px] text-[#BC4E32]">{error}</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-5 py-3">
        <button onClick={onClose} disabled={busy} className="whitespace-nowrap rounded-lg border border-[#e4e7ec] px-3.5 py-2 text-[12.5px] font-semibold text-[#42485a] hover:bg-[#f3f4f6] disabled:opacity-50">{t('common.done')}</button>
      </div>
    </div>
  </div>;
};

const EditorAlertDialog = ({ config, onClose }: { config: EditorAlertConfig | null; onClose: () => void }) => {
  const { t } = useTranslation();
  const isMobile = useIsMobileEditor();
  if (!config) return null;
  const confirm = () => {
    config.onConfirm?.();
    onClose();
  };
  if (isMobile) {
    return <div className="fixed inset-0 z-[70] bg-black/40" onClick={onClose}>
      <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white pb-7 shadow-[0_-10px_36px_rgba(20,28,46,.25)]" onClick={(event) => event.stopPropagation()}>
        <div className="flex justify-center pt-2"><span className="h-1 w-9 rounded-full bg-[#d5d9e0]" /></div>
        <div className="flex items-start gap-3 px-5 pt-4">
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${config.danger ? 'bg-[#fdecea] text-[#BC4E32]' : 'bg-[#fdeee9] text-[#F36440]'}`}>
            {config.danger ? <AlertTriangle className="h-5 w-5" /> : <AlertCircle className="h-5 w-5" />}
          </span>
          <div className="min-w-0">
            <h3 className="text-[15px] font-bold tracking-tight">{config.title}</h3>
            <p className="mt-1 text-[12.5px] leading-relaxed text-[#42485a]">{config.body}</p>
          </div>
        </div>
        <div className="mt-4 flex gap-2 px-5">
          {config.cancelLabel && <button onClick={onClose} className="min-h-12 flex-1 whitespace-nowrap rounded-xl border border-[#e4e7ec] px-3 text-[14px] font-semibold text-[#42485a]">{config.cancelLabel}</button>}
          <button onClick={confirm} className={`inline-flex min-h-12 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl px-3 text-[14px] font-semibold text-white ${config.danger ? 'bg-[#BC4E32]' : 'bg-[#F36440]'}`}>
            {config.danger && <Trash2 className="h-4 w-4" />}
            {config.confirmLabel}
          </button>
        </div>
      </div>
    </div>;
  }
  return <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 px-6" onClick={onClose}>
    <div className="w-[380px] max-w-[92vw] overflow-hidden rounded-2xl bg-white shadow-[0_24px_60px_rgba(20,28,46,.35)]" onClick={(event) => event.stopPropagation()}>
      <div className="flex items-center gap-2.5 px-5 pt-5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-xl ${config.danger ? 'bg-[#fdecea] text-[#BC4E32]' : 'bg-[#fdeee9] text-[#F36440]'}`}>
          {config.danger ? <AlertTriangle className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
        </span>
        <h3 className="text-[15px] font-bold tracking-tight">{config.title}</h3>
        <button onClick={onClose} className="ml-auto rounded-md p-1 text-[#9aa1b1] hover:bg-[#f3f4f6] hover:text-[#1a1d24]" aria-label={t('common.close')}><X className="h-4 w-4" /></button>
      </div>
      <div className="px-5 py-4 text-[12.5px] leading-relaxed text-[#42485a]">{config.body}</div>
      <div className="flex justify-end gap-2 border-t border-[#eef0f3] bg-[#fafbfc] px-5 py-3">
        {config.cancelLabel && <button onClick={onClose} className="whitespace-nowrap rounded-lg border border-[#e4e7ec] px-3.5 py-2 text-[12.5px] font-semibold text-[#42485a] hover:bg-[#f3f4f6]">{config.cancelLabel}</button>}
        <button onClick={confirm} className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3.5 py-2 text-[12.5px] font-semibold text-white ${config.danger ? 'bg-[#BC4E32] hover:bg-[#a13e2b]' : 'bg-[#F36440] hover:bg-[#d9532b]'}`}>
          {config.danger && <Trash2 className="h-3.5 w-3.5" />}
          {config.confirmLabel}
        </button>
      </div>
    </div>
  </div>;
};

const EmptyCardState = ({ onUseTemplate }: { onUseTemplate: () => void }) => {
  const { t } = useTranslation();
  return <div className="flex h-[300px] w-[300px] flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-[#cfd4dc] bg-white/60">
    <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#fdeee9] text-[#F36440]"><Plus className="h-6 w-6" /></span>
    <p className="text-[13px] font-semibold">{t('editor.emptyCard.title')}</p>
    <p className="-mt-1 text-[12px] text-[#9aa1b1]">{t('editor.emptyCard.body')}</p>
    <button onClick={onUseTemplate} className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-lg bg-[#F36440] px-3 py-2 text-[12.5px] font-semibold text-white hover:bg-[#d9532b]">
      <LayersIcon className="h-3.5 w-3.5 shrink-0" /> {t('editor.emptyCard.useTemplate')}
    </button>
  </div>;
};

const EditorLoadingSkeleton = () => {
  const { t } = useTranslation();
  return <div className="flex h-dvh w-full overflow-hidden bg-[#eef0f3] text-[#1a1d24]">
    <div className="flex w-[60px] shrink-0 flex-col items-center gap-2 border-r border-[#e4e7ec] bg-white py-3">
      {[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-[42px] w-[48px] animate-pulse rounded-lg bg-[#f3f4f6]" />)}
    </div>
    <div className="w-[264px] shrink-0 border-r border-[#e4e7ec] bg-white">
      <div className="h-12 border-b border-[#eef0f3] px-4 py-3"><div className="h-4 w-24 animate-pulse rounded bg-[#eef0f3]" /></div>
      <div className="space-y-2 p-3">{[0, 1, 2, 3, 4].map((item) => <div key={item} className="h-10 animate-pulse rounded-lg bg-[#f3f4f6]" />)}</div>
    </div>
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="h-[52px] shrink-0 border-b border-[#e4e7ec] bg-white" />
      <div className="grid flex-1 place-items-center bg-[#eef0f3]" style={{ backgroundImage: 'radial-gradient(circle,#d8dce2 1px,transparent 1px)', backgroundSize: '22px 22px' }}>
        <div className="relative h-[300px] w-[300px] overflow-hidden rounded-xl bg-white shadow-lg">
          <div className="absolute inset-0 animate-pulse">
            <div className="absolute right-6 top-8 h-24 w-24 rounded-full bg-[#eef0f3]" />
            <div className="absolute left-6 bottom-16 h-7 w-40 rounded bg-[#eef0f3]" />
            <div className="absolute left-6 bottom-7 h-7 w-28 rounded bg-[#eef0f3]" />
          </div>
          <div className="absolute inset-x-0 bottom-3 flex items-center justify-center gap-1.5 text-[11px] text-[#9aa1b1]"><Loader2 className="h-3.5 w-3.5 animate-spin" /> {t('editor.loadingCard')}</div>
        </div>
      </div>
    </div>
    <div className="w-[284px] shrink-0 border-l border-[#e4e7ec] bg-white">
      <div className="h-12 border-b border-[#eef0f3]" />
      <div className="space-y-2 p-3">{[0, 1, 2, 3].map((item) => <div key={item} className="h-12 animate-pulse rounded-lg bg-[#f3f4f6]" />)}</div>
    </div>
  </div>;
};

const RightContextHeader = ({ panel, layer, selectedCount, card }: { panel: RightPanel; layer: Layer | null; selectedCount: number; card: CardEditorCard }) => {
  const { t } = useTranslation();
  const panelItem = RIGHT_PANEL_ITEMS.find((item) => item.id === panel) ?? RIGHT_PANEL_ITEMS[0];
  const LayerIcon = panel === 'inspector' && selectedCount > 1 ? Group : layer ? LAYER_ICON[layer.kind] : panelItem.icon;
  const title = panel === 'inspector'
    ? selectedCount > 1 ? t('editor.context.multi', { count: selectedCount }) : layer ? t(`editor.context.kind.${layer.kind}`) : t('editor.context.page')
    : t(panelItem.labelKey);
  const subtitle = panel === 'inspector'
    ? selectedCount > 1 ? t('editor.context.groupable') : layer?.name ?? card.ratio
    : card.title;
  return <div className="flex min-h-[48px] items-center gap-2 border-b border-[#eef0f3] px-4 py-3">
    <LayerIcon className={`h-[15px] w-[15px] shrink-0 ${panel === 'inspector' && layer ? 'text-[#d9532b]' : 'text-[#7a8194]'}`} />
    <span className="shrink-0 whitespace-nowrap font-semibold tracking-tight">{title}</span>
    <span className="ml-auto min-w-0 truncate text-[11px] text-[#9aa1b1]">{subtitle}</span>
  </div>;
};

/* ─────────────────────────── Layer row ─────────────────────────── */

const LayerRow = ({
  mobile = false,
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
  onDelete,
  onDragStartRow,
  onDragOverRow,
  onDropRow,
  onDragEndRow
}: {
  mobile?: boolean;
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
  onDelete: () => void;
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
      className={`group relative flex items-center gap-1.5 rounded-lg px-2 cursor-pointer transition-colors ${mobile ? 'min-h-12 py-2' : 'min-h-10 py-1.5'} ${isSelected ? 'bg-[#fdeee9] ring-1 ring-inset ring-[#f3b39c]' : 'hover:bg-[#f6f7f9]'} ${dragging ? 'opacity-40' : ''}`}>
      {/* M-216: drop-position indicator while dragging a row to reorder */}
      {dropPos && <span className={`absolute left-1 right-1 h-0.5 rounded-full bg-[#F36440] ${dropPos === 'above' ? '-top-px' : '-bottom-px'}`} />}
      <GripVertical className="w-3.5 h-3.5 text-[#c2c7d1] shrink-0 cursor-grab" />
      <button onClick={e => {
      e.stopPropagation();
      onToggleVisibility();
      }} className={`grid shrink-0 place-items-center rounded-md text-[#7a8194] hover:bg-white ${mobile ? 'h-10 w-10' : 'h-7 w-7'}`} aria-label="Toggle visibility" title="Toggle visibility">
        {layer.visible ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
      </button>
      <button onClick={e => {
      e.stopPropagation();
      onToggleLock();
    }} className={`grid shrink-0 place-items-center rounded-md hover:bg-white ${mobile ? 'h-10 w-10' : 'h-7 w-7'} ${layer.locked ? 'text-[#d9532b]' : 'text-[#7a8194]/70'}`} aria-label="Toggle lock" title="Toggle lock">
        {layer.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5 opacity-60 group-hover:opacity-100" />}
      </button>
      <Icon className={`w-3.5 h-3.5 shrink-0 ${isSelected ? 'text-[#d9532b]' : 'text-[#9aa1b1]'}`} />
      <div className="flex-1 min-w-0">
        <div className={`text-[12px] truncate ${isSelected ? 'font-semibold text-[#1a1d24]' : 'font-medium text-[#42485a]'} ${!layer.visible ? 'text-[#9aa1b1]' : ''}`}>
          {layer.name}
        </div>
        <div className="text-[9.5px] font-mono text-[#9aa1b1] truncate">
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
    }} className={`grid shrink-0 place-items-center rounded-md text-[#d9532b] hover:bg-white ${mobile ? 'h-10 w-10' : 'h-7 w-7'}`} aria-label={t('editor.layers.bringIntoView')} title={t('editor.layers.bringIntoView')}>
        <Crosshair className="w-3.5 h-3.5" />
      </button>}
      {busy && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
      <div className={`ml-auto shrink-0 items-center gap-0.5 ${mobile ? 'flex' : 'hidden group-hover:flex'}`}>
        <button disabled={!canMoveUp} onClick={e => {
        e.stopPropagation();
        onMoveUp();
      }} className={`grid place-items-center rounded-md text-[#7a8194] hover:bg-white disabled:opacity-30 ${mobile ? 'h-10 w-10' : 'h-7 w-7'}`} aria-label="Move layer up">
          <ArrowUp className="w-3 h-3" />
        </button>
        <button disabled={!canMoveDown} onClick={e => {
        e.stopPropagation();
        onMoveDown();
      }} className={`grid place-items-center rounded-md text-[#7a8194] hover:bg-white disabled:opacity-30 ${mobile ? 'h-10 w-10' : 'h-7 w-7'}`} aria-label="Move layer down">
          <ArrowDown className="w-3 h-3" />
        </button>
        <button disabled={layer.locked} onClick={e => {
        e.stopPropagation();
        onDelete();
      }} className={`grid place-items-center rounded-md text-[#BC4E32] hover:bg-white disabled:opacity-30 ${mobile ? 'h-10 w-10' : 'h-7 w-7'}`} aria-label={t('editor.alerts.delete')} title={t('editor.alerts.delete')}>
          <Trash2 className="w-3 h-3" />
        </button>
      </div>
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

const layerRotation = (layer: Layer) => Number.isFinite(layer.rotation) ? Number(layer.rotation) : 0;

function normalizeDegrees(value: number) {
  const normalized = ((((value + 180) % 360) + 360) % 360) - 180;
  return Math.round(normalized);
}

function snapRotation(value: number, forceStep = false) {
  const normalized = normalizeDegrees(value);
  if (forceStep) return normalizeDegrees(Math.round(normalized / 15) * 15);
  const anchors = [-180, -135, -90, -45, 0, 45, 90, 135, 180];
  const hit = anchors.find((anchor) => Math.abs(normalizeDegrees(normalized - anchor)) <= 3);
  return hit === undefined ? normalized : normalizeDegrees(hit);
}

const hasRotationModifier = (event: PointerEvent | React.PointerEvent<HTMLElement>) =>
  event.shiftKey || event.altKey || event.metaKey || event.ctrlKey;

const touchPairAngle = (touches: TouchList | React.TouchList) => {
  const a = touches[0];
  const b = touches[1];
  return Math.atan2(b.clientY - a.clientY, b.clientX - a.clientX) * 180 / Math.PI;
};

const normalizeGradientAngle = (value: number | undefined) => {
  if (!Number.isFinite(value)) return DEFAULT_TEXT_GRADIENT_ANGLE;
  return ((Math.round(value ?? DEFAULT_TEXT_GRADIENT_ANGLE) % 360) + 360) % 360;
};

const normalizeHexColor = (value: string | undefined, fallback: string) => {
  if (typeof value !== 'string') return fallback;
  const next = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(next)) return next;
  if (/^#[0-9a-f]{3}$/i.test(next)) {
    const [, r, g, b] = next;
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return fallback;
};

const textFillStyle = (layer: Layer): CSSProperties => {
  if (layer.textFill !== 'gradient') return { color: '#FFFFFF', WebkitTextFillColor: undefined };
  const from = normalizeHexColor(layer.gradientFrom, DEFAULT_TEXT_GRADIENT_FROM);
  const to = normalizeHexColor(layer.gradientTo, DEFAULT_TEXT_GRADIENT_TO);
  const angle = normalizeGradientAngle(layer.gradientAngle);
  return {
    color: 'transparent',
    backgroundImage: `linear-gradient(${angle}deg, ${from}, ${to})`,
    backgroundClip: 'text',
    WebkitBackgroundClip: 'text',
    WebkitTextFillColor: 'transparent',
  };
};

const frameVisualStyle = (layer: Layer): CSSProperties => ({
  opacity: layer.opacity,
  mixBlendMode: layer.blendMode && layer.blendMode !== 'normal' ? layer.blendMode : undefined,
  ...(layerRotation(layer) ? { rotate: `${layerRotation(layer)}deg`, transformOrigin: 'center' } : {}),
}) as CSSProperties;

const layerShadow = (layer: Layer) => {
  if (!layer.shadowEnabled) return null;
  const x = layer.shadowOffsetX ?? 0;
  const y = layer.shadowOffsetY ?? 8;
  const blur = layer.shadowBlur ?? 18;
  const color = layer.shadowColor ?? 'rgba(20,28,46,0.24)';
  return `${x}px ${y}px ${blur}px ${color}`;
};

const layerStrokeShadow = (layer: Layer) => {
  if (!layer.strokeEnabled) return null;
  const width = Math.max(1, layer.strokeWidth ?? 2);
  const color = layer.strokeColor ?? '#F36440';
  return `0 0 0 ${width}px ${color}`;
};

const imageLayerStyle = (layer: Layer): CSSProperties => {
  const shadows = [layerShadow(layer), layerStrokeShadow(layer)].filter(Boolean).join(', ');
  return {
    borderRadius: layer.cornerRadius ? `${layer.cornerRadius}px` : undefined,
    boxShadow: shadows || undefined,
    overflow: layer.cornerRadius ? 'hidden' : undefined,
  };
};

const imageFilterStyle = (filter: ImageFilter | undefined): string | undefined => {
  if (filter === 'warm') return 'saturate(1.08) sepia(0.16)';
  if (filter === 'cool') return 'saturate(1.05) hue-rotate(10deg)';
  if (filter === 'mono') return 'grayscale(1)';
  if (filter === 'high-contrast') return 'contrast(1.18) saturate(1.12)';
  return undefined;
};

const textEffectStyle = (layer: Layer): CSSProperties => ({
  textShadow: layerShadow(layer) ?? undefined,
  ...(layer.strokeEnabled ? { WebkitTextStroke: `${Math.max(1, layer.strokeWidth ?? 1)}px ${layer.strokeColor ?? '#F36440'}` } : {}),
}) as CSSProperties;

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
  // R6-editor (1)/(4): transient overlays - red snap guides + marquee rect. Cleared on mouseup.
  const [guides, setGuides] = useState<{ x: number[]; y: number[] }>({ x: [], y: [] });
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(null);
  // M-225/226: true while an asset chip is dragged over the canvas (drop-target highlight).
  const [assetDragOver, setAssetDragOver] = useState(false);
  const innerRef = useRef<HTMLDivElement | null>(null);
  const touchRotateRef = useRef<{ layerId: string; startAngle: number; startRotation: number; nextRotation: number; node: HTMLElement } | null>(null);
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
    // R6-editor (1): equal-spacing - if a left + right neighbor exist on an axis, snap so the
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
  const startTouchRotate = (event: TouchEvent<HTMLDivElement>) => {
    if (event.touches.length !== 2 || selectedIds.length !== 1) {
      touchRotateRef.current = null;
      return;
    }
    const layer = layers.find((item) => item.id === selectedIds[0]);
    if (!layer || layer.locked || (layer.kind !== 'asset' && layer.kind !== 'text')) return;
    const node = innerRef.current?.querySelector(`[data-layer-id="${layer.id}"]`) as HTMLElement | null;
    if (!node) return;
    const rotation = layerRotation(layer);
    touchRotateRef.current = {
      layerId: layer.id,
      startAngle: touchPairAngle(event.touches),
      startRotation: rotation,
      nextRotation: rotation,
      node,
    };
  };
  const moveTouchRotate = (event: TouchEvent<HTMLDivElement>) => {
    const gesture = touchRotateRef.current;
    if (!gesture || event.touches.length !== 2) return;
    event.preventDefault();
    gesture.nextRotation = snapRotation(gesture.startRotation + touchPairAngle(event.touches) - gesture.startAngle);
    gesture.node.style.rotate = gesture.nextRotation ? `${gesture.nextRotation}deg` : '';
  };
  const finishTouchRotate = (persist: boolean) => {
    const gesture = touchRotateRef.current;
    if (!gesture) return;
    touchRotateRef.current = null;
    gesture.node.style.rotate = gesture.startRotation ? `${gesture.startRotation}deg` : '';
    if (persist && gesture.nextRotation !== gesture.startRotation) onPatchLayer(gesture.layerId, { rotation: gesture.nextRotation });
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
        data-m238-two-finger-rotate="true"
        onTouchStart={startTouchRotate}
        onTouchMove={moveTouchRotate}
        onTouchEnd={() => finishTouchRotate(true)}
        onTouchCancel={() => finishTouchRotate(false)}
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
        className={`relative overflow-hidden bloome-card-hero ${assetDragOver ? 'outline outline-2 outline-dashed outline-[#F36440] outline-offset-2' : ''}`} style={{
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
        const startRotate = (event: React.PointerEvent<HTMLElement>) => {
          if (l.locked || (l.kind !== 'asset' && l.kind !== 'text')) return;
          event.preventDefault();
          event.stopPropagation();
          onSelectLayer(l.id);
          const frameRect = innerRef.current?.getBoundingClientRect();
          const parent = event.currentTarget.parentElement as HTMLElement | null;
          if (!frameRect || !parent) return;
          const centerX = frameRect.left + x + lw / 2;
          const centerY = frameRect.top + y + lh / 2;
          const angleOf = (pointer: PointerEvent | React.PointerEvent<HTMLElement>) => Math.atan2(pointer.clientY - centerY, pointer.clientX - centerX) * 180 / Math.PI;
          const initialAngle = angleOf(event);
          const initialRotation = layerRotation(l);
          let frame = 0;
          let nextRotation = initialRotation;
          const paint = () => {
            frame = 0;
            parent.style.rotate = `${nextRotation}deg`;
          };
          const move = (moveEvent: PointerEvent) => {
            nextRotation = snapRotation(initialRotation + angleOf(moveEvent) - initialAngle, hasRotationModifier(moveEvent));
            if (!frame) frame = window.requestAnimationFrame(paint);
          };
          const up = (upEvent: PointerEvent) => {
            window.removeEventListener('pointermove', move);
            window.removeEventListener('pointerup', up);
            if (frame) window.cancelAnimationFrame(frame);
            parent.style.rotate = initialRotation ? `${initialRotation}deg` : '';
            const rotation = snapRotation(initialRotation + angleOf(upEvent) - initialAngle, hasRotationModifier(upEvent));
            if (rotation !== initialRotation) onPatchLayer(l.id, { rotation });
          };
          window.addEventListener('pointermove', move);
          window.addEventListener('pointerup', up, { once: true });
        };
        const startDrag = (event: React.PointerEvent<HTMLElement | SVGSVGElement>) => {
          if (event.target instanceof Element && event.target.closest('[data-resize-handle], [data-rotate-handle]')) return;
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
          const shouldSelectLayer = inEnteredGroup ? (selectedIds.length !== 1 || !alreadySelected) : !alreadySelected;
          if (shouldSelectLayer) onSelectLayer(l.id, event.shiftKey);
          else if (alreadySelected && selectedIds.length === 1) onSelectLayer(l.id);
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
            ...frameVisualStyle(l)
          }}>
                <span className="text-[500px] font-[900] leading-[0.8] text-white" style={{
              fontFamily: 'Inter, sans-serif',
              letterSpacing: '-30px'
            }}>b</span>
              </div>;
        }
        if (l.kind === 'asset' && l.id === 'l_asset_bird') {
          // matisse bird
          return <div key={l.id} data-layer-id={l.id} onPointerDown={startDrag} onDoubleClick={() => { if (l.groupId) onEnterGroup(l.groupId); }} className={`absolute ${l.locked ? '' : 'cursor-grab'} ${soloSelected ? 'outline outline-1 outline-[#F36440]' : ''}`} style={{
            left: x,
            top: y,
            width: lw,
            height: lh,
            ...frameVisualStyle(l),
            ...imageLayerStyle(l),
            touchAction: 'none'
          }}>
            <svg viewBox="0 0 200 200" className="w-full h-full" aria-hidden>
                <path d="M 30 100 Q 50 60 110 70 L 150 50 L 165 75 Q 175 80 165 95 L 170 110 L 150 130 Q 110 140 80 130 L 50 145 Z" fill={fg} stroke="#0C0A0F" strokeWidth="3" strokeLinejoin="round" />
                <circle cx="148" cy="78" r="2.5" fill="#0C0A0F" />
              </svg>
            {soloSelected && <SelectionHandles onResize={startResize} onRotate={startRotate} />}
          </div>;
        }
        if (l.kind === 'text') {
          return <EditableTextLayer key={l.id} layer={l} title={title} selected={soloSelected} x={x} y={y} width={lw} height={lh} onPointerDown={startDrag} onResize={startResize} onRotate={startRotate} onSave={(value) => onPatchLayer(l.id, { textValue: value })} />;
        }
        if (l.kind === 'asset') {
          return <div key={l.id} data-layer-id={l.id} onPointerDown={startDrag} onDoubleClick={() => { if (l.groupId) onEnterGroup(l.groupId); }} className={`absolute grid place-items-center ${l.locked ? '' : 'cursor-grab'} ${soloSelected ? 'outline outline-1 outline-[#F36440]' : ''}`} style={{
            left: x,
            top: y,
            width: lw,
            height: lh,
            ...frameVisualStyle(l),
            ...imageLayerStyle(l),
            touchAction: 'none'
          }}>
              {/* M-225/226: real asset image when present, else fallback icon. */}
              {l.src
                ? <img src={l.src} alt={l.name} draggable={false} className="absolute inset-0 w-full h-full pointer-events-none" style={{ outline: '1px solid rgba(0,0,0,0.1)', objectFit: l.cropMode ?? 'contain', filter: imageFilterStyle(l.filter), borderRadius: l.cornerRadius ? `${l.cornerRadius}px` : undefined }} onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
                : <ImageIcon className="w-10 h-10 text-white/80" />}
              {soloSelected && <SelectionHandles onResize={startResize} onRotate={startRotate} />}
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
          return <div className="absolute border border-dashed border-[#F36440]" style={{ left: bx, top: by, width: bw, height: bh, pointerEvents: 'none' }}>
            {corners.map((c) => <span key={c.id} onPointerDown={(e) => startGroupResize(c.id, e)} className={`absolute z-20 w-3 h-3 rounded-full bg-white border border-[#F36440] shadow-sm ${c.cls}`} style={{ cursor: c.cursor, pointerEvents: 'auto' }} />)}
          </div>;
        })()}

        {/* R6-editor (1): red snap guides (cleared on pointerup) */}
        {guides.x.map((gx, i) => <div key={`gx${i}`} className="absolute top-0 bottom-0 pointer-events-none" style={{ left: gx, width: 1, background: '#F36440' }} />)}
        {guides.y.map((gy, i) => <div key={`gy${i}`} className="absolute left-0 right-0 pointer-events-none" style={{ top: gy, height: 1, background: '#F36440' }} />)}

        {/* R6-editor (4): marquee rubber-band */}
        {marquee && <div className="absolute pointer-events-none border border-[#F36440] bg-[#F36440]/10" style={{ left: marquee.x, top: marquee.y, width: marquee.w, height: marquee.h }} />}

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
  onRotate,
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
  onRotate: (event: React.PointerEvent<HTMLElement>) => void;
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
  // M-083: selection happens in startDrag (pointerdown), exactly like asset layers - a
  // separate onClick=onSelect here re-toggled the just-added shift-selection back off, which
  // is why canvas shift-click multi-select never accumulated for text layers.
  return <div data-layer-id={layer.id} onPointerDown={editing ? undefined : onPointerDown} onDoubleClick={() => !layer.locked && setEditing(true)} className={`absolute ${layer.locked ? '' : 'cursor-grab'} ${selected ? 'outline outline-1 outline-[#F36440]' : ''}`} style={{ left: x, top: y, width, height, ...frameVisualStyle(layer), touchAction: 'none' }}>
    <div ref={ref} data-m203-text-gradient="true" data-text-gradient-fill={layer.textFill === 'gradient' ? 'true' : 'false'} contentEditable={editing} suppressContentEditableWarning onBlur={save} onKeyDown={(event) => {
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
      // text-decoration auto-tracks the text width - no more fixed 120px SVG squiggle.
      textDecorationLine: layer.decoration && layer.decoration !== 'none' ? 'underline' : 'none',
      textDecorationStyle:
        layer.decoration === 'wavy' ? 'wavy' :
        layer.decoration === 'dashed' ? 'dashed' :
        layer.decoration === 'dotted' ? 'dotted' : 'solid',
      textDecorationColor: layer.decorationColor ?? '#F36440',
      textDecorationThickness: '2.5px',
      textUnderlineOffset: '6px',
      ...textFillStyle(layer),
      ...textEffectStyle(layer),
    }}>
      {value}
    </div>
    {selected && !editing && <SelectionHandles onResize={onResize} onRotate={onRotate} />}
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

const SelectionHandles = ({ onResize, onRotate }: { onResize: (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => void; onRotate: (event: React.PointerEvent<HTMLElement>) => void }) => <>
  <button
    type="button"
    data-rotate-handle="true"
    data-m201-desktop-rotate-handle="true"
    onPointerDown={onRotate}
    className="absolute left-1/2 z-30 flex h-11 w-11 -translate-x-1/2 items-center justify-center rounded-full border-2 border-[#F36440] bg-white text-[#F36440] shadow-sm md:-top-9 md:h-7 md:w-7 -top-14"
    style={{ touchAction: 'none' }}
    aria-label="Rotate layer"
    title="Rotate layer"
  >
    <span className="absolute left-1/2 top-full h-3 w-px -translate-x-1/2 bg-[#F36440] md:h-2" />
    <RotateCw className="h-4 w-4 md:h-3 md:w-3" />
  </button>
  <ResizeHandles onResize={onResize} />
</>;

const ResizeHandles = ({ onResize }: { onResize: (handle: ResizeHandle, event: React.PointerEvent<HTMLElement>) => void }) => <>
  {HANDLE_POSITIONS.map((handle) => <span
    key={handle.id}
    data-resize-handle={handle.id}
    onPointerDown={(event) => onResize(handle.id, event)}
    className={`absolute z-20 h-11 w-11 md:h-3 md:w-3 ${handle.className}`}
    style={{ cursor: handle.cursor, touchAction: 'none' }}
  >
    <span className="absolute left-1/2 top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border border-[#F36440] bg-white shadow-sm" />
  </span>)}
</>;

// R5 (b): how far an element may hang off any edge (canvas-preview px). Canva-style
// bleed - symmetric on all four sides; export clips to the page rect (canvas is
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
// falls outside the page rect - a partially-bleeding layer is still findable.
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
// back to 'Custom' - keeping select.value consistent with the rendered canvas.
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

const ReferenceAttachControl = ({
  selectedAssets,
  libraryAssets,
  producedAssets,
  onAttach,
  onRemove,
}: {
  selectedAssets: EditorSourceAsset[];
  libraryAssets: EditorSourceAsset[];
  producedAssets: EditorSourceAsset[];
  onAttach: (asset: EditorSourceAsset) => void;
  onRemove: (id: string) => void;
}) => {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const selectedIds = new Set(selectedAssets.map((asset) => asset.id));
  const full = selectedAssets.length >= REFERENCE_ASSET_LIMIT;
  const empty = libraryAssets.length === 0 && producedAssets.length === 0;
  return <div data-m209-reference-attach="true" className="mt-2 rounded-lg border border-[#f3d2c5] bg-[#fff8f5] px-2.5 py-2">
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="inline-flex min-h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-[#f3b39c] bg-white px-2 py-1 text-[11.5px] font-semibold text-[#d9532b] hover:bg-[#fdeee9]"
        aria-expanded={open}
      >
        <FileImage className="h-3.5 w-3.5 shrink-0" />
        <span className="whitespace-nowrap">{t('editor.reference.label')}</span>
        <span className="rounded bg-[#fdeee9] px-1.5 py-0.5 font-mono text-[10px] text-[#BC4E32]">{t('editor.reference.count', { count: selectedAssets.length, max: REFERENCE_ASSET_LIMIT })}</span>
      </button>
      <div className="min-w-0 flex-1 truncate text-[10.5px] leading-snug text-[#7a8194]">
        {full ? t('editor.reference.full') : selectedAssets.length > 0 ? t('editor.reference.normalHint') : t('editor.reference.emptyHint')}
      </div>
    </div>
    {selectedAssets.length > 0 && <div className="mt-2 flex gap-1.5 overflow-x-auto pb-0.5">
      {selectedAssets.map((asset) => <div key={asset.id} className="relative h-11 w-11 shrink-0 overflow-hidden rounded-md border border-[#f3b39c] bg-[#f7f5f1]">
        {asset.previewUrl && <img src={asset.previewUrl} alt={asset.name ?? ''} className="absolute inset-0 h-full w-full object-contain" draggable={false} loading="lazy" />}
        <button
          type="button"
          onClick={() => onRemove(asset.id)}
          aria-label={t('editor.reference.remove')}
          title={t('editor.reference.remove')}
          className="absolute right-0.5 top-0.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-[#0C0A0F]/70 text-white"
        >
          <X className="h-3 w-3" />
        </button>
      </div>)}
    </div>}
    {open && <div className="mt-2 space-y-2 rounded-lg border border-[#e4e7ec] bg-white p-2 shadow-[0_8px_20px_rgba(20,28,46,0.08)]">
      {empty ? <div className="rounded-md border border-dashed border-[#e4e7ec] px-2.5 py-3 text-[11.5px] leading-relaxed text-[#7a8194]">
        {t('editor.reference.emptyPicker')}
      </div> : <>
        <ReferenceOptionSection
          title={t('editor.reference.library')}
          emptyLabel={t('editor.reference.noLibrary')}
          assets={libraryAssets}
          selectedIds={selectedIds}
          full={full}
          onAttach={onAttach}
        />
        <ReferenceOptionSection
          title={t('editor.reference.produced')}
          emptyLabel={t('editor.reference.noProduced')}
          assets={producedAssets}
          selectedIds={selectedIds}
          full={full}
          onAttach={onAttach}
        />
      </>}
    </div>}
  </div>;
};

const ReferenceOptionSection = ({
  title,
  emptyLabel,
  assets,
  selectedIds,
  full,
  onAttach,
}: {
  title: string;
  emptyLabel: string;
  assets: EditorSourceAsset[];
  selectedIds: Set<string>;
  full: boolean;
  onAttach: (asset: EditorSourceAsset) => void;
}) => <section>
  <div className="mb-1.5 flex items-center justify-between gap-2">
    <div className="shrink-0 whitespace-nowrap text-[10px] font-bold uppercase tracking-wider text-[#7a8194]">{title}</div>
    <div className="shrink-0 font-mono text-[10px] text-[#9aa1b1]">{assets.length}</div>
  </div>
  {assets.length === 0 ? <div className="rounded-md bg-[#f6f7f9] px-2 py-2 text-[11px] text-[#7a8194]">{emptyLabel}</div> : <div className="grid grid-cols-4 gap-1.5">
    {assets.slice(0, 12).map((asset) => <ReferenceOptionTile
      key={asset.id}
      asset={asset}
      selected={selectedIds.has(asset.id)}
      disabled={full && !selectedIds.has(asset.id)}
      onAttach={onAttach}
    />)}
  </div>}
</section>;

const ReferenceOptionTile = ({
  asset,
  selected,
  disabled,
  onAttach,
}: {
  asset: EditorSourceAsset;
  selected: boolean;
  disabled: boolean;
  onAttach: (asset: EditorSourceAsset) => void;
}) => {
  const { t } = useTranslation();
  return <button
    type="button"
    onClick={() => !selected && !disabled && onAttach(asset)}
    disabled={selected || disabled}
    title={selected ? t('editor.reference.selected') : asset.name ?? asset.id}
    className={`relative aspect-square overflow-hidden rounded-md border bg-[#f7f5f1] ${selected ? 'border-[#F36440] ring-2 ring-[#F36440]/30' : disabled ? 'border-[#e4e7ec] opacity-45' : 'border-[#e4e7ec] hover:border-[#f3b39c]'}`}
  >
    {asset.previewUrl && <img src={asset.previewUrl} alt={asset.name ?? ''} className="absolute inset-0 h-full w-full object-contain" draggable={false} loading="lazy" />}
    {selected && <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-[#F36440] text-white">
      <CheckCircle2 className="h-3.5 w-3.5" />
    </span>}
  </button>;
};

const AgentPanel = ({
  input,
  setInput,
  runs,
  referenceAssets,
  libraryReferenceAssets,
  producedReferenceAssets,
  onAttachReferenceAsset,
  onRemoveReferenceAsset,
  onRun,
  onRetry,
  layoutSuggestion,
  onSuggestLayout,
  onOpenAgent,
  sessionName
}: {
  input: string;
  setInput: (v: string) => void;
  runs: AgentRunView[];
  referenceAssets: EditorSourceAsset[];
  libraryReferenceAssets: EditorSourceAsset[];
  producedReferenceAssets: EditorSourceAsset[];
  onAttachReferenceAsset: (asset: EditorSourceAsset) => void;
  onRemoveReferenceAsset: (id: string) => void;
  onRun?: (prompt: string) => void;
  onRetry?: (prompt: string) => void;
  layoutSuggestion: LayoutSuggestionState;
  onSuggestLayout?: () => void;
  onOpenAgent: () => void;
  sessionName?: string | null;
}) => {
  const { t } = useTranslation();
  const latest = runs[0] ?? null;
  const latestFailed = latest && (latest.status === 'failed' || latest.status === 'stream-lost' || latest.steps?.some((step) => step.status === 'error'));
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
        <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">{t('editor.agentPanel.session')}</div>
        <div className="text-[13px] font-semibold leading-tight mt-0.5">{sessionName ?? t('editor.agentPanel.newSession')}</div>
      </div>
    </div>

    {/* Omnibar */}
    <form className="bloome-card p-1.5 flex items-center gap-1.5" onSubmit={submit}>
      <Search className="w-3.5 h-3.5 ml-1 text-muted-foreground shrink-0" />
      <input value={input} onChange={e => setInput(e.target.value)} {...hintProps(t('editor.agentPanel.prompt'))} className="flex-1 bg-transparent text-[13px] focus:outline-none " />
    
      <button type="submit" className="p-1.5 rounded-md bg-[#F36440] text-primary-foreground" aria-label={t('editor.agentPanel.run')}>
        <ArrowRight className="w-3 h-3" />
      </button>
    </form>

    <ReferenceAttachControl
      selectedAssets={referenceAssets}
      libraryAssets={libraryReferenceAssets}
      producedAssets={producedReferenceAssets}
      onAttach={onAttachReferenceAsset}
      onRemove={onRemoveReferenceAsset}
    />

    <SuggestLayoutAction state={layoutSuggestion} onSuggest={onSuggestLayout} />

    {/* Active plan or empty state */}
    {latestFailed ? <AIErrorCard run={latest} onRetry={() => onRetry?.(latest.prompt)} onOpenAgent={onOpenAgent} /> : latest ? <div className="bloome-card overflow-hidden">
      <div className="px-3 py-1.5 flex items-baseline justify-between">
        <span className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground">{t('editor.agentPanel.plan')}</span>
        <span className="text-[10px] font-mono text-muted-foreground">{`${latest.status} · ${formatMicros(latest.costMicros ?? 0)}`}</span>
      </div>
      <div className="px-3 pb-2 text-[12px] text-foreground leading-relaxed">
        <span className="italic text-muted-foreground">"{latest.prompt}"</span>
      </div>
      {latest.steps && latest.steps.length > 0 && <ul className="px-3 pb-2 space-y-1 text-[11.5px]">
        {latest.steps.slice(0, 8).map((step, index) => <li key={`${step.name}-${index}`} className="grid grid-cols-[14px_1fr_auto] gap-1.5 items-baseline">
          {step.status === 'running' ? <Loader2 className="w-3 h-3 text-[#d9532b] animate-spin self-center" /> : step.status === 'error' ? <AlertCircle className="w-3 h-3 text-[var(--destructive)] self-center" /> : <CheckCircle2 className="w-3 h-3 text-[var(--success)] self-center" />}
          <span><code className="font-mono">{step.name}</code></span>
          <span className="text-[10px] font-mono text-muted-foreground">{step.status === 'running' ? '...' : step.status}</span>
        </li>)}
      </ul>}
      {latest.producedAssets && latest.producedAssets.length > 0 && <ProducedAssetStrip assets={latest.producedAssets} onZoom={setZoom} onAttachReference={onAttachReferenceAsset} selectedReferenceIds={referenceAssets.map((asset) => asset.id)} />}
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
            {r.producedAssets && r.producedAssets.length > 0 && <ProducedAssetStrip assets={r.producedAssets} onZoom={setZoom} compact onAttachReference={onAttachReferenceAsset} selectedReferenceIds={referenceAssets.map((asset) => asset.id)} />}
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
const ProducedAssetStrip = ({ assets, onZoom, compact = false, onAttachReference, selectedReferenceIds = [] }: {
  assets: NonNullable<AgentRunView['producedAssets']>;
  onZoom: (asset: NonNullable<AgentRunView['producedAssets']>[number]) => void;
  compact?: boolean;
  onAttachReference?: (asset: EditorSourceAsset) => void;
  selectedReferenceIds?: string[];
}) => <div className={compact ? 'mt-1.5' : 'px-3 pb-2.5'}>
    {!compact && <div className="text-[10px] uppercase tracking-wider font-bold text-muted-foreground mb-1.5">Produced · {assets.length}</div>}
    <div className={`grid gap-1.5 ${compact ? 'grid-cols-6' : 'grid-cols-3'}`}>
      {assets.map(asset => <ProducedAssetThumb key={asset.id} asset={asset} onZoom={onZoom} onAttachReference={onAttachReference} referenceSelected={selectedReferenceIds.includes(asset.id)} />)}
    </div>
  </div>;

const ProducedAssetThumb = ({ asset, onZoom, onAttachReference, referenceSelected = false }: {
  asset: NonNullable<AgentRunView['producedAssets']>[number];
  onZoom: (asset: NonNullable<AgentRunView['producedAssets']>[number]) => void;
  onAttachReference?: (asset: EditorSourceAsset) => void;
  referenceSelected?: boolean;
}) => {
  const { t } = useTranslation();
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
    {ready && onAttachReference && <button
      type="button"
      onClick={(e) => { e.stopPropagation(); if (!referenceSelected) onAttachReference(asset); }}
      disabled={referenceSelected}
      title={referenceSelected ? t('editor.reference.selected') : t('editor.reference.attach')}
      aria-label={referenceSelected ? t('editor.reference.selected') : t('editor.reference.attach')}
      className={`absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-md border bg-white/95 shadow-sm ${referenceSelected ? 'border-[#F36440] text-[#F36440]' : 'border-[#e4e7ec] text-[#42485a] hover:border-[#f3b39c] hover:text-[#d9532b]'}`}
    >
      {referenceSelected ? <CheckCircle2 className="h-3.5 w-3.5" /> : <FileImage className="h-3.5 w-3.5" />}
    </button>}
    {ready && <button onClick={(e) => { e.stopPropagation(); window.dispatchEvent(new CustomEvent('magpie:add-asset-to-card', { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl, width: asset.width, height: asset.height } })); }} title="Add to card" className="absolute bottom-1 left-1 right-1 opacity-0 group-hover:opacity-100 rounded bg-[#F36440] text-primary-foreground py-0.5 text-[9px] font-semibold inline-flex items-center justify-center gap-1 transition-opacity">
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
        <button onClick={() => { window.dispatchEvent(new CustomEvent('magpie:add-asset-to-card', { detail: { assetId: asset.id, name: asset.name, previewUrl: asset.previewUrl, width: asset.width, height: asset.height } })); onClose(); }} className="shrink-0 rounded-md bg-[#F36440] text-primary-foreground px-3 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5">
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
      {/* Brand rules are EDITED with the structured editor on /rules - never as JSON here (M-223). */}
      <a href="/rules" className="shrink-0 text-[11px] font-semibold text-[#d9532b] hover:underline inline-flex items-center gap-1 mt-0.5">Edit brand rules <ArrowRight className="w-3 h-3" /></a>
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

// Human-readable rendering of a brand-rule / rule-finding object - swatches, type + spacing
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
const TEXT_FILL_OPTIONS: TextFillMode[] = ['solid', 'gradient'];
const BLEND_OPTIONS: BlendMode[] = ['normal', 'multiply', 'screen', 'overlay', 'darken', 'lighten'];
const IMAGE_FILTER_OPTIONS: ImageFilter[] = ['none', 'warm', 'cool', 'mono', 'high-contrast'];
const CROP_OPTIONS: CropMode[] = ['contain', 'cover', 'fill'];

const InspectorPanel = ({
  card,
  layers,
  selectedIds,
  layer,
  canvasW,
  canvasH,
  canGroup,
  canUngroup,
  onPatchLayer,
  onPatchManyLayers,
  onGroupSelection,
  onUngroupSelection,
  onPatchCardMeta,
}: {
  card: CardEditorCard;
  layers: Layer[];
  selectedIds: string[];
  layer: Layer | null;
  canvasW: number;
  canvasH: number;
  canGroup: boolean;
  canUngroup: boolean;
  onPatchLayer: (id: string, patch: Partial<Layer>, title?: string) => void;
  onPatchManyLayers: (patches: Record<string, Partial<Layer>>) => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
  onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => void;
}) => {
  const selectedLayers = selectedIds.map((id) => layers.find((item) => item.id === id)).filter(Boolean) as Layer[];
  if (selectedLayers.length > 1) {
    return <MultiLayerInspector
      layers={selectedLayers}
      canvasW={canvasW}
      canvasH={canvasH}
      canGroup={canGroup}
      canUngroup={canUngroup}
      onPatchManyLayers={onPatchManyLayers}
      onGroupSelection={onGroupSelection}
      onUngroupSelection={onUngroupSelection}
    />;
  }
  if (layer?.kind === 'text') {
    return <TextLayerInspector layer={layer} canvasW={canvasW} canvasH={canvasH} onPatch={(patch) => onPatchLayer(layer.id, patch)} />;
  }
  if (layer?.kind === 'asset') {
    return <ImageLayerInspector layer={layer} canvasW={canvasW} canvasH={canvasH} onPatch={(patch) => onPatchLayer(layer.id, patch)} />;
  }
  return <PageInspector card={card} onPatchCardMeta={onPatchCardMeta} />;
};

const TextLayerInspector = ({ layer, canvasW, canvasH, onPatch }: { layer: Layer; canvasW: number; canvasH: number; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  return <InspectorScroll>
    <TransformAccordion layer={layer} canvasW={canvasW} canvasH={canvasH} onPatch={onPatch} />
    <InspectorAccordion title={t('editor.inspector.sections.text')} defaultOpen>
      <FieldLabel label={t('editor.inspector.fields.text')}>
        <input className={fieldInputClass} defaultValue={(layer.textValue ?? '').replace(/^"|"$/g, '')} onBlur={(event) => {
          const value = event.currentTarget.value.trim();
          if (value && value !== layer.textValue) onPatch({ textValue: value });
        }} />
      </FieldLabel>
      <SelectField label={t('editor.inspector.fields.font')} value={layer.font ?? 'Inter 800'} options={['Inter 800', 'Inter 600', 'Inter 400', 'JetBrains Mono 500'].map((id) => ({ id, label: id }))} onChange={(value) => onPatch({ font: value })} />
      <TextFillControls layer={layer} onPatch={onPatch} />
      <SliderField label={t('editor.inspector.fontSize')} min={8} max={160} value={layer.fontSize ?? 34} onChange={(value) => onPatch({ fontSize: value })} />
      <div>
        <div className={fieldLabelClass}>{t('editor.inspector.textAlign')}</div>
        <div className="inline-flex w-full overflow-hidden rounded-md border border-[#e4e7ec] bg-white">
          {TEXT_ALIGNS.map(({ id, Icon }) => {
            const active = (layer.textAlign ?? 'left') === id;
            return <button key={id} onClick={() => onPatch({ textAlign: id })} aria-label={t(`editor.inspector.align.${id}`)} title={t(`editor.inspector.align.${id}`)} className={`grid min-h-9 flex-1 shrink-0 place-items-center whitespace-nowrap px-2 py-1.5 ${active ? 'bg-[#F36440] text-white' : 'text-[#7a8194] hover:bg-[#f6f7f9]'}`}>
              <Icon className="h-3.5 w-3.5 shrink-0" />
            </button>;
          })}
        </div>
      </div>
      <SelectField label={t('editor.inspector.fields.decoration')} value={layer.decoration ?? 'none'} options={( ['none', 'solid', 'wavy', 'dashed', 'dotted'] as TextDecoration[]).map((id) => ({ id, label: t(`editor.inspector.decoration.${id}`) }))} onChange={(value) => onPatch({ decoration: value as TextDecoration })} />
    </InspectorAccordion>
    <AppearanceAccordion layer={layer} onPatch={onPatch} />
    <EffectsAccordion layer={layer} onPatch={onPatch} />
  </InspectorScroll>;
};

const TextFillControls = ({ layer, onPatch }: { layer: Layer; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  const mode = layer.textFill === 'gradient' ? 'gradient' : 'solid';
  const patchMode = (nextMode: TextFillMode) => {
    if (nextMode === 'gradient') {
      onPatch({
        textFill: 'gradient',
        gradientFrom: normalizeHexColor(layer.gradientFrom, DEFAULT_TEXT_GRADIENT_FROM),
        gradientTo: normalizeHexColor(layer.gradientTo, DEFAULT_TEXT_GRADIENT_TO),
        gradientAngle: normalizeGradientAngle(layer.gradientAngle),
      });
      return;
    }
    onPatch({ textFill: 'solid' });
  };
  return <div data-m203-text-gradient-controls="true" className="space-y-2">
    <div>
      <div className={fieldLabelClass}>{t('editor.inspector.fields.textFill')}</div>
      <div className="inline-flex w-full overflow-hidden rounded-md border border-[#e4e7ec] bg-white">
        {TEXT_FILL_OPTIONS.map((id) => {
          const active = mode === id;
          return <button key={id} type="button" onClick={() => patchMode(id)} className={`min-h-9 flex-1 shrink-0 whitespace-nowrap px-2 py-1.5 text-[12px] font-semibold ${active ? 'bg-[#F36440] text-white' : 'text-[#7a8194] hover:bg-[#f6f7f9]'}`}>
            {t(`editor.inspector.fill.${id}`)}
          </button>;
        })}
      </div>
    </div>
    {mode === 'gradient' && <div className="grid grid-cols-2 gap-2">
      <ColorField label={t('editor.inspector.fields.gradientFrom')} value={layer.gradientFrom ?? DEFAULT_TEXT_GRADIENT_FROM} fallback={DEFAULT_TEXT_GRADIENT_FROM} onChange={(value) => onPatch({ gradientFrom: value })} />
      <ColorField label={t('editor.inspector.fields.gradientTo')} value={layer.gradientTo ?? DEFAULT_TEXT_GRADIENT_TO} fallback={DEFAULT_TEXT_GRADIENT_TO} onChange={(value) => onPatch({ gradientTo: value })} />
      <div className="col-span-2">
        <NumberField label={t('editor.inspector.fields.gradientAngle')} value={normalizeGradientAngle(layer.gradientAngle)} min={0} max={359} onChange={(value) => onPatch({ gradientAngle: normalizeGradientAngle(value) })} suffix="°" />
      </div>
    </div>}
  </div>;
};

const ImageLayerInspector = ({ layer, canvasW, canvasH, onPatch }: { layer: Layer; canvasW: number; canvasH: number; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  const currentCrop = layer.cropMode ?? 'contain';
  const nextCrop = CROP_OPTIONS[(CROP_OPTIONS.indexOf(currentCrop) + 1) % CROP_OPTIONS.length];
  return <InspectorScroll>
    <TransformAccordion layer={layer} canvasW={canvasW} canvasH={canvasH} onPatch={onPatch} />
    <InspectorAccordion title={t('editor.inspector.sections.image')} defaultOpen>
      <button onClick={() => onPatch({ cropMode: nextCrop })} className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#e4e7ec] bg-white px-2 py-2 text-[12px] font-semibold text-[#42485a] hover:bg-[#f6f7f9]">
        <Crop className="h-3.5 w-3.5 shrink-0" /> {t('editor.inspector.image.crop')} · {t(`editor.inspector.crop.${currentCrop}`)}
      </button>
      <SelectField label={t('editor.inspector.fields.filter')} value={layer.filter ?? 'none'} options={IMAGE_FILTER_OPTIONS.map((id) => ({ id, label: t(`editor.inspector.filter.${id}`) }))} onChange={(value) => onPatch({ filter: value as ImageFilter })} />
      <SliderField label={t('editor.inspector.fields.cornerRadius')} min={0} max={96} value={layer.cornerRadius ?? 0} onChange={(value) => onPatch({ cornerRadius: value })} suffix="px" />
    </InspectorAccordion>
    <AppearanceAccordion layer={layer} onPatch={onPatch} />
    <EffectsAccordion layer={layer} onPatch={onPatch} />
  </InspectorScroll>;
};

const MultiLayerInspector = ({
  layers,
  canvasW,
  canvasH,
  canGroup,
  canUngroup,
  onPatchManyLayers,
  onGroupSelection,
  onUngroupSelection,
}: {
  layers: Layer[];
  canvasW: number;
  canvasH: number;
  canGroup: boolean;
  canUngroup: boolean;
  onPatchManyLayers: (patches: Record<string, Partial<Layer>>) => void;
  onGroupSelection: () => void;
  onUngroupSelection: () => void;
}) => {
  const { t } = useTranslation();
  const editable = layers.filter((item) => !item.locked && item.kind !== 'bg');
  const opacity = editable.length ? Math.round((editable.reduce((sum, item) => sum + item.opacity, 0) / editable.length) * 100) : 100;
  const alignSelection = (axis: 'x' | 'y', where: 'start' | 'center' | 'end') => {
    const boxes = editable.map((item) => ({ layer: item, box: resolveBox(item, canvasW, canvasH) }));
    if (!boxes.length) return;
    const left = Math.min(...boxes.map(({ box }) => box.x));
    const top = Math.min(...boxes.map(({ box }) => box.y));
    const right = Math.max(...boxes.map(({ box }) => box.x + box.w));
    const bottom = Math.max(...boxes.map(({ box }) => box.y + box.h));
    const groupW = right - left;
    const groupH = bottom - top;
    const dx = axis === 'x'
      ? (where === 'start' ? -left : where === 'center' ? Math.round((canvasW - groupW) / 2 - left) : Math.round(canvasW - right))
      : 0;
    const dy = axis === 'y'
      ? (where === 'start' ? -top : where === 'center' ? Math.round((canvasH - groupH) / 2 - top) : Math.round(canvasH - bottom))
      : 0;
    const patches: Record<string, Partial<Layer>> = {};
    for (const { layer: item, box } of boxes) patches[item.id] = { x: Math.round(box.x + dx), y: Math.round(box.y + dy) };
    onPatchManyLayers(patches);
  };
  return <InspectorScroll>
    <InspectorAccordion title={t('editor.inspector.sections.align')} defaultOpen>
      <div className="grid grid-cols-3 gap-1.5">
        <AlignGridButton label={t('editor.inspector.canvas.left')} icon={<AlignLeft className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('x', 'start')} />
        <AlignGridButton label={t('editor.inspector.canvas.centerH')} icon={<AlignCenter className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('x', 'center')} />
        <AlignGridButton label={t('editor.inspector.canvas.right')} icon={<AlignRight className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('x', 'end')} />
        <AlignGridButton label={t('editor.inspector.canvas.top')} icon={<ArrowUp className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('y', 'start')} />
        <AlignGridButton label={t('editor.inspector.canvas.middle')} icon={<Crosshair className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('y', 'center')} />
        <AlignGridButton label={t('editor.inspector.canvas.bottom')} icon={<ArrowDown className="h-3.5 w-3.5 shrink-0" />} onClick={() => alignSelection('y', 'end')} />
      </div>
      <div className="text-[11px] leading-snug text-[#9aa1b1]">{t('editor.inspector.multi.alignHint', { count: editable.length })}</div>
    </InspectorAccordion>
    <InspectorAccordion title={t('editor.inspector.sections.group')} defaultOpen>
      <button onClick={onGroupSelection} disabled={!canGroup} className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[#F36440] px-3 py-2 text-[12px] font-semibold text-white hover:bg-[#d9532b] disabled:cursor-not-allowed disabled:opacity-40">
        <Group className="h-3.5 w-3.5 shrink-0" /> {t('editor.layers.group')} <span className="text-white/80">(⌘G)</span>
      </button>
      <button onClick={onUngroupSelection} disabled={!canUngroup} className="inline-flex min-h-9 w-full shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[#e4e7ec] bg-white px-3 py-2 text-[12px] font-semibold text-[#42485a] hover:bg-[#f6f7f9] disabled:cursor-not-allowed disabled:opacity-40">
        <Ungroup className="h-3.5 w-3.5 shrink-0" /> {t('editor.layers.ungroup')}
      </button>
    </InspectorAccordion>
    <InspectorAccordion title={t('editor.inspector.sections.appearance')} defaultOpen>
      <SliderField label={t('editor.inspector.fields.opacity')} min={0} max={100} value={opacity} onChange={(value) => {
        const patches: Record<string, Partial<Layer>> = {};
        for (const item of editable) patches[item.id] = { opacity: value / 100 };
        onPatchManyLayers(patches);
      }} suffix="%" disabled={!editable.length} />
    </InspectorAccordion>
  </InspectorScroll>;
};

const PageInspector = ({ card, onPatchCardMeta }: { card: CardEditorCard; onPatchCardMeta?: (patch: { title?: string; ratio?: string }) => void }) => {
  const { t } = useTranslation();
  const actual = actualSize(card.ratio, card.widthPx, card.heightPx);
  const ratioValue = aspectPreset(card.ratio, card.widthPx, card.heightPx);
  const ratioOptions = [...ASPECT_PRESETS.map((id) => ({ id, label: id })), ...(ratioValue === 'Custom' ? [{ id: 'Custom', label: 'Custom' }] : [])];
  return <InspectorScroll>
    <InspectorAccordion title={t('editor.inspector.sections.canvas')} defaultOpen>
      <div className="grid grid-cols-2 gap-2">
        <ReadonlyField label={t('editor.inspector.fields.w')} value={String(actual.width)} />
        <ReadonlyField label={t('editor.inspector.fields.h')} value={String(actual.height)} />
      </div>
      <SelectField label={t('editor.inspector.fields.ratio')} value={ratioValue} options={ratioOptions} onChange={(value) => onPatchCardMeta?.({ ratio: value })} />
    </InspectorAccordion>
    <InspectorAccordion title={t('editor.inspector.sections.background')} defaultOpen>
      <div className="flex min-w-0 items-center gap-1.5">
        {[card.bg, card.fg, '#fff5f0', '#ffe7da', '#1a1d24'].map((color) => <span key={color} aria-label={color} title={color} className="h-7 w-7 shrink-0 rounded-md border border-black/10" style={{ background: color }} />)}
        <span className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-dashed border-[#d5d9e0] text-[#9aa1b1]">
          <Plus className="h-3.5 w-3.5 shrink-0" />
        </span>
      </div>
    </InspectorAccordion>
    <InspectorAccordion title={t('editor.inspector.sections.export')} defaultOpen>
      <ReadonlyField label={t('editor.inspector.fields.bleed')} value="80 px" />
      <ReadonlyField label={t('editor.inspector.fields.defaultFormat')} value="PNG · 2x" />
    </InspectorAccordion>
  </InspectorScroll>;
};

const TransformAccordion = ({ layer, canvasW, canvasH, onPatch }: { layer: Layer; canvasW: number; canvasH: number; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  const box = resolveBox(layer, canvasW, canvasH);
  const patchSize = (key: 'width' | 'height', value: number) => {
    const patch: Partial<Layer> = { [key]: Math.max(32, value) };
    if (layer.lockRatio) {
      const aspect = box.w / Math.max(1, box.h);
      if (key === 'width') patch.height = Math.max(32, Math.round(value / aspect));
      if (key === 'height') patch.width = Math.max(32, Math.round(value * aspect));
    }
    onPatch(patch);
  };
  return <InspectorAccordion title={t('editor.inspector.sections.transform')} defaultOpen>
    <div className="grid grid-cols-2 gap-2">
      <NumberField label={t('editor.inspector.fields.x')} value={box.x} min={-160} max={canvasW + 160} onChange={(value) => onPatch({ x: value })} />
      <NumberField label={t('editor.inspector.fields.y')} value={box.y} min={-160} max={canvasH + 160} onChange={(value) => onPatch({ y: value })} />
      <NumberField label={t('editor.inspector.fields.w')} value={box.w} min={32} max={canvasW * 2} onChange={(value) => patchSize('width', value)} />
      <NumberField label={t('editor.inspector.fields.h')} value={box.h} min={32} max={canvasH * 2} onChange={(value) => patchSize('height', value)} />
      <NumberField label={t('editor.inspector.fields.rotation')} value={layer.rotation ?? 0} min={-180} max={180} icon={<RotateCw className="h-3 w-3 shrink-0" />} onChange={(value) => onPatch({ rotation: value })} suffix="°" />
      <button onClick={() => onPatch({ lockRatio: !layer.lockRatio })} className={`inline-flex min-h-9 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border px-2 py-1.5 text-[11px] font-semibold ${layer.lockRatio ? 'border-[#F36440] bg-[#fdeee9] text-[#d9532b]' : 'border-[#e4e7ec] bg-white text-[#7a8194] hover:bg-[#f6f7f9]'}`}>
        <Link2 className="h-3 w-3 shrink-0" /> {t('editor.inspector.fields.lockRatio')}
      </button>
    </div>
  </InspectorAccordion>;
};

const AppearanceAccordion = ({ layer, onPatch }: { layer: Layer; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  return <InspectorAccordion title={t('editor.inspector.sections.appearance')} defaultOpen>
    <SliderField label={t('editor.inspector.fields.opacity')} min={0} max={100} value={Math.round(layer.opacity * 100)} onChange={(value) => onPatch({ opacity: value / 100 })} suffix="%" />
    <SelectField label={t('editor.inspector.fields.blendMode')} value={layer.blendMode ?? 'normal'} options={BLEND_OPTIONS.map((id) => ({ id, label: t(`editor.inspector.blend.${id}`) }))} onChange={(value) => onPatch({ blendMode: value as BlendMode })} />
  </InspectorAccordion>;
};

const EffectsAccordion = ({ layer, onPatch }: { layer: Layer; onPatch: (patch: Partial<Layer>) => void }) => {
  const { t } = useTranslation();
  return <InspectorAccordion title={t('editor.inspector.sections.effects')} defaultOpen={!!layer.shadowEnabled || !!layer.strokeEnabled}>
    <ToggleField label={t('editor.inspector.fields.shadow')} checked={!!layer.shadowEnabled} onChange={(checked) => onPatch({ shadowEnabled: checked, shadowBlur: layer.shadowBlur ?? 18, shadowOffsetX: layer.shadowOffsetX ?? 0, shadowOffsetY: layer.shadowOffsetY ?? 8, shadowColor: layer.shadowColor ?? 'rgba(20,28,46,0.24)' })} />
    {layer.shadowEnabled && <SliderField label={t('editor.inspector.fields.shadowBlur')} min={0} max={48} value={layer.shadowBlur ?? 18} onChange={(value) => onPatch({ shadowBlur: value })} suffix="px" />}
    <ToggleField label={t('editor.inspector.fields.stroke')} checked={!!layer.strokeEnabled} onChange={(checked) => onPatch({ strokeEnabled: checked, strokeWidth: layer.strokeWidth ?? 2, strokeColor: layer.strokeColor ?? '#F36440' })} />
    {layer.strokeEnabled && <SliderField label={t('editor.inspector.fields.strokeWidth')} min={1} max={12} value={layer.strokeWidth ?? 2} onChange={(value) => onPatch({ strokeWidth: value })} suffix="px" />}
  </InspectorAccordion>;
};

const InspectorScroll = ({ children }: { children: ReactNode }) => <div className="flex-1 overflow-y-auto">{children}</div>;

const InspectorAccordion = ({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) => {
  const [open, setOpen] = useState(defaultOpen);
  return <section className="border-b border-[#eef0f3]">
    <button onClick={() => setOpen((value) => !value)} className="flex w-full min-w-0 shrink-0 items-center gap-1.5 px-4 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-[#7a8194] hover:text-[#1a1d24]">
      {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
      <span className="shrink-0 whitespace-nowrap">{title}</span>
    </button>
    {open && <div className="flex flex-col gap-2.5 px-4 pb-3">{children}</div>}
  </section>;
};

const fieldLabelClass = "mb-1 text-[9.5px] font-bold uppercase tracking-wider text-[#7a8194]";
const fieldFrameClass = "flex min-h-9 items-center gap-1.5 rounded-md border border-[#e4e7ec] bg-white px-2 py-1.5 focus-within:border-[#f3b39c]";
const fieldInputClass = "min-w-0 flex-1 bg-transparent text-[12px] text-[#1a1d24] outline-none";

const FieldLabel = ({ label, children }: { label: string; children: ReactNode }) => <label className="block">
  <div className={fieldLabelClass}>{label}</div>
  <div className={fieldFrameClass}>{children}</div>
</label>;

const NumberField = ({ label, value, min, max, icon, suffix, onChange }: { label: string; value: number; min: number; max: number; icon?: ReactNode; suffix?: string; onChange: (value: number) => void }) => {
  const numericValue = Number.isFinite(value) ? Math.round(value) : 0;
  const apply = (raw: string) => {
    const next = Number(raw);
    if (!Number.isFinite(next)) return;
    onChange(Math.round(Math.min(max, Math.max(min, next))));
  };
  return <label className={fieldFrameClass}>
    <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-[#9aa1b1]">{icon}{label}</span>
    <input type="number" value={numericValue} min={min} max={max} onChange={(event) => apply(event.currentTarget.value)} className="min-w-0 flex-1 bg-transparent text-right text-[12px] tabular-nums text-[#1a1d24] outline-none" />
    {suffix && <span className="shrink-0 whitespace-nowrap text-[10.5px] text-[#9aa1b1]">{suffix}</span>}
  </label>;
};

const SelectField = ({ label, value, options, onChange }: { label: string; value: string; options: Array<{ id: string; label: string }>; onChange: (value: string) => void }) => <FieldLabel label={label}>
  <select value={value} onChange={(event) => onChange(event.currentTarget.value)} className="min-w-0 flex-1 bg-transparent text-[12px] text-[#42485a] outline-none">
    {options.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}
  </select>
</FieldLabel>;

const ColorField = ({ label, value, fallback, onChange }: { label: string; value: string; fallback: string; onChange: (value: string) => void }) => {
  const safe = normalizeHexColor(value, fallback);
  const [draft, setDraft] = useState(safe.toUpperCase());
  useEffect(() => setDraft(safe.toUpperCase()), [safe]);
  const commitText = () => {
    const next = normalizeHexColor(draft, safe);
    setDraft(next.toUpperCase());
    onChange(next);
  };
  return <FieldLabel label={label}>
    <input type="color" value={safe} onChange={(event) => onChange(event.currentTarget.value)} className="h-7 w-8 shrink-0 cursor-pointer rounded border border-[#e4e7ec] bg-transparent p-0.5" aria-label={label} />
    <input value={draft} onChange={(event) => setDraft(event.currentTarget.value)} onBlur={commitText} onKeyDown={(event) => { if (event.key === 'Enter') commitText(); }} className="min-w-0 flex-1 bg-transparent text-right text-[12px] font-mono tabular-nums text-[#42485a] outline-none" />
  </FieldLabel>;
};

const SliderField = ({ label, min, max, value, suffix = '', disabled = false, onChange }: { label: string; min: number; max: number; value: number; suffix?: string; disabled?: boolean; onChange: (value: number) => void }) => {
  const rounded = Math.round(value);
  return <div>
    <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-[#7a8194]">
      <span className="shrink-0 whitespace-nowrap">{label}</span>
      <span className="shrink-0 whitespace-nowrap tabular-nums">{rounded}{suffix}</span>
    </div>
    <input type="range" min={min} max={max} value={rounded} disabled={disabled} onChange={(event) => onChange(Number(event.currentTarget.value))} className="w-full accent-[#F36440] disabled:opacity-40" />
  </div>;
};

const ToggleField = ({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) => <button onClick={() => onChange(!checked)} className="flex min-h-8 w-full shrink-0 items-center justify-between gap-2 whitespace-nowrap text-[12px] text-[#42485a]">
  <span className="shrink-0 whitespace-nowrap">{label}</span>
  <span className={`h-4 w-7 shrink-0 rounded-full p-0.5 transition-colors ${checked ? 'bg-[#F36440]' : 'bg-[#e4e7ec]'}`}>
    <span className={`block h-3 w-3 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-3' : ''}`} />
  </span>
</button>;

const ReadonlyField = ({ label, value }: { label: string; value: string }) => <FieldLabel label={label}>
  <span className="min-w-0 flex-1 truncate text-right text-[12px] font-mono tabular-nums text-[#42485a]">{value}</span>
</FieldLabel>;

const AlignGridButton = ({ label, icon, onClick }: { label: string; icon: ReactNode; onClick: () => void }) => <button onClick={onClick} title={label} aria-label={label} className="inline-flex min-h-10 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md border border-[#e4e7ec] bg-white px-2 py-1.5 text-[10.5px] font-semibold text-[#42485a] hover:bg-[#f6f7f9]">
  {icon}
  <span className="sr-only">{label}</span>
</button>;

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
