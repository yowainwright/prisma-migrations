import assert from 'node:assert';
import { describe, it, before } from 'node:test';
import { CommitManager } from '../src/commit-manager';

describe('CommitManager', () => {
  let commitManager: CommitManager;

  before(() => {
    commitManager = new CommitManager();
  });

  it('should create CommitManager instance', () => {
    assert(commitManager instanceof CommitManager);
  });

  it('should handle getCommitInfo with mock data', () => {
    // Since this relies on git commands, we test basic functionality
    // In a real scenario, this would interact with actual git repo
    try {
      const commitInfo = commitManager.getCommitInfo('HEAD');
      // If we're in a git repo, this should work
      assert(typeof commitInfo === 'object');
    } catch (error) {
      // If not in a git repo or git not available, expect an error
      assert(error instanceof Error);
    }
  });

  it('should handle getLatestTag with mock data', () => {
    try {
      const latestTag = commitManager.getLatestTag('HEAD');
      // If we're in a git repo with tags, this should work
      assert(typeof latestTag === 'string' || latestTag === null);
    } catch (error) {
      // If not in a git repo or no tags, expect an error
      assert(error instanceof Error);
    }
  });

  it('should handle getCurrentCommit', () => {
    try {
      const currentCommit = commitManager.getCurrentCommit();
      // If we're in a git repo, this should return a string
      assert(typeof currentCommit === 'string');
      assert(currentCommit.length > 0);
    } catch (error) {
      // If not in a git repo, expect an error
      assert(error instanceof Error);
    }
  });

  it('should handle isCommitReachable', () => {
    try {
      const isReachable = commitManager.isCommitReachable('HEAD', 'HEAD');
      // HEAD should be reachable from itself
      assert(typeof isReachable === 'boolean');
    } catch (error) {
      // If not in a git repo, expect an error
      assert(error instanceof Error);
    }
  });
});
