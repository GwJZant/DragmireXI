/** Preset nodes for main-series (and common spin-off) Zelda titles for the timeline editor. */
export type GamePreset = {
	id: string;
	label: string;
	/** Short label for the node header */
	short: string;
	/** Accent for the node chrome (hex) */
	color: string;
	/** Optional extra copy (custom events); shown under `label` on the node. */
	description?: string;
};

export const TIMELINE_GAME_PRESETS: GamePreset[] = [
	{ id: 'loz', label: 'The Legend of Zelda', short: 'LoZ', color: '#6d4c41' },
	{ id: 'aol', label: 'Zelda II: The Adventure of Link', short: 'AoL', color: '#5d4037' },
	{ id: 'alttp', label: 'A Link to the Past', short: 'ALttP', color: '#2e7d32' },
	{ id: 'la', label: "Link's Awakening", short: 'LA', color: '#00838f' },
	{ id: 'oot', label: 'Ocarina of Time', short: 'OoT', color: '#1565c0' },
	{ id: 'mm', label: "Majora's Mask", short: 'MM', color: '#6a1b9a' },
	{ id: 'ooa', label: 'Oracle of Ages', short: 'OoA', color: '#4527a0' },
	{ id: 'oos', label: 'Oracle of Seasons', short: 'OoS', color: '#c62828' },
	{ id: 'fs', label: 'Four Swords', short: 'FS', color: '#0277bd' },
	{ id: 'ww', label: 'The Wind Waker', short: 'WW', color: '#0277bd' },
	{ id: 'fsa', label: 'Four Swords Adventures', short: 'FSA', color: '#00695c' },
	{ id: 'mc', label: 'The Minish Cap', short: 'MC', color: '#558b2f' },
	{ id: 'tp', label: 'Twilight Princess', short: 'TP', color: '#37474f' },
	{ id: 'ph', label: 'Phantom Hourglass', short: 'PH', color: '#ef6c00' },
	{ id: 'st', label: 'Spirit Tracks', short: 'ST', color: '#5d4037' },
	{ id: 'ss', label: 'Skyward Sword', short: 'SS', color: '#ad1457' },
	{ id: 'albw', label: 'A Link Between Worlds', short: 'ALBW', color: '#283593' },
	{ id: 'tfh', label: 'Tri Force Heroes', short: 'TFH', color: '#f9a825' },
	{ id: 'botw', label: 'Breath of the Wild', short: 'BotW', color: '#2e7d32' },
	{ id: 'totk', label: 'Tears of the Kingdom', short: 'TotK', color: '#1b5e20' },
	{ id: 'eow', label: 'Echoes of Wisdom', short: 'EoW', color: '#512da8' },
	{ id: 'hw', label: 'Hyrule Warriors', short: 'HW', color: '#c62828' },
	{ id: 'aoc', label: 'Hyrule Warriors: Age of Calamity', short: 'AoC', color: '#b71c1c' },
	{ id: 'aoi', label: 'Hyrule Warriors: Age of Imprisonment', short: 'AoI', color: '#004d40' },
];

export function getPresetById(id: string): GamePreset | undefined {
	return TIMELINE_GAME_PRESETS.find((g) => g.id === id);
}
