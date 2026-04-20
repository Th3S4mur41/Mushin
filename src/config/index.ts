import * as YAML from 'yaml';
import type { GitHubClient } from '../github/api';
import type { GitHubCustomProperty, GitHubLabel } from '../github/types';
import { DEFAULT_CONFIG, type MergeMethod, type MushinConfig, type UpdateLevel } from './types';

const UPDATE_LEVELS: UpdateLevel[] = ['major', 'minor', 'patch'];
const MERGE_METHODS: MergeMethod[] = ['merge', 'squash', 'rebase'];

function parseUpdateLevel(value: string | null | undefined): UpdateLevel | undefined {
	if (value && UPDATE_LEVELS.includes(value as UpdateLevel)) {
		return value as UpdateLevel;
	}
	return undefined;
}

function parseMergeMethod(value: string | null | undefined): MergeMethod | undefined {
	if (value && MERGE_METHODS.includes(value as MergeMethod)) {
		return value as MergeMethod;
	}
	return undefined;
}

function parseBool(value: string | null | undefined): boolean | undefined {
	if (value === 'true') return true;
	if (value === 'false') return false;
	return undefined;
}

function configFromCustomProperties(props: GitHubCustomProperty[]): Partial<MushinConfig> {
	const map = Object.fromEntries(props.map((p) => [p.property_name, p.value]));
	const result: Partial<MushinConfig> = {};

	const hvtm = parseUpdateLevel(map['mushin_highest_version_to_merge']);
	if (hvtm !== undefined) result.highestVersionToMerge = hvtm;

	const mu = parseBool(map['mushin_merge_unknown']);
	if (mu !== undefined) result.mergeUnknown = mu;

	const mm = parseMergeMethod(map['mushin_merge_method']);
	if (mm !== undefined) result.mergeMethod = mm;

	const skip = parseBool(map['mushin_skip']);
	if (skip !== undefined) result.skip = skip;

	return result;
}

function configFromYAML(content: string): Partial<MushinConfig> {
	let parsed: Record<string, unknown>;
	try {
		parsed = YAML.parse(content) as Record<string, unknown>;
	} catch {
		return {};
	}

	if (!parsed || typeof parsed !== 'object') return {};

	const result: Partial<MushinConfig> = {};

	const hvtm = parseUpdateLevel(parsed['highest_version_to_merge'] as string);
	if (hvtm !== undefined) result.highestVersionToMerge = hvtm;

	const mu = parsed['merge_unknown'];
	if (typeof mu === 'boolean') result.mergeUnknown = mu;
	else if (typeof mu === 'string') {
		const b = parseBool(mu);
		if (b !== undefined) result.mergeUnknown = b;
	}

	const mm = parseMergeMethod(parsed['merge_method'] as string);
	if (mm !== undefined) result.mergeMethod = mm;

	const skip = parsed['skip'];
	if (typeof skip === 'boolean') result.skip = skip;
	else if (typeof skip === 'string') {
		const b = parseBool(skip);
		if (b !== undefined) result.skip = b;
	}

	return result;
}

function configFromLabels(labels: GitHubLabel[]): Partial<MushinConfig> {
	const names = labels.map((l) => l.name);
	const result: Partial<MushinConfig> = {};

	if (names.includes('mushin:skip')) result.skip = true;
	if (names.includes('mushin:merge-unknown')) result.mergeUnknown = true;

	// Version level labels
	if (names.includes('mushin:merge-major')) result.highestVersionToMerge = 'major';
	else if (names.includes('mushin:merge-minor')) result.highestVersionToMerge = 'minor';
	else if (names.includes('mushin:merge-patch')) result.highestVersionToMerge = 'patch';

	return result;
}

/**
 * Resolves Mushin configuration for a PR using the following precedence:
 * 1. GitHub custom properties (org/repo level) — lowest precedence
 * 2. Repo config file (.github/mushin.yml)
 * 3. PR labels — highest precedence
 */
export async function resolveConfig(
	client: GitHubClient,
	owner: string,
	repo: string,
	labels: GitHubLabel[],
): Promise<MushinConfig> {
	// 1. Custom properties
	const customProps = await client.getRepoCustomProperties(owner, repo);
	const fromProps = configFromCustomProperties(customProps);

	// 2. Repo config file
	const yamlContent = await client.getFileContent(owner, repo, '.github/mushin.yml');
	const fromYAML = yamlContent ? configFromYAML(yamlContent) : {};

	// 3. PR labels
	const fromLabels = configFromLabels(labels);

	// Merge with precedence: labels > repo YAML > custom properties > defaults
	return { ...DEFAULT_CONFIG, ...fromProps, ...fromYAML, ...fromLabels };
}
