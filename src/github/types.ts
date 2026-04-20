export interface GitHubRepo {
	owner: { login: string };
	name: string;
	default_branch: string;
}

export interface GitHubLabel {
	name: string;
}

export interface GitHubPR {
	number: number;
	title: string;
	body: string | null;
	state: string;
	draft: boolean;
	user: { login: string };
	head: { ref: string; sha: string };
	base: { ref: string; repo: GitHubRepo };
	labels: GitHubLabel[];
	mergeable: boolean | null;
	mergeable_state: string;
}

export interface GitHubCommit {
	commit: { message: string };
}

export interface GitHubComment {
	id: number;
	body: string;
	user: { login: string };
}

export interface GitHubCheckRun {
	name: string;
	status: string;
	conclusion: string | null;
}

export interface GitHubCommitStatus {
	context: string;
	state: 'success' | 'failure' | 'pending' | 'error';
}

export interface GitHubCustomProperty {
	property_name: string;
	value: string | null;
}
