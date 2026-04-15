export type UpdateLevel = 'major' | 'minor' | 'patch';
export type MergeMethod = 'merge' | 'squash' | 'rebase';

export interface MushinConfig {
  /** Highest semver update level to auto-merge. Default: 'minor' */
  highestVersionToMerge: UpdateLevel;
  /** Whether to merge PRs when update type cannot be determined. Default: false */
  mergeUnknown: boolean;
  /** Merge method to use. Default: 'squash' */
  mergeMethod: MergeMethod;
  /** Skip this PR entirely. Default: false */
  skip: boolean;
}

export const DEFAULT_CONFIG: MushinConfig = {
  highestVersionToMerge: 'minor',
  mergeUnknown: false,
  mergeMethod: 'squash',
  skip: false,
};
