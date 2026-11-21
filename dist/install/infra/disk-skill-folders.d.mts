import type { SkillFolders, SkillLinkKind, SkillPaths } from '../application/ports.mts';
import type { SkillManifest } from '../domain/skill-manifest.mts';
import type { SkillTree } from '../domain/skill-tree.mts';
export interface SkillRoots {
    /** The running package (where `skills/` lives). */
    packageDir: string;
    projectRoot: string;
}
export declare class DiskSkillFolders implements SkillFolders {
    private readonly packageDir;
    private readonly projectRoot;
    /**
     * @example
     *   new DiskSkillFolders({ packageDir: '/p/node_modules/@lukiita/toolbox', projectRoot: '/p' })
     */
    constructor({ packageDir, projectRoot }: SkillRoots);
    paths(name: string): SkillPaths;
    shipped(): string[];
    readShipped(name: string): SkillTree | undefined;
    readLocal(name: string): SkillTree | undefined;
    writeLocal(name: string, tree: SkillTree): string | undefined;
    linkKind(name: string): SkillLinkKind;
    recover(name: string): void;
    readManifest(): SkillManifest;
    saveManifest(manifest: SkillManifest): void;
}
