import { TIMELINE_GAME_PRESETS, getPresetById, type GamePreset } from '../lib/timelineGames';

const CUSTOM_NODE_COLOR = '#111111';

/** Header abbreviation derived from a custom event label (no separate short field). */
function shortFromLabel(label: string): string {
	const words = label.trim().split(/\s+/).filter(Boolean);
	if (words.length === 0) return '?';
	const acronym = words
		.slice(0, 6)
		.map((w) => {
			const m = w.match(/[A-Za-z]/);
			return m ? m[0]!.toUpperCase() : '';
		})
		.join('');
	if (acronym.length > 0) return acronym.slice(0, 10);
	return words[0]!.slice(0, 8).toUpperCase();
}

const NODE_W = 168;
const NODE_H = 72;
const WORLD_W = 4000;
/** World height matches width so the canvas is at least square (enough vertical room). */
const WORLD_H = WORLD_W;
/** Same margin (world px) on all sides around the union of placed node boxes in PNG export. */
const EXPORT_MARGIN = 120;
/** Snap nodes to this grid (px). 12 divides node width 168 and height 72 evenly. */
const GRID = 12;

function snapCoord(v: number): number {
	return Math.round(v / GRID) * GRID;
}

type Side = 'n' | 'e' | 's' | 'w';

type PlacedNode = {
	id: string;
	presetId: string;
	x: number;
	y: number;
};

type Edge = {
	id: string;
	fromId: string;
	toId: string;
	fromSide: Side;
	toSide: Side;
};

function uid(): string {
	if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
		return crypto.randomUUID();
	}
	return `id_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

function anchorFor(placed: PlacedNode, side: Side): { x: number; y: number } {
	const x0 = placed.x;
	const y0 = placed.y;
	switch (side) {
		case 'n':
			return { x: x0 + NODE_W / 2, y: y0 };
		case 's':
			return { x: x0 + NODE_W / 2, y: y0 + NODE_H };
		case 'e':
			return { x: x0 + NODE_W, y: y0 + NODE_H / 2 };
		case 'w':
			return { x: x0, y: y0 + NODE_H / 2 };
	}
}

function outVec(side: Side): { x: number; y: number } {
	switch (side) {
		case 'n':
			return { x: 0, y: -90 };
		case 's':
			return { x: 0, y: 90 };
		case 'e':
			return { x: 90, y: 0 };
		case 'w':
			return { x: -90, y: 0 };
	}
}

/** Unit vector outward from `side` on the node (same direction as `outVec`). */
function unitOutFromSide(side: Side): { x: number; y: number } {
	const v = outVec(side);
	const len = Math.hypot(v.x, v.y);
	return { x: v.x / len, y: v.y / len };
}

/** Straight run from each port before the first 90° bend — one grid cell from origin and from destination. */
const EDGE_STUB = GRID;

function orthogonalEdgePathD(
	p1: { x: number; y: number },
	fromSide: Side,
	p2: { x: number; y: number },
	toSide: Side,
): string {
	const u1 = unitOutFromSide(fromSide);
	const u2 = unitOutFromSide(toSide);
	const ax = p1.x + u1.x * EDGE_STUB;
	const ay = p1.y + u1.y * EDGE_STUB;
	const bx = p2.x + u2.x * EDGE_STUB;
	const by = p2.y + u2.y * EDGE_STUB;
	const pts: [number, number][] = [
		[p1.x, p1.y],
		[ax, ay],
	];
	const eps = 0.5;
	// One bend between (ax,ay) and (bx,by): horizontal-then-vertical or the reverse.
	const hFirst = Math.abs(bx - ax) >= Math.abs(by - ay);
	if (hFirst) {
		if (Math.abs(bx - ax) > eps) pts.push([bx, ay]);
		const last = pts[pts.length - 1]!;
		if (Math.abs(by - last[1]) > eps) pts.push([bx, by]);
	} else {
		if (Math.abs(by - ay) > eps) pts.push([ax, by]);
		const last = pts[pts.length - 1]!;
		if (Math.abs(bx - last[0]) > eps) pts.push([bx, by]);
	}
	const tail = pts[pts.length - 1]!;
	if (Math.abs(tail[0] - p2.x) > eps || Math.abs(tail[1] - p2.y) > eps) {
		pts.push([p2.x, p2.y]);
	}
	const dedup: [number, number][] = [];
	for (const p of pts) {
		const prev = dedup[dedup.length - 1];
		if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > eps) dedup.push(p);
	}
	return dedup.map((p, i) => (i === 0 ? `M ${p[0]} ${p[1]}` : `L ${p[0]} ${p[1]}`)).join(' ');
}

function closestSide(wx: number, wy: number, placed: PlacedNode): Side {
	const dN = Math.abs(wy - placed.y);
	const dS = Math.abs(wy - (placed.y + NODE_H));
	const dW = Math.abs(wx - placed.x);
	const dE = Math.abs(wx - (placed.x + NODE_W));
	const m = Math.min(dN, dS, dW, dE);
	if (m === dN) return 'n';
	if (m === dS) return 's';
	if (m === dW) return 'w';
	return 'e';
}

/** Axis-aligned bounds of all placed nodes, expanded by `EXPORT_MARGIN` on every side (world coordinates). */
function getExportBoundsForNodes(placed: PlacedNode[]): { left: number; top: number; width: number; height: number } {
	let minX = Infinity;
	let minY = Infinity;
	let maxX = -Infinity;
	let maxY = -Infinity;
	for (const n of placed) {
		minX = Math.min(minX, n.x);
		minY = Math.min(minY, n.y);
		maxX = Math.max(maxX, n.x + NODE_W);
		maxY = Math.max(maxY, n.y + NODE_H);
	}
	const left = minX - EXPORT_MARGIN;
	const top = minY - EXPORT_MARGIN;
	const right = maxX + EXPORT_MARGIN;
	const bottom = maxY + EXPORT_MARGIN;
	return {
		left,
		top,
		width: Math.max(1, Math.round(right - left)),
		height: Math.max(1, Math.round(bottom - top)),
	};
}

/** Download PNG without navigating the current page (data-URL anchor clicks can reload the tab). */
function triggerPngDownload(dataUrl: string, filename: string): void {
	const a = document.createElement('a');
	a.download = filename;
	a.href = dataUrl;
	a.style.cssText = 'position:fixed;left:-9999px;opacity:0;pointer-events:none';
	document.body.appendChild(a);
	a.click();
	a.remove();
}

export function mountTimelineEditor(host: HTMLElement): void {
	host.textContent = '';

	const nodes: PlacedNode[] = [];
	const edges: Edge[] = [];
	const selectedNodeIds = new Set<string>();
	let selectedEdgeId: string | null = null;
	let dragState: {
		ids: string[];
		primaryId: string;
		grabDx: number;
		grabDy: number;
		origins: Map<string, { x: number; y: number }>;
	} | null = null;
	let marquee:
		| { x0: number; y0: number; clientX0: number; clientY0: number; x1: number; y1: number }
		| null = null;
	let marqueeActive = false;
	let suppressWorkspaceClick = false;
	const MARQUEE_THRESHOLD_PX = 4;
	let mmbPan: { scrollLeft0: number; scrollTop0: number; clientX0: number; clientY0: number } | null = null;
	let wireDrag: { fromId: string; fromSide: Side; x1: number; y1: number } | null = null;
	let rubberPath: SVGPathElement | null = null;
	let zoom = 1;
	let paletteDragOver = false;
	/** Preset id being dragged from the palette (HTML5 DnD); used so `dragover` can allow drop. */
	let draggingPresetId: string | null = null;
	const DT_PRESET = 'application/x-dragmirexi-preset';

	const root = el('div', 'tm-root');
	const editor = el('div', 'tm-editor');
	const toolbar = el('div', 'tm-toolbar');
	const btnClear = el('button', 'tm-btn', 'Clear Canvas');
	btnClear.type = 'button';
	const btnCustom = el('button', 'tm-btn', 'Custom Event');
	btnCustom.type = 'button';
	const btnExport = el('button', 'tm-btn tm-btn-primary', 'Export PNG');
	btnExport.type = 'button';
	const status = el(
		'span',
		'tm-status',
	    '');

	const body = el('div', 'tm-body');
	const palette = el('aside', 'tm-palette');
	const paletteTitle = el('h2', 'tm-palette-title', 'Games');
	palette.append(paletteTitle);

	const customPresets: GamePreset[] = [];
	let customPaletteDividerInDom = false;

	function resolvePreset(id: string): GamePreset | undefined {
		return customPresets.find((p) => p.id === id) ?? getPresetById(id);
	}

	function appendPaletteRow(g: GamePreset): void {
		const row = document.createElement('div');
		row.className = 'tm-palette-item';
		row.draggable = true;
		row.dataset.presetId = g.id;
		row.dataset.presetLabel = g.label;
		row.title = g.description
			? `Drag onto canvas: ${g.label} — ${g.description}`
			: `Drag onto canvas: ${g.label}`;
		row.tabIndex = 0;

		const builtIn = getPresetById(g.id) !== undefined;
		const primary = document.createElement('span');
		primary.className = 'tm-palette-short';
		const secondary = document.createElement('span');
		secondary.className = 'tm-palette-full';

		if (builtIn) {
			primary.textContent = g.short;
			secondary.textContent = g.label;
			row.append(primary, secondary);
		} else {
			row.classList.add('tm-palette-item--custom');
			primary.textContent = g.label;
			row.append(primary);
			if (g.description) {
				secondary.textContent = g.description;
				row.append(secondary);
			}
		}

		row.addEventListener('dragstart', (ev) => {
			if (!ev.dataTransfer) return;
			draggingPresetId = g.id;
			ev.dataTransfer.setData(DT_PRESET, g.id);
			ev.dataTransfer.setData('text/plain', g.id);
			ev.dataTransfer.effectAllowed = 'copy';
			workspace.classList.add('tm-canvas-drop-ready');
		});
		row.addEventListener('dragend', () => {
			draggingPresetId = null;
			workspace.classList.remove('tm-canvas-drop-ready');
			workspace.classList.remove('tm-drag-over');
		});
		palette.append(row);
	}

	function addCustomPresetToPalette(label: string, description?: string): void {
		const lab = label.trim();
		const desc = description?.trim();
		const preset: GamePreset = {
			id: uid(),
			short: shortFromLabel(lab),
			label: lab,
			color: CUSTOM_NODE_COLOR,
			...(desc ? { description: desc } : {}),
		};
		customPresets.push(preset);
		if (!customPaletteDividerInDom) {
			palette.append(el('div', 'tm-palette-section-title', 'Custom events'));
			customPaletteDividerInDom = true;
		}
		appendPaletteRow(preset);
		syncPaletteOnCanvasState();
		syncWorkspaceWrapHeightToPalette();
	}

	function openCustomEventModal(): void {
		const idSuffix = uid().replace(/[^a-z0-9]/gi, '').slice(0, 12);
		const backdrop = el('div', 'tm-modal-backdrop');
		const modal = el('div', 'tm-modal');
		modal.setAttribute('role', 'dialog');
		modal.setAttribute('aria-modal', 'true');
		const titleId = `tm-custom-modal-title-${idSuffix}`;
		modal.setAttribute('aria-labelledby', titleId);

		const title = el('h3', 'tm-modal-title', 'Custom event');
		title.id = titleId;

		const labelId = `tm-custom-label-${idSuffix}`;
		const descId = `tm-custom-desc-${idSuffix}`;

		const labelWrap = el('div', 'tm-modal-field');
		const labelLab = el('label', 'tm-modal-field-label', 'Label');
		labelLab.htmlFor = labelId;
		const labelInput = document.createElement('input');
		labelInput.id = labelId;
		labelInput.type = 'text';
		labelInput.className = 'tm-modal-input';
		labelInput.maxLength = 200;
		labelInput.autocomplete = 'off';
		labelInput.placeholder = 'Event name (required)';
		labelInput.required = true;
		labelWrap.append(labelLab, labelInput);

		const descWrap = el('div', 'tm-modal-field');
		const descLab = el('label', 'tm-modal-field-label', 'Description');
		descLab.htmlFor = descId;
		const descInput = document.createElement('textarea');
		descInput.id = descId;
		descInput.className = 'tm-modal-input tm-modal-textarea';
		descInput.rows = 3;
		descInput.maxLength = 600;
		descInput.autocomplete = 'off';
		descInput.placeholder = 'Optional details';
		descWrap.append(descLab, descInput);

		const actions = el('div', 'tm-modal-actions');
		const btnCancel = el('button', 'tm-btn', 'Cancel');
		btnCancel.type = 'button';
		const btnAdd = el('button', 'tm-btn tm-btn-primary', 'Add to canvas');
		btnAdd.type = 'button';
		actions.append(btnCancel, btnAdd);

		modal.append(title, labelWrap, descWrap, actions);
		backdrop.append(modal);
		document.body.append(backdrop);

		function closeModal(): void {
			window.removeEventListener('keydown', onKey);
			backdrop.remove();
		}

		function onKey(ev: KeyboardEvent): void {
			if (ev.key === 'Escape') {
				ev.preventDefault();
				closeModal();
			}
		}

		window.addEventListener('keydown', onKey);

		backdrop.addEventListener('mousedown', (ev) => {
			if (ev.target === backdrop) closeModal();
		});

		btnCancel.addEventListener('click', closeModal);

		btnAdd.addEventListener('click', () => {
			const lab = labelInput.value.trim();
			const desc = descInput.value.trim();
			if (!lab) {
				alert('Please enter a label.');
				return;
			}
			addCustomPresetToPalette(lab, desc || undefined);
			closeModal();
		});

		labelInput.focus();
	}

	btnCustom.addEventListener('click', () => openCustomEventModal());

	const wrap = el('div', 'tm-workspace-wrap');
	const workspace = el('div', 'tm-workspace');
	workspace.setAttribute('tabindex', '0');

	const scaler = el('div', 'tm-scaler');
	const world = el('div', 'tm-world');

	const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
	svg.setAttribute('class', 'tm-svg');
	svg.setAttribute('preserveAspectRatio', 'none');
	const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
	const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
	marker.setAttribute('id', 'tm-arrow');
	marker.setAttribute('markerWidth', '10');
	marker.setAttribute('markerHeight', '7');
	marker.setAttribute('refX', '9');
	marker.setAttribute('refY', '3.5');
	marker.setAttribute('orient', 'auto');
	const poly = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
	poly.setAttribute('points', '0 0, 10 3.5, 0 7');
	poly.setAttribute('fill', 'var(--ganon-red)');
	marker.append(poly);
	defs.append(marker);
	svg.append(defs);
	const pathsGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
	pathsGroup.setAttribute('class', 'tm-paths');
	svg.append(pathsGroup);

	const nodesLayer = el('div', 'tm-nodes');
	const marqueeEl = el('div', 'tm-marquee');

	toolbar.append(btnClear, btnCustom, btnExport, status);
	scaler.append(world);
	world.append(svg, nodesLayer, marqueeEl);
	workspace.append(scaler);
	wrap.append(workspace);
	body.append(toolbar, palette, wrap);
	editor.append(body);
	root.append(editor);
	host.append(root);

	for (const g of TIMELINE_GAME_PRESETS) {
		appendPaletteRow(g);
	}

	function syncWorkspaceWrapHeightToPalette(): void {
		const h = Math.round(palette.getBoundingClientRect().height);
		if (h < 1) return;
		wrap.style.height = `${h}px`;
	}

	if (typeof ResizeObserver !== 'undefined') {
		const layoutRo = new ResizeObserver(() => {
			syncWorkspaceWrapHeightToPalette();
		});
		layoutRo.observe(palette);
		layoutRo.observe(body);
	}
	requestAnimationFrame(() => syncWorkspaceWrapHeightToPalette());

	function syncPaletteOnCanvasState(): void {
		const placedIds = new Set(nodes.map((n) => n.presetId));
		for (const row of palette.querySelectorAll<HTMLElement>('.tm-palette-item')) {
			const id = row.dataset.presetId;
			if (!id) continue;
			const onCanvas = placedIds.has(id);
			row.classList.toggle('tm-palette-item--on-canvas', onCanvas);
			const preset = resolvePreset(id);
			const label = row.dataset.presetLabel ?? preset?.label ?? id;
			const tip =
				preset?.description != null && preset.description !== ''
					? `${label} — ${preset.description}`
					: label;
			row.title = onCanvas ? `On canvas — drag to place again: ${tip}` : `Drag onto canvas: ${tip}`;
		}
	}

	syncPaletteOnCanvasState();

	function el<K extends keyof HTMLElementTagNameMap>(
		tag: K,
		className: string,
		text?: string,
	): HTMLElementTagNameMap[K] {
		const n = document.createElement(tag);
		n.className = className;
		if (text !== undefined) n.textContent = text;
		return n;
	}

	function clientToWorld(ev: MouseEvent): { x: number; y: number } {
		const br = world.getBoundingClientRect();
		return {
			x: ((ev.clientX - br.left) / br.width) * WORLD_W,
			y: ((ev.clientY - br.top) / br.height) * WORLD_H,
		};
	}

	function applyZoom(): void {
		world.style.transform = `scale(${zoom})`;
		scaler.style.width = `${WORLD_W * zoom}px`;
		scaler.style.height = `${WORLD_H * zoom}px`;
		syncSvgSize();
		updateEdges();
	}

	function syncSvgSize(): void {
		svg.setAttribute('width', String(WORLD_W));
		svg.setAttribute('height', String(WORLD_H));
		svg.setAttribute('viewBox', `0 0 ${WORLD_W} ${WORLD_H}`);
	}

	/** `centerWorld` = pointer position in world space (node is centered there, then snapped). */
	function addNode(presetId: string, centerWorld: { x: number; y: number }): void {
		const preset = resolvePreset(presetId);
		if (!preset) return;
		let x = snapCoord(centerWorld.x - NODE_W / 2);
		let y = snapCoord(centerWorld.y - NODE_H / 2);
		x = Math.max(0, Math.min(x, WORLD_W - NODE_W));
		y = Math.max(0, Math.min(y, WORLD_H - NODE_H));
		const n: PlacedNode = {
			id: uid(),
			presetId,
			x,
			y,
		};
		nodes.push(n);
		renderNodes();
		updateEdges();
		syncPaletteOnCanvasState();
	}

	function removeNode(id: string): void {
		const idx = nodes.findIndex((x) => x.id === id);
		if (idx === -1) return;
		nodes.splice(idx, 1);
		for (let i = edges.length - 1; i >= 0; i--) {
			if (edges[i]!.fromId === id || edges[i]!.toId === id) {
				if (selectedEdgeId === edges[i]!.id) selectedEdgeId = null;
				edges.splice(i, 1);
			}
		}
		selectedNodeIds.delete(id);
		renderNodes();
		updateEdges();
		syncPaletteOnCanvasState();
	}

	function removeEdge(id: string): void {
		const i = edges.findIndex((x) => x.id === id);
		if (i === -1) return;
		edges.splice(i, 1);
		if (selectedEdgeId === id) selectedEdgeId = null;
		updateEdges();
	}

	function addPort(node: HTMLElement, side: Side): HTMLElement {
		const p = el('div', `tm-port tm-port-${side}`);
		p.dataset.side = side;
		p.title = `Drag arrow ${side.toUpperCase()}`;
		p.addEventListener('mousedown', (ev) => {
			if (ev.button !== 0) return;
			ev.preventDefault();
			ev.stopPropagation();
			selectedEdgeId = null;
			selectedNodeIds.clear();
			const id = node.dataset.nodeId!;
			const placed = nodes.find((x) => x.id === id);
			if (!placed) return;
			const a = anchorFor(placed, side);
			wireDrag = { fromId: id, fromSide: side, x1: a.x, y1: a.y };
			root.classList.add('tm-wiring');
			rubberPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			rubberPath.classList.add('tm-rubber');
			rubberPath.setAttribute('fill', 'none');
			rubberPath.setAttribute('stroke', 'var(--power-gold)');
			rubberPath.setAttribute('stroke-width', '2');
			rubberPath.setAttribute('stroke-dasharray', '6 4');
			pathsGroup.append(rubberPath);
			window.addEventListener('mousemove', onWireMove);
			window.addEventListener('mouseup', onWireUp);
		});
		return p;
	}

	function renderNodes(): void {
		nodesLayer.textContent = '';
		for (const n of nodes) {
			const preset = resolvePreset(n.presetId);
			if (!preset) continue;
			const node = el('div', 'tm-node');
			node.dataset.nodeId = n.id;
			node.style.left = `${n.x}px`;
			node.style.top = `${n.y}px`;
			if (selectedNodeIds.has(n.id)) node.classList.add('tm-node-selected');

			const builtIn = getPresetById(preset.id) !== undefined;
			if (!builtIn) node.classList.add('tm-node-custom');

			const head = el(
				'div',
				'tm-node-head',
				builtIn ? preset.short : preset.label,
			);
			head.style.background = preset.color;

			const bodyEl = el('div', 'tm-node-body');
			if (builtIn) {
				bodyEl.append(document.createTextNode(preset.label));
			} else if (preset.description) {
				bodyEl.append(document.createTextNode(preset.description));
			} else {
				node.classList.add('tm-node-custom-compact');
			}

			const card = el('div', 'tm-node-card');
			card.append(head, bodyEl);
			const ports = el('div', 'tm-node-ports');
			ports.append(addPort(node, 'n'), addPort(node, 'e'), addPort(node, 's'), addPort(node, 'w'));

			node.append(card, ports);

			node.addEventListener('mousedown', (ev) => {
				if (ev.button !== 0) return;
				if ((ev.target as HTMLElement).closest('.tm-port')) return;
				ev.preventDefault();
				ev.stopPropagation();
				selectedEdgeId = null;
				if (ev.shiftKey) {
					if (selectedNodeIds.has(n.id)) selectedNodeIds.delete(n.id);
					else selectedNodeIds.add(n.id);
					renderNodes();
					updateEdges();
					return;
				}
				if (!selectedNodeIds.has(n.id)) {
					selectedNodeIds.clear();
					selectedNodeIds.add(n.id);
				}
				const wpt = clientToWorld(ev);
				const origins = new Map<string, { x: number; y: number }>();
				for (const id of selectedNodeIds) {
					const pl = nodes.find((x) => x.id === id);
					if (pl) origins.set(id, { x: pl.x, y: pl.y });
				}
				dragState = {
					ids: [...selectedNodeIds],
					primaryId: n.id,
					grabDx: wpt.x - n.x,
					grabDy: wpt.y - n.y,
					origins,
				};
				renderNodes();
				window.addEventListener('mousemove', onNodeMove);
				window.addEventListener('mouseup', onNodeUp);
			});

			nodesLayer.append(node);
		}
	}

	function syncMarqueeVisual(): void {
		if (!marquee || !marqueeActive) return;
		const left = Math.min(marquee.x0, marquee.x1);
		const top = Math.min(marquee.y0, marquee.y1);
		const w = Math.abs(marquee.x1 - marquee.x0);
		const h = Math.abs(marquee.y1 - marquee.y0);
		marqueeEl.style.display = 'block';
		marqueeEl.style.left = `${left}px`;
		marqueeEl.style.top = `${top}px`;
		marqueeEl.style.width = `${w}px`;
		marqueeEl.style.height = `${h}px`;
	}

	function onWorldMarqueeDown(ev: MouseEvent): void {
		if (ev.button !== 0) return;
		if (wireDrag || dragState || draggingPresetId) return;
		const t = ev.target as Element;
		if (t.closest('.tm-node')) return;
		if (t.closest('.tm-edge-hit')) return;
		ev.preventDefault();
		const w = clientToWorld(ev);
		marquee = { x0: w.x, y0: w.y, x1: w.x, y1: w.y, clientX0: ev.clientX, clientY0: ev.clientY };
		marqueeActive = false;
		window.addEventListener('mousemove', onMarqueeMove);
		window.addEventListener('mouseup', onMarqueeUp);
	}

	function onMarqueeMove(ev: MouseEvent): void {
		if (!marquee) return;
		if (!marqueeActive) {
			const dx = ev.clientX - marquee.clientX0;
			const dy = ev.clientY - marquee.clientY0;
			if (dx * dx + dy * dy < MARQUEE_THRESHOLD_PX * MARQUEE_THRESHOLD_PX) return;
			marqueeActive = true;
		}
		const w = clientToWorld(ev);
		marquee.x1 = w.x;
		marquee.y1 = w.y;
		syncMarqueeVisual();
	}

	function onMarqueeUp(ev: MouseEvent): void {
		window.removeEventListener('mousemove', onMarqueeMove);
		window.removeEventListener('mouseup', onMarqueeUp);
		marqueeEl.style.display = 'none';
		if (!marquee) return;
		if (marqueeActive) {
			const rx0 = Math.min(marquee.x0, marquee.x1);
			const ry0 = Math.min(marquee.y0, marquee.y1);
			const rx1 = Math.max(marquee.x0, marquee.x1);
			const ry1 = Math.max(marquee.y0, marquee.y1);
			if (!ev.shiftKey) {
				selectedNodeIds.clear();
				selectedEdgeId = null;
			}
			for (const n of nodes) {
				const ix0 = n.x;
				const iy0 = n.y;
				const ix1 = n.x + NODE_W;
				const iy1 = n.y + NODE_H;
				if (!(ix1 < rx0 || ix0 > rx1 || iy1 < ry0 || iy0 > ry1)) {
					selectedNodeIds.add(n.id);
				}
			}
		} else {
			if (!ev.shiftKey) {
				selectedNodeIds.clear();
				selectedEdgeId = null;
			}
		}
		marquee = null;
		marqueeActive = false;
		suppressWorkspaceClick = true;
		renderNodes();
		updateEdges();
	}

	function pointInPalette(cx: number, cy: number): boolean {
		const r = palette.getBoundingClientRect();
		return cx >= r.left && cx <= r.right && cy >= r.top && cy <= r.bottom;
	}

	function setPaletteDragOver(on: boolean): void {
		if (on === paletteDragOver) return;
		paletteDragOver = on;
		palette.classList.toggle('tm-palette-drop-target', on);
	}

	function onNodeMove(ev: MouseEvent): void {
		if (!dragState) return;
		const primary = nodes.find((x) => x.id === dragState!.primaryId);
		if (!primary) return;
		const oP = dragState.origins.get(dragState.primaryId);
		if (!oP) return;
		const pt = clientToWorld(ev);
		const rawX = pt.x - dragState.grabDx;
		const rawY = pt.y - dragState.grabDy;
		let newPx = snapCoord(Math.max(0, Math.min(WORLD_W - NODE_W, rawX)));
		let newPy = snapCoord(Math.max(0, Math.min(WORLD_H - NODE_H, rawY)));
		let ddx = newPx - oP.x;
		let ddy = newPy - oP.y;
		let ddxMin = -Infinity;
		let ddxMax = Infinity;
		let ddyMin = -Infinity;
		let ddyMax = Infinity;
		for (const id of dragState.ids) {
			const o = dragState.origins.get(id);
			if (!o) continue;
			ddxMin = Math.max(ddxMin, -o.x);
			ddxMax = Math.min(ddxMax, WORLD_W - NODE_W - o.x);
			ddyMin = Math.max(ddyMin, -o.y);
			ddyMax = Math.min(ddyMax, WORLD_H - NODE_H - o.y);
		}
		ddx = Math.max(ddxMin, Math.min(ddxMax, ddx));
		ddy = Math.max(ddyMin, Math.min(ddyMax, ddy));
		for (const id of dragState.ids) {
			const placed = nodes.find((x) => x.id === id);
			const o = dragState.origins.get(id);
			if (!placed || !o) continue;
			const nx = o.x + ddx;
			const ny = o.y + ddy;
			placed.x = nx;
			placed.y = ny;
			const eln = nodesLayer.querySelector<HTMLElement>(`[data-node-id="${id}"]`);
			if (eln) {
				eln.style.left = `${nx}px`;
				eln.style.top = `${ny}px`;
			}
		}
		setPaletteDragOver(pointInPalette(ev.clientX, ev.clientY));
		updateEdges();
	}

	function onNodeUp(ev: MouseEvent): void {
		if (dragState) {
			if (pointInPalette(ev.clientX, ev.clientY)) {
				for (const id of [...dragState.ids]) {
					removeNode(id);
				}
			} else {
				for (const id of dragState.ids) {
					const placed = nodes.find((x) => x.id === id);
					if (!placed) continue;
					placed.x = snapCoord(placed.x);
					placed.y = snapCoord(placed.y);
					placed.x = Math.max(0, Math.min(placed.x, WORLD_W - NODE_W));
					placed.y = Math.max(0, Math.min(placed.y, WORLD_H - NODE_H));
				}
				renderNodes();
				updateEdges();
			}
		}
		dragState = null;
		setPaletteDragOver(false);
		window.removeEventListener('mousemove', onNodeMove);
		window.removeEventListener('mouseup', onNodeUp);
	}

	function onWireMove(ev: MouseEvent): void {
		if (!wireDrag || !rubberPath) return;
		const pt = clientToWorld(ev);
		rubberPath.setAttribute('d', `M ${wireDrag.x1} ${wireDrag.y1} L ${pt.x} ${pt.y}`);
	}

	function resolveWireTarget(ev: MouseEvent): { nodeId: string; side: Side } | null {
		const els = document.elementsFromPoint(ev.clientX, ev.clientY);
		for (const el of els) {
			const h = el as HTMLElement;
			const port = h.closest?.('.tm-port') as HTMLElement | null;
			if (port && port.dataset.side) {
				const nodeEl = port.closest('.tm-node') as HTMLElement | null;
				const id = nodeEl?.dataset.nodeId;
				if (id && ['n', 'e', 's', 'w'].includes(port.dataset.side)) {
					return { nodeId: id, side: port.dataset.side as Side };
				}
			}
			const nodeEl = h.closest?.('.tm-node') as HTMLElement | null;
			if (nodeEl?.dataset.nodeId) {
				const id = nodeEl.dataset.nodeId;
				const placed = nodes.find((x) => x.id === id);
				if (!placed) continue;
				const pt = clientToWorld(ev);
				return { nodeId: id, side: closestSide(pt.x, pt.y, placed) };
			}
		}
		return null;
	}

	function onWireUp(ev: MouseEvent): void {
		window.removeEventListener('mousemove', onWireMove);
		window.removeEventListener('mouseup', onWireUp);
		if (rubberPath) {
			rubberPath.remove();
			rubberPath = null;
		}
		if (!wireDrag) {
			root.classList.remove('tm-wiring');
			return;
		}
		const target = resolveWireTarget(ev);
		const fromId = wireDrag.fromId;
		const fromSide = wireDrag.fromSide;
		wireDrag = null;
		root.classList.remove('tm-wiring');
		if (!target || target.nodeId === fromId) {
			updateEdges();
			return;
		}
		const dup = edges.some(
			(e) =>
				e.fromId === fromId &&
				e.toId === target.nodeId &&
				e.fromSide === fromSide &&
				e.toSide === target.side,
		);
		if (!dup) {
			edges.push({
				id: uid(),
				fromId,
				toId: target.nodeId,
				fromSide,
				toSide: target.side,
			});
		}
		updateEdges();
	}

	function updateEdges(): void {
		pathsGroup.querySelectorAll('path.tm-edge, path.tm-edge-hit').forEach((c) => c.remove());
		for (const e of edges) {
			const A = nodes.find((n) => n.id === e.fromId);
			const B = nodes.find((n) => n.id === e.toId);
			if (!A || !B) continue;
			const p1 = anchorFor(A, e.fromSide);
			const p2 = anchorFor(B, e.toSide);
			const d = orthogonalEdgePathD(p1, e.fromSide, p2, e.toSide);
			const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			path.setAttribute('d', d);
			path.setAttribute('fill', 'none');
			path.setAttribute('stroke', 'var(--power-gold)');
			path.setAttribute('stroke-width', '2');
			path.setAttribute('stroke-linejoin', 'miter');
			path.setAttribute('stroke-linecap', 'butt');
			path.setAttribute('marker-end', 'url(#tm-arrow)');
			path.classList.add('tm-edge');
			if (e.id === selectedEdgeId) path.classList.add('tm-edge-selected');

			const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
			hit.setAttribute('d', d);
			hit.setAttribute('fill', 'none');
			hit.setAttribute('stroke', 'transparent');
			hit.setAttribute('stroke-width', '14');
			hit.classList.add('tm-edge-hit');
			hit.addEventListener('click', (ev) => {
				ev.stopPropagation();
				selectedEdgeId = e.id;
				selectedNodeIds.clear();
				renderNodes();
				updateEdges();
			});

			pathsGroup.append(path, hit);
		}
	}

	btnClear.addEventListener('click', () => {
		if (!confirm('Clear all nodes and arrows on the canvas?')) return;
		nodes.length = 0;
		edges.length = 0;
		selectedNodeIds.clear();
		selectedEdgeId = null;
		renderNodes();
		updateEdges();
		syncPaletteOnCanvasState();
	});

	btnExport.addEventListener('click', async (ev) => {
		ev.preventDefault();
		if (nodes.length === 0) {
			alert('Drag at least one game from the list onto the canvas before exporting.');
			return;
		}
		btnExport.disabled = true;
		btnExport.textContent = 'Exporting…';
		try {
			const { domToPng } = await import('modern-screenshot');
			updateEdges();
			const bounds = getExportBoundsForNodes(nodes);
			const left = Math.round(bounds.left);
			const top = Math.round(bounds.top);
			const bg = getComputedStyle(workspace).backgroundColor;
			const backgroundColor =
				!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent' ? '#0f0f0f' : bg;
			const dataUrl = await domToPng(world, {
				scale: 2,
				width: bounds.width,
				height: bounds.height,
				backgroundColor,
				style: {
					transform: `translate(${-left}px, ${-top}px) scale(1)`,
					transformOrigin: '0 0',
					width: `${WORLD_W}px`,
					height: `${WORLD_H}px`,
				},
			});
			triggerPngDownload(
				dataUrl,
				`zelda-timeline-${new Date().toISOString().slice(0, 10)}.png`,
			);
		} catch (err) {
			console.error(err);
			const msg = err instanceof Error ? err.message : String(err);
			alert(`Export failed: ${msg}`);
		} finally {
			btnExport.disabled = false;
			btnExport.textContent = 'Export PNG';
		}
	});

	window.addEventListener('keydown', (ev) => {
		if (ev.key !== 'Delete' && ev.key !== 'Backspace') return;
		const t = ev.target as HTMLElement;
		if (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable) return;
		if (selectedEdgeId) {
			ev.preventDefault();
			removeEdge(selectedEdgeId);
			return;
		}
		if (selectedNodeIds.size === 0) return;
		ev.preventDefault();
		for (const id of [...selectedNodeIds]) {
			removeNode(id);
		}
		selectedNodeIds.clear();
	});

	workspace.addEventListener('click', (ev) => {
		if (suppressWorkspaceClick) {
			suppressWorkspaceClick = false;
			return;
		}
		const t = ev.target as Element;
		if (t.closest('.tm-node')) return;
		if (t.closest('.tm-edge-hit')) return;
		selectedNodeIds.clear();
		selectedEdgeId = null;
		renderNodes();
		updateEdges();
	});

	workspace.addEventListener(
		'wheel',
		(ev) => {
			ev.preventDefault();
			const rect = workspace.getBoundingClientRect();
			const oldZoom = zoom;
			const factor = ev.deltaY > 0 ? 0.92 : 1.08;
			const next = Math.min(2.75, Math.max(0.2, zoom * factor));
			if (next === oldZoom) return;
			const mouseX = ev.clientX - rect.left;
			const mouseY = ev.clientY - rect.top;
			zoom = next;
			applyZoom();
			workspace.scrollLeft = (mouseX + workspace.scrollLeft) * (zoom / oldZoom) - mouseX;
			workspace.scrollTop = (mouseY + workspace.scrollTop) * (zoom / oldZoom) - mouseY;
		},
		{ passive: false },
	);

	function endMmbPan(): void {
		if (!mmbPan) return;
		mmbPan = null;
		workspace.classList.remove('tm-mmb-panning');
		window.removeEventListener('mousemove', onMmbPanMove);
		window.removeEventListener('mouseup', onMmbPanUp, true);
	}

	function onMmbPanMove(ev: MouseEvent): void {
		if (!mmbPan) return;
		if ((ev.buttons & 4) === 0) {
			endMmbPan();
			return;
		}
		const dx = ev.clientX - mmbPan.clientX0;
		const dy = ev.clientY - mmbPan.clientY0;
		workspace.scrollLeft = mmbPan.scrollLeft0 - dx;
		workspace.scrollTop = mmbPan.scrollTop0 - dy;
	}

	function onMmbPanUp(ev: MouseEvent): void {
		if (ev.button === 1) endMmbPan();
	}

	workspace.addEventListener('mousedown', (ev) => {
		if (ev.button !== 1) return;
		ev.preventDefault();
		mmbPan = {
			scrollLeft0: workspace.scrollLeft,
			scrollTop0: workspace.scrollTop,
			clientX0: ev.clientX,
			clientY0: ev.clientY,
		};
		workspace.classList.add('tm-mmb-panning');
		window.addEventListener('mousemove', onMmbPanMove);
		window.addEventListener('mouseup', onMmbPanUp, true);
	});

	workspace.addEventListener('auxclick', (ev) => {
		if (ev.button === 1) ev.preventDefault();
	});

	workspace.addEventListener('dragover', (ev) => {
		if (!draggingPresetId) return;
		ev.preventDefault();
		ev.dataTransfer!.dropEffect = 'copy';
		workspace.classList.add('tm-drag-over');
	});

	workspace.addEventListener('drop', (ev) => {
		if (!draggingPresetId) return;
		ev.preventDefault();
		workspace.classList.remove('tm-drag-over');
		const id =
			ev.dataTransfer?.getData(DT_PRESET) ||
			ev.dataTransfer?.getData('text/plain') ||
			draggingPresetId;
		if (!resolvePreset(id)) return;
		const wpt = clientToWorld(ev);
		addNode(id, wpt);
	});

	const ro = new ResizeObserver(() => {
		updateEdges();
	});
	ro.observe(workspace);

	world.addEventListener('mousedown', onWorldMarqueeDown);

	applyZoom();
}
