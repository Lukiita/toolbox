// The skills on disk: the running package's `skills/` and the project's
// `.agents/skills/`, behind the port the two commands use. Everything about
// paths is here; the use cases only name a skill.

import { join } from 'node:path';

import type { SkillFolders, SkillLinkKind, SkillPaths } from '../application/ports.mts';
import { PACKAGE_SKILLS_DIR, SKILLS_DIR } from '../application/skill-layout.mts';
import type { SkillManifest } from '../domain/skill-manifest.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
import {
  readShippedSkillTree,
  readSkillTree,
  recoverSkillFolder,
  shippedSkills,
  skillLinkKind,
  writeSkillTree,
} from './skill-directory.mts';
import { readSkillManifest, writeSkillManifest } from './skill-manifest-file.mts';

export interface SkillRoots {
  /** The running package (where `skills/` lives). */
  packageDir: string;
  projectRoot: string;
}

export class DiskSkillFolders implements SkillFolders {
  private readonly packageDir: string;
  private readonly projectRoot: string;

  /**
   * @example
   *   new DiskSkillFolders({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
   */
  public constructor({ packageDir, projectRoot }: SkillRoots) {
    this.packageDir = packageDir;
    this.projectRoot = projectRoot;
  }

  public paths(name: string): SkillPaths {
    return {
      local: join(this.projectRoot, SKILLS_DIR, name),
      shipped: join(this.packageDir, PACKAGE_SKILLS_DIR, name),
    };
  }

  public shipped(): string[] {
    return shippedSkills(this.packageDir);
  }

  public readShipped(name: string): SkillTree | undefined {
    return readShippedSkillTree(this.paths(name).shipped);
  }

  public readLocal(name: string): SkillTree | undefined {
    return readSkillTree(this.paths(name).local);
  }

  public writeLocal(name: string, tree: SkillTree): string | undefined {
    return writeSkillTree(this.paths(name).local, tree);
  }

  public linkKind(name: string): SkillLinkKind {
    return skillLinkKind(this.paths(name).local, this.packageDir);
  }

  public recover(name: string): void {
    recoverSkillFolder(this.paths(name).local);
  }

  public readManifest(): SkillManifest {
    return readSkillManifest(this.projectRoot);
  }

  public saveManifest(manifest: SkillManifest): void {
    writeSkillManifest(this.projectRoot, manifest);
  }
}
