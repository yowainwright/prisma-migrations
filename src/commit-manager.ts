import { execSync } from "child_process";

export interface CommitInfo {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: Date;
  branch?: string;
}

export class CommitManager {
  private gitDir: string;

  constructor(gitDir: string = process.cwd()) {
    this.gitDir = gitDir;
  }

  /**
   * Get current commit hash
   */
  public getCurrentCommit(): string {
    try {
      return this.execGitCommand("git rev-parse HEAD").trim();
    } catch (error) {
      throw new Error(
        `Failed to get current commit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get current short commit hash
   */
  public getCurrentShortCommit(): string {
    try {
      return this.execGitCommand("git rev-parse --short HEAD").trim();
    } catch (error) {
      throw new Error(
        `Failed to get current short commit: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get current branch name
   */
  public getCurrentBranch(): string {
    try {
      return this.execGitCommand("git rev-parse --abbrev-ref HEAD").trim();
    } catch (error) {
      throw new Error(
        `Failed to get current branch: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Get detailed commit information
   */
  public getCommitInfo(commitHash?: string): CommitInfo {
    const commit = commitHash || "HEAD";

    try {
      const hash = this.execGitCommand(`git rev-parse ${commit}`).trim();
      const shortHash = this.execGitCommand(
        `git rev-parse --short ${commit}`,
      ).trim();
      const message = this.execGitCommand(
        `git log -1 --pretty=format:"%s" ${commit}`,
      ).trim();
      const author = this.execGitCommand(
        `git log -1 --pretty=format:"%an <%ae>" ${commit}`,
      ).trim();
      const dateStr = this.execGitCommand(
        `git log -1 --pretty=format:"%ai" ${commit}`,
      ).trim();
      const date = new Date(dateStr);

      let branch: string | undefined;
      try {
        // Try to get the branch containing this commit
        branch = this.execGitCommand(
          `git branch --contains ${hash} | grep -v "detached" | head -1`,
        )
          .trim()
          .replace(/^\*?\s*/, "");
      } catch {
        // Branch detection failed, not critical
      }

      return {
        hash,
        shortHash,
        message,
        author,
        date,
        branch,
      };
    } catch (error) {
      throw new Error(
        `Failed to get commit info: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if the working directory is clean (no uncommitted changes)
   */
  public isWorkingDirectoryClean(): boolean {
    try {
      const status = this.execGitCommand("git status --porcelain").trim();
      return status.length === 0;
    } catch {
      return false;
    }
  }

  /**
   * Get commits between two references
   */
  public getCommitsBetween(from: string, to: string): CommitInfo[] {
    try {
      const range = `${from}..${to}`;
      const hashes = this.execGitCommand(`git rev-list ${range}`)
        .trim()
        .split("\n")
        .filter(Boolean);

      return hashes.map((hash) => this.getCommitInfo(hash));
    } catch (error) {
      throw new Error(
        `Failed to get commits between ${from} and ${to}: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  /**
   * Check if a commit exists
   */
  public commitExists(commitHash: string): boolean {
    try {
      this.execGitCommand(`git rev-parse --verify ${commitHash}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get tags for a specific commit
   */
  public getTagsForCommit(commitHash: string): string[] {
    try {
      const tags = this.execGitCommand(
        `git tag --points-at ${commitHash}`,
      ).trim();
      return tags ? tags.split("\n").filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  /**
   * Find the most recent tag reachable from a commit
   */
  public getLatestTag(commitHash?: string): string | null {
    try {
      const commit = commitHash || "HEAD";
      const tag = this.execGitCommand(
        `git describe --tags --abbrev=0 ${commit}`,
      ).trim();
      return tag || null;
    } catch {
      return null;
    }
  }

  /**
   * Check if Git repository exists
   */
  public isGitRepository(): boolean {
    try {
      this.execGitCommand("git rev-parse --git-dir");
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Generate a version string based on git state
   */
  public generateVersionFromGit(): string {
    try {
      const latestTag = this.getLatestTag();
      const shortCommit = this.getCurrentShortCommit();
      const branch = this.getCurrentBranch();
      const isClean = this.isWorkingDirectoryClean();

      if (latestTag) {
        // If we're exactly on a tag, use the tag
        const tagCommit = this.execGitCommand(
          `git rev-parse ${latestTag}`,
        ).trim();
        const currentCommit = this.getCurrentCommit();

        if (tagCommit === currentCommit && isClean) {
          return latestTag;
        }

        // Otherwise, create a version with tag + commits since tag
        const commitsSinceTag = this.execGitCommand(
          `git rev-list --count ${latestTag}..HEAD`,
        ).trim();
        const suffix = isClean ? "" : "-dirty";
        return `${latestTag}-${commitsSinceTag}-g${shortCommit}${suffix}`;
      }

      // No tags, use branch and commit
      const cleanBranch = branch.replace(/[^a-zA-Z0-9.-]/g, "-");
      const suffix = isClean ? "" : "-dirty";
      return `${cleanBranch}-${shortCommit}${suffix}`;
    } catch (error) {
      throw new Error(
        `Failed to generate version from git: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
  }

  private execGitCommand(command: string): string {
    return execSync(command, {
      cwd: this.gitDir,
      encoding: "utf8",
      stdio: "pipe",
    });
  }
}
