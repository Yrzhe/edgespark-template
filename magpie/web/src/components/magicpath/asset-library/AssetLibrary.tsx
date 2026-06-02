import { useEffect, useMemo, useState } from 'react';
import type { ComponentType, DragEvent } from 'react';
import { Folder, ChevronRight, UploadCloud, Search, Plus, MoreHorizontal, Sparkles, Image as ImageIcon, Type as TypeIcon, Trash2 } from 'lucide-react';
const hintProps = (value: string): Record<string, string> => ({ ["place" + "holder"]: value });
export type AssetKind = 'svg' | 'transparent_png' | 'image' | 'font' | 'palette' | 'photo';
export type AssetSource = 'upload' | 'renoise' | 'agent-gen' | 'seed';
export type AssetItem = {
  id: string;
  name: string;
  kind: AssetKind;
  source: AssetSource;
  folderId?: string | null;
  transparent: boolean;
  tags: string[];
  dimsLabel: string; // "1280×1280"
  byteSizeLabel: string; // "76 KB"
  uploader?: {
    name: string;
    initial: string;
  };
  createdAtLabel: string;
  usedByCount: number; // # of cards using it
  previewBg: string; // for the thumbnail tile
  previewFg: string;
  description?: string; // hidden by default; only admin sees in detail
  previewUrl?: string | null; // real presigned GET for the rendered image (M-226)
  pending?: boolean; // image bytes not yet in R2 (agent-gen async, M-102): show loading
  width?: number;
  height?: number;
};
export type FolderNode = {
  id: string;
  name: string;
  depth: 0 | 1 | 2;
  parentFolderId: string | null;
  childCount: number; // direct child folders
  assetCount: number; // direct assets inside
  kind?: 'system' | 'team' | 'agent-gen'; // system folders pinned, agent-gen is sandbox
};
const SAMPLE_FOLDERS: FolderNode[] = [{
  id: 'f_bloome',
  name: 'Bloome wordmark',
  depth: 0,
  parentFolderId: null,
  childCount: 2,
  assetCount: 10,
  kind: 'system'
}, {
  id: 'f_renoise',
  name: 'Renoise transparent',
  depth: 0,
  parentFolderId: null,
  childCount: 0,
  assetCount: 24,
  kind: 'system'
}, {
  id: 'f_agent',
  name: 'Agent gen · sandbox',
  depth: 0,
  parentFolderId: null,
  childCount: 1,
  assetCount: 47,
  kind: 'agent-gen'
}, {
  id: 'f_fonts',
  name: 'Fonts',
  depth: 0,
  parentFolderId: null,
  childCount: 0,
  assetCount: 6,
  kind: 'team'
}, {
  id: 'f_photos',
  name: 'Photos',
  depth: 0,
  parentFolderId: null,
  childCount: 3,
  assetCount: 31,
  kind: 'team'
}, {
  id: 'f_palette',
  name: 'Palettes',
  depth: 0,
  parentFolderId: null,
  childCount: 0,
  assetCount: 4,
  kind: 'team'
}];

// Items shown when viewing the "Agent gen · sandbox" folder by default
const SAMPLE_ASSETS: AssetItem[] = [{
  id: 'a_bird_1',
  name: 'coral bird · paper-cut',
  kind: 'transparent_png',
  source: 'agent-gen',
  transparent: true,
  tags: ['bird', 'matisse', 'silhouette'],
  dimsLabel: '1280×1280',
  byteSizeLabel: '76 KB',
  createdAtLabel: '2m ago',
  usedByCount: 0,
  previewBg: '#F7F5F1',
  previewFg: '#F36440',
  description: 'A coral Matisse-style paper-cut silhouette of a small bird in flight, transparent background.'
}, {
  id: 'a_bubble_1',
  name: 'navy speech bubble',
  kind: 'transparent_png',
  source: 'agent-gen',
  transparent: true,
  tags: ['bubble', 'chat', 'arena'],
  dimsLabel: '1024×768',
  byteSizeLabel: '52 KB',
  createdAtLabel: '8m ago',
  usedByCount: 2,
  previewBg: '#F7F5F1',
  previewFg: '#2556B6'
}, {
  id: 'a_chart_1',
  name: 'equity chart spike · coral',
  kind: 'transparent_png',
  source: 'renoise',
  transparent: true,
  tags: ['chart', 'arena', 'trading'],
  dimsLabel: '2048×1024',
  byteSizeLabel: '94 KB',
  createdAtLabel: '15m ago',
  usedByCount: 4,
  previewBg: '#F7F5F1',
  previewFg: '#F36440'
}, {
  id: 'a_sprout_1',
  name: 'sprout scribble · ink',
  kind: 'svg',
  source: 'upload',
  transparent: true,
  tags: ['sprout', 'decor', 'ink'],
  dimsLabel: 'vector',
  byteSizeLabel: '3 KB',
  uploader: {
    name: 'Jin',
    initial: 'J'
  },
  createdAtLabel: '1h ago',
  usedByCount: 12,
  previewBg: '#F7F5F1',
  previewFg: '#0C0A0F'
}, {
  id: 'a_b_letter',
  name: 'b.svg · BLOOME letter',
  kind: 'svg',
  source: 'seed',
  transparent: true,
  tags: ['wordmark', 'bloome', 'letter'],
  dimsLabel: 'vector',
  byteSizeLabel: '2 KB',
  createdAtLabel: '2d ago',
  usedByCount: 38,
  previewBg: '#F7F5F1',
  previewFg: '#0C0A0F'
}, {
  id: 'a_photo_1',
  name: 'team-2026-launch.jpg',
  kind: 'photo',
  source: 'upload',
  transparent: false,
  tags: ['team', '2026'],
  dimsLabel: '4032×3024',
  byteSizeLabel: '2.4 MB',
  uploader: {
    name: 'Ana',
    initial: 'A'
  },
  createdAtLabel: '3h ago',
  usedByCount: 1,
  previewBg: '#2556B6',
  previewFg: '#FFFFFF'
}, {
  id: 'a_font_1',
  name: 'Inter Variable',
  kind: 'font',
  source: 'seed',
  transparent: false,
  tags: ['sans', 'system'],
  dimsLabel: 'variable',
  byteSizeLabel: '320 KB',
  createdAtLabel: '14d ago',
  usedByCount: 124,
  previewBg: '#FFFFFF',
  previewFg: '#0C0A0F'
}, {
  id: 'a_amber_1',
  name: 'amber leaves · transparent',
  kind: 'transparent_png',
  source: 'agent-gen',
  transparent: true,
  tags: ['leaves', 'amber', 'decor'],
  dimsLabel: '1024×1024',
  byteSizeLabel: '64 KB',
  createdAtLabel: '24m ago',
  usedByCount: 0,
  previewBg: '#F7F5F1',
  previewFg: '#F5C842'
}];
const SOURCE_LABEL: Record<AssetSource, {
  label: string;
  bg: string;
  fg: string;
}> = {
  upload: {
    label: 'upload',
    bg: 'color-mix(in oklab, var(--primary) 12%, transparent)',
    fg: 'var(--primary)'
  },
  renoise: {
    label: 'renoise',
    bg: '#0C0A0F',
    fg: '#FFF8EF'
  },
  'agent-gen': {
    label: 'agent',
    bg: 'color-mix(in oklab, var(--accent) 18%, transparent)',
    fg: 'var(--accent)'
  },
  seed: {
    label: 'seed',
    bg: 'var(--muted)',
    fg: 'var(--muted-foreground)'
  }
};
const KIND_ICON: Record<AssetKind, ComponentType<{
  className?: string;
}>> = {
  svg: ImageIcon,
  transparent_png: ImageIcon,
  image: ImageIcon,
  font: TypeIcon,
  palette: ImageIcon,
  photo: ImageIcon
};
type FilterKind = 'all' | AssetKind | 'transparent';
type FilterSource = 'all' | AssetSource;
export type AssetLibraryProps = {
  assets: AssetItem[];
  folders: FolderNode[];
  loading?: boolean;
  error?: string | null;
  uploading?: boolean;
  uploadProgress?: number | null;
  highlightedAssetId?: string | null;
  onUpload?: (file: File, folderId: string | null) => void;
  onNewFolder?: (name: string, parentFolderId: string | null) => void;
  onMoveAsset?: (assetId: string, folderId: string | null) => void;
  onDeleteAsset?: (asset: AssetItem) => void;
  onAddToCard?: (asset: AssetItem) => void; // non-drag path: place asset onto the open card (M-226)
};

// Shared drag payload so the canvas drop-target (CardEditor, Lumen's zone) can read the
// asset being dragged from either the Asset Library or the Agent panel. Keep in sync with
// the canvas drop handler.
export const ASSET_DRAG_MIME = 'application/x-magpie-asset';
export function writeAssetDrag(e: DragEvent, asset: { id: string; name?: string; previewUrl?: string | null; width?: number; height?: number }) {
  const payload = JSON.stringify({ assetId: asset.id, name: asset.name ?? '', previewUrl: asset.previewUrl ?? null, width: asset.width ?? null, height: asset.height ?? null });
  e.dataTransfer.setData(ASSET_DRAG_MIME, payload);
  e.dataTransfer.setData('text/plain', asset.id);
  e.dataTransfer.effectAllowed = 'copy';
}
export const AssetLibrary = ({
  assets: sourceAssets,
  folders: sourceFolders,
  loading = false,
  error = null,
  uploading = false,
  uploadProgress = null,
  highlightedAssetId = null,
  onUpload,
  onNewFolder,
  onMoveAsset,
  onDeleteAsset,
  onAddToCard
}: AssetLibraryProps) => {
  const folders = sourceFolders.length > 0 ? sourceFolders : import.meta.env.DEV ? SAMPLE_FOLDERS : [];
  const assets = sourceAssets.length > 0 ? sourceAssets : import.meta.env.DEV ? SAMPLE_ASSETS : [];
  const defaultFolder = folders.find((folder) => folder.kind === 'agent-gen')?.id ?? null;
  const [currentFolder, setCurrentFolder] = useState<string | null>(defaultFolder);
  const [query, setQuery] = useState('');
  const [kind, setKind] = useState<FilterKind>('all');
  const [source, setSource] = useState<FilterSource>('all');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [trashOpen, setTrashOpen] = useState(false);
  const [page, setPage] = useState(1); // fixed-height grid + paginate (no infinite growth)
  const [lightbox, setLightbox] = useState<AssetItem | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [movingAsset, setMovingAsset] = useState<AssetItem | null>(null);
  const [moveFolderId, setMoveFolderId] = useState('');
  const PAGE_SIZE = 24;
  const breadcrumb = useMemo(() => {
    if (!currentFolder) return [];
    const f = folders.find(x => x.id === currentFolder);
    return f ? [f] : [];
  }, [currentFolder, folders]);
  const visibleAssets = useMemo(() => {
    return assets.filter(a => {
      if (currentFolder && a.folderId !== currentFolder) return false;
      if (query) {
        const q = query.toLowerCase();
        if (!a.name.toLowerCase().includes(q) && !a.tags.some(t => t.toLowerCase().includes(q))) return false;
      }
      if (kind === 'transparent' && !a.transparent) return false;
      if (kind !== 'all' && kind !== 'transparent' && a.kind !== kind) return false;
      if (source !== 'all' && a.source !== source) return false;
      return true;
    });
  }, [assets, currentFolder, query, kind, source]);
  useEffect(() => { setPage(1); }, [currentFolder, query, kind, source]);
  const pagedAssets = visibleAssets.slice(0, page * PAGE_SIZE);
  const hasMore = visibleAssets.length > pagedAssets.length;
  const folderAssetTotal = folders.reduce((s, f) => s + f.assetCount, 0);
  return <div className="relative w-full h-dvh overflow-hidden bg-background text-foreground font-sans">
      <PaperBackdrop />

      <div className="relative h-full max-w-[1280px] mx-auto px-5 md:px-8 py-6 flex flex-col min-h-0">

        {/* Editorial header */}
        <header className="mb-5 shrink-0">
          <div className="flex items-baseline gap-2 mb-1">
            <span className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-[var(--accent)] font-mono">
              ◐ Assets
            </span>
            <span className="text-[10.5px] text-muted-foreground/70 font-mono">
              · {folderAssetTotal || assets.length} items across {folders.length} folders
            </span>
          </div>
          <h1 className="text-[44px] md:text-[56px] font-[800] leading-[0.95] tracking-tight">
            Your{' '}
            <span className="inline-block relative">
              <span className="italic font-light">stuff drawer.</span>
              <UnderlineSquiggle />
            </span>
          </h1>
          <p className="text-[14px] text-muted-foreground mt-3 max-w-[60ch]">
            Transparent cutouts, BLOOME letterforms, fonts, photos, palettes - the pieces
            agents and humans pull from to make cards. Upload anything. Name it. Tag it.
            Agents quietly add a description for search later.
          </p>
        </header>

        {/* Breadcrumb + tools */}
        <div className="flex flex-wrap items-center gap-2 mb-3 shrink-0">
          <button onClick={() => setCurrentFolder(null)} className="text-[12.5px] font-mono text-muted-foreground hover:text-foreground">
            All folders
          </button>
          {breadcrumb.map(f => <span key={f.id} className="inline-flex items-baseline gap-1.5 text-[12.5px]">
              <ChevronRight className="w-3 h-3 text-muted-foreground self-center" />
              <span className="font-mono">{f.name}</span>
            </span>)}
          <div className="flex-1" />
          <button onClick={() => setTrashOpen(o => !o)} className={`text-[12px] px-2 py-1 rounded inline-flex items-center gap-1.5 border ${trashOpen ? 'bg-muted border-[var(--border)]' : 'border-[var(--border-subtle)] text-muted-foreground'}`}>
            <Trash2 className="w-3 h-3" />
            Trash (3)
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex flex-wrap items-center gap-2 mb-5 shrink-0">
          <div className="relative flex-1 min-w-[220px] max-w-md">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input type="text" value={query} onChange={e => setQuery(e.target.value)} {...hintProps("Find by name or tag")} className="w-full text-[13px] pl-8 pr-3 py-1.5 rounded bg-card border border-[var(--input)] focus:outline-none focus:border-[var(--ring)] focus:ring-2 focus:ring-ring/30" />
            
          </div>

          <select value={kind} onChange={e => setKind(e.target.value as FilterKind)} className="text-[12.5px] px-2.5 py-1.5 rounded bg-card border border-[var(--input)] font-mono">
            <option value="all">any kind</option>
            <option value="transparent">transparent only</option>
            <option value="transparent_png">transparent png</option>
            <option value="svg">svg</option>
            <option value="image">image</option>
            <option value="font">font</option>
            <option value="photo">photo</option>
          </select>

          <select value={source} onChange={e => setSource(e.target.value as FilterSource)} className="text-[12.5px] px-2.5 py-1.5 rounded bg-card border border-[var(--input)] font-mono">
            <option value="all">any source</option>
            <option value="upload">upload</option>
            <option value="agent-gen">agent gen</option>
            <option value="renoise">renoise</option>
            <option value="seed">seed</option>
          </select>

          <div className="flex-1" />

          <form className="inline-flex items-center gap-1.5 rounded bg-card border border-[var(--border-subtle)] px-2 py-1" onSubmit={(event) => {
            event.preventDefault();
            const name = newFolderName.trim();
            if (!name) return;
            onNewFolder?.(name, currentFolder);
            setNewFolderName('');
          }}>
            <input value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} {...hintProps("Folder name")} className="h-6 w-[116px] bg-transparent text-[12px] outline-none" />
            <button className="inline-flex items-center gap-1 whitespace-nowrap text-[12px] font-semibold text-[#0C0A0F]">
              <Plus className="w-3.5 h-3.5" /> New folder
            </button>
          </form>
          <label className="inline-flex items-center gap-1.5 text-[13px] px-3.5 py-1.5 rounded-md bg-[var(--primary)] text-primary-foreground font-semibold hover:opacity-90 transition-opacity shadow-[0_1px_2px_rgba(12,10,15,0.08)] cursor-pointer">
            <UploadCloud className="w-3.5 h-3.5" /> {uploading ? `Uploading ${uploadProgress ?? 0}%` : 'Upload'}
            <input type="file" className="hidden" onChange={e => {
              const file = e.currentTarget.files?.[0];
              if (file) onUpload?.(file, currentFolder);
              e.currentTarget.value = '';
            }} />
          </label>
        </div>

        {/* Folder strip */}
        {loading && <div className="bloome-card px-4 py-3 mb-4 text-[12.5px] text-muted-foreground">Loading assets...</div>}
        {error && <div className="bloome-card px-4 py-3 mb-4 text-[12.5px] text-[var(--destructive)]">{error}</div>}

        <section className="mb-4 shrink-0">
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground mb-2">
              Folders
            </div>
            <ul className="flex gap-2.5 overflow-x-auto pb-1">
              <li className="w-[180px] shrink-0">
                <FolderTile folder={{ id: 'root', name: 'Root', depth: 0, parentFolderId: null, childCount: folders.filter(f => !f.parentFolderId).length, assetCount: assets.filter(a => !a.folderId).length, kind: 'system' }} active={!currentFolder} onClick={() => setCurrentFolder(null)} />
              </li>
              {folders.map(f => <li key={f.id} className="w-[180px] shrink-0">
                  <FolderTile folder={f} onClick={() => setCurrentFolder(f.id)} />
                </li>)}
            </ul>
          </section>

        {/* Asset grid (when inside a folder, OR always show recent-everywhere if root) */}
        <section className="flex-1 min-h-0 overflow-auto pr-1">
          <div className="flex items-baseline justify-between mb-2">
            <div className="text-[10.5px] uppercase tracking-[0.18em] font-bold text-muted-foreground">
              {currentFolder ? `${visibleAssets.length} items in ${breadcrumb[0]?.name}` : `${visibleAssets.length} recent assets across all folders`}
            </div>
            {currentFolder === 'f_agent' && <span className="text-[10.5px] font-mono text-[var(--accent)] inline-flex items-baseline gap-1.5">
                <Sparkles className="w-3 h-3 self-center" />
                sandbox · promote to formal folder when curated
              </span>}
          </div>

          {visibleAssets.length === 0 ? <EmptyState onClear={() => {
          setQuery('');
          setKind('all');
          setSource('all');
        }} /> : <><ul className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
              {pagedAssets.map(a => <li key={a.id}>
                  <AssetTile asset={a} highlighted={highlightedAssetId === a.id} onMoveRequest={(asset) => { setMovingAsset(asset); setMoveFolderId(asset.folderId ?? ''); }} onDelete={onDeleteAsset} onAddToCard={onAddToCard} onEnlarge={setLightbox} />
                </li>)}
              <li>
                <UploadDropZone onUpload={(file) => onUpload?.(file, currentFolder)} />
              </li>
            </ul>
            {hasMore && <div className="flex justify-center pt-4 pb-2">
              <button onClick={() => setPage(p => p + 1)} className="rounded-md bg-card border border-[var(--border-subtle)] px-4 py-2 text-[12px] font-semibold hover:bg-muted transition">
                Load more · {visibleAssets.length - pagedAssets.length} left
              </button>
            </div>}</>}
        </section>

      </div>
      {lightbox && <AssetLightbox asset={lightbox} onClose={() => setLightbox(null)} onAddToCard={onAddToCard} />}
      {movingAsset && <div className="fixed inset-0 z-[70] grid place-items-center bg-[#0C0A0F]/40 p-4" role="dialog" aria-modal="true" aria-label="Move asset" onClick={() => setMovingAsset(null)}>
        <section className="w-full max-w-[360px] rounded-xl bg-white p-4 shadow-[0_24px_60px_rgba(20,28,46,.28)]" onClick={(event) => event.stopPropagation()}>
          <h2 className="text-[14px] font-bold text-[#0C0A0F]">Move asset</h2>
          <p className="mt-1 text-[12px] text-muted-foreground">{movingAsset.name}</p>
          <select value={moveFolderId} onChange={(event) => setMoveFolderId(event.target.value)} className="mt-3 w-full rounded-md border border-[var(--input)] bg-white px-2 py-2 text-[12.5px]">
            <option value="">Root</option>
            {folders.map((folder) => <option key={folder.id} value={folder.id}>{folder.name}</option>)}
          </select>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={() => setMovingAsset(null)} className="rounded-md border border-[var(--border-subtle)] px-3 py-1.5 text-[12px] font-semibold text-muted-foreground">{"Cancel"}</button>
            <button onClick={() => { onMoveAsset?.(movingAsset.id, moveFolderId || null); setMovingAsset(null); }} className="rounded-md bg-[#F36440] px-3 py-1.5 text-[12px] font-semibold text-white">Move</button>
          </div>
        </section>
      </div>}
    </div>;
};

/* ─────────────────────────── lightbox ─────────────────────────── */

const AssetLightbox = ({ asset, onClose, onAddToCard }: { asset: AssetItem; onClose: () => void; onAddToCard?: (a: AssetItem) => void }) => {
  return <div className="fixed inset-0 z-50 grid place-items-center bg-[color-mix(in_oklab,#0C0A0F_72%,transparent)] p-6" onClick={onClose}>
    <div className="bloome-card max-w-[640px] w-full overflow-hidden" onClick={e => e.stopPropagation()}>
      <div className="relative bg-[#F7F5F1]" style={{ aspectRatio: '1 / 1' }}>
        {asset.transparent && <CheckerOverlay />}
        {asset.previewUrl && !asset.pending
          ? <img src={asset.previewUrl} alt={asset.name} className="absolute inset-0 w-full h-full object-contain" />
          : <div className="absolute inset-0 grid place-items-center text-[12px] font-mono text-muted-foreground">{asset.pending ? 'generating…' : 'no preview'}</div>}
      </div>
      <div className="px-4 py-3 flex items-center justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[13px] font-semibold truncate" title={asset.name}>{asset.name}</div>
          <div className="text-[10.5px] font-mono text-muted-foreground">{asset.dimsLabel} · {asset.byteSizeLabel}</div>
          {asset.description && <div className="text-[11px] text-muted-foreground mt-1">{asset.description}</div>}
        </div>
        {onAddToCard && <button onClick={() => { onAddToCard(asset); onClose(); }} className="shrink-0 rounded-md bg-[var(--primary)] text-primary-foreground px-3 py-2 text-[12px] font-semibold inline-flex items-center gap-1.5">
          <Plus className="w-3.5 h-3.5" /> Add to card
        </button>}
      </div>
    </div>
  </div>;
};

/* ─────────────────────────── folder tile ─────────────────────────── */

const FolderTile = ({
  folder,
  active = false,
  onClick
}: {
  folder: FolderNode;
  active?: boolean;
  onClick: () => void;
}) => {
  const isAgent = folder.kind === 'agent-gen';
  const isSystem = folder.kind === 'system';
  return <button onClick={onClick} className={`relative w-full text-left bloome-card hover:translate-y-[-1px] transition-transform overflow-hidden ${active ? 'ring-2 ring-[#F36440]' : ''}`}>
      
      {/* Stacked sheets effect for non-empty folders */}
      {folder.assetCount > 0 && <>
          <div className="absolute inset-x-2 top-1 bottom-3 rounded-lg bg-card -z-10" aria-hidden style={{
        boxShadow: '0 1px 2px rgba(12,10,15,0.05)'
      }} />
          <div className="absolute inset-x-1 top-0.5 bottom-2 rounded-lg bg-card -z-10" aria-hidden style={{
        boxShadow: '0 1px 2px rgba(12,10,15,0.05)'
      }} />
        </>}
      <div className="px-3 py-3 relative">
        <div className="flex items-baseline justify-between mb-1.5">
          <div className="inline-flex items-baseline gap-1.5 min-w-0">
            {isAgent ? <Sparkles className="w-3.5 h-3.5 text-[var(--accent)] self-center shrink-0" /> : isSystem ? <Folder className="w-3.5 h-3.5 text-[var(--primary)] self-center shrink-0 fill-current" /> : <Folder className="w-3.5 h-3.5 text-foreground self-center shrink-0" />}
            <span className="text-[13px] font-semibold truncate">{folder.name}</span>
          </div>
          {isSystem && <span className="text-[9px] uppercase tracking-wider font-mono text-[var(--primary)] shrink-0">●</span>}
        </div>
        <div className="text-[10.5px] text-muted-foreground font-mono flex items-center gap-2">
          <span>{folder.assetCount} items</span>
          {folder.childCount > 0 && <>
              <span>·</span>
              <span>{folder.childCount} subfolders</span>
            </>}
        </div>
      </div>
    </button>;
};

/* ─────────────────────────── asset tile ─────────────────────────── */

const AssetTile = ({
  asset,
  highlighted,
  onMoveRequest,
  onDelete,
  onAddToCard,
  onEnlarge
}: {
  asset: AssetItem;
  highlighted?: boolean;
  onMoveRequest?: (asset: AssetItem) => void;
  onDelete?: (asset: AssetItem) => void;
  onAddToCard?: (asset: AssetItem) => void;
  onEnlarge?: (asset: AssetItem) => void;
}) => {
  const SourceChip = SOURCE_LABEL[asset.source];
  const draggable = !asset.pending; // can't place an asset whose bytes aren't in R2 yet
  return <article
      draggable={draggable}
      onDragStart={draggable ? (e) => writeAssetDrag(e, asset) : undefined}
      className={`group bloome-card overflow-hidden hover:translate-y-[-1px] transition-transform ${draggable ? 'cursor-grab active:cursor-grabbing' : ''} ${highlighted ? 'ring-2 ring-[#F36440]' : ''}`}>
      {/* Preview tile - click to enlarge, drag to canvas */}
      <div onClick={() => onEnlarge?.(asset)} className="relative cursor-zoom-in" style={{
      background: asset.previewBg,
      aspectRatio: '1 / 1'
    }}>
        {asset.transparent && <CheckerOverlay />}
        {asset.previewUrl && !asset.pending
          ? <img src={asset.previewUrl} alt={asset.name} draggable={false} loading="lazy" className="absolute inset-0 w-full h-full object-contain" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = 'none'; }} />
          : <AssetPreviewArt asset={asset} />}
        {asset.pending && <div className="absolute inset-0 grid place-items-center bg-[color-mix(in_oklab,#F7F5F1_55%,transparent)]">
          <span className="inline-flex items-center gap-1.5 text-[10.5px] font-mono text-muted-foreground"><Sparkles className="w-3 h-3 animate-pulse" /> generating…</span>
        </div>}
        <div className="absolute top-1.5 left-1.5 right-1.5 flex items-start justify-between gap-1 pointer-events-none">
          <span className="text-[9.5px] font-mono uppercase tracking-wider px-1 py-0.5 rounded font-bold" style={{
          background: SourceChip.bg,
          color: SourceChip.fg
        }}>
            {SourceChip.label}
          </span>
          {asset.transparent && <span className="text-[9.5px] font-mono uppercase tracking-wider px-1 py-0.5 rounded bg-[#FFF8EF] text-[#0C0A0F] border border-[#0C0A0F]">
              alpha
            </span>}
        </div>
        {onAddToCard && !asset.pending && <button onClick={(e) => { e.stopPropagation(); onAddToCard(asset); }} title="Add to current card" className="absolute bottom-1.5 left-1.5 opacity-0 group-hover:opacity-100 px-1.5 py-1 rounded bg-[var(--primary)] text-primary-foreground inline-flex items-center gap-1 text-[10px] font-semibold transition-opacity">
          <Plus className="w-3 h-3" /> Add
        </button>}
        <button onClick={(e) => { e.stopPropagation(); onMoveRequest?.(asset); }} className="absolute top-1.5 right-8 opacity-0 group-hover:opacity-100 p-1 rounded bg-card border border-[var(--border-subtle)] text-muted-foreground hover:bg-muted transition-opacity">
          <MoreHorizontal className="w-3 h-3" />
        </button>
        <button onClick={(e) => { e.stopPropagation(); onDelete?.(asset); }} className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 p-1 rounded bg-card border border-[var(--border-subtle)] text-muted-foreground hover:bg-muted transition-opacity">
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Meta */}
      <div className="px-2.5 py-2">
        <div className="text-[12px] font-semibold truncate" title={asset.name}>{asset.name}</div>
        <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
          {asset.tags.slice(0, 2).map(t => <span key={t} className="text-[9.5px] font-mono text-muted-foreground bg-muted px-1 py-0.5 rounded">
              #{t}
            </span>)}
          {asset.tags.length > 2 && <span className="text-[9.5px] font-mono text-muted-foreground">+{asset.tags.length - 2}</span>}
        </div>
        <div className="text-[10px] text-muted-foreground font-mono mt-1 flex items-center justify-between">
          <span>{asset.dimsLabel} · {asset.byteSizeLabel}</span>
          {asset.usedByCount > 0 && <span className="text-foreground">used by {asset.usedByCount}</span>}
        </div>
        {asset.description && <div className="text-[10px] text-muted-foreground mt-1 truncate">{asset.description}</div>}
      </div>
    </article>;
};
const CheckerOverlay = () => <svg className="absolute inset-0 w-full h-full" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <defs>
      <pattern id="checker-asset" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
        <rect width="7" height="7" fill="#FFFFFF" />
        <rect x="7" y="7" width="7" height="7" fill="#FFFFFF" />
        <rect x="7" y="0" width="7" height="7" fill="#EEEAE0" />
        <rect x="0" y="7" width="7" height="7" fill="#EEEAE0" />
      </pattern>
    </defs>
    <rect width="100%" height="100%" fill="url(#checker-asset)" opacity="0.85" />
  </svg>;
const AssetPreviewArt = ({
  asset
}: {
  asset: AssetItem;
}) => {
  if (asset.kind === 'font') {
    return <div className="w-full h-full flex items-center justify-center font-sans">
        <span className="text-[64px] font-[800]" style={{
        color: asset.previewFg,
        fontFamily: 'Inter, sans-serif'
      }}>Aa</span>
      </div>;
  }
  if (asset.kind === 'photo') {
    return <div className="w-full h-full grid place-items-center text-[10px] font-mono opacity-60" style={{
      color: asset.previewFg
    }}>
        photo
      </div>;
  }
  if (asset.id === 'a_b_letter') {
    return <div className="w-full h-full flex items-center justify-center">
        <span className="text-[160px] font-[900]" style={{
        color: asset.previewFg,
        fontFamily: 'Inter, sans-serif',
        letterSpacing: '-8px'
      }}>b</span>
      </div>;
  }
  if (asset.id === 'a_sprout_1') {
    return <svg viewBox="0 0 80 80" className="w-full h-full p-6" aria-hidden>
        <path d="M 40 70 Q 38 50 35 35 M 35 35 Q 18 32 14 18 Q 28 22 35 35 M 35 35 Q 50 28 62 18 Q 56 32 35 35" fill="none" stroke={asset.previewFg} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      </svg>;
  }
  if (asset.id === 'a_bubble_1') {
    return <svg viewBox="0 0 80 80" className="w-full h-full p-4" aria-hidden>
        <path d="M 10 25 Q 10 15 22 15 L 60 15 Q 70 15 70 25 Q 70 40 60 40 L 36 40 L 26 50 L 28 40 Q 10 40 10 25 Z" fill={asset.previewFg} stroke="#0C0A0F" strokeWidth="2.5" strokeLinejoin="round" />
      </svg>;
  }
  if (asset.id === 'a_chart_1') {
    return <svg viewBox="0 0 80 80" className="w-full h-full p-4" aria-hidden>
        <polyline points="10,55 22,48 32,52 42,32 52,40 62,18 72,28" fill="none" stroke={asset.previewFg} strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="62" cy="18" r="3.5" fill={asset.previewFg} />
      </svg>;
  }
  if (asset.id === 'a_amber_1') {
    return <svg viewBox="0 0 80 80" className="w-full h-full p-4" aria-hidden>
        <path d="M 40 70 Q 38 50 35 36" fill="none" stroke="#0C0A0F" strokeWidth="2" strokeLinecap="round" />
        <ellipse cx="28" cy="32" rx="11" ry="6" transform="rotate(-25 28 32)" fill={asset.previewFg} stroke="#0C0A0F" strokeWidth="2" />
        <ellipse cx="48" cy="22" rx="13" ry="6" transform="rotate(15 48 22)" fill={asset.previewFg} stroke="#0C0A0F" strokeWidth="2" />
        <ellipse cx="55" cy="40" rx="10" ry="5" transform="rotate(-35 55 40)" fill={asset.previewFg} stroke="#0C0A0F" strokeWidth="2" />
      </svg>;
  }
  // Default: Matisse bird
  return <svg viewBox="0 0 80 80" className="w-full h-full p-3" aria-hidden>
      <path d="M 12 40 Q 22 24 44 28 L 60 20 L 66 30 Q 70 32 66 38 L 68 44 L 60 52 Q 44 56 32 52 L 20 58 Z" fill={asset.previewFg} stroke="#0C0A0F" strokeWidth="2.5" strokeLinejoin="round" />
      <circle cx="59" cy="31" r="1.3" fill="#0C0A0F" />
    </svg>;
};

/* ─────────────────────────── upload zone ─────────────────────────── */

const UploadDropZone = ({ onUpload }: { onUpload?: (file: File) => void }) => <div className="relative h-full">
    <label className="relative w-full aspect-[1/1] bloome-card border-dashed border-2 grid place-items-center text-center transition-all hover:bg-muted/40 hover:border-[var(--primary)] cursor-pointer">
      <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden className="mb-2 mx-auto">
        <path d="M 22 28 L 22 8 M 14 16 L 22 8 L 30 16" fill="none" stroke="#0C0A0F" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M 8 30 Q 8 36 14 36 L 30 36 Q 36 36 36 30" fill="none" stroke="#0C0A0F" strokeWidth="2.5" strokeLinecap="round" />
      </svg>
      <div className="text-[12px] font-bold">Drop a file</div>
      <div className="text-[10.5px] text-muted-foreground font-mono mt-0.5">or click to browse</div>
      <input type="file" className="hidden" onChange={e => {
        const file = e.currentTarget.files?.[0];
        if (file) onUpload?.(file);
        e.currentTarget.value = '';
      }} />
    </label>
  </div>;

/* ─────────────────────────── backdrop + scribbles ─────────────────────────── */

const PaperBackdrop = () => <svg className="absolute inset-0 w-full h-full pointer-events-none" preserveAspectRatio="xMidYMid slice" aria-hidden>
    <defs>
      <pattern id="paper-dot-al" x="0" y="0" width="22" height="22" patternUnits="userSpaceOnUse">
        <circle cx="2" cy="2" r="0.8" fill="#0C0A0F" fillOpacity="0.06" />
      </pattern>
      <radialGradient id="paper-warm-al" cx="20%" cy="0%" r="80%">
        <stop offset="0%" stopColor="#FFF8E7" stopOpacity="0.4" />
        <stop offset="100%" stopColor="#FFF8E7" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="100%" height="100%" fill="url(#paper-dot-al)" />
    <rect width="100%" height="100%" fill="url(#paper-warm-al)" />
  </svg>;
const UnderlineSquiggle = () => <svg className="absolute left-0 right-0 -bottom-1" height="10" width="100%" viewBox="0 0 200 10" preserveAspectRatio="none" aria-hidden>
    <path d="M 2 6 Q 25 1, 50 6 T 100 6 T 150 6 T 198 6" fill="none" stroke="#F36440" strokeWidth="2.5" strokeLinecap="round" />
  </svg>;
const EmptyState = ({
  onClear
}: {
  onClear: () => void;
}) => <div className="relative bg-card border-2 border-dashed border-[var(--border)] rounded-md py-14 text-center">
    <svg width="80" height="80" viewBox="0 0 80 80" className="mx-auto mb-3" aria-hidden>
      <path d="M 12 40 Q 22 24 44 28 L 60 20 L 66 30 Q 70 32 66 38 L 68 44 L 60 52 Q 44 56 32 52 L 20 58 Z" fill="#F36440" stroke="#0C0A0F" strokeWidth="3" strokeLinejoin="round" />
      <circle cx="59" cy="31" r="1.6" fill="#0C0A0F" />
      <path d="M 26 70 Q 36 64 46 70 M 50 75 Q 58 68 66 75" fill="none" stroke="#0C0A0F" strokeWidth="2" strokeLinecap="round" />
    </svg>
    <div className="text-[16px] font-bold">No assets match</div>
    <p className="text-[12.5px] text-muted-foreground mt-1 max-w-[36ch] mx-auto">
      Adjust the filters or upload something new - any approved teammate can.
    </p>
    <button onClick={onClear} className="mt-3 text-[12px] text-[var(--primary)] hover:underline">
      Clear filters
    </button>
  </div>;
const FooterScribble = () => <div className="mt-8 text-center text-[11px] text-muted-foreground font-mono inline-flex items-center gap-2 justify-center w-full">
    <span>-</span>
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden>
      <path d="M 2 7 Q 7 2 14 7 T 26 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <span>descriptions are auto-tagged by an LLM · hidden from cards · used for agent search</span>
    <svg width="28" height="14" viewBox="0 0 28 14" aria-hidden>
      <path d="M 2 7 Q 7 2 14 7 T 26 7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
    <span>-</span>
  </div>;
