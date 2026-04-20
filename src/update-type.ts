import type { updatedDependency } from 'fetch-metadata/src/dependabot/update_metadata';

export type SemverLevel = 'major' | 'minor' | 'patch';

const SEMVER_RANK: Record<string, number> = {
	'version-update:semver-major': 3,
	'version-update:semver-minor': 2,
	'version-update:semver-patch': 1,
};

const SEMVER_LEVEL: Record<string, SemverLevel> = {
	'version-update:semver-major': 'major',
	'version-update:semver-minor': 'minor',
	'version-update:semver-patch': 'patch',
};

const LEVEL_RANK: Record<SemverLevel, number> = {
	major: 3,
	minor: 2,
	patch: 1,
};

/**
 * Determines the highest semver update type from a list of updated dependencies.
 * Returns undefined if no valid update type is found.
 */
export function getHighestUpdateType(dependencies: updatedDependency[]): SemverLevel | undefined {
	let highest = 0;
	let highestLevel: SemverLevel | undefined;

	for (const dep of dependencies) {
		const rank = SEMVER_RANK[dep.updateType];
		if (rank !== undefined && rank > highest) {
			highest = rank;
			highestLevel = SEMVER_LEVEL[dep.updateType];
		}
	}

	return highestLevel;
}

/**
 * Returns true if the actual update level is within the allowed maximum.
 * e.g. allowed='minor' permits 'patch' and 'minor', but not 'major'.
 */
export function isUpdateLevelAllowed(actual: SemverLevel, allowed: SemverLevel): boolean {
	return LEVEL_RANK[actual] <= LEVEL_RANK[allowed];
}
